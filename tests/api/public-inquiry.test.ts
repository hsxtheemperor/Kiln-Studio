// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  checkInquiryRateLimit: vi.fn(),
  createPublicInquiry: vi.fn(),
  queueInquiryReferenceProcessing: vi.fn(),
  queueInquirySimilarityProcessing: vi.fn(),
}));

vi.mock("@/lib/rate-limit/inquiry", () => ({
  checkInquiryRateLimit: mocks.checkInquiryRateLimit,
}));
vi.mock("@/lib/supabase/public-inquiry", () => ({
  createPublicInquiry: mocks.createPublicInquiry,
}));
vi.mock("@/lib/inquiries/reference-queue", () => ({
  queueInquiryReferenceProcessing: mocks.queueInquiryReferenceProcessing,
}));
vi.mock("@/lib/inquiries/similarity-queue", () => ({
  queueInquirySimilarityProcessing: mocks.queueInquirySimilarityProcessing,
}));

import { POST } from "../../app/api/inquiries/route";

function createRequest(payload: unknown): Request {
  return new Request("https://kiln-studio.test/api/inquiries", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "203.0.113.10",
    },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/inquiries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkInquiryRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mocks.createPublicInquiry.mockResolvedValue({ id: "mock-inquiry-id" });
    mocks.queueInquiryReferenceProcessing.mockResolvedValue({ pending: 0 });
    mocks.queueInquirySimilarityProcessing.mockResolvedValue({ queued: true });
  });

  it("persists a validated submission before returning confirmation", async () => {
    const response = await POST(
      createRequest({
        name: "Ada Lovelace",
        email: "ada@example.com",
        project_brief: "A new project identity",
        website: "",
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      message: "Your inquiry has been received.",
      referenceFilesPending: false,
      similarityPending: false,
    });
    expect(mocks.createPublicInquiry).toHaveBeenCalledWith({
      name: "Ada Lovelace",
      email: "ada@example.com",
      company: null,
      service: null,
      project_brief: "A new project identity",
      budget_range: null,
      timeline: null,
      priority_score: 0,
      similarity_opt_in: false,
    }, {
      design_goal: "",
      brand_message: "",
      target_audience: null,
      desired_outcomes: null,
      references: null,
      time_budget: null,
      design_complexity: null,
    }, []);
  });

  it("queues similarity processing only after explicit client consent", async () => {
    const response = await POST(
      createRequest({
        name: "Ada Lovelace",
        email: "ada@example.com",
        project_brief: "A new project identity",
        similarity_opt_in: true,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ similarityPending: true });
    expect(mocks.createPublicInquiry).toHaveBeenCalledWith(
      expect.objectContaining({ similarity_opt_in: true }),
      expect.any(Object),
      [],
    );
    expect(mocks.queueInquirySimilarityProcessing).toHaveBeenCalledWith(
      "mock-inquiry-id",
    );
  });

  it("rejects honeypot submissions without persisting them", async () => {
    const response = await POST(
      createRequest({
        name: "Automated submission",
        email: "bot@example.com",
        project_brief: "Spam",
        website: "https://spam.example",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.checkInquiryRateLimit).not.toHaveBeenCalled();
    expect(mocks.createPublicInquiry).not.toHaveBeenCalled();
  });

  it("returns a rate-limit response without writing to the database", async () => {
    mocks.checkInquiryRateLimit.mockResolvedValue({
      success: false,
      reset: Date.now() + 60_000,
    });

    const response = await POST(
      createRequest({
        name: "Ada Lovelace",
        email: "ada@example.com",
        project_brief: "A new project identity",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(mocks.createPublicInquiry).not.toHaveBeenCalled();
  });

  it("does not claim success when persistence fails", async () => {
    mocks.createPublicInquiry.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(
      createRequest({
        name: "Ada Lovelace",
        email: "ada@example.com",
        project_brief: "A new project identity",
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "We could not save your inquiry. Please try again later.",
    });
  });
});
