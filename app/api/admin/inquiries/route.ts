import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudioMember } from "@/lib/auth/require-studio-member";
import { INQUIRY_STATUSES } from "@/lib/inquiries/schema";

const QuerySchema = z.object({
  page: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().max(10_000)),
  pageSize: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(100)),
  status: z.enum(INQUIRY_STATUSES).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = QuerySchema.safeParse({
    page: url.searchParams.get("page") ?? "1",
    pageSize: url.searchParams.get("pageSize") ?? "20",
    status: url.searchParams.get("status") ?? undefined,
  });

  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid pagination or status filter." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorization = await requireStudioMember();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const { page, pageSize, status } = query.data;
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  let inquiryQuery = authorization.supabase
    .from("inquiries")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, end);

  if (status) {
    inquiryQuery = inquiryQuery.eq("status", status);
  }

  const { data, error, count } = await inquiryQuery;
  if (error) {
    console.error("Admin inquiry list could not be loaded.");
    return NextResponse.json(
      { error: "The inquiry list is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const inquiryIds = (data ?? []).map((inquiry) => inquiry.id).filter(Boolean);
  let projectBriefs: Array<{ inquiry_id: string; priority_score: number | null; priority_label: string | null }> = [];

  if (inquiryIds.length > 0) {
    const { data: briefData, error: briefError } = await authorization.supabase
      .from("project_briefs")
      .select("inquiry_id, priority_score, priority_label")
      .in("inquiry_id", inquiryIds);

    if (briefError) {
      console.error("Admin inquiry priority list could not be loaded.", briefError.message);
    } else {
      projectBriefs = briefData ?? [];
    }
  }

  const priorityLookup = new Map(
    projectBriefs.map((brief) => [brief.inquiry_id, brief]),
  );

  const prepared = (data ?? []).map((inquiry) => ({
    ...inquiry,
    project_briefs: priorityLookup.has(inquiry.id)
      ? [priorityLookup.get(inquiry.id)]
      : [],
  }));

  prepared.sort((left, right) => {
    const leftPriority = left.project_briefs[0]?.priority_score ?? 0;
    const rightPriority = right.project_briefs[0]?.priority_score ?? 0;
    return rightPriority - leftPriority;
  });

  return NextResponse.json(
    { items: prepared, page, pageSize, totalCount: count ?? 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
