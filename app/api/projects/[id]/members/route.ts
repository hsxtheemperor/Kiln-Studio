import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDesigner } from "@/lib/auth/require-designer";
import { readJsonBody } from "@/lib/http/read-json";

const ProjectRoleSchema = z.enum([
  "TEAM_MEMBER",
  "DESIGNER",
  "DESIGN_LEAD",
  "RESEARCH_LEAD",
  "CLIENT_LIAISON",
  "CREATIVE_DIRECTOR",
  "PRODUCTION_HANDOFF",
]);

const AddMemberSchema = z.object({
  team_member_id: z.string().uuid(),
  role_name: ProjectRoleSchema,
});

const RemoveMemberSchema = z.object({
  team_member_id: z.string().uuid(),
});

const ProjectIdSchema = z.string().uuid();

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authorization = await requireDesigner();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const { id: projectId } = await params;
  if (!ProjectIdSchema.safeParse(projectId).success) {
    return NextResponse.json(
      { error: "Invalid project ID." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = AddMemberSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose an active team member and a valid project role." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: project, error: projectError } = await authorization.supabase
    .from("projects")
    .select("id, status")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    console.error("Project membership could not be verified.", projectError.message);
    return NextResponse.json(
      { error: "The project could not be verified." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!project) {
    return NextResponse.json(
      { error: "The project was not found or is not accessible." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (project.status !== "active") {
    return NextResponse.json(
      { error: "Completed projects cannot add members." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: teamMember, error: teamMemberError } = await authorization.supabase
    .from("team_members")
    .select("id, is_active")
    .eq("id", parsed.data.team_member_id)
    .maybeSingle();

  if (teamMemberError) {
    console.error("Project team member could not be verified.", teamMemberError.message);
    return NextResponse.json(
      { error: "The team member could not be verified." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!teamMember?.is_active) {
    return NextResponse.json(
      { error: "Choose an active team member." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await authorization.supabase
    .from("project_members")
    .insert({
      project_id: projectId,
      team_member_id: parsed.data.team_member_id,
      role_name: parsed.data.role_name,
    })
    .select("id, project_id, team_member_id, role_name")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This team member is already assigned to the project." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "Only the studio admin or project manager can edit this team." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Project member could not be added.", error.message);
    return NextResponse.json(
      { error: "The project member could not be added." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { member: data },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const authorization = await requireDesigner();
  if (!authorization.authorized) {
    return authorization.response;
  }

  const { id: projectId } = await params;
  if (!ProjectIdSchema.safeParse(projectId).success) {
    return NextResponse.json(
      { error: "Invalid project ID." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = RemoveMemberSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A valid team member id is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: membership, error: membershipError } = await authorization.supabase
    .from("project_members")
    .select("id, role_name")
    .eq("project_id", projectId)
    .eq("team_member_id", parsed.data.team_member_id)
    .maybeSingle();

  if (membershipError) {
    console.error("Project membership could not be loaded for removal.", membershipError.message);
    return NextResponse.json(
      { error: "The project membership could not be verified." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!membership) {
    return NextResponse.json(
      { error: "The project member was not found or cannot be removed." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (membership.role_name === "PROJECT_MANAGER") {
    return NextResponse.json(
      { error: "Reassign the project manager before removing them from the team." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await authorization.supabase
    .from("project_members")
    .delete()
    .eq("id", membership.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "Only the studio admin or project manager can edit this team." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Project member could not be removed.", error.message);
    return NextResponse.json(
      { error: "The project member could not be removed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "The project member could not be removed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({ removed: true }, { headers: { "Cache-Control": "no-store" } });
}
