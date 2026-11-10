import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/http/read-json";
import {
  PublicInquirySchema,
  toInquiryBriefInsert,
  toInquiryInsert,
} from "@/lib/inquiries/schema";
import { computeProjectPriority } from "@/lib/project-priority";
import { createPublicInquiry } from "@/lib/supabase/public-inquiry";
import { checkInquiryRateLimit } from "@/lib/rate-limit/inquiry";
import { queueInquiryReferenceProcessing } from "@/lib/inquiries/reference-queue";
import { INQUIRY_REFERENCE_BUCKET } from "@/lib/inquiries/reference-file-constants";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { queueInquirySimilarityProcessing } from "@/lib/inquiries/similarity-queue";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readJsonBody(request, 12_288);
  if (!body.ok) {
    return body.response;
  }

  const parsed = PublicInquirySchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please correct the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  if (parsed.data.website.trim().length > 0) {
    return NextResponse.json(
      { error: "This submission could not be accepted." },
      { status: 400 },
    );
  }

  const ipAddress = request.headers.get("x-real-ip")?.trim() || "unknown";
  const identifier = createHash("sha256").update(ipAddress).digest("hex");

  try {
    const rateLimit = await checkInquiryRateLimit(identifier);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
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
    console.error("Inquiry rate-limit service is unavailable.");
    return NextResponse.json(
      { error: "Submissions are temporarily unavailable. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const referenceIds = parsed.data.reference_upload_ids;
  if (referenceIds.length > 0) {
    try {
      const supabase = createSupabaseServiceClient();
      const { data: files, error: filesError } = await supabase
        .from("inquiry_reference_files")
        .select("id, content_type, byte_size")
        .in("id", referenceIds)
        .is("inquiry_id", null)
        .eq("status", "awaiting_upload");

      if (filesError) {
        throw filesError;
      }
      if (!files || files.length !== referenceIds.length) {
        return NextResponse.json(
          { error: "One or more reference images are no longer available. Please upload them again." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }

      for (const file of files) {
        const { data: objects, error: listError } = await supabase.storage
          .from(INQUIRY_REFERENCE_BUCKET)
          .list("pending", { search: file.id, limit: 10 });
        if (listError) {
          throw listError;
        }

        const uploadedObject = objects?.find((object) => object.name === file.id);
        if (
          !uploadedObject ||
          Number(uploadedObject.metadata?.size) !== file.byte_size ||
          uploadedObject.metadata?.mimetype !== file.content_type
        ) {
          return NextResponse.json(
            { error: "One or more reference images have not finished uploading." },
            { status: 400, headers: { "Cache-Control": "no-store" } },
          );
        }
      }
    } catch (error) {
      console.error("Inquiry reference uploads could not be verified.", error);
      return NextResponse.json(
        { error: "Reference images are temporarily unavailable. Please try again." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  let clientProfileId: string | null = null;
  try {
    const { createSupabaseSessionClient } = await import("@/lib/supabase/session");
    const supabase = await createSupabaseSessionClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (!userError && userData.user) {
      const accessLevel =
        userData.user.app_metadata?.access_level ?? userData.user.app_metadata?.role;

      if (accessLevel === "client" || accessLevel === "client_account") {
        const { data: profileData, error: profileError } = await supabase
          .from("client_profiles")
          .select("id")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (!profileError && profileData) {
          clientProfileId = profileData.id;
        }
      }
    }
  } catch {
    clientProfileId = null;
  }

  let inquiryId: string;
  try {
    const priority = computeProjectPriority({
      budget_range: parsed.data.budget_range ?? undefined,
      design_complexity: parsed.data.design_complexity ?? undefined,
      timeline: parsed.data.timeline ?? undefined,
    });
    const savedInquiry = await createPublicInquiry({
      ...toInquiryInsert(parsed.data),
      ...(clientProfileId ? { client_id: clientProfileId } : {}),
      priority_score: priority.priority_score,
      similarity_opt_in: parsed.data.similarity_opt_in,
    }, toInquiryBriefInsert(parsed.data), parsed.data.reference_upload_ids);
    inquiryId = savedInquiry.id;
  } catch {
    console.error("Inquiry and brief could not be saved.");
    return NextResponse.json(
      { error: "We could not save your inquiry. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const queueResult = await queueInquiryReferenceProcessing(referenceIds);
  if (parsed.data.similarity_opt_in) {
    try {
      await queueInquirySimilarityProcessing(inquiryId);
    } catch (error) {
      console.error("Opted-in inquiry similarity could not be queued.", error);
    }
  }

  return NextResponse.json(
    {
      message: "Your inquiry has been received.",
      referenceFilesPending: queueResult.pending > 0,
      similarityPending: parsed.data.similarity_opt_in,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
