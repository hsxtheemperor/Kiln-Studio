// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseSessionClient: vi.fn(),
}));

vi.mock("@/lib/supabase/session", () => ({
  createSupabaseSessionClient: mocks.createSupabaseSessionClient,
}));

import { DELETE, POST } from "../../app/api/admin/auth/route";

describe("Admin auth endpoints", () => {
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

  it("rejects invalid JSON payloads before attempting sign-in", async () => {
    const response = await POST(
      new Request("https://kiln-studio.test/api/admin/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{invalid-json",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Request body must contain valid JSON.",
    });
    expect(mockClient.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("signs in a studio member and returns success", async () => {
    mockClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: { app_metadata: { access_level: "studio_member" } } },
      error: null,
    });

    const response = await POST(
      new Request("https://kiln-studio.test/api/admin/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "team@kilnstudio.test", password: "secure-password-123" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "Signed in.",
      accessLevel: "studio_member",
    });
    expect(mockClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "team@kilnstudio.test",
      password: "secure-password-123",
    });
  });

  it("allows a provisioned deal lead and returns the engagement workspace role", async () => {
    mockClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: { app_metadata: { access_level: "deal_lead" } } },
      error: null,
    });

    const response = await POST(
      new Request("https://kiln-studio.test/api/admin/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "lead@kilnstudio.test", password: "secure-password-123" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "Signed in.",
      accessLevel: "deal_lead",
    });
  });

  it("rejects non-member access when the app_metadata does not allow studio login", async () => {
    mockClient.auth.signInWithPassword.mockResolvedValue({
      data: { user: { app_metadata: { access_level: "client" } } },
      error: null,
    });
    mockClient.auth.signOut.mockResolvedValue({ error: null });

    const response = await POST(
      new Request("https://kiln-studio.test/api/admin/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "person@example.com", password: "secure-password-123" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Private studio access is required.",
    });
    expect(mockClient.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("signs a studio member out via DELETE", async () => {
    mockClient.auth.signOut.mockResolvedValue({ error: null });

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Signed out." });
    expect(mockClient.auth.signOut).toHaveBeenCalledTimes(1);
  });
});
