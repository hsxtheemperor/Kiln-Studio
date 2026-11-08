import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type {
  SlackMessageOutboxRow,
  SlackProjectSyncJobRow,
} from "@/lib/supabase/database.types";
import { decryptSlackToken } from "@/lib/slack/crypto";
import {
  callSlackApi,
  createSlackServiceClient,
  safeSlackError,
} from "@/lib/slack/service";

export const maxDuration = 60;

type SlackChannelResponse = {
  channel: { id: string; name: string };
};

type SlackMessageResponse = {
  ts: string;
};

function isAuthorized(request: Request): boolean {
  const expected = process.env.SLACK_SYNC_SECRET;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 32 || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
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
    .eq("project_id", job.project_id);
  if (updateError) throw new Error("Slack channel sync status could not be updated.");
}

async function updateOutbox(
  service: ReturnType<typeof createSlackServiceClient>,
  job: SlackMessageOutboxRow,
  values: {
    status: "delivered" | "retry" | "failed";
    slack_message_ts?: string | null;
    last_error?: string | null;
    available_at?: string;
  },
) {
  const { error } = await service
    .from("slack_message_outbox")
    .update({
      ...values,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (error) throw new Error("Slack message delivery status could not be updated.");
}

async function deliverOutbox(
  service: ReturnType<typeof createSlackServiceClient>,
  token: string,
  job: SlackMessageOutboxRow,
) {
  const [
    { data: message, error: messageError },
    { data: mapping, error: mappingError },
    { data: project, error: projectError },
  ] = await Promise.all([
    service
      .from("project_channel_messages")
      .select("id, channel_id, sender_name, body, message_source")
      .eq("id", job.project_channel_message_id)
      .maybeSingle(),
    service
      .from("slack_project_channels")
      .select("slack_channel_id")
      .eq("project_id", job.project_id)
      .maybeSingle(),
    service
      .from("projects")
      .select("status")
      .eq("id", job.project_id)
      .maybeSingle(),
  ]);
  if (messageError || mappingError || projectError) {
    throw new Error("Slack delivery data could not be loaded.");
  }
  if (!message || message.message_source !== "app" || !mapping) {
    await updateOutbox(service, job, {
      status: "failed",
      last_error: "Message or Slack channel mapping is no longer available.",
    });
    return "failed";
  }
  if (project?.status !== "active") {
    await updateOutbox(service, job, {
      status: "failed",
      last_error: "Project is completed; pending messages were not sent.",
    });
    return "failed";
  }

  const response = await callSlackApi<SlackMessageResponse>(token, "chat.postMessage", {
    channel: mapping.slack_channel_id,
    text: `*${message.sender_name}*\n${message.body}`,
    client_msg_id: message.id,
    unfurl_links: false,
    unfurl_media: false,
  });
  await updateOutbox(service, job, {
    status: "delivered",
    slack_message_ts: response.ts,
    last_error: null,
  });
  return "delivered";
}

async function processProjectSync(
  service: ReturnType<typeof createSlackServiceClient>,
  token: string,
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
        await callSlackApi(token, "conversations.archive", {
          channel: existingMapping.slack_channel_id,
        });
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

    const created = await callSlackApi<SlackChannelResponse>(token, "conversations.create", {
      name: channelName(project.project_name, job.project_id),
      is_private: true,
    });
    const { error: completionError } = await service.rpc("complete_slack_project_sync", {
      p_project_id: job.project_id,
      p_slack_channel_id: created.channel.id,
      p_slack_channel_name: created.channel.name,
    });
    if (completionError) throw new Error("The new Slack channel mapping could not be saved.");
    return "completed";
  } catch (error) {
    await updateSyncJob(service, job, safeSlackError(error));
    return job.attempt_count >= 8 ? "failed" : "retry";
  }
}

async function processOutbox(
  service: ReturnType<typeof createSlackServiceClient>,
  token: string,
  job: SlackMessageOutboxRow,
) {
  try {
    return await deliverOutbox(service, token, job);
  } catch (error) {
    const failed = job.attempt_count >= 8;
    await updateOutbox(service, job, {
      status: failed ? "failed" : "retry",
      available_at: new Date(
        Date.now() + retryDelaySeconds(job.attempt_count) * 1000,
      ).toISOString(),
      last_error: safeSlackError(error),
    });
    return failed ? "failed" : "retry";
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
      .maybeSingle();
    if (installationError) throw new Error("Slack installation could not be loaded.");
    if (!installation) {
      return NextResponse.json(
        { error: "Slack is not installed." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const token = decryptSlackToken(installation.encrypted_bot_token);
    const { data: syncJobs, error: syncError } = await service.rpc(
      "claim_slack_project_sync_jobs",
      { p_limit: 10 },
    );
    if (syncError) throw new Error("Slack channel jobs could not be claimed.");

    const counts = { completed: 0, retry: 0, failed: 0, delivered: 0 };
    for (const job of (syncJobs ?? []) as SlackProjectSyncJobRow[]) {
      counts[await processProjectSync(service, token, job)] += 1;
    }

    const { data: outboxJobs, error: outboxError } = await service.rpc(
      "claim_slack_message_outbox",
      { p_limit: 20 },
    );
    if (outboxError) throw new Error("Slack message jobs could not be claimed.");

    for (const job of (outboxJobs ?? []) as SlackMessageOutboxRow[]) {
      const result = await processOutbox(service, token, job);
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
