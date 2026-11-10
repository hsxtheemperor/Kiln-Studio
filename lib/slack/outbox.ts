import "server-only";

import type { SlackMessageOutboxRow } from "@/lib/supabase/database.types";
import {
  callSlackApi,
  createSlackServiceClient,
  safeSlackError,
} from "./service";

type SlackServiceClient = ReturnType<typeof createSlackServiceClient>;

type DeliveryResult = "delivered" | "retry" | "failed";

async function updateOutbox(
  service: SlackServiceClient,
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
    .eq("id", job.id)
    .eq("status", "processing")
    .eq("attempt_count", job.attempt_count);
  if (error) throw new Error("Slack message delivery status could not be updated.");
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(60 * 60, 30 * 2 ** Math.max(0, attempt - 1));
}

async function deliverOutbox(
  service: SlackServiceClient,
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
    return "failed" as const;
  }
  if (project?.status !== "active") {
    await updateOutbox(service, job, {
      status: "failed",
      last_error: "Project is completed; pending messages were not sent.",
    });
    return "failed" as const;
  }

  const response = await callSlackApi<{ ts: string }>(token, "chat.postMessage", {
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
  return "delivered" as const;
}

export async function processSlackOutboxMessage(
  service: SlackServiceClient,
  token: string,
  job: SlackMessageOutboxRow,
  options: { immediateRetry?: boolean } = {},
): Promise<DeliveryResult> {
  try {
    return await deliverOutbox(service, token, job);
  } catch (error) {
    const failed = job.attempt_count >= 8;
    const availableAt = new Date(
      Date.now() +
        (options.immediateRetry ? 0 : retryDelaySeconds(job.attempt_count)) * 1000,
    ).toISOString();
    await updateOutbox(service, job, {
      status: failed ? "failed" : "retry",
      available_at: availableAt,
      last_error: safeSlackError(error),
    });
    return failed ? "failed" : "retry";
  }
}
