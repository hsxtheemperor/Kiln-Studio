// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requestPayload: {} as unknown,
  run: vi.fn(),
  generateClientChatAnswer: vi.fn(),
  storeClientChatAnswer: vi.fn(),
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
vi.mock("@/lib/assistant/client-chat", () => ({
  generateClientChatAnswer: mocks.generateClientChatAnswer,
}));
vi.mock("@/lib/assistant/client-chat-queue", () => ({
  storeClientChatAnswer: mocks.storeClientChatAnswer,
}));

import { POST } from "../../app/api/workflows/client-chat/route";

const requestId = "40000000-0000-4000-8000-000000000001";
const message = "How do I start a project?";

describe("POST /api/workflows/client-chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestPayload = { requestId, message };
    mocks.run.mockImplementation(
      async (_name: string, operation: () => Promise<unknown>) => operation(),
    );
    mocks.generateClientChatAnswer.mockResolvedValue(
      "Share the project through the inquiry form.",
    );
    mocks.storeClientChatAnswer.mockResolvedValue(undefined);
  });

  it("answers public questions and stores only a short-lived result", async () => {
    const response = await POST(
      new Request("https://kiln-studio.test/api/workflows/client-chat", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenNthCalledWith(
      1,
      "answer-public-studio-question",
      expect.any(Function),
    );
    expect(mocks.run).toHaveBeenNthCalledWith(
      2,
      "store-short-lived-assistant-result",
      expect.any(Function),
    );
    expect(mocks.generateClientChatAnswer).toHaveBeenCalledWith(message);
    expect(mocks.storeClientChatAnswer).toHaveBeenCalledWith(
      requestId,
      "Share the project through the inquiry form.",
    );
  });

  it("rejects malformed workflow payloads", async () => {
    mocks.requestPayload = { requestId, message: "x".repeat(1001) };

    const response = await POST(
      new Request("https://kiln-studio.test/api/workflows/client-chat", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    expect(mocks.generateClientChatAnswer).not.toHaveBeenCalled();
  });

  it("propagates provider failures so Workflow can retry", async () => {
    mocks.generateClientChatAnswer.mockRejectedValue(new Error("Provider unavailable."));

    const response = await POST(
      new Request("https://kiln-studio.test/api/workflows/client-chat", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(500);
    expect(mocks.storeClientChatAnswer).not.toHaveBeenCalled();
  });
});
