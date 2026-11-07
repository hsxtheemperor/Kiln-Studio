import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudioMember } from "@/lib/auth/require-studio-member";
import { InquiryStatusSchema } from "@/lib/inquiries/schema";
import { readJsonBody } from "@/lib/http/read-json";

const IdSchema = z.string().uuid();
const UpdateSchema = z.object({ status: InquiryStatusSchema }).strict();

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
    .from("project_briefs")
    .select("id, inquiry_id, priority_score, priority_label, design_goal, brand_message, target_audience, desired_outcomes, references, time_budget, design_complexity")
    .eq("inquiry_id", id)
    .maybeSingle();

  if (briefError) {
    console.error("Admin inquiry priority detail could not be loaded.", briefError.message);
  }

  return NextResponse.json(
    { item: { ...data, project_briefs: briefData ? [briefData] : [] } },
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
      { error: "Only a valid inquiry status can be updated." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorization = await requireStudioMember();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const { data, error } = await authorization.supabase
    .from("inquiries")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Admin inquiry status could not be updated.");
    return NextResponse.json(
      { error: "The inquiry status could not be updated." },
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
    { message: "Inquiry status updated." },
    { headers: { "Cache-Control": "no-store" } },
  );
}
