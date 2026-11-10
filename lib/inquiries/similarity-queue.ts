import "server-only";

import { randomUUID } from "node:crypto";
import { Client } from "@upstash/workflow";
import { processInquirySimilarity } from "./similarity";

function isLocalSite(siteUrl: string) {
  try {
    const hostname = new URL(siteUrl).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export async function queueInquirySimilarityProcessing(inquiryId: string) {
  const token = process.env.QSTASH_TOKEN;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const signingKeysConfigured =
    Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY) &&
    Boolean(process.env.QSTASH_NEXT_SIGNING_KEY);

  if (siteUrl && isLocalSite(siteUrl)) {
    await processInquirySimilarity(inquiryId);
    return { queued: false };
  }

  if (!token || !siteUrl || !signingKeysConfigured) {
    throw new Error("QStash similarity processing is not configured.");
  }

  const client = new Client({ token });
  await client.trigger({
    url: `${siteUrl}/api/workflows/inquiry-similarity`,
    body: { inquiryId },
    retries: 5,
    workflowRunId: `inquiry-similarity-${inquiryId}-${randomUUID()}`,
  });
  return { queued: true };
}
