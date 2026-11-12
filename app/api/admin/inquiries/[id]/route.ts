import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudioMember } from "@/lib/auth/require-studio-member";
import { InquiryStatusSchema } from "@/lib/inquiries/schema";
import { readJsonBody } from "@/lib/http/read-json";
import { INQUIRY_REFERENCE_BUCKET } from "@/lib/inquiries/reference-file-constants";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  disableInquirySimilarity,
  readSimilarityMatches,
} from "@/lib/inquiries/similarity";
import { queueInquirySimilarityProcessing } from "@/lib/inquiries/similarity-queue";
import type { InquiryRow } from "@/lib/supabase/database.types";

const IdSchema = z.string().uuid();
const UpdateSchema = z
  .object({
    status: InquiryStatusSchema.optional(),
    priority_score: z.number().int().min(0).max(10).optional(),
    reviewed_complexity: z.number().int().min(1).max(10).nullable().optional(),
    actual_hours: z.number().min(0).max(100_000).nullable().optional(),
    review_notes: z.string().max(1000).nullable().optional(),
    similarity_opt_in: z.literal(false).optional(),
    similarity_retry: z.literal(true).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0)
  .refine(
    (value) =>
      value.similarity_retry !== true ||
      (Object.keys(value).length === 1 && value.similarity_opt_in === undefined),
  )
  .refine(
    (value) =>
      value.similarity_opt_in !== false ||
      (Object.keys(value).length === 1 && value.similarity_retry === undefined),
  );

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
    return NextResponse.json(
      { error: "Inquiry priority details are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsedMatches = readSimilarityMatches(data.similarity_matches)
    .filter((match) => match.inquiry_id !== id);
  const matchIds = parsedMatches.map((match) => match.inquiry_id);
  const { data: relatedInquiries, error: relatedInquiriesError } =
    matchIds.length > 0
      ? await authorization.supabase
          .from("inquiries")
          .select("id, service, status, priority_score, reviewed_complexity, actual_hours")
          .in("id", matchIds)
          .eq("similarity_opt_in", true)
      : { data: [], error: null };
  if (relatedInquiriesError) {
    console.error("Related inquiry similarity details could not be loaded.");
    return NextResponse.json(
      { error: "Inquiry similarity details are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const relatedById = new Map(
    (relatedInquiries ?? []).map((inquiry) => [inquiry.id, inquiry]),
  );
  const similarityMatches = parsedMatches.flatMap((match) => {
    const related = relatedById.get(match.inquiry_id);
    return related ? [{ ...related, score: match.score }] : [];
  });

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
    {
      item: {
        ...data,
        inquiry_briefs: safeBriefData,
        reference_files: referenceFiles,
        similarity_matches: similarityMatches,
      },
    },
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

  if (parsed.data.similarity_opt_in === false) {
    try {
      await disableInquirySimilarity(id);
    } catch (error) {
      console.error("Inquiry similarity could not be removed.", error);
      return NextResponse.json(
        { error: "The inquiry could not be removed from similarity search." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { message: "Inquiry removed from similarity search." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (parsed.data.similarity_retry === true) {
    const service = createSupabaseServiceClient();
    const { data: inquiry, error: lookupError } = await service
      .from("inquiries")
      .select("id, similarity_opt_in")
      .eq("id", id)
      .maybeSingle();
    if (lookupError) {
      console.error("Inquiry similarity retry could not be checked.");
      return NextResponse.json(
        { error: "The inquiry could not be queued for similarity processing." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!inquiry) {
      return NextResponse.json(
        { error: "Inquiry not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!inquiry.similarity_opt_in) {
      return NextResponse.json(
        { error: "Similarity processing requires client opt-in." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { error: resetError } = await service
      .from("inquiries")
      .update({ similarity_status: "pending", similarity_matches: [] })
      .eq("id", id)
      .eq("similarity_opt_in", true);
    if (resetError) {
      console.error("Inquiry similarity status could not be reset.");
      return NextResponse.json(
        { error: "The inquiry could not be queued for similarity processing." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      await queueInquirySimilarityProcessing(id);
    } catch (error) {
      console.error("Inquiry similarity retry could not be queued.", error);
      return NextResponse.json(
        { error: "The inquiry could not be queued for similarity processing." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { message: "Inquiry similarity processing was queued." },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const updates: Partial<
    Pick<
      InquiryRow,
      | "status"
      | "priority_score"
      | "reviewed_complexity"
      | "actual_hours"
      | "review_notes"
    >
  > = { ...parsed.data };
  const { data, error } = await authorization.supabase
    .from("inquiries")
    .update(updates)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (
      error.code === "23514" &&
      error.message.includes("An inquiry must be marked suitable and assigned")
    ) {
      return NextResponse.json(
        {
          error:
            "Mark the inquiry suitable and assign it to a deal lead in Engagements before accepting it.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
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
