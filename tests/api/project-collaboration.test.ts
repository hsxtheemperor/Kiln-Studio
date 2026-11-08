// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireDesigner: vi.fn(),
}));

vi.mock("@/lib/auth/require-designer", () => ({
  requireDesigner: mocks.requireDesigner,
}));

import {
  DELETE as removeProjectMember,
  POST as addProjectMember,
} from "../../app/api/projects/[id]/members/route";
import { POST as sendProjectMessage } from "../../app/api/projects/[id]/messages/route";

const projectId = "30000000-0000-4000-8000-000000000001";
const channelId = "40000000-0000-4000-8000-000000000001";
const teamMemberId = "20000000-0000-4000-8000-000000000001";

function query(result: unknown, terminal: "single" | "maybeSingle" = "maybeSingle") {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    neq: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  for (const method of ["select", "eq", "insert", "delete", "neq"] as const) {
    builder[method].mockReturnValue(builder);
  }
  return { builder, terminal: builder[terminal] };
}

describe("Project collaboration endpoints", () => {
  const supabase = { from: vi.fn() };
  const user = {
    id: "10000000-0000-0000-0000-000000000001",
    email: "studio@example.test",
    app_metadata: { access_level: "studio_member" },
    user_metadata: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    supabase.from.mockReset();
    mocks.requireDesigner.mockResolvedValue({
      authorized: true,
      supabase,
      user,
    });
  });

  it("requires authentication before accepting project messages", async () => {
    mocks.requireDesigner.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }),
    });

    const response = await sendProjectMessage(
      new Request("https://kiln-studio.test/api/projects/invalid/messages"),
      { params: Promise.resolve({ id: projectId }) },
    );

    expect(response.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("persists a message using the authenticated team identity", async () => {
    const project = query({ data: { id: projectId, status: "active" }, error: null });
    const channel = query({
      data: { id: channelId, project_id: projectId, channel_type: "project", is_archived: false },
      error: null,
    });
    const sender = query({ data: { id: teamMemberId, full_name: "Studio Member" }, error: null });
    const membership = query({ data: { role_name: "DESIGN_LEAD" }, error: null });
    const savedMessage = {
      id: "message-1",
      channel_id: channelId,
      sender_member_id: teamMemberId,
      sender_name: "Studio Member",
      sender_role: "DESIGN_LEAD",
      body: "Share the revised direction.",
      created_at: "2026-11-08T12:00:00.000Z",
    };
    const insert = query({ data: savedMessage, error: null }, "single");
    supabase.from
      .mockReturnValueOnce(project.builder)
      .mockReturnValueOnce(channel.builder)
      .mockReturnValueOnce(sender.builder)
      .mockReturnValueOnce(membership.builder)
      .mockReturnValueOnce(insert.builder);

    const response = await sendProjectMessage(
      new Request(`https://kiln-studio.test/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, body: "  Share the revised direction.  " }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ message: savedMessage });
    expect(insert.builder.insert).toHaveBeenCalledWith({
      channel_id: channelId,
      sender_member_id: teamMemberId,
      sender_name: "Studio Member",
      sender_role: "DESIGN_LEAD",
      body: "Share the revised direction.",
    });
  });

  it("adds a project member with a selected role", async () => {
    const project = query({ data: { id: projectId, status: "active" }, error: null });
    const teamMember = query({ data: { id: teamMemberId, is_active: true }, error: null });
    const savedMember = {
      id: "membership-1",
      project_id: projectId,
      team_member_id: teamMemberId,
      role_name: "DESIGN_LEAD",
    };
    const memberInsert = query({ data: savedMember, error: null }, "single");
    supabase.from
      .mockReturnValueOnce(project.builder)
      .mockReturnValueOnce(teamMember.builder)
      .mockReturnValueOnce(memberInsert.builder);

    const response = await addProjectMember(
      new Request(`https://kiln-studio.test/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ team_member_id: teamMemberId, role_name: "DESIGN_LEAD" }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ member: savedMember });
    expect(memberInsert.builder.insert).toHaveBeenCalledWith({
      project_id: projectId,
      team_member_id: teamMemberId,
      role_name: "DESIGN_LEAD",
    });
  });

  it("does not allow removing the project manager through membership editing", async () => {
    const membership = query({ data: { id: "membership-pm", role_name: "PROJECT_MANAGER" }, error: null });
    supabase.from.mockReturnValueOnce(membership.builder);

    const response = await removeProjectMember(
      new Request(`https://kiln-studio.test/api/projects/${projectId}/members`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ team_member_id: teamMemberId }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );

    expect(response.status).toBe(409);
    expect(membership.builder.delete).not.toHaveBeenCalled();
  });

  it("rejects invalid roles without querying the database", async () => {
    const response = await addProjectMember(
      new Request(`https://kiln-studio.test/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ team_member_id: teamMemberId, role_name: "PROJECT_MANAGER" }),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );

    expect(response.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
