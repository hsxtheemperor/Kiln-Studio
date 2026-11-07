// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireDesigner: vi.fn(),
}));

vi.mock("@/lib/auth/require-designer", () => ({
  requireDesigner: mocks.requireDesigner,
}));

import { GET, POST } from "../../app/api/designer/messages/route";

describe("Designer message endpoints", () => {
  const mockSupabase = {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
    mockSupabase.auth.getUser.mockReset();
  });

  it("requires designer authentication before reading the project room", async () => {
    mocks.requireDesigner.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: "Designer access is required." }, { status: 403 }),
    });

    const response = await GET(new Request("https://kiln-studio.test/api/designer/messages?inquiry_id=123e4567-e89b-12d3-a456-426614174000"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Designer access is required." });
  });

  it("stores a message from a signed-in designer and returns it", async () => {
    mocks.requireDesigner.mockResolvedValue({
      authorized: true,
      user: {
        id: "designer-1",
        email: "designer@kilnstudio.test",
        user_metadata: { full_name: "Jun Park" },
      },
      supabase: mockSupabase,
    });

    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "m-1",
              inquiry_id: "123e4567-e89b-12d3-a456-426614174000",
              sender_type: "designer",
              sender_id: "designer-1",
              sender_name: "Jun Park",
              body: "Need client feedback by Friday.",
              created_at: "2026-11-07T15:00:00.000Z",
            },
            error: null,
          }),
        }),
      }),
    });

    const response = await POST(
      new Request("https://kiln-studio.test/api/designer/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inquiry_id: "123e4567-e89b-12d3-a456-426614174000",
          body: "Need client feedback by Friday.",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      message: {
        sender_name: "Jun Park",
        body: "Need client feedback by Friday.",
      },
    });
  });
});
