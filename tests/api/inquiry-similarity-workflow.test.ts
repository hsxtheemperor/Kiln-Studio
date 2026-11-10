// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requestPayload: {} as unknown,
  run: vi.fn(),
  hasInquirySimilarityConsent: vi.fn(),
  processInquirySimilarity: vi.fn(),
}));

vi.mock("@upstash/workflow/nextjs", () => ({
  serve: (
    callback: (context: {
      requestPayload: unknown;
      run: (name: string, operation: () => Promise<unknown>) => Promise<unknown>;
    }) => Promise<void>,
  ) => ({
    POST: async (_request: Request) => {
      try {
        await callback({
          requestPayload: mocks.requestPayload,
          run: mocks.run,
        });
        return new Response(null, { status: 200 });
      } catch {
        return new Response(null, { status: 500 });
      }
    },
  }),
}));
vi.mock("@/lib/inquiries/similarity", () => ({
  hasInquirySimilarityConsent: mocks.hasInquirySimilarityConsent,
  processInquirySimilarity: mocks.processInquirySimilarity,
}));

import { POST } from "../../app/api/workflows/inquiry-similarity/route";

const inquiryId = "40000000-0000-4000-8000-000000000001";

describe("POST /api/workflows/inquiry-similarity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestPayload = { inquiryId };
    mocks.run.mockImplementation(
      async (_name: string, operation: () => Promise<unknown>) => operation(),
    );
    mocks.hasInquirySimilarityConsent.mockResolvedValue(true);
    mocks.processInquirySimilarity.mockResolvedValue(undefined);
  });

  it("verifies consent and runs the similarity operation as durable workflow steps", async () => {
    const response = await POST(
      new Request("https://kiln-studio.test/api/workflows/inquiry-similarity", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenNthCalledWith(
      1,
      "verify-explicit-similarity-consent",
      expect.any(Function),
    );
    expect(mocks.run).toHaveBeenNthCalledWith(
      2,
      "process-consented-inquiry-similarity",
      expect.any(Function),
    );
    expect(mocks.hasInquirySimilarityConsent).toHaveBeenCalledWith(inquiryId);
    expect(mocks.processInquirySimilarity).toHaveBeenCalledWith(inquiryId);
  });

  it("does not process or embed an inquiry without client consent", async () => {
    mocks.hasInquirySimilarityConsent.mockResolvedValue(false);

    const response = await POST(
      new Request("https://kiln-studio.test/api/workflows/inquiry-similarity", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.processInquirySimilarity).not.toHaveBeenCalled();
    expect(mocks.run).toHaveBeenCalledOnce();
  });

  it("rejects malformed workflow payloads without processing", async () => {
    mocks.requestPayload = { inquiryId: "invalid" };

    const response = await POST(
      new Request("https://kiln-studio.test/api/workflows/inquiry-similarity", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    expect(mocks.processInquirySimilarity).not.toHaveBeenCalled();
  });

  it("propagates processing failures so Workflow can retry the step", async () => {
    mocks.processInquirySimilarity.mockRejectedValue(new Error("Vector unavailable."));

    const response = await POST(
      new Request("https://kiln-studio.test/api/workflows/inquiry-similarity", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
  });
});
