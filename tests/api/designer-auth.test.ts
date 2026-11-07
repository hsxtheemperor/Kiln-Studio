// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseSessionClient: vi.fn(),
}));

vi.mock("@/lib/supabase/session", () => ({
  createSupabaseSessionClient: mocks.createSupabaseSessionClient,
}));

import { POST } from "../../app/api/designer/auth/route";

describe("Designer auth endpoint", () => {
  const mockClient = {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseSessionClient.mockResolvedValue(mockClient);
  });

  it("allows a signed-in designer to authenticate successfully", async () => {
    mockClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: { app_metadata: { access_level: "designer" } } },
      error: null,
    });

    const response = await POST(
      new Request("https://kiln-studio.test/api/designer/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "designer@kilnstudio.test", password: "secure-password-123" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Signed in." });
  });

  it("requires designer access level before allowing a user through", async () => {
    mockClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: { app_metadata: { access_level: "client" } } },
      error: null,
    });
    mockClient.auth.signOut.mockResolvedValue({ error: null });

    const response = await POST(
      new Request("https://kiln-studio.test/api/designer/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "someone@example.com", password: "secure-password-123" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Designer access is required." });
    expect(mockClient.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed credentials before reaching Supabase", async () => {
    const response = await POST(
      new Request("https://kiln-studio.test/api/designer/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Enter a valid email address and password.",
    });
    expect(mockClient.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
