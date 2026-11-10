// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  trigger: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
  generateClientChatAnswer: vi.fn(),
  persistCustomerSupportMessage: vi.fn(),
}));

vi.mock("@upstash/workflow", () => ({
  Client: class {
    trigger = mocks.trigger;
  },
}));
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: mocks.redisGet,
      set: mocks.redisSet,
      del: mocks.redisDel,
    }),
  },
}));
vi.mock("../../lib/assistant/client-chat", () => ({
  generateClientChatAnswer: mocks.generateClientChatAnswer,
}));
vi.mock("../../lib/assistant/customer-support-messages", () => ({
  persistCustomerSupportMessage: mocks.persistCustomerSupportMessage,
}));

import {
  queueClientChatAnswer,
  readClientChatResult,
  storeClientChatAnswer,
} from "../../lib/assistant/client-chat-queue";

const requestId = "40000000-0000-4000-8000-000000000001";

describe("client assistant queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("QSTASH_TOKEN", "test-token");
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "current-test-key");
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next-test-key");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://kiln-studio.test");
    mocks.trigger.mockResolvedValue({ workflowRunId: "test-run" });
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.redisDel.mockResolvedValue(1);
    mocks.generateClientChatAnswer.mockResolvedValue({
      answer: "Public studio answer.",
      model: "gemini-3.8-flash",
    });
    mocks.persistCustomerSupportMessage.mockResolvedValue(undefined);
  });

  it("initializes a short-lived result and triggers a Workflow", async () => {
    const history = [{ role: "user" as const, text: "What do you do?" }];
    await queueClientChatAnswer(requestId, "How do I start? ", history);

    expect(mocks.redisSet).toHaveBeenCalledWith(
      `kiln-studio:client-chat:result:${requestId}`,
      JSON.stringify({ status: "pending" }),
      { ex: 600 },
    );
    expect(mocks.trigger).toHaveBeenCalledWith({
      url: "https://kiln-studio.test/api/workflows/client-chat",
      body: { requestId, message: "How do I start? ", history },
      retries: 5,
      workflowRunId: `client-chat-${requestId}`,
    });
    expect(mocks.generateClientChatAnswer).not.toHaveBeenCalled();
  });

  it("answers inline for local development without publishing a Workflow", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

    await queueClientChatAnswer(requestId, "What services do you offer?");

    expect(mocks.trigger).not.toHaveBeenCalled();
    expect(mocks.generateClientChatAnswer).toHaveBeenCalledWith(
      "What services do you offer?",
      [],
    );
    expect(mocks.persistCustomerSupportMessage).toHaveBeenCalledWith({
      requestId,
      question: "What services do you offer?",
      answer: "Public studio answer.",
      model: "gemini-3.8-flash",
    });
    expect(mocks.redisSet).toHaveBeenLastCalledWith(
      `kiln-studio:client-chat:result:${requestId}`,
      JSON.stringify({ status: "ready", answer: "Public studio answer." }),
      { ex: 600 },
    );
    expect(mocks.persistCustomerSupportMessage).toHaveBeenCalledWith({
      requestId,
      question: "What services do you offer?",
      answer: "Public studio answer.",
      model: "gemini-3.8-flash",
    });
  });

  it("removes pending state if Workflow publication fails", async () => {
    mocks.trigger.mockRejectedValue(new Error("QStash unavailable."));

    await expect(
      queueClientChatAnswer(requestId, "How do I start?"),
    ).rejects.toThrow("QStash unavailable.");
    expect(mocks.redisDel).toHaveBeenCalledWith(
      `kiln-studio:client-chat:result:${requestId}`,
    );
  });

  it("reads pending and ready responses and reports missing records", async () => {
    mocks.redisGet.mockResolvedValueOnce(JSON.stringify({ status: "pending" }));
    await expect(readClientChatResult(requestId)).resolves.toEqual({
      status: "pending",
    });
    mocks.redisGet.mockResolvedValueOnce(
      JSON.stringify({ status: "ready", answer: "Here is an answer." }),
    );
    await expect(readClientChatResult(requestId)).resolves.toEqual({
      status: "ready",
      answer: "Here is an answer.",
    });
    mocks.redisGet.mockResolvedValueOnce(null);
    await expect(readClientChatResult(requestId)).resolves.toEqual({
      status: "not_found",
    });
  });

  it("stores completed answers with a bounded lifetime", async () => {
    await storeClientChatAnswer(requestId, "Done.");

    expect(mocks.redisSet).toHaveBeenCalledWith(
      `kiln-studio:client-chat:result:${requestId}`,
      JSON.stringify({ status: "ready", answer: "Done." }),
      { ex: 600 },
    );
  });
});
