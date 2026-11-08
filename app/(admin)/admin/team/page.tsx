import { AdminFrame } from "@/components/admin/admin-frame";
import { TeamWorkspace } from "@/components/team/team-workspace";
import { requireStudioMemberPage } from "@/lib/auth/require-studio-member-page";
import { getProjectChannels } from "@/lib/studio/project-channels";
import { createSupabaseSessionClient } from "@/lib/supabase/session";

export default async function AdminTeamPage() {
  const user = await requireStudioMemberPage();
  const supabase = await createSupabaseSessionClient();
  const { channels: projectChannels, error } = await getProjectChannels(supabase, user.id);
  const { data: teamMembers, error: teamError } = await supabase
    .from("team_members")
    .select("id, full_name, email")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (teamError) {
    console.error("Project manager options could not be loaded.", teamError.message);
  }

  return (
    <AdminFrame>
      <TeamWorkspace
        scope="admin"
        liveProjectChannels={projectChannels}
        liveProjectChannelsError={error ?? undefined}
        teamMemberOptions={teamMembers ?? []}
        teamMemberOptionsError={teamError ? "Team members are temporarily unavailable." : undefined}
      />
    </AdminFrame>
  );
}
