// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  from: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: mocks.createSupabaseServiceClient,
}));

import { persistCustomerSupportMessage } from "../../lib/assistant/customer-support-messages";

describe("persistCustomerSupportMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ upsert: mocks.upsert });
    mocks.createSupabaseServiceClient.mockReturnValue({ from: mocks.from });
  });

  it("stores the question and answer idempotently without user identity", async () => {
    const message = {
      requestId: "40000000-0000-4000-8000-000000000001",
      question: "What services do you offer?",
      answer: "Brand identity, web design, and product design.",
      model: "gemini-3.8-flash",
    };

    await expect(persistCustomerSupportMessage(message)).resolves.toBeUndefined();
    expect(mocks.from).toHaveBeenCalledWith("customer_support_messages");
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        request_id: message.requestId,
        question: message.question,
        answer: message.answer,
        model: message.model,
      },
      { onConflict: "request_id", ignoreDuplicates: true },
    );
  });

  it("surfaces database failures for Workflow retry", async () => {
    mocks.upsert.mockResolvedValue({ error: { message: "database unavailable" } });

    await expect(
      persistCustomerSupportMessage({
        requestId: "40000000-0000-4000-8000-000000000001",
        question: "How do I start?",
        answer: "Use the inquiry page.",
        model: "gemini-3.8-flash",
      }),
    ).rejects.toThrow("The customer support message could not be saved.");
  });
});
