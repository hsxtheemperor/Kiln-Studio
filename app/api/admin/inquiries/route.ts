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
    .order("priority_score", { ascending: false })
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

  return NextResponse.json(
    { items: data ?? [], page, pageSize, totalCount: count ?? 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
