import { AdminFrame } from "@/components/admin/admin-frame";
import { TeamWorkspace } from "@/components/team/team-workspace";
import { requireStudioMemberPage } from "@/lib/auth/require-studio-member-page";
import { getProjectChannels } from "@/lib/studio/project-channels";
import { createSupabaseSessionClient } from "@/lib/supabase/session";

export default async function AdminTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireStudioMemberPage();
  const supabase = await createSupabaseSessionClient();
  const { page: pageParam } = await searchParams;
  const requestedPage = Number(pageParam ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 1000
    ? requestedPage
    : 1;
  const { channels: projectChannels, hasMore, error } = await getProjectChannels(
    supabase,
    user.id,
    (page - 1) * 50,
  );
  const { data: teamMembers, error: teamError } = await supabase
    .from("team_members")
    .select("id, full_name, email, title, specialty, availability_status")
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
        channelPage={page}
        hasMoreChannels={hasMore}
        teamMemberOptions={teamMembers ?? []}
        teamMemberOptionsError={teamError ? "Team members are temporarily unavailable." : undefined}
      />
    </AdminFrame>
  );
}
