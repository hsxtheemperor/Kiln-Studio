import { randomUUID, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/http/read-json";
import {
  INQUIRY_REFERENCE_BUCKET,
  ReferenceFileUploadSchema,
  sanitizeReferenceFileName,
} from "@/lib/inquiries/reference-files";
import { MAX_INQUIRY_REFERENCE_FILES, MAX_INQUIRY_REFERENCE_BYTES } from "@/lib/inquiries/reference-file-constants";
import { checkInquiryUploadRateLimit } from "@/lib/rate-limit/inquiry";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readJsonBody(request, 8_192);
  if (!body.ok) {
    return body.response;
  }

  const parsed = ReferenceFileUploadSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: `Choose up to ${MAX_INQUIRY_REFERENCE_FILES} JPEG, PNG, or WebP images, each no larger than ${MAX_INQUIRY_REFERENCE_BYTES / (1024 * 1024)} MB and no more than 24 MB total.`,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (parsed.data.website.trim().length > 0) {
    return NextResponse.json(
      { error: "This upload could not be accepted." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const ipAddress = request.headers.get("x-real-ip")?.trim() || "unknown";
  const identifier = createHash("sha256").update(ipAddress).digest("hex");

  try {
    const rateLimit = await checkInquiryUploadRateLimit(identifier);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many upload attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(
              Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000)),
            ),
          },
        },
      );
    }
  } catch {
    console.error("Inquiry reference upload rate limiting is unavailable.");
    return NextResponse.json(
      { error: "Uploads are temporarily unavailable. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = createSupabaseServiceClient();
  const created: Array<{ id: string; objectPath: string }> = [];
  try {
    const uploads = [];
    for (const file of parsed.data.files) {
      const id = randomUUID();
      const objectPath = `pending/${id}`;
      const { error: insertError } = await supabase
        .from("inquiry_reference_files")
        .insert({
          id,
          inquiry_id: null,
          object_path: objectPath,
          file_name: sanitizeReferenceFileName(file.name),
          content_type: file.type,
          byte_size: file.size,
          status: "awaiting_upload",
          failure_reason: null,
        });

      if (insertError) {
        throw insertError;
      }
      created.push({ id, objectPath });

      const { data: signedUpload, error: signingError } = await supabase.storage
        .from(INQUIRY_REFERENCE_BUCKET)
        .createSignedUploadUrl(objectPath, { upsert: false });

      if (signingError || !signedUpload) {
        throw signingError ?? new Error("Signed upload URL could not be created.");
      }

      uploads.push({
        id,
        path: signedUpload.path,
        token: signedUpload.token,
      });
    }

    return NextResponse.json(
      { uploads },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Inquiry reference upload could not be initialized.", error);
    if (created.length > 0) {
      const { error: removeError } = await supabase.storage
        .from(INQUIRY_REFERENCE_BUCKET)
        .remove(created.map((item) => item.objectPath));
      if (removeError) {
        console.error("Partially initialized inquiry reference files could not be removed.");
      }
    }
    if (created.length > 0) {
      const { error: deleteError } = await supabase
        .from("inquiry_reference_files")
        .delete()
        .in("id", created.map((item) => item.id));
      if (deleteError) {
        console.error("Partially initialized inquiry reference records could not be removed.");
      }
    }
    return NextResponse.json(
      { error: "We could not prepare your reference images. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
