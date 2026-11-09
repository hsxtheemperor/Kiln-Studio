import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySlackRequestSignature } from "@/lib/slack/crypto";
import { createSlackServiceClient } from "@/lib/slack/service";

const SlackEventPayloadSchema = z.object({
  type: z.string(),
  challenge: z.string().optional(),
  event_id: z.string().min(1).max(255).optional(),
  team_id: z.string().optional(),
  event: z.object({
    type: z.string(),
    subtype: z.string().optional(),
    bot_id: z.string().optional(),
    channel: z.string().optional(),
    user: z.string().optional(),
    ts: z.string().optional(),
    text: z.string().optional(),
  }).optional(),
});

async function readBoundedBody(request: Request, maxBytes: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function POST(request: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error("Slack event signing secret is not configured.");
    return NextResponse.json({ error: "Slack events are not configured." }, { status: 503 });
  }

  const rawBody = await readBoundedBody(request, 1_000_000);
  if (rawBody === null) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }

  if (
    !verifySlackRequestSignature(
      signingSecret,
      request.headers.get("x-slack-request-timestamp"),
      request.headers.get("x-slack-signature"),
      rawBody,
    )
  ) {
    return NextResponse.json({ error: "Invalid Slack signature." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = SlackEventPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Slack event payload." }, { status: 400 });
  }
  if (parsed.data.type === "url_verification" && parsed.data.challenge) {
    return NextResponse.json({ challenge: parsed.data.challenge });
  }
  if (parsed.data.type !== "event_callback") {
    return NextResponse.json({ ok: true });
  }

  const event = parsed.data.event;
  const eventId = parsed.data.event_id;
  const teamId = parsed.data.team_id;
  if (event?.type === "app_uninstalled" && teamId) {
    try {
      const service = createSlackServiceClient();
      const { data, error } = await service
        .from("slack_installations")
        .update({
          is_active: false,
          encrypted_bot_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true)
        .eq("workspace_id", teamId)
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("Slack uninstall event could not revoke the stored installation.", error.message);
        return NextResponse.json({ error: "Slack installation could not be revoked." }, { status: 503 });
      }
      return NextResponse.json({ ok: true, outcome: data ? "revoked" : "ignored" });
    } catch (error) {
      console.error("Slack uninstall event processing failed.", error);
      return NextResponse.json({ error: "Slack uninstall event processing failed." }, { status: 503 });
    }
  }

  if (
    !event ||
    !eventId ||
    event.type !== "message" ||
    event.subtype ||
    event.bot_id ||
    !event.channel ||
    !event.user ||
    !event.ts ||
    typeof event.text !== "string"
  ) {
    return NextResponse.json({ ok: true });
  }

  try {
    const service = createSlackServiceClient();
    const { data: installation, error: installationError } = await service
      .from("slack_installations")
      .select("workspace_id, is_active")
      .eq("id", true)
      .maybeSingle();
    if (installationError) {
      console.error("Slack workspace could not be verified.", installationError.message);
      return NextResponse.json({ error: "Slack workspace could not be verified." }, { status: 503 });
    }
    if (!installation?.is_active || !teamId || installation.workspace_id !== teamId) {
      return NextResponse.json({ ok: true, outcome: "ignored" });
    }

    const { data: outcome, error } = await service.rpc("persist_slack_inbound_message", {
      p_event_id: eventId,
      p_provider_channel_id: event.channel,
      p_provider_message_ts: event.ts,
      p_slack_user_id: event.user,
      p_body: event.text,
    });
    if (error) {
      console.error("Verified Slack message event could not be persisted.", error.message);
      return NextResponse.json({ error: "Slack message could not be stored." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    console.error("Verified Slack event processing failed.", error);
    return NextResponse.json({ error: "Slack event processing failed." }, { status: 503 });
  }
}
