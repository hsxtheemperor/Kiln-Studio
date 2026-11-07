import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDesigner } from "@/lib/auth/require-designer";

const MessageSchema = z.object({
  inquiry_id: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export async function GET(request: Request) {
  const authorization = await requireDesigner();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const { searchParams } = new URL(request.url);
  const inquiryId = searchParams.get("inquiry_id");

  if (!inquiryId) {
    return NextResponse.json(
      { error: "An inquiry id is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await authorization.supabase
    .from("project_messages")
    .select("id, inquiry_id, sender_type, sender_id, sender_name, body, created_at")
    .eq("inquiry_id", inquiryId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Designer messages could not be loaded.", error.message);
    return NextResponse.json(
      { error: "The project messages could not be loaded." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({ messages: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const authorization = await requireDesigner();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = MessageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid inquiry id and message body are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
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
