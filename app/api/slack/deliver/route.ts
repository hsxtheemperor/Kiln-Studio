import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { SlackMessageOutboxRow } from "@/lib/supabase/database.types";
import { decryptSlackToken } from "@/lib/slack/crypto";
import { processSlackOutboxMessage } from "@/lib/slack/outbox";
import {
  createSlackServiceClient,
} from "@/lib/slack/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const PayloadSchema = z.object({ messageId: z.string().uuid() }).strict();
const MAX_TASK_BODY_BYTES = 8_192;

async function readTaskBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_TASK_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function POST(request: Request) {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  const signature = request.headers.get("upstash-signature");

  if (!currentSigningKey || !nextSigningKey) {
    return NextResponse.json(
      { error: "QStash signature verification is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!signature) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_TASK_BODY_BYTES) {
    return NextResponse.json(
      { error: "Task payload is too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rawBody = await readTaskBody(request);
  if (rawBody === null) {
    return NextResponse.json(
      { error: "Task payload is too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const receiver = new Receiver({ currentSigningKey, nextSigningKey });
    const valid = await receiver.verify({ signature, body: rawBody, url: request.url });
    if (!valid) {
      return NextResponse.json(
        { error: "Unauthorized." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid task payload." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid task payload." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const service = createSlackServiceClient();
    const { data: installation, error: installationError } = await service
      .from("slack_installations")
      .select("encrypted_bot_token")
      .eq("id", true)
      .eq("is_active", true)
      .maybeSingle();
    if (installationError) throw new Error("Slack installation could not be loaded.");
    if (!installation?.encrypted_bot_token) {
      return NextResponse.json(
        { status: "skipped", reason: "Slack is not installed." },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const token = decryptSlackToken(installation.encrypted_bot_token);

    const { data: jobs, error: claimError } = await service.rpc(
      "claim_slack_message_outbox_by_message_id",
      { p_message_id: parsed.data.messageId },
    );
    if (claimError) throw new Error("Slack message delivery could not be claimed.");

    const job = (jobs ?? [])[0] as SlackMessageOutboxRow | undefined;
    if (!job) {
      return NextResponse.json(
        { status: "already_claimed_or_delivered" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await processSlackOutboxMessage(
      service,
      token,
      job,
      { immediateRetry: true },
    );
    if (result === "retry") {
      return NextResponse.json(
        { error: "Slack message delivery will be retried." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { status: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Queued Slack message delivery failed.", error);
    return NextResponse.json(
      { error: "Slack message delivery could not be completed." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
