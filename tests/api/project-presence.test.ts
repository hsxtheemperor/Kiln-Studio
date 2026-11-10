// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  requireDesigner: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
}));

vi.mock("@/lib/auth/require-designer", () => ({
  requireDesigner: mocks.requireDesigner,
}));
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({
      get: mocks.redisGet,
      set: mocks.redisSet,
      del: mocks.redisDel,
    }),
  },
}));

import {
  DELETE,
  GET,
  POST,
} from "../../app/api/projects/[id]/presence/route";

const projectId = "40000000-0000-4000-8000-000000000001";
const channelId = "40000000-0000-4000-8000-000000000002";
const memberId = "40000000-0000-4000-8000-000000000003";
const otherMemberId = "40000000-0000-4000-8000-000000000004";

function createQuery(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query),
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return query;
}

function createAuthorizedSupabase(membership = true) {
  const results = [
    { data: { id: projectId, status: "active" }, error: null },
    { data: { id: channelId }, error: null },
    { data: { id: memberId }, error: null },
    {
      data: membership ? { team_member_id: memberId } : null,
      error: null,
    },
    {
      data: [
        { team_member_id: memberId },
        { team_member_id: otherMemberId },
      ],
      error: null,
    },
  ];
  let call = 0;
  return {
    from: vi.fn(() => createQuery(results[call++])),
  };
}

function context() {
  return { params: Promise.resolve({ id: projectId }) };
}

function createPostRequest(payload: unknown) {
  return new Request(`https://kiln-studio.test/api/projects/${projectId}/presence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("/api/projects/[id]/presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireDesigner.mockResolvedValue({
      authorized: true,
      user: { id: "user-id" },
      supabase: createAuthorizedSupabase(),
    });
    mocks.redisGet.mockResolvedValue(null);
    mocks.redisSet.mockResolvedValue("OK");
    mocks.redisDel.mockResolvedValue(1);
  });

  it("returns only current members with unexpired online and typing keys", async () => {
    mocks.redisGet.mockImplementation(async (key: string) =>
      key.includes(`member:${memberId}`) &&
      key.includes(`channel:${channelId}`)
        ? "1"
        : key.includes(`member:${memberId}`) &&
            key.startsWith("kiln:presence:")
          ? "1"
          : null,
    );

    const response = await GET(
      new Request(
        `https://kiln-studio.test/api/projects/${projectId}/presence?channel_id=${channelId}`,
      ),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      online_member_ids: [memberId],
      typing_member_ids: [memberId],
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("uses short TTLs for presence and typing state", async () => {
    const response = await POST(
      createPostRequest({ channel_id: channelId, typing: true }),
      context(),
    );

    expect(response.status).toBe(204);
    expect(mocks.redisSet).toHaveBeenNthCalledWith(
      1,
      `kiln:presence:project:${projectId}:member:${memberId}`,
      "1",
      { ex: 45 },
    );
    expect(mocks.redisSet).toHaveBeenNthCalledWith(
      2,
      `kiln:typing:project:${projectId}:channel:${channelId}:member:${memberId}`,
      "1",
      { ex: 8 },
    );
  });

  it("does not allow non-members to create project presence", async () => {
    mocks.requireDesigner.mockResolvedValue({
      authorized: true,
      user: { id: "user-id" },
      supabase: createAuthorizedSupabase(false),
    });

    const response = await POST(
      createPostRequest({ channel_id: channelId, typing: false }),
      context(),
    );

    expect(response.status).toBe(403);
    expect(mocks.redisSet).not.toHaveBeenCalled();
  });

  it("rejects malformed heartbeat payloads", async () => {
    const response = await POST(createPostRequest({ channel_id: "bad" }), context());

    expect(response.status).toBe(400);
    expect(mocks.requireDesigner).not.toHaveBeenCalled();
  });

  it("clears typing state without deleting durable chat data", async () => {
    const response = await DELETE(
      new Request(
        `https://kiln-studio.test/api/projects/${projectId}/presence?channel_id=${channelId}`,
        { method: "DELETE" },
      ),
      context(),
    );

    expect(response.status).toBe(204);
    expect(mocks.redisDel).toHaveBeenCalledWith(
      `kiln:typing:project:${projectId}:channel:${channelId}:member:${memberId}`,
    );
  });

  it("returns an explicit auth response before reading Redis", async () => {
    mocks.requireDesigner.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }),
    });

    const response = await GET(
      new Request(
        `https://kiln-studio.test/api/projects/${projectId}/presence?channel_id=${channelId}`,
      ),
      context(),
    );

    expect(response.status).toBe(401);
    expect(mocks.redisGet).not.toHaveBeenCalled();
  });
});
