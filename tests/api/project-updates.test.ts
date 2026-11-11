// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireDesigner: vi.fn(),
}));

vi.mock("@/lib/auth/require-designer", () => ({
  requireDesigner: mocks.requireDesigner,
}));

import { PATCH } from "../../app/api/projects/[id]/route";

const projectId = "30000000-0000-4000-8000-000000000001";

function query(result: unknown) {
  const builder = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  for (const method of ["update", "eq", "select"] as const) {
    builder[method].mockReturnValue(builder);
  }
  return builder;
}

function request(payload: unknown) {
  return new Request(`https://kiln-studio.test/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function context(id = projectId) {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/projects/[id]", () => {
  const supabase = { from: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    supabase.from.mockReset();
    mocks.requireDesigner.mockResolvedValue({
      authorized: true,
      supabase,
    });
  });

  it("persists the deadline and returns the fields rendered by the team workspace", async () => {
    const project = {
      id: projectId,
      status: "active",
      deadline_date: "2026-12-01",
      project_manager_id: null,
      completed_at: null,
    };
    const update = query({ data: project, error: null });
    supabase.from.mockReturnValueOnce(update);

    const response = await PATCH(
      request({ deadline_date: project.deadline_date }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ project });
    expect(supabase.from).toHaveBeenCalledWith("projects");
    expect(update.update).toHaveBeenCalledWith({ deadline_date: "2026-12-01" });
    expect(update.eq).toHaveBeenCalledWith("id", projectId);
  });

  it("rejects impossible calendar dates before accessing the database", async () => {
    const response = await PATCH(request({ deadline_date: "2026-02-30" }), context());

    expect(response.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("reports completion permission failures as forbidden", async () => {
    const update = query({
      data: null,
      error: { code: "42501", message: "row-level security violation" },
    });
    supabase.from.mockReturnValueOnce(update);

    const response = await PATCH(request({ status: "completed" }), context());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Only the assigned project manager can complete this project.",
    });
  });

  it("returns the authentication response without querying project data", async () => {
    mocks.requireDesigner.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }),
    });

    const response = await PATCH(request({ deadline_date: null }), context());

    expect(response.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
