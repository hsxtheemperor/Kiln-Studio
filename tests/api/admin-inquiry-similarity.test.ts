// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireStudioMember: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
  disableInquirySimilarity: vi.fn(),
  queueInquirySimilarityProcessing: vi.fn(),
}));

vi.mock("@/lib/auth/require-studio-member", () => ({
  requireStudioMember: mocks.requireStudioMember,
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: mocks.createSupabaseServiceClient,
}));
vi.mock("@/lib/inquiries/similarity", () => ({
  disableInquirySimilarity: mocks.disableInquirySimilarity,
  readSimilarityMatches: vi.fn(() => []),
}));
vi.mock("@/lib/inquiries/similarity-queue", () => ({
  queueInquirySimilarityProcessing: mocks.queueInquirySimilarityProcessing,
}));

import { PATCH } from "../../app/api/admin/inquiries/[id]/route";

const inquiryId = "40000000-0000-4000-8000-000000000001";

function createRequest(payload: unknown) {
  return new Request(`https://kiln-studio.test/api/admin/inquiries/${inquiryId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function createQuery(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query),
    update: vi.fn(() => query),
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return query;
}

describe("PATCH /api/admin/inquiries/[id] similarity actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStudioMember.mockResolvedValue({
      authorized: true,
      supabase: {},
    });
    mocks.disableInquirySimilarity.mockResolvedValue(undefined);
    mocks.queueInquirySimilarityProcessing.mockResolvedValue({ queued: true });
  });

  it("queues a retry only for an opted-in inquiry", async () => {
    let call = 0;
    const from = vi.fn(() =>
      createQuery(
        call++ === 0
          ? {
              data: { id: inquiryId, similarity_opt_in: true },
              error: null,
            }
          : { data: null, error: null },
      ),
    );
    mocks.createSupabaseServiceClient.mockReturnValue({ from });

    const response = await PATCH(
      createRequest({ similarity_retry: true }),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.queueInquirySimilarityProcessing).toHaveBeenCalledWith(inquiryId);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("refuses a retry when the client has not opted in", async () => {
    mocks.createSupabaseServiceClient.mockReturnValue({
      from: vi.fn(() =>
        createQuery({
          data: { id: inquiryId, similarity_opt_in: false },
          error: null,
        }),
      ),
    });

    const response = await PATCH(
      createRequest({ similarity_retry: true }),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    expect(response.status).toBe(409);
    expect(mocks.queueInquirySimilarityProcessing).not.toHaveBeenCalled();
  });

  it("removes similarity consent and delegates vector deletion", async () => {
    const response = await PATCH(
      createRequest({ similarity_opt_in: false }),
      { params: Promise.resolve({ id: inquiryId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.disableInquirySimilarity).toHaveBeenCalledWith(inquiryId);
    expect(mocks.queueInquirySimilarityProcessing).not.toHaveBeenCalled();
  });
});
