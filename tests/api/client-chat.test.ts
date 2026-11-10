// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  checkClientChatRateLimit: vi.fn(),
  queueClientChatAnswer: vi.fn(),
  readClientChatResult: vi.fn(),
}));

vi.mock("@/lib/rate-limit/client-chat", () => ({
  checkClientChatRateLimit: mocks.checkClientChatRateLimit,
}));
vi.mock("@/lib/assistant/client-chat-queue", () => ({
  queueClientChatAnswer: mocks.queueClientChatAnswer,
  readClientChatResult: mocks.readClientChatResult,
}));

import { GET, POST } from "../../app/api/client-chat/route";

function createRequest(payload: unknown) {
  return new Request("https://kiln-studio.test/api/client-chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "203.0.113.31",
    },
    body: JSON.stringify(payload),
  });
}

describe("/api/client-chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkClientChatRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mocks.queueClientChatAnswer.mockResolvedValue(undefined);
    mocks.readClientChatResult.mockResolvedValue({
      status: "ready",
      answer: "The studio offers web design.",
    });
  });

  it("queues a public assistant question after rate limiting", async () => {
    const response = await POST(createRequest({ message: "What services do you offer?" }));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(mocks.checkClientChatRateLimit).toHaveBeenCalledWith("203.0.113.31");
    expect(mocks.queueClientChatAnswer).toHaveBeenCalledWith(
      payload.requestId,
      "What services do you offer?",
      [],
    );
  });

  it("passes bounded conversation context to the assistant", async () => {
    const history = [
      { role: "user", text: "What services do you offer?" },
      { role: "model", text: "Brand, web, and product design." },
    ];
    const response = await POST(
      createRequest({ message: "Which includes UX?", history }),
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(mocks.queueClientChatAnswer).toHaveBeenCalledWith(
      payload.requestId,
      "Which includes UX?",
      history,
    );
  });

  it("rejects malformed or oversized questions before rate limiting", async () => {
    const response = await POST(createRequest({ message: "x".repeat(1001) }));

    expect(response.status).toBe(400);
    expect(mocks.checkClientChatRateLimit).not.toHaveBeenCalled();
    expect(mocks.queueClientChatAnswer).not.toHaveBeenCalled();
  });

  it("rejects oversized conversation context before rate limiting", async () => {
    const response = await POST(
      createRequest({
        message: "Hello",
        history: Array.from({ length: 9 }, () => ({
          role: "user",
          text: "Earlier question",
        })),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.checkClientChatRateLimit).not.toHaveBeenCalled();
    expect(mocks.queueClientChatAnswer).not.toHaveBeenCalled();
  });

  it("does not enqueue when rate limited", async () => {
    mocks.checkClientChatRateLimit.mockResolvedValue({
      success: false,
      reset: Date.now() + 60_000,
    });

    const response = await POST(createRequest({ message: "Hello" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(mocks.queueClientChatAnswer).not.toHaveBeenCalled();
  });

  it("returns saved short-lived assistant results", async () => {
    const requestId = "40000000-0000-4000-8000-000000000001";
    const response = await GET(
      new Request(`https://kiln-studio.test/api/client-chat?id=${requestId}`),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      answer: "The studio offers web design.",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.readClientChatResult).toHaveBeenCalledWith(requestId);
  });

  it("rejects malformed result IDs", async () => {
    const response = await GET(
      new Request("https://kiln-studio.test/api/client-chat?id=not-an-id"),
    );

    expect(response.status).toBe(400);
    expect(mocks.readClientChatResult).not.toHaveBeenCalled();
  });
});
