import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDealLead } from "@/lib/auth/require-deal-lead";
import type { EngagementReviewState } from "@/lib/supabase/database.types";

const QuerySchema = z.object({
  page: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(10_000)),
  pageSize: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().min(1).max(50)),
  review_state: z.enum(["pending", "suitable", "not_suitable", "needs_info"]).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = QuerySchema.safeParse({
    page: url.searchParams.get("page") ?? "1",
    pageSize: url.searchParams.get("pageSize") ?? "20",
    review_state: url.searchParams.get("review_state") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid engagement pagination or review filter." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorization = await requireDealLead();
  if (!authorization.authorized) return authorization.response;

  const { page, pageSize, review_state: reviewState } = query.data;
  let engagementsQuery = authorization.supabase
    .from("engagements")
    .select(
      "id, inquiry_id, review_state, review_notes, reviewed_by, reviewed_at, deal_lead_id, claimed_at, created_at, updated_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (reviewState) engagementsQuery = engagementsQuery.eq("review_state", reviewState);

  const { data: engagements, error: engagementsError, count } = await engagementsQuery;
  if (engagementsError) {
    console.error("Engagement queue could not be loaded.", engagementsError.code);
    return NextResponse.json(
      { error: "The engagement queue is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const inquiryIds = (engagements ?? []).map(({ inquiry_id }) => inquiry_id);
  if (inquiryIds.length === 0) {
    return NextResponse.json(
      { items: [], page, pageSize, totalCount: count ?? 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const [
    { data: inquiries, error: inquiriesError },
    { data: briefs, error: briefsError },
  ] = await Promise.all([
    authorization.supabase
      .from("inquiries")
      .select("id, name, email, company, service, project_brief, budget_range, timeline, priority_score, status, created_at")
      .in("id", inquiryIds),
    authorization.supabase
      .from("inquiry_briefs")
      .select("inquiry_id, design_goal, brand_message, target_audience, desired_outcomes")
      .in("inquiry_id", inquiryIds),
  ]);
  if (inquiriesError || briefsError) {
    console.error(
      "Engagement details could not be loaded.",
      inquiriesError?.code ?? briefsError?.code,
    );
    return NextResponse.json(
      { error: "Engagement details are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const inquiryById = new Map((inquiries ?? []).map((inquiry) => [inquiry.id, inquiry]));
  const briefByInquiryId = new Map(
    (briefs ?? []).map((brief) => [brief.inquiry_id, brief]),
  );
  const items = (engagements ?? []).flatMap((engagement) => {
    const inquiry = inquiryById.get(engagement.inquiry_id);
    if (!inquiry) return [];
    return [{
      ...engagement,
      inquiry,
      brief: briefByInquiryId.get(engagement.inquiry_id) ?? null,
    }];
  });

  return NextResponse.json(
    { items, page, pageSize, totalCount: count ?? 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
