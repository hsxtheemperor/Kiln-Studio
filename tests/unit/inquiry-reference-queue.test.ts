// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  publishJSON: vi.fn(),
  processInquiryReferenceFile: vi.fn(),
}));

vi.mock("@upstash/qstash", () => ({
  Client: class {
    publishJSON = mocks.publishJSON;
  },
}));
vi.mock("../../lib/inquiries/reference-files", () => ({
  processInquiryReferenceFile: mocks.processInquiryReferenceFile,
}));

import { queueInquiryReferenceProcessing } from "../../lib/inquiries/reference-queue";

describe("queueInquiryReferenceProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("QSTASH_TOKEN", "test-token");
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "current-test-key");
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next-test-key");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://kiln-studio.test/");
    mocks.publishJSON.mockResolvedValue({ messageId: "test-message-id" });
    mocks.processInquiryReferenceFile.mockResolvedValue(undefined);
  });

  it("does not publish an empty batch", async () => {
    await expect(queueInquiryReferenceProcessing([])).resolves.toEqual({
      pending: 0,
    });
    expect(mocks.publishJSON).not.toHaveBeenCalled();
  });

  it("publishes an idempotent QStash job to the canonical callback", async () => {
    const referenceId = "40000000-0000-4000-8000-000000000001";

    await expect(queueInquiryReferenceProcessing([referenceId])).resolves.toEqual({
      pending: 0,
    });
    expect(mocks.publishJSON).toHaveBeenCalledWith({
      url: "https://kiln-studio.test/api/inquiries/process-reference",
      body: { referenceId },
      retries: 5,
      deduplicationId: `inquiry-reference-${referenceId}`,
    });
    expect(mocks.processInquiryReferenceFile).not.toHaveBeenCalled();
  });

  it("verifies inline when QStash is not configured", async () => {
    vi.stubEnv("QSTASH_TOKEN", "");
    const referenceId = "40000000-0000-4000-8000-000000000001";

    await expect(queueInquiryReferenceProcessing([referenceId])).resolves.toEqual({
      pending: 0,
    });
    expect(mocks.publishJSON).not.toHaveBeenCalled();
    expect(mocks.processInquiryReferenceFile).toHaveBeenCalledWith(referenceId);
  });

  it("falls back to inline verification when queue publication fails", async () => {
    mocks.publishJSON.mockRejectedValue(new Error("QStash unavailable"));
    const referenceId = "40000000-0000-4000-8000-000000000001";

    await expect(queueInquiryReferenceProcessing([referenceId])).resolves.toEqual({
      pending: 0,
    });
    expect(mocks.processInquiryReferenceFile).toHaveBeenCalledWith(referenceId);
  });

  it("reports work as pending when queueing and inline verification both fail", async () => {
    mocks.publishJSON.mockRejectedValue(new Error("QStash unavailable"));
    mocks.processInquiryReferenceFile.mockRejectedValue(
      new Error("Supabase Storage unavailable"),
    );

    await expect(
      queueInquiryReferenceProcessing([
        "40000000-0000-4000-8000-000000000001",
      ]),
    ).resolves.toEqual({ pending: 1 });
  });
});
