import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDealLead } from "@/lib/auth/require-deal-lead";
import { readJsonBody } from "@/lib/http/read-json";
import type { EngagementReviewState } from "@/lib/supabase/database.types";

const IdSchema = z.string().uuid();
const UpdateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("review"),
    review_state: z.enum(["suitable", "not_suitable", "needs_info"]),
    notes: z.string().trim().max(2000).nullable().optional(),
  }).strict(),
  z.object({ action: z.literal("claim") }).strict(),
  z.object({
    action: z.literal("reassign"),
    deal_lead_id: z.string().uuid(),
  }).strict(),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!IdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid inquiry ID." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = UpdateSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid engagement action is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorization = await requireDealLead();
  if (!authorization.authorized) return authorization.response;
  if (
    parsed.data.action === "reassign" &&
    authorization.accessLevel !== "studio_member"
  ) {
    return NextResponse.json(
      { error: "Only a studio admin can reassign an engagement." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  let result: {
    data: unknown;
    error: { code: string; message: string } | null;
  };
  if (parsed.data.action === "review") {
    result = await authorization.supabase.rpc("review_engagement", {
      p_inquiry_id: id,
      p_review_state: parsed.data.review_state as EngagementReviewState,
      p_notes: parsed.data.notes ?? null,
    });
  } else if (parsed.data.action === "claim") {
    result = await authorization.supabase.rpc("claim_engagement", {
      p_inquiry_id: id,
    });
  } else {
    result = await authorization.supabase.rpc("reassign_engagement", {
      p_inquiry_id: id,
      p_deal_lead_id: parsed.data.deal_lead_id,
    });
  }

  if (result.error) {
    const { code, message } = result.error;
    if (code === "P0002") {
      return NextResponse.json(
        { error: "Engagement not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (code === "42501") {
      return NextResponse.json(
        { error: "You are not allowed to perform this engagement action." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (code === "23505" || code === "23514") {
      return NextResponse.json(
        { error: message },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (code === "22023") {
      return NextResponse.json(
        { error: "The engagement action contains invalid data." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("Engagement action failed.", code);
    return NextResponse.json(
      { error: "The engagement could not be updated." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { engagement: result.data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
