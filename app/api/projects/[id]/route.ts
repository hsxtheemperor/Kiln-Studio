import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/http/read-json";
import { requireDesigner } from "@/lib/auth/require-designer";
import { ProjectUpdateSchema } from "@/lib/studio/project-schema";

const IdSchema = z.string().uuid();

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!IdSchema.safeParse(id).success) {
    return NextResponse.json(
      { error: "Invalid project ID." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = ProjectUpdateSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a valid project deadline, manager, or completion status." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorization = await requireDesigner();
  if (!authorization.authorized) return authorization.response;

  const { data, error } = await authorization.supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", id)
    .select("id, status, deadline_date, project_manager_id, completed_at")
    .maybeSingle();

  if (error) {
    console.error("Project could not be updated.", error.message);
    if (error.code === "42501" && parsed.data.status === "completed") {
      return NextResponse.json(
        { error: "Only the assigned project manager can complete this project." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error.code === "42501" && parsed.data.project_manager_id !== undefined) {
      return NextResponse.json(
        { error: "Only a studio admin can assign or change the project manager." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "You do not have permission to update this project." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "The project could not be updated." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Project not found or you do not have permission to update it." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({ project: data }, { headers: { "Cache-Control": "no-store" } });
}
