// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  vectorDelete: vi.fn(),
  vectorQuery: vi.fn(),
  vectorUpsert: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("@upstash/vector", () => ({
  Index: vi.fn(function () {
    return {
      namespace: vi.fn(() => ({
        delete: mocks.vectorDelete,
        query: mocks.vectorQuery,
        upsert: mocks.vectorUpsert,
      })),
    };
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: mocks.createSupabaseServiceClient,
}));

import {
  buildInquiryEmbeddingText,
  processInquirySimilarity,
} from "../../lib/inquiries/similarity";

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

describe("inquiry similarity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("UPSTASH_VECTOR_REST_URL", "https://vector.example.test");
    vi.stubEnv("UPSTASH_VECTOR_REST_TOKEN", "test-vector-token");
    mocks.vectorUpsert.mockResolvedValue("OK");
    mocks.vectorDelete.mockResolvedValue({ deleted: 1 });
    mocks.vectorQuery.mockResolvedValue([
      {
        id: "inquiry-current",
        score: 1,
        metadata: { inquiry_id: "inquiry-current" },
      },
      {
        id: "inquiry-neighbor",
        score: 0.87,
        metadata: { inquiry_id: "inquiry-neighbor" },
      },
    ]);
  });

  it("only assembles approved design fields for the embedding request", () => {
    const requestWithPrivateFields = {
      projectBrief: " A visual refresh ",
      designGoal: " Improve navigation ",
      brandMessage: "Warm and practical",
      targetAudience: "Local customers",
      desiredOutcomes: "More online bookings",
      name: "Ada Lovelace",
      email: "ada@example.test",
      references: "https://private.example.test",
    };

    const text = buildInquiryEmbeddingText(requestWithPrivateFields);

    expect(text).toContain("Project brief: A visual refresh");
    expect(text).toContain("Target audience: Local customers");
    expect(text).not.toContain("Ada Lovelace");
    expect(text).not.toContain("ada@example.test");
    expect(text).not.toContain("private.example.test");
  });

  it("embeds opted-in text, stores no raw text in Vector, and records neighbor IDs", async () => {
    const inquiryId = "inquiry-current";
    let inquiryCall = 0;
    const service = {
      from: vi.fn((table: string) => {
        if (table === "inquiry_briefs") {
          return createQuery({
            data: {
              design_goal: "Improve navigation",
              brand_message: "Warm and practical",
              target_audience: "Local customers",
              desired_outcomes: "More online bookings",
            },
            error: null,
          });
        }

        const result =
          inquiryCall++ === 0
            ? {
                data: {
                  id: inquiryId,
                  similarity_opt_in: true,
                  project_brief: "A visual refresh for a bakery",
                },
                error: null,
              }
            : inquiryCall === 2 || inquiryCall === 3
              ? { data: { id: inquiryId }, error: null }
              : { data: null, error: null };
        return createQuery(result);
      }),
    };
    mocks.createSupabaseServiceClient.mockReturnValue(service);

    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { input: string };
      expect(request.input).toContain("A visual refresh for a bakery");
      expect(request.input).not.toContain("ada@example.test");
      return new Response(
        JSON.stringify({
          data: [{ embedding: Array.from({ length: 1536 }, () => 0.01) }],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await processInquirySimilarity(inquiryId);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.vectorUpsert).toHaveBeenCalledWith({
      id: inquiryId,
      vector: expect.arrayContaining([0.01]),
      metadata: { inquiry_id: inquiryId },
    });
    expect(mocks.vectorUpsert.mock.calls[0][0]).not.toHaveProperty("data");
    expect(service.from).toHaveBeenCalledWith("inquiries");
  });

  it("does not call OpenAI or store a vector when consent is absent", async () => {
    const inquiry = createQuery({ data: null, error: null });
    mocks.createSupabaseServiceClient.mockReturnValue({
      from: vi.fn(() => inquiry),
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await processInquirySimilarity("inquiry-without-consent");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.vectorUpsert).not.toHaveBeenCalled();
    expect(mocks.vectorDelete).toHaveBeenCalledWith("inquiry-without-consent");
  });
});
