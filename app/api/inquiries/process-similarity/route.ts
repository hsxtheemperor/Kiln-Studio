import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { z } from "zod";
import { processInquirySimilarity } from "@/lib/inquiries/similarity";

export const runtime = "nodejs";

const PayloadSchema = z.object({ inquiryId: z.string().uuid() }).strict();
const MAX_TASK_BODY_BYTES = 8_192;

async function readTaskBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

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
    const isValid = await receiver.verify({
      signature,
      body: rawBody,
      url: request.url,
    });
    if (!isValid) {
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
    await processInquirySimilarity(parsed.data.inquiryId);
  } catch (error) {
    console.error("Queued inquiry similarity could not be processed.", error);
    return NextResponse.json(
      { error: "Inquiry similarity processing failed." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { message: "Inquiry similarity processed." },
    { headers: { "Cache-Control": "no-store" } },
  );
}
