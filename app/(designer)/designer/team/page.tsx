import Link from "next/link";
import { redirect } from "next/navigation";
import { TeamWorkspace } from "@/components/team/team-workspace";
import { getProjectChannels } from "@/lib/studio/project-channels";
import { requireDesigner } from "@/lib/auth/require-designer";

export default async function DesignerTeamPage() {
  const authorization = await requireDesigner();

  if (!authorization.authorized) {
    redirect("/designer/sign-in");
  }

  const { channels: projectChannels, error } = await getProjectChannels(
    authorization.supabase,
    authorization.user.id,
  );
  const { data: teamMembers, error: teamError } = await authorization.supabase
    .from("team_members")
    .select("id, full_name, email, title, specialty, availability_status")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (teamError) {
    console.error("Team member options could not be loaded.", teamError.message);
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <Link className="admin-brand" href="/designer">
          <strong className="brand-mark">
            <span className="brand-symbol" aria-hidden="true">✦</span>
            Kiln Studio
          </strong>
          <span>Designer workspace</span>
        </Link>
        <nav className="admin-nav" aria-label="Designer navigation">
          <Link href="/designer">Dashboard</Link>
          <Link href="/designer/team">Team</Link>
          <Link href="/">Home</Link>
        </nav>
      </header>
      <TeamWorkspace
        scope="designer"
        liveProjectChannels={projectChannels}
        liveProjectChannelsError={error ?? undefined}
        teamMemberOptions={teamMembers ?? []}
        teamMemberOptionsError={teamError ? "Team members are temporarily unavailable." : undefined}
      />
    </div>
  );
}
