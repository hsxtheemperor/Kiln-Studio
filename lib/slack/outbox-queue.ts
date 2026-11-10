import "server-only";

import { Client } from "@upstash/qstash";

function isLocalSite(siteUrl: string) {
  try {
    const hostname = new URL(siteUrl).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export async function queueSlackMessageDelivery(messageId: string) {
  const token = process.env.QSTASH_TOKEN;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const signingKeysConfigured =
    Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY) &&
    Boolean(process.env.QSTASH_NEXT_SIGNING_KEY);

  if (!token || !siteUrl || !signingKeysConfigured || isLocalSite(siteUrl)) {
    return { queued: false };
  }

  await new Client({ token }).publishJSON({
    url: `${siteUrl}/api/slack/deliver`,
    body: { messageId },
    retries: 5,
    deduplicationId: `slack-message-${messageId}`,
  });

  return { queued: true };
}
