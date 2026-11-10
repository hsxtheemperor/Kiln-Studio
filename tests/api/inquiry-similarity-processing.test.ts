// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  processInquirySimilarity: vi.fn(),
}));

vi.mock("@/lib/inquiries/similarity", () => ({
  processInquirySimilarity: mocks.processInquirySimilarity,
}));

import { POST } from "../../app/api/inquiries/process-similarity/route";

const url = "https://kiln-studio.test/api/inquiries/process-similarity";
const signingKey = "unit-test-qstash-key";

function signRequest(body: string, requestUrl: string, key: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "Upstash",
      sub: requestUrl,
      body: createHash("sha256").update(body).digest("base64url"),
      nbf: now - 1,
      exp: now + 60,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", key)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function createRequest(body: string, key = signingKey) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "upstash-signature": signRequest(body, url, key),
    },
    body,
  });
}

describe("POST /api/inquiries/process-similarity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", signingKey);
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next-test-qstash-key");
    mocks.processInquirySimilarity.mockResolvedValue(undefined);
  });

  it("verifies QStash signatures before processing opted-in inquiries", async () => {
    const body = JSON.stringify({
      inquiryId: "40000000-0000-4000-8000-000000000001",
    });

    const invalidResponse = await POST(
      createRequest(body, "wrong-signing-key"),
    );
    expect(invalidResponse.status).toBe(401);
    expect(mocks.processInquirySimilarity).not.toHaveBeenCalled();

    const response = await POST(createRequest(body));
    expect(response.status).toBe(200);
    expect(mocks.processInquirySimilarity).toHaveBeenCalledWith(
      "40000000-0000-4000-8000-000000000001",
    );
  });

  it("rejects malformed task payloads without processing them", async () => {
    const response = await POST(
      createRequest(JSON.stringify({ inquiryId: "not-a-uuid" })),
    );

    expect(response.status).toBe(400);
    expect(mocks.processInquirySimilarity).not.toHaveBeenCalled();
  });

  it("returns a retryable failure when similarity processing fails", async () => {
    mocks.processInquirySimilarity.mockRejectedValue(
      new Error("Similarity service unavailable."),
    );

    const response = await POST(
      createRequest(
        JSON.stringify({
          inquiryId: "40000000-0000-4000-8000-000000000001",
        }),
      ),
    );

    expect(response.status).toBe(503);
  });
});
