import { describe, expect, it } from "vitest";
import { readJsonBody } from "../../lib/http/read-json";

describe("readJsonBody", () => {
  it("parses a bounded JSON request", async () => {
    const request = new Request("https://kiln-studio.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "new" }),
    });

    await expect(readJsonBody(request)).resolves.toMatchObject({
      ok: true,
      value: { status: "new" },
    });
  });

  it("rejects non-JSON content types", async () => {
    const request = new Request("https://kiln-studio.test/api", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    });

    const result = await readJsonBody(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(415);
    }
  });

  it("rejects oversized streamed bodies", async () => {
    const request = new Request("https://kiln-studio.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "too large" }),
    });

    const result = await readJsonBody(request, 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
    }
  });
});
