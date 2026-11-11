import "server-only";

import type { createSupabaseSessionClient } from "@/lib/supabase/session";
import type {
  ProjectChannelMessageRow,
  ProjectChannelRow,
  ProjectMemberRow,
  ProjectRow,
  TeamMemberRow,
} from "@/lib/supabase/database.types";
import { getPriorityLabel } from "@/lib/project-priority";

type SessionClient = Awaited<ReturnType<typeof createSupabaseSessionClient>>;

export type ProjectChannelView = Omit<ProjectChannelRow, "project_id" | "inquiry_id"> & {
  project_id: string;
  inquiry_id: string;
  project_status: ProjectRow["status"];
  deadline_date: string | null;
  priority_score: number;
  priority_label: string;
  project_manager_id: string | null;
  is_project_manager: boolean;
  members: ProjectChannelMemberView[];
  messages: ProjectChannelMessageRow[];
};

export type ProjectChannelMemberView = Pick<
  ProjectMemberRow,
  "id" | "team_member_id" | "role_name"
> &
  Pick<TeamMemberRow, "full_name" | "email">;

type ProjectChannelResult =
  | { channels: ProjectChannelView[]; hasMore: boolean; error: null }
  | { channels: []; hasMore: false; error: string };

export async function getProjectChannels(
  supabase: SessionClient,
  userId: string,
  offset = 0,
): Promise<ProjectChannelResult> {
  const { data: channelRows, error: channelError } = await supabase.rpc(
    "list_project_channels",
    { p_limit: 51, p_offset: offset },
  );
  if (channelError) {
    console.error("Ordered project channels could not be loaded.", channelError.message);
    return { channels: [], hasMore: false, error: "Project channels are temporarily unavailable." };
  }

  if (!channelRows?.length) {
    return { channels: [], hasMore: false, error: null };
  }

  const hasMore = channelRows.length > 50;
  const pageRows = channelRows.slice(0, 50);
  const projectIds = pageRows.flatMap((channel) =>
    channel.project_id ? [channel.project_id] : [],
  );
  const inquiryIds = pageRows.flatMap((channel) =>
    channel.inquiry_id ? [channel.inquiry_id] : [],
  );

  const [
    { data: projects, error: projectsError },
    { data: inquiries, error: inquiryError },
    { data: currentMember, error: memberError },
  ] = await Promise.all([
    supabase.from("projects").select("*").in("id", projectIds),
    supabase
      .from("inquiries")
      .select("id, priority_score")
      .in("id", inquiryIds),
    supabase
      .from("team_members")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const queryError = projectsError ?? inquiryError ?? memberError;
  if (queryError) {
    console.error("Project channel details could not be loaded.", queryError.message);
    return { channels: [], hasMore: false, error: "Project channel details are temporarily unavailable." };
  }

  const projectById = new Map((projects ?? []).map((project) => [project.id, project]));
  const priorityByInquiry = new Map((inquiries ?? []).map((inquiry) => [inquiry.id, inquiry.priority_score]));

  const mappedChannels: ProjectChannelView[] = [];
  for (const channel of pageRows) {
    if (!channel.project_id || !channel.inquiry_id) continue;
    const project = projectById.get(channel.project_id);
    if (!project) continue;
    const priority = priorityByInquiry.get(channel.inquiry_id) ?? 0;
    mappedChannels.push({
      ...channel,
      project_id: channel.project_id,
      inquiry_id: channel.inquiry_id,
      project_status: project.status,
      deadline_date: project.deadline_date,
      priority_score: priority,
      priority_label: getPriorityLabel(priority),
      project_manager_id: project.project_manager_id,
      is_project_manager: project.project_manager_id === currentMember?.id,
      members: [],
      messages: [],
    });
  }

  const projectIdsForMembers = [...new Set(mappedChannels.map((channel) => channel.project_id))];
  const { data: projectMembers, error: projectMembersError } = await supabase
    .from("project_members")
    .select("id, project_id, team_member_id, role_name, created_at, updated_at")
    .in("project_id", projectIdsForMembers);

  if (projectMembersError) {
    console.error("Project channel memberships could not be loaded.", projectMembersError.message);
    return { channels: [], hasMore: false, error: "Project channel memberships are temporarily unavailable." };
  }

  const memberIds = [...new Set((projectMembers ?? []).map((member) => member.team_member_id))];
  const { data: teamMembers, error: teamMembersError } = memberIds.length
    ? await supabase
        .from("team_members")
        .select("id, full_name, email")
        .in("id", memberIds)
    : { data: [], error: null };

  if (teamMembersError) {
    console.error("Project channel member details could not be loaded.", teamMembersError.message);
    return { channels: [], hasMore: false, error: "Project channel members are temporarily unavailable." };
  }

  const teamMemberById = new Map((teamMembers ?? []).map((member) => [member.id, member]));
  const membersByProject = new Map<string, ProjectChannelMemberView[]>();
  for (const membership of projectMembers ?? []) {
    const member = teamMemberById.get(membership.team_member_id);
    if (!member) continue;
    const members = membersByProject.get(membership.project_id) ?? [];
    members.push({
      id: membership.id,
      team_member_id: membership.team_member_id,
      role_name: membership.role_name,
      full_name: member.full_name,
      email: member.email,
    });
    membersByProject.set(membership.project_id, members);
  }

  for (const channel of mappedChannels) {
    channel.members = membersByProject.get(channel.project_id) ?? [];
  }

  return {
    channels: mappedChannels,
    hasMore,
    error: null,
  };
}

export type ProjectManagerOption = Pick<
  TeamMemberRow,
  "id" | "full_name" | "email" | "title" | "specialty" | "availability_status"
>;
