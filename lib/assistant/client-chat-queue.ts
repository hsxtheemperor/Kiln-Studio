import "server-only";

import { Client } from "@upstash/workflow";
import { Redis } from "@upstash/redis";
import {
  generateClientChatAnswer,
  type ClientChatTurn,
} from "./client-chat";
import { persistCustomerSupportMessage } from "./customer-support-messages";

const RESULT_TTL_SECONDS = 600;

function resultKey(requestId: string) {
  return `kiln-studio:client-chat:result:${requestId}`;
}

function isLocalSite(siteUrl: string) {
  try {
    const hostname = new URL(siteUrl).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export async function queueClientChatAnswer(
  requestId: string,
  message: string,
  history: ClientChatTurn[] = [],
) {
  const redis = Redis.fromEnv();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const token = process.env.QSTASH_TOKEN;
  const signingKeysConfigured =
    Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY) &&
    Boolean(process.env.QSTASH_NEXT_SIGNING_KEY);
  const key = resultKey(requestId);

  await redis.set(key, JSON.stringify({ status: "pending" }), {
    ex: RESULT_TTL_SECONDS,
  });

  if (siteUrl && isLocalSite(siteUrl)) {
    try {
      const generated = await generateClientChatAnswer(message, history);
      await persistCustomerSupportMessage({
        requestId,
        question: message,
        answer: generated.answer,
        model: generated.model,
      });
      await redis.set(key, JSON.stringify({ status: "ready", answer: generated.answer }), {
        ex: RESULT_TTL_SECONDS,
      });
      return;
    } catch (error) {
      await redis.del(key);
      throw error;
    }
  }

  if (!token || !siteUrl || !signingKeysConfigured) {
    await redis.del(key);
    throw new Error("Client assistant Workflow is not configured.");
  }

  try {
    await new Client({ token }).trigger({
      url: `${siteUrl}/api/workflows/client-chat`,
      body: { requestId, message, history },
      retries: 5,
      workflowRunId: `client-chat-${requestId}`,
    });
  } catch (error) {
    await redis.del(key);
    throw error;
  }
}

export async function readClientChatResult(requestId: string) {
  const serialized = await Redis.fromEnv().get<string>(resultKey(requestId));
  if (!serialized) {
    return { status: "not_found" as const };
  }

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("The client assistant result could not be read.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("status" in value) ||
    (value.status !== "pending" && value.status !== "ready")
  ) {
    throw new Error("The client assistant result could not be read.");
  }

  if (value.status === "pending") {
    return { status: "pending" as const };
  }
  if (!("answer" in value) || typeof value.answer !== "string") {
    throw new Error("The client assistant result could not be read.");
  }
  return { status: "ready" as const, answer: value.answer };
}

export async function storeClientChatAnswer(requestId: string, answer: string) {
  await Redis.fromEnv().set(
    resultKey(requestId),
    JSON.stringify({ status: "ready", answer }),
    { ex: RESULT_TTL_SECONDS },
  );
}
