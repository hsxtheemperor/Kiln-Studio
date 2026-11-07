import { NextResponse } from "next/server";

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

export async function readJsonBody(
  request: Request,
  maxBytes = 16_384,
): Promise<JsonBodyResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Content-Type must be application/json." },
        { status: 415 },
      ),
    };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Request body is too large." },
          { status: 413 },
        ),
      };
    }
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Request body is too large." },
            { status: 413 },
          ),
        };
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 },
      ),
    };
  }
}
