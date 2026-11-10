import "server-only";

import { Client } from "@upstash/qstash";
import { processInquiryReferenceFile } from "./reference-files";

export async function queueInquiryReferenceProcessing(referenceIds: string[]) {
  if (referenceIds.length === 0) {
    return { pending: 0 };
  }

  const token = process.env.QSTASH_TOKEN;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  const signingKeysConfigured =
    Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY) &&
    Boolean(process.env.QSTASH_NEXT_SIGNING_KEY);

  if (token && siteUrl && signingKeysConfigured) {
    const client = new Client({ token });
    let pending = 0;

    for (const referenceId of referenceIds) {
      try {
        await client.publishJSON({
          url: `${siteUrl}/api/inquiries/process-reference`,
          body: { referenceId },
          retries: 5,
          deduplicationId: `inquiry-reference-${referenceId}`,
        });
      } catch (error) {
        console.error("Reference image could not be queued; processing inline.", error);
        try {
          await processInquiryReferenceFile(referenceId);
        } catch (processingError) {
          console.error("Reference image verification is still pending.", processingError);
          pending += 1;
        }
      }
    }

    return { pending };
  }

  let pending = 0;
  for (const referenceId of referenceIds) {
    try {
      await processInquiryReferenceFile(referenceId);
    } catch (error) {
      console.error("Reference image verification is still pending.", error);
      pending += 1;
    }
  }
  return { pending };
}
