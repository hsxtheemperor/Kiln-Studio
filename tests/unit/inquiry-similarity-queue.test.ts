// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  trigger: vi.fn(),
  processInquirySimilarity: vi.fn(),
}));

vi.mock("@upstash/workflow", () => ({
  Client: class {
    trigger = mocks.trigger;
  },
}));
vi.mock("../../lib/inquiries/similarity", () => ({
  processInquirySimilarity: mocks.processInquirySimilarity,
}));

import { queueInquirySimilarityProcessing } from "../../lib/inquiries/similarity-queue";

const inquiryId = "40000000-0000-4000-8000-000000000001";

describe("queueInquirySimilarityProcessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("QSTASH_TOKEN", "test-token");
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "current-test-key");
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next-test-key");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://kiln-studio.test/");
    mocks.trigger.mockResolvedValue({ workflowRunId: "test-workflow-run" });
    mocks.processInquirySimilarity.mockResolvedValue(undefined);
  });

  it("triggers the similarity workflow at the canonical endpoint", async () => {
    await expect(queueInquirySimilarityProcessing(inquiryId)).resolves.toEqual({
      queued: true,
    });

    expect(mocks.trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://kiln-studio.test/api/workflows/inquiry-similarity",
        body: { inquiryId },
        retries: 5,
        workflowRunId: expect.stringMatching(
          new RegExp(`^inquiry-similarity-${inquiryId}-`),
        ),
      }),
    );
    expect(mocks.processInquirySimilarity).not.toHaveBeenCalled();
  });

  it("processes inline for a local site URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

    await expect(queueInquirySimilarityProcessing(inquiryId)).resolves.toEqual({
      queued: false,
    });

    expect(mocks.trigger).not.toHaveBeenCalled();
    expect(mocks.processInquirySimilarity).toHaveBeenCalledWith(inquiryId);
  });

  it("reports missing production configuration instead of silently skipping work", async () => {
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "");

    await expect(queueInquirySimilarityProcessing(inquiryId)).rejects.toThrow(
      "QStash similarity processing is not configured.",
    );
    expect(mocks.trigger).not.toHaveBeenCalled();
    expect(mocks.processInquirySimilarity).not.toHaveBeenCalled();
  });
});
