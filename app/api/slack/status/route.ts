import { NextResponse } from "next/server";
import { requireDesigner } from "@/lib/auth/require-designer";
import { createSlackServiceClient } from "@/lib/slack/service";

export async function GET() {
  const authorization = await requireDesigner();
  if (!authorization.authorized) return authorization.response;

  try {
    const service = createSlackServiceClient();
    const { data: installation, error: installationError } = await service
      .from("slack_installations")
      .select("workspace_name, is_active")
      .eq("id", true)
      .maybeSingle();
    if (installationError) throw new Error("Slack installation status could not be loaded.");

    const { data: teamMember, error: teamMemberError } = await authorization.supabase
      .from("team_members")
      .select("id")
      .eq("user_id", authorization.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (teamMemberError) throw new Error("The current team profile could not be loaded.");

    if (!teamMember) {
      return NextResponse.json(
        { workspaceInstalled: Boolean(installation?.is_active), accountLinked: false, workspaceName: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data: mapping, error: mappingError } = await service
      .from("slack_user_mappings")
      .select("team_member_id")
      .eq("team_member_id", teamMember.id)
      .maybeSingle();
    if (mappingError) throw new Error("Slack account-link status could not be loaded.");

    const workspaceInstalled = Boolean(installation?.is_active);
    return NextResponse.json(
      {
        workspaceInstalled,
        accountLinked: workspaceInstalled && Boolean(mapping),
        workspaceName: workspaceInstalled ? installation?.workspace_name ?? null : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Slack connection status could not be loaded.", error);
    return NextResponse.json(
      { error: "Slack connection status is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
