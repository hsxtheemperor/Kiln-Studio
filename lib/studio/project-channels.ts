import "server-only";

import type { createSupabaseSessionClient } from "@/lib/supabase/session";
import type {
  ProjectChannelRow,
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
};

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
    });
  }

  return {
    channels: mappedChannels,
    error: null,
  };
}

export type ProjectManagerOption = Pick<TeamMemberRow, "id" | "full_name" | "email">;
