// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateClientChatAnswer } from "../../lib/assistant/client-chat";

function geminiResponse(parts: object[]) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { role: "model", parts } }],
    }),
    { status: 200 },
  );
}

describe("generateClientChatAnswer", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLEAI_API", "unit-test-key");
  });

  it("uses a bounded agentic tool loop with public studio context", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        geminiResponse([
          {
            functionCall: {
              name: "get_service_catalog",
              args: {},
            },
          },
        ]),
      )
      .mockImplementationOnce(async (_url: string | URL | Request, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
          systemInstruction: { parts: Array<{ text: string }> };
          tools: Array<{ functionDeclarations: Array<{ name: string }> }>;
          generationConfig: { maxOutputTokens: number };
        };
        expect(request.systemInstruction.parts[0].text).toContain(
          "fictional design studio demo",
        );
        expect(request.systemInstruction.parts[0].text).toContain(
          "untrusted input",
        );
        expect(request.tools[0].functionDeclarations.map(({ name }) => name)).toEqual([
          "get_service_catalog",
          "get_inquiry_checklist",
          "get_portfolio_concepts",
        ]);
        expect(request.contents.at(-1)).toMatchObject({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: "get_service_catalog",
                response: {
                  result: {
                    services: expect.arrayContaining([
                      expect.objectContaining({ name: "Brand identity" }),
                    ]),
                  },
                },
              },
            },
          ],
        });
        expect(request.generationConfig.maxOutputTokens).toBe(500);
        expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("unit-test-key");
        return geminiResponse([{ text: "The studio offers brand, web, and product design." }]);
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateClientChatAnswer("What services do you offer?"),
    ).resolves.toEqual({
      answer: "The studio offers brand, web, and product design.",
      model: "gemini-3.8-flash",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/models/gemini-3.8-flash:generateContent",
    );
  });

  it("includes only the bounded conversation history and latest visitor message", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        contents: Array<{ role: string; parts: Array<{ text?: string }> }>;
      };
      expect(request.contents).toEqual([
        { role: "user", parts: [{ text: "What services do you offer?" }] },
        { role: "model", parts: [{ text: "Brand, web, and product design." }] },
        { role: "user", parts: [{ text: "Which includes UX?" }] },
      ]);
      return geminiResponse([{ text: "Web design includes UX." }]);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateClientChatAnswer("Which includes UX?", [
        { role: "user", text: "What services do you offer?" },
        { role: "model", text: "Brand, web, and product design." },
      ]),
    ).resolves.toMatchObject({
      answer: "Web design includes UX.",
      model: "gemini-3.8-flash",
    });
  });

  it("falls back to Gemini 3.5 Flash-Lite when the primary model is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(geminiResponse([{ text: "Share your goals in the inquiry form." }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateClientChatAnswer("How do I start?")).resolves.toEqual({
      answer: "Share your goals in the inquiry form.",
      model: "gemini-3.5-flash-lite",
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/models/gemini-3.5-flash-lite:generateContent",
    );
  });

  it("stops a repeated tool-call loop at its bounded turn limit", async () => {
    const fetchMock = vi.fn(async () =>
      geminiResponse([
        {
          functionCall: {
            name: "get_service_catalog",
            args: {},
          },
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateClientChatAnswer("Tell me about services.")).resolves.toMatchObject({
      answer: expect.stringContaining("/services"),
      model: "gemini-3.8-flash",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not accept an invalid Gemini response as a successful answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })),
    );

    await expect(generateClientChatAnswer("Hello")).rejects.toThrow(
      "The client assistant returned an invalid response.",
    );
  });

  it("surfaces missing provider configuration", async () => {
    vi.stubEnv("GOOGLEAI_API", "");

    await expect(generateClientChatAnswer("Hello")).rejects.toThrow(
      "The client assistant is not configured.",
    );
  });
});
