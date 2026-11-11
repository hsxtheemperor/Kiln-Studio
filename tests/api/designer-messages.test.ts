// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireDesigner: vi.fn(),
  checkProjectMessageRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/require-designer", () => ({
  requireDesigner: mocks.requireDesigner,
}));
vi.mock("@/lib/rate-limit/project-messages", () => ({
  checkProjectMessageRateLimit: mocks.checkProjectMessageRateLimit,
}));

import { GET, POST } from "../../app/api/designer/messages/route";

describe("Designer message endpoints", () => {
  const mockSupabase = {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
    mockSupabase.rpc.mockReset();
    mockSupabase.auth.getUser.mockReset();
    mocks.checkProjectMessageRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
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
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });

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
    expect(mockSupabase.rpc).toHaveBeenCalledWith("can_access_inquiry_project", {
      p_inquiry_id: "123e4567-e89b-12d3-a456-426614174000",
    });
  });

  it("does not read messages for an inquiry outside the designer's assignment", async () => {
    mocks.requireDesigner.mockResolvedValue({
      authorized: true,
      user: { id: "designer-1", user_metadata: {} },
      supabase: mockSupabase,
    });
    mockSupabase.rpc.mockResolvedValue({ data: false, error: null });

    const response = await GET(
      new Request("https://kiln-studio.test/api/designer/messages?inquiry_id=123e4567-e89b-12d3-a456-426614174000"),
    );

    expect(response.status).toBe(404);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("returns a bounded message page and cursor for older history", async () => {
    mocks.requireDesigner.mockResolvedValue({
      authorized: true,
      user: { id: "designer-1", user_metadata: {} },
      supabase: mockSupabase,
    });
    mockSupabase.rpc.mockResolvedValue({ data: true, error: null });
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `message-${index}`,
      inquiry_id: "123e4567-e89b-12d3-a456-426614174000",
      sender_type: "client",
      sender_id: null,
      sender_name: "Client",
      body: `Message ${index}`,
      created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    })).reverse();
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    mockSupabase.from.mockReturnValue(query);

    const response = await GET(
      new Request("https://kiln-studio.test/api/designer/messages?inquiry_id=123e4567-e89b-12d3-a456-426614174000&before=2026-04-01T00%3A00%3A00.000Z"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(query.limit).toHaveBeenCalledWith(51);
    expect(query.lt).toHaveBeenCalledWith("created_at", "2026-04-01T00:00:00.000Z");
    expect(payload.messages).toHaveLength(50);
    expect(payload.hasMore).toBe(true);
    expect(payload.nextCursor).toBe(rows[49].created_at);
  });
});
