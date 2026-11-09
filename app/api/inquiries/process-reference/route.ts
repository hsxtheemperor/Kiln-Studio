import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { z } from "zod";
import { processInquiryReferenceFile } from "@/lib/inquiries/reference-files";

export const runtime = "nodejs";

const PayloadSchema = z.object({ referenceId: z.string().uuid() }).strict();

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

  const rawBody = await request.text();
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
    await processInquiryReferenceFile(parsed.data.referenceId);
  } catch (error) {
    console.error("Queued inquiry reference image could not be processed.", error);
    return NextResponse.json(
      { error: "Reference image processing failed." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { message: "Reference image processed." },
    { headers: { "Cache-Control": "no-store" } },
  );
}
