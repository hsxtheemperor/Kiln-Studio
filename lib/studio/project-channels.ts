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
  | { channels: ProjectChannelView[]; error: null }
  | { channels: []; error: string };

export async function getProjectChannels(
  supabase: SessionClient,
  userId: string,
): Promise<ProjectChannelResult> {
  const { data: channelRows, error: channelError } = await supabase.rpc(
    "list_project_channels",
  );
  if (channelError) {
    console.error("Ordered project channels could not be loaded.", channelError.message);
    return { channels: [], error: "Project channels are temporarily unavailable." };
  }

  if (!channelRows?.length) {
    return { channels: [], error: null };
  }

  const projectIds = channelRows.flatMap((channel) =>
    channel.project_id ? [channel.project_id] : [],
  );
  const inquiryIds = channelRows.flatMap((channel) =>
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
    return { channels: [], error: "Project channel details are temporarily unavailable." };
  }

  const projectById = new Map((projects ?? []).map((project) => [project.id, project]));
  const priorityByInquiry = new Map((inquiries ?? []).map((inquiry) => [inquiry.id, inquiry.priority_score]));

  const mappedChannels: ProjectChannelView[] = [];
  for (const channel of channelRows) {
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
    return { channels: [], error: "Project channel memberships are temporarily unavailable." };
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
    return { channels: [], error: "Project channel members are temporarily unavailable." };
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

  const channelMessages = await Promise.all(
    mappedChannels.map(async (channel) => {
      const { data, error } = await supabase
        .from("project_channel_messages")
        .select("id, channel_id, sender_member_id, sender_name, sender_role, body, message_source, created_at")
        .eq("channel_id", channel.id)
        .order("created_at", { ascending: false })
        .limit(100);
      return { channelId: channel.id, messages: data ?? [], error };
    }),
  );

  const messageError = channelMessages.find((result) => result.error)?.error;
  if (messageError) {
    console.error("Project channel messages could not be loaded.", messageError.message);
    return { channels: [], error: "Project channel messages are temporarily unavailable." };
  }

  const messagesByChannel = new Map(
    channelMessages.map((result) => [
      result.channelId,
      [...result.messages].reverse(),
    ]),
  );

  for (const channel of mappedChannels) {
    channel.members = membersByProject.get(channel.project_id) ?? [];
    channel.messages = messagesByChannel.get(channel.id) ?? [];
  }

  return {
    channels: mappedChannels,
    error: null,
  };
}

export type ProjectManagerOption = Pick<
  TeamMemberRow,
  "id" | "full_name" | "email" | "title" | "specialty" | "availability_status"
>;
