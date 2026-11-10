import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/http/read-json";
import { checkClientChatRateLimit } from "@/lib/rate-limit/client-chat";
import {
  queueClientChatAnswer,
  readClientChatResult,
} from "@/lib/assistant/client-chat-queue";

export const runtime = "nodejs";

const RequestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z.array(
    z.object({
      role: z.enum(["user", "model"]),
      text: z.string().trim().min(1).max(2000),
    }).strict(),
  ).max(8).optional().default([]),
}).strict();
const RequestIdSchema = z.string().uuid();

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return body.response;
  }
  const parsed = RequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a message of up to 1000 characters." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const identifier =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  let rateLimit: Awaited<ReturnType<typeof checkClientChatRateLimit>>;
  try {
    rateLimit = await checkClientChatRateLimit(identifier);
  } catch (error) {
    console.error("Client assistant rate limiting is unavailable.", error);
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!rateLimit.success) {
    const retryAfter = Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Please wait before asking another question." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  const requestId = randomUUID();
  try {
    await queueClientChatAnswer(
      requestId,
      parsed.data.message,
      parsed.data.history,
    );
  } catch (error) {
    console.error("Client assistant request could not be queued.", error);
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable. Please try again later." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { requestId },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const requestId = new URL(request.url).searchParams.get("id") ?? "";
  if (!RequestIdSchema.safeParse(requestId).success) {
    return NextResponse.json(
      { error: "A valid assistant request ID is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await readClientChatResult(requestId);
    if (result.status === "not_found") {
      return NextResponse.json(
        { error: "Assistant response expired or was not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Client assistant result could not be read.", error);
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
