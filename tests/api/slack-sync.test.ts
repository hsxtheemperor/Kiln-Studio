// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callSlackApi: vi.fn(),
  createSlackServiceClient: vi.fn(),
  decryptSlackToken: vi.fn(),
  safeSlackError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : "Slack synchronization failed.",
  ),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/slack/crypto", () => ({
  decryptSlackToken: mocks.decryptSlackToken,
}));
vi.mock("@/lib/slack/service", () => ({
  callSlackApi: mocks.callSlackApi,
  createSlackServiceClient: mocks.createSlackServiceClient,
  safeSlackError: mocks.safeSlackError,
}));

import { POST } from "../../app/api/slack/sync/route";

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const method of ["select", "update", "eq", "in"] as const) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

describe("Slack sync worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SLACK_SYNC_SECRET = "test-sync-secret-with-at-least-32-characters";
    process.env.CRON_SECRET = undefined;
    mocks.decryptSlackToken.mockReturnValue("xoxb-test-token");
  });

  it("rejects unauthorized calls before accessing Supabase", async () => {
    const response = await POST(
      new Request("https://kiln-studio.test/api/slack/sync", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(mocks.createSlackServiceClient).not.toHaveBeenCalled();
  });

  it("reconciles private Slack channel membership from active, linked project members", async () => {
    const installation = query({
      data: {
        id: true,
        encrypted_bot_token: "encrypted",
        bot_user_id: "UBOT",
        is_active: true,
      },
      error: null,
    });
    const channelMapping = query({
      data: { slack_channel_id: "C_PROJECT", slack_channel_name: "project-demo" },
      error: null,
    });
    const appChannel = query({
      data: { description: "Synthetic inquiry and project brief." },
      error: null,
    });
    const projectMembers = query({
      data: [{ team_member_id: "TEAM_DESIGNER", role_name: "DESIGNER" }],
      error: null,
    });
    const activeMembers = query({
      data: [{ id: "TEAM_DESIGNER" }],
      error: null,
    });
    const mappings = query({
      data: [{ team_member_id: "TEAM_DESIGNER", slack_user_id: "UDESIGNER" }],
      error: null,
    });
    const updateJob = query({ error: null });
    const service = {
      from: vi.fn((table: string) => {
        const tables: Record<string, ReturnType<typeof query>> = {
          slack_installations: installation,
          slack_project_channels: channelMapping,
          project_channels: appChannel,
          project_members: projectMembers,
          team_members: activeMembers,
          slack_user_mappings: mappings,
          slack_project_sync_jobs: updateJob,
        };
        const result = tables[table];
        if (!result) throw new Error(`Unexpected table: ${table}`);
        return result;
      }),
      rpc: vi.fn()
        .mockResolvedValueOnce({
          data: [{
            project_id: "PROJECT",
            action: "sync_members",
            status: "processing",
            attempt_count: 1,
          }],
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: [], error: null }),
    };
    mocks.createSlackServiceClient.mockReturnValue(service);
    mocks.callSlackApi.mockImplementation(async (_token: string, method: string) => {
      if (method === "conversations.members") {
        return { members: ["UBOT", "USTALE"], response_metadata: { next_cursor: "" } };
      }
      return {};
    });

    const response = await POST(
      new Request("https://kiln-studio.test/api/slack/sync", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.SLACK_SYNC_SECRET}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      processed: { completed: 1, retry: 0, failed: 0, delivered: 0 },
    });
    expect(mocks.callSlackApi).toHaveBeenCalledWith(
      "xoxb-test-token",
      "conversations.setPurpose",
      { channel: "C_PROJECT", purpose: "Synthetic inquiry and project brief." },
    );
    expect(mocks.callSlackApi).toHaveBeenCalledWith(
      "xoxb-test-token",
      "conversations.invite",
      { channel: "C_PROJECT", users: "UDESIGNER" },
    );
    expect(mocks.callSlackApi).toHaveBeenCalledWith(
      "xoxb-test-token",
      "conversations.kick",
      { channel: "C_PROJECT", user: "USTALE" },
    );
    expect(updateJob.eq).toHaveBeenCalledWith("status", "processing");
  });
});
