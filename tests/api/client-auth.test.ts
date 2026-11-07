// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseSessionClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/session", () => ({
  createSupabaseSessionClient: mocks.createSupabaseSessionClient,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { POST } from "../../app/api/client/auth/route";

describe("Client auth endpoints", () => {
  const mockClient = {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSupabaseSessionClient.mockResolvedValue(mockClient);
    mocks.createClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "profile-1" }, error: null }),
          }),
        }),
      }),
    });
  });

  it("validates client sign-up inputs before creating a profile", async () => {
    const response = await POST(
      new Request("https://kiln-studio.test/api/client/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sign-up", email: "bad-email", password: "short" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Please enter your name, a valid email, and a password.",
    });
  });

  it("creates a client account and profile when sign-up is valid", async () => {
    mockClient.auth.signUp.mockResolvedValue({
      data: { user: { id: "user-123" }, session: { access_token: "tok" } },
      error: null,
    });

    const response = await POST(
      new Request("https://kiln-studio.test/api/client/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "sign-up",
          full_name: "Riley Clark",
          email: "riley@kilnstudio.test",
          company: "Kiln Studio",
          password: "secure-password-123",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ message: "Your account is ready." });
    expect(mockClient.auth.signUp).toHaveBeenCalledWith({
      email: "riley@kilnstudio.test",
      password: "secure-password-123",
      options: {
        data: {
          full_name: "Riley Clark",
          company: "Kiln Studio",
          access_level: "client",
        },
      },
    });
  });

  it("rejects a client with an unauthorized access level during sign-in", async () => {
    mockClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: { app_metadata: { access_level: "designer" } } },
      error: null,
    });
    mockClient.auth.signOut.mockResolvedValue({ error: null });

    const response = await POST(
      new Request("https://kiln-studio.test/api/client/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "riley@kilnstudio.test", password: "secure-password-123" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Client access is required." });
    expect(mockClient.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
