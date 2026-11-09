import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudioMember } from "@/lib/auth/require-studio-member";
import { InquiryStatusSchema } from "@/lib/inquiries/schema";
import { readJsonBody } from "@/lib/http/read-json";
import { INQUIRY_REFERENCE_BUCKET } from "@/lib/inquiries/reference-file-constants";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const IdSchema = z.string().uuid();
const UpdateSchema = z
  .object({
    status: InquiryStatusSchema.optional(),
    priority_score: z.number().int().min(0).max(10).optional(),
  })
  .strict()
  .refine((value) => value.status !== undefined || value.priority_score !== undefined);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!IdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid inquiry ID." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorization = await requireStudioMember();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const { data, error } = await authorization.supabase
    .from("inquiries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Admin inquiry detail could not be loaded.");
    return NextResponse.json(
      { error: "The inquiry is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Inquiry not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: briefData, error: briefError } = await authorization.supabase
    .from("inquiry_briefs")
    .select("id, inquiry_id, design_goal, brand_message, target_audience, desired_outcomes, references, time_budget, design_complexity")
    .eq("inquiry_id", id)
    .maybeSingle();

  if (briefError) {
    console.error("Admin inquiry priority detail could not be loaded.", briefError.message);
  }

  let referenceFiles;
  try {
    const service = createSupabaseServiceClient();
    const { data: files, error: filesError } = await service
      .from("inquiry_reference_files")
      .select("id, file_name, content_type, byte_size, status, object_path, created_at")
      .eq("inquiry_id", id)
      .order("created_at", { ascending: true });

    if (filesError) {
      throw filesError;
    }

    referenceFiles = await Promise.all(
      (files ?? []).map(async (file) => {
        if (file.status !== "ready") {
          return {
            id: file.id,
            file_name: file.file_name,
            content_type: file.content_type,
            byte_size: file.byte_size,
            status: file.status,
            signed_url: null,
          };
        }

        const { data: signedFile, error: signedUrlError } = await service.storage
          .from(INQUIRY_REFERENCE_BUCKET)
          .createSignedUrl(file.object_path, 10 * 60);
        if (signedUrlError || !signedFile) {
          throw signedUrlError ?? new Error("Reference image URL could not be created.");
        }

        return {
          id: file.id,
          file_name: file.file_name,
          content_type: file.content_type,
          byte_size: file.byte_size,
          status: file.status,
          signed_url: signedFile.signedUrl,
        };
      }),
    );
  } catch (error) {
    console.error("Admin inquiry reference images could not be loaded.", error);
    return NextResponse.json(
      { error: "Inquiry reference images are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const safeBriefData: Array<{
    id: string;
    inquiry_id: string;
    design_goal: string;
    brand_message: string;
    target_audience: string | null;
    desired_outcomes: string | null;
    references: string | null;
    time_budget: string | null;
    design_complexity: number | null;
  }> = briefData ? [briefData as typeof briefData & {
    id: string;
    inquiry_id: string;
    design_goal: string;
    brand_message: string;
    target_audience: string | null;
    desired_outcomes: string | null;
    references: string | null;
    time_budget: string | null;
    design_complexity: number | null;
  }] : [];

  return NextResponse.json(
    { item: { ...data, inquiry_briefs: safeBriefData, reference_files: referenceFiles } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!IdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid inquiry ID." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.response;
  }

  const parsed = UpdateSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid inquiry status or priority score is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorization = await requireStudioMember();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const { data, error } = await authorization.supabase
    .from("inquiries")
    .update(parsed.data)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Admin inquiry could not be updated.");
    return NextResponse.json(
      { error: "The inquiry could not be updated." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Inquiry not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { message: "Inquiry updated." },
    { headers: { "Cache-Control": "no-store" } },
  );
}
