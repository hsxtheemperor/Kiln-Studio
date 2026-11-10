import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { SlackProjectSyncJobRow } from "@/lib/supabase/database.types";
import { decryptSlackToken } from "@/lib/slack/crypto";
import { processSlackOutboxMessage } from "@/lib/slack/outbox";
import {
  callSlackApi,
  createSlackServiceClient,
  safeSlackError,
} from "@/lib/slack/service";

export const maxDuration = 60;

type SlackChannelResponse = {
  channel: { id: string; name: string };
};

type SlackMembersResponse = {
  members: string[];
  response_metadata?: { next_cursor?: string };
};

type SlackChannelsResponse = {
  channels: Array<{ id: string; name: string; is_private: boolean }>;
  response_metadata?: { next_cursor?: string };
};

function isAuthorized(request: Request): boolean {
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedSecrets = [process.env.CRON_SECRET, process.env.SLACK_SYNC_SECRET]
    .filter((secret): secret is string => Boolean(secret && secret.length >= 32));
  return expectedSecrets.some(
    (expected) =>
      actual.length === expected.length &&
      timingSafeEqual(Buffer.from(actual), Buffer.from(expected)),
  );
}

function channelName(projectName: string, projectId: string): string {
  const slug = projectName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55);
  return `${slug || "project"}-${projectId.replace(/-/g, "").slice(0, 8)}`;
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(60 * 60, 30 * 2 ** Math.max(0, attempt - 1));
}

async function findExistingSlackChannel(token: string, name: string) {
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const response = await callSlackApi<SlackChannelsResponse>(token, "conversations.list", {
      types: "private_channel",
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    const match = response.channels.find((channel) => channel.name === name && channel.is_private);
    if (match) return match;
    cursor = response.response_metadata?.next_cursor || undefined;
    if (!cursor) return null;
  }
  if (cursor) throw new Error("Slack channel listing exceeded the reconciliation limit.");
  return null;
}

async function updateSyncJob(
  service: ReturnType<typeof createSlackServiceClient>,
  job: SlackProjectSyncJobRow,
  error?: string,
) {
  const failed = job.attempt_count >= 8;
  const values = error
    ? {
        status: failed ? "failed" as const : "retry" as const,
        available_at: new Date(Date.now() + retryDelaySeconds(job.attempt_count) * 1000).toISOString(),
        claimed_at: null,
        last_error: error.slice(0, 400),
        updated_at: new Date().toISOString(),
      }
    : {
        status: "completed" as const,
        claimed_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      };
  const { error: updateError } = await service
    .from("slack_project_sync_jobs")
    .update(values)
    .eq("project_id", job.project_id)
    .eq("status", "processing")
    .eq("attempt_count", job.attempt_count);
  if (updateError) throw new Error("Slack channel sync status could not be updated.");
}

async function reconcileSlackMembers(
  service: ReturnType<typeof createSlackServiceClient>,
  token: string,
  projectId: string,
  channelId: string,
  botUserId: string,
) {
  const { data: appChannel, error: appChannelError } = await service
    .from("project_channels")
    .select("description")
    .eq("project_id", projectId)
    .eq("channel_type", "project")
    .maybeSingle();
  if (appChannelError) throw new Error("Project channel details could not be loaded.");
  if (appChannel?.description) {
    await callSlackApi(token, "conversations.setPurpose", {
      channel: channelId,
      purpose: appChannel.description.slice(0, 250),
    });
  }

  const { data: projectMembers, error: projectMembersError } = await service
    .from("project_members")
    .select("team_member_id, role_name")
    .eq("project_id", projectId);
  if (projectMembersError) throw new Error("Project membership could not be loaded.");

  const teamMemberIds = (projectMembers ?? []).map((member) => member.team_member_id);
  const [{ data: activeMembers, error: activeMembersError }, { data: mappings, error: mappingsError }] =
    teamMemberIds.length > 0
      ? await Promise.all([
          service
            .from("team_members")
            .select("id")
            .in("id", teamMemberIds)
            .eq("is_active", true),
          service
            .from("slack_user_mappings")
            .select("team_member_id, slack_user_id")
            .in("team_member_id", teamMemberIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
  if (activeMembersError || mappingsError) {
    throw new Error("Linked Slack project members could not be loaded.");
  }

  const activeMemberIds = new Set((activeMembers ?? []).map((member) => member.id));
  const desiredSlackUserIds = new Set(
    (mappings ?? [])
      .filter((mapping) => activeMemberIds.has(mapping.team_member_id))
      .map((mapping) => mapping.slack_user_id),
  );
  const currentSlackUserIds = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const response = await callSlackApi<SlackMembersResponse>(token, "conversations.members", {
      channel: channelId,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    response.members.forEach((userId) => currentSlackUserIds.add(userId));
    cursor = response.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  if (cursor) throw new Error("Slack channel membership exceeded the reconciliation limit.");

  const toInvite = [...desiredSlackUserIds].filter((userId) => !currentSlackUserIds.has(userId));
  for (let index = 0; index < toInvite.length; index += 100) {
    try {
      await callSlackApi(token, "conversations.invite", {
        channel: channelId,
        users: toInvite.slice(index, index + 100).join(","),
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("already_in_channel")) throw error;
    }
  }

  const toRemove = [...currentSlackUserIds].filter(
    (userId) => userId !== botUserId && !desiredSlackUserIds.has(userId),
  );
  for (const userId of toRemove) {
    try {
      await callSlackApi(token, "conversations.kick", {
        channel: channelId,
        user: userId,
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("not_in_channel")) throw error;
    }
  }
}

async function processProjectSync(
  service: ReturnType<typeof createSlackServiceClient>,
  token: string,
  botUserId: string,
  job: SlackProjectSyncJobRow,
) {
  try {
    const { data: existingMapping, error: mappingError } = await service
      .from("slack_project_channels")
      .select("slack_channel_id, slack_channel_name")
      .eq("project_id", job.project_id)
      .maybeSingle();
    if (mappingError) throw new Error("Slack channel mapping could not be loaded.");

    if (job.action === "archive") {
      if (existingMapping) {
        try {
          await callSlackApi(token, "conversations.archive", {
            channel: existingMapping.slack_channel_id,
          });
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("already_archived")) throw error;
        }
      }
      await updateSyncJob(service, job);
      return "completed";
    }

    if (existingMapping) {
      const { error: completionError } = await service.rpc("complete_slack_project_sync", {
        p_project_id: job.project_id,
        p_slack_channel_id: existingMapping.slack_channel_id,
        p_slack_channel_name: existingMapping.slack_channel_name,
      });
      if (completionError) throw new Error("Existing Slack channel mapping could not be reconciled.");
      await reconcileSlackMembers(
        service,
        token,
        job.project_id,
        existingMapping.slack_channel_id,
        botUserId,
      );
      await updateSyncJob(service, job);
      return "completed";
    }

    const { data: project, error: projectError } = await service
      .from("projects")
      .select("project_name, status")
      .eq("id", job.project_id)
      .maybeSingle();
    if (projectError) throw new Error("Project channel details could not be loaded.");
    if (!project || project.status !== "active") {
      await updateSyncJob(service, job);
      return "completed";
    }

    const targetName = channelName(project.project_name, job.project_id);
    const existingSlackChannel = await findExistingSlackChannel(token, targetName);
    const created = existingSlackChannel ?? (
      await callSlackApi<SlackChannelResponse>(token, "conversations.create", {
        name: targetName,
        is_private: true,
      })
    ).channel;
    const { error: completionError } = await service.rpc("complete_slack_project_sync", {
      p_project_id: job.project_id,
      p_slack_channel_id: created.id,
      p_slack_channel_name: created.name,
    });
    if (completionError) throw new Error("The new Slack channel mapping could not be saved.");
    await reconcileSlackMembers(
      service,
      token,
      job.project_id,
      created.id,
      botUserId,
    );
    await updateSyncJob(service, job);
    return "completed";
  } catch (error) {
    await updateSyncJob(service, job, safeSlackError(error));
    return job.attempt_count >= 8 ? "failed" : "retry";
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const service = createSlackServiceClient();
    const { data: installation, error: installationError } = await service
      .from("slack_installations")
      .select("*")
      .eq("id", true)
      .eq("is_active", true)
      .maybeSingle();
    if (installationError) throw new Error("Slack installation could not be loaded.");
    if (!installation) {
      return NextResponse.json(
        { error: "Slack is not installed." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!installation.encrypted_bot_token) {
      throw new Error("The active Slack installation has no bot token.");
    }
    const token = decryptSlackToken(installation.encrypted_bot_token);
    const { data: syncJobs, error: syncError } = await service.rpc(
      "claim_slack_project_sync_jobs",
      { p_limit: 10 },
    );
    if (syncError) throw new Error("Slack channel jobs could not be claimed.");

    const counts = { completed: 0, retry: 0, failed: 0, delivered: 0 };
    for (const job of (syncJobs ?? []) as SlackProjectSyncJobRow[]) {
      counts[await processProjectSync(service, token, installation.bot_user_id, job)] += 1;
    }

    const { data: outboxJobs, error: outboxError } = await service.rpc(
      "claim_slack_message_outbox",
      { p_limit: 20 },
    );
    if (outboxError) throw new Error("Slack message jobs could not be claimed.");

    for (const job of outboxJobs ?? []) {
      const result = await processSlackOutboxMessage(service, token, job);
      if (result === "delivered") counts.delivered += 1;
      else counts[result] += 1;
    }

    return NextResponse.json({ processed: counts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Slack synchronization worker failed.", error);
    return NextResponse.json(
      { error: "Slack synchronization could not be completed." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
