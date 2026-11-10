// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  processInquiryReferenceFile: vi.fn(),
}));

vi.mock("@/lib/inquiries/reference-files", () => ({
  processInquiryReferenceFile: mocks.processInquiryReferenceFile,
}));

import { POST } from "../../app/api/inquiries/process-reference/route";

function createRequest(payload: unknown, signature = "signed") {
  return new Request("https://kiln-studio.test/api/inquiries/process-reference", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "upstash-signature": signature,
    },
    body: JSON.stringify(payload),
  });
}

function signQStashRequest(
  body: string,
  url: string,
  key: string,
  options: { subject?: string; signedBody?: string } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({
      iss: "Upstash",
      sub: options.subject ?? url,
      body: createHash("sha256")
        .update(options.signedBody ?? body)
        .digest("base64url"),
      nbf: now - 1,
      exp: now + 60,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", key)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

describe("POST /api/inquiries/process-reference", () => {
  const signingKey = "unit-test-qstash-key";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", signingKey);
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next-test-qstash-key");
    mocks.processInquiryReferenceFile.mockResolvedValue(undefined);
  });

  it("requires a valid QStash signature before processing a file", async () => {
    const request = createRequest({
      referenceId: "40000000-0000-4000-8000-000000000001",
    });
    const invalidSignature = signQStashRequest(
      JSON.stringify({ referenceId: "40000000-0000-4000-8000-000000000001" }),
      request.url,
      "wrong-signing-key",
    );

    const response = await POST(
      createRequest(
        { referenceId: "40000000-0000-4000-8000-000000000001" },
        invalidSignature,
      ),
    );

    expect(response.status).toBe(401);
    expect(mocks.processInquiryReferenceFile).not.toHaveBeenCalled();
  });

  it("processes verified QStash tasks", async () => {
    const referenceId = "40000000-0000-4000-8000-000000000001";
    const body = JSON.stringify({ referenceId });
    const request = new Request(
      "https://kiln-studio.test/api/inquiries/process-reference",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "upstash-signature": signQStashRequest(
            body,
            "https://kiln-studio.test/api/inquiries/process-reference",
            signingKey,
          ),
        },
        body,
      },
    );
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.processInquiryReferenceFile).toHaveBeenCalledWith(referenceId);
  });

  it("rejects a signature when the body or target URL is changed", async () => {
    const referenceId = "40000000-0000-4000-8000-000000000001";
    const body = JSON.stringify({ referenceId });
    const url = "https://kiln-studio.test/api/inquiries/process-reference";
    const bodyMismatchRequest = new Request(url, {
      method: "POST",
      headers: {
        "upstash-signature": signQStashRequest(
          body,
          url,
          signingKey,
          { signedBody: JSON.stringify({ referenceId: "40000000-0000-4000-8000-000000000002" }) },
        ),
      },
      body,
    });
    expect((await POST(bodyMismatchRequest)).status).toBe(401);

    const urlMismatchRequest = new Request(url, {
      method: "POST",
      headers: {
        "upstash-signature": signQStashRequest(
          body,
          url,
          signingKey,
          { subject: "https://attacker.example/api/inquiries/process-reference" },
        ),
      },
      body,
    });
    expect((await POST(urlMismatchRequest)).status).toBe(401);
    expect(mocks.processInquiryReferenceFile).not.toHaveBeenCalled();
  });

  it("returns a retryable failure when processing fails", async () => {
    mocks.processInquiryReferenceFile.mockRejectedValue(new Error("storage unavailable"));

    const body = JSON.stringify({
      referenceId: "40000000-0000-4000-8000-000000000001",
    });
    const url = "https://kiln-studio.test/api/inquiries/process-reference";
    const response = await POST(
      new Request(url, {
        method: "POST",
        headers: {
          "upstash-signature": signQStashRequest(body, url, signingKey),
        },
        body,
      }),
    );

    expect(response.status).toBe(503);
  });
});
