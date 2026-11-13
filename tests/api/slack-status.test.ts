// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireDesigner: vi.fn(),
  createSlackServiceClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-designer", () => ({
  requireDesigner: mocks.requireDesigner,
}));
vi.mock("@/lib/slack/service", () => ({
  createSlackServiceClient: mocks.createSlackServiceClient,
}));

import { GET } from "../../app/api/slack/status/route";

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  return builder;
}

describe("Slack status endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports an unconnected workspace using the authenticated team profile", async () => {
    const teamMemberQuery = query({
      data: { id: "team-member-id" },
      error: null,
    });
    const service = {
      from: vi.fn((table: string) => {
        if (table === "slack_installations") {
          return query({ data: null, error: null });
        }
        if (table === "slack_user_mappings") {
          return query({ data: null, error: null });
        }
        throw new Error(`Unexpected service-role table: ${table}`);
      }),
    };
    const session = {
      from: vi.fn((table: string) => {
        if (table !== "team_members") throw new Error(`Unexpected session table: ${table}`);
        return teamMemberQuery;
      }),
    };
    mocks.requireDesigner.mockResolvedValue({
      authorized: true,
      supabase: session,
      user: { id: "user-id" },
    });
    mocks.createSlackServiceClient.mockReturnValue(service);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workspaceInstalled: false,
      accountLinked: false,
      workspaceName: null,
    });
    expect(session.from).toHaveBeenCalledWith("team_members");
    expect(service.from).not.toHaveBeenCalledWith("team_members");
  });

  it("reports a linked account only when the workspace and user mapping exist", async () => {
    const service = {
      from: vi.fn((table: string) => {
        if (table === "slack_installations") {
          return query({
            data: { workspace_name: "Kiln Test Workspace", is_active: true },
            error: null,
          });
        }
        if (table === "slack_user_mappings") {
          return query({ data: { team_member_id: "team-member-id" }, error: null });
        }
        throw new Error(`Unexpected service-role table: ${table}`);
      }),
    };
    const session = {
      from: vi.fn((table: string) => {
        if (table !== "team_members") throw new Error(`Unexpected session table: ${table}`);
        return query({ data: { id: "team-member-id" }, error: null });
      }),
    };
    mocks.requireDesigner.mockResolvedValue({
      authorized: true,
      supabase: session,
      user: { id: "user-id" },
    });
    mocks.createSlackServiceClient.mockReturnValue(service);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      workspaceInstalled: true,
      accountLinked: true,
      workspaceName: "Kiln Test Workspace",
    });
    expect(session.from).toHaveBeenCalledWith("team_members");
  });
});
