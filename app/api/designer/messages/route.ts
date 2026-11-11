import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDesigner } from "@/lib/auth/require-designer";
import { readJsonBody } from "@/lib/http/read-json";
import { checkProjectMessageRateLimit } from "@/lib/rate-limit/project-messages";
import type { createSupabaseSessionClient } from "@/lib/supabase/session";

const InquiryIdSchema = z.string().uuid();
const MessageSchema = z.object({
  inquiry_id: InquiryIdSchema,
  body: z.string().trim().min(1).max(2000),
}).strict();
const PAGE_SIZE = 50;
type SessionClient = Awaited<ReturnType<typeof createSupabaseSessionClient>>;

async function canAccessInquiry(
  supabase: SessionClient,
  inquiryId: string,
) {
  const { data, error } = await supabase.rpc("can_access_inquiry_project", {
    p_inquiry_id: inquiryId,
  });
  if (error) {
    console.error("Designer inquiry assignment could not be verified.", error.message);
    return { allowed: false, response: NextResponse.json(
      { error: "Project access is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    ) };
  }
  if (!data) {
    return { allowed: false, response: NextResponse.json(
      { error: "The project was not found or is not assigned to you." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    ) };
  }
  return { allowed: true as const };
}

export async function GET(request: Request) {
  const authorization = await requireDesigner();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const { searchParams } = new URL(request.url);
  const inquiryId = InquiryIdSchema.safeParse(searchParams.get("inquiry_id"));
  const before = searchParams.get("before");

  if (!inquiryId.success || (before !== null && !Number.isFinite(Date.parse(before)))) {
    return NextResponse.json(
      { error: "A valid inquiry id and message cursor are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const access = await canAccessInquiry(authorization.supabase, inquiryId.data);
  if (!access.allowed) return access.response;

  let query = authorization.supabase
    .from("project_messages")
    .select("id, inquiry_id, sender_type, sender_id, sender_name, body, created_at")
    .eq("inquiry_id", inquiryId.data);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (error) {
    console.error("Designer messages could not be loaded.", error.message);
    return NextResponse.json(
      { error: "The project messages could not be loaded." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const hasMore = (data?.length ?? 0) > PAGE_SIZE;
  const messages = (data ?? []).slice(0, PAGE_SIZE).reverse();
  return NextResponse.json(
    {
      messages,
      hasMore,
      nextCursor: hasMore ? messages[0]?.created_at ?? null : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const authorization = await requireDesigner();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const body = await readJsonBody(request, 8_192);
  if (!body.ok) return body.response;
  const parsed = MessageSchema.safeParse(body.value);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid inquiry id and message body are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const access = await canAccessInquiry(authorization.supabase, parsed.data.inquiry_id);
  if (!access.allowed) return access.response;

  let rateLimit: Awaited<ReturnType<typeof checkProjectMessageRateLimit>>;
  try {
    rateLimit = await checkProjectMessageRateLimit(authorization.user.id);
  } catch (error) {
    console.error("Designer message rate limiting is unavailable.", error);
    return NextResponse.json(
      { error: "Messaging is temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!rateLimit.success) {
    const retryAfter = Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "You are sending messages too quickly. Please try again shortly." },
      {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfter) },
      },
    );
  }

  const userName =
    authorization.user.user_metadata?.full_name ||
    authorization.user.email ||
    "Designer";

  const { data, error } = await authorization.supabase
    .from("project_messages")
    .insert({
      inquiry_id: parsed.data.inquiry_id,
      sender_type: "designer",
      sender_id: authorization.user.id,
      sender_name: userName,
      body: parsed.data.body,
    })
    .select("id, inquiry_id, sender_type, sender_id, sender_name, body, created_at")
    .single();

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "You must be assigned to this project to send messages." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Designer message could not be saved.", error.message);
    return NextResponse.json(
      { error: "The message could not be saved." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { message: data },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
