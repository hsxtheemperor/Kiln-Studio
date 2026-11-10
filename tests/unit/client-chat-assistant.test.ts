// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateClientChatAnswer } from "../../lib/assistant/client-chat";

describe("generateClientChatAnswer", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-key");
  });

  it("uses only the public studio prompt and one visitor message", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
        max_tokens: number;
      };
      expect(request.messages).toHaveLength(2);
      expect(request.messages[0].role).toBe("system");
      expect(request.messages[0].content).toContain("fictional design studio demo");
      expect(request.messages[0].content).toContain("untrusted input");
      expect(request.messages[1]).toEqual({
        role: "user",
        content: "What kinds of design work do you do?",
      });
      expect(request.max_tokens).toBe(300);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Brand, web, and product design." } }],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateClientChatAnswer("What kinds of design work do you do?"),
    ).resolves.toBe("Brand, web, and product design.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not accept an invalid OpenAI response as a successful answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })),
    );

    await expect(generateClientChatAnswer("Hello")).rejects.toThrow(
      "The client assistant returned an invalid response.",
    );
  });

  it("surfaces missing provider configuration", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(generateClientChatAnswer("Hello")).rejects.toThrow(
      "The client assistant is not configured.",
    );
  });
});
