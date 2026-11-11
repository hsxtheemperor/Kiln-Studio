// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireDesigner: vi.fn(),
}));

vi.mock("@/lib/auth/require-designer", () => ({
  requireDesigner: mocks.requireDesigner,
}));
vi.mock("@/lib/slack/outbox-queue", () => ({
  queueSlackMessageDelivery: vi.fn(),
}));
vi.mock("@/lib/rate-limit/project-messages", () => ({
  checkProjectMessageRateLimit: vi.fn(),
}));

import { GET } from "../../app/api/projects/[id]/messages/route";

const projectId = "30000000-0000-4000-8000-000000000001";
const channelId = "40000000-0000-4000-8000-000000000001";

function context() {
  return { params: Promise.resolve({ id: projectId }) };
}

describe("GET /api/projects/[id]/messages", () => {
  const supabase = { from: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    supabase.from.mockReset();
    mocks.requireDesigner.mockResolvedValue({ authorized: true, supabase });
  });

  it("returns only a bounded page of the authorized project's channel history", async () => {
    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: projectId }, error: null }),
    };
    const channelQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: channelId }, error: null }),
    };
    const messages = Array.from({ length: 51 }, (_, index) => ({
      id: `message-${index}`,
      channel_id: channelId,
      sender_member_id: null,
      sender_name: "Designer",
      sender_role: "DESIGNER",
      body: `Message ${index}`,
      message_source: "app",
      created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    })).reverse();
    const messageQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: messages, error: null }),
    };
    supabase.from
      .mockReturnValueOnce(projectQuery)
      .mockReturnValueOnce(channelQuery)
      .mockReturnValueOnce(messageQuery);

    const response = await GET(
      new Request(`https://kiln-studio.test/api/projects/${projectId}/messages?channel_id=${channelId}&before=2026-04-01T00%3A00%3A00.000Z`),
      context(),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(messageQuery.limit).toHaveBeenCalledWith(51);
    expect(messageQuery.lt).toHaveBeenCalledWith("created_at", "2026-04-01T00:00:00.000Z");
    expect(payload.messages).toHaveLength(50);
    expect(payload.hasMore).toBe(true);
    expect(payload.nextCursor).toBe(messages[49].created_at);
  });

  it("returns forbidden when RLS denies the channel message read", async () => {
    const projectQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: projectId }, error: null }),
    };
    const channelQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: channelId }, error: null }),
    };
    const messageQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } }),
    };
    supabase.from
      .mockReturnValueOnce(projectQuery)
      .mockReturnValueOnce(channelQuery)
      .mockReturnValueOnce(messageQuery);

    const response = await GET(
      new Request(`https://kiln-studio.test/api/projects/${projectId}/messages?channel_id=${channelId}`),
      context(),
    );

    expect(response.status).toBe(403);
  });

  it("returns the authentication response without querying project data", async () => {
    mocks.requireDesigner.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }),
    });

    const response = await GET(
      new Request(`https://kiln-studio.test/api/projects/${projectId}/messages?channel_id=${channelId}`),
      context(),
    );

    expect(response.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
