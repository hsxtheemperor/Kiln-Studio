import { serve } from "@upstash/workflow/nextjs";
import { z } from "zod";
import {
  hasInquirySimilarityConsent,
  processInquirySimilarity,
} from "@/lib/inquiries/similarity";

export const runtime = "nodejs";

const PayloadSchema = z.object({ inquiryId: z.string().uuid() }).strict();

export const { POST } = serve<{ inquiryId: string }>(async (context) => {
  const parsed = PayloadSchema.safeParse(context.requestPayload);
  if (!parsed.success) {
    throw new Error("Invalid inquiry similarity workflow payload.");
  }

  const optedIn = await context.run("verify-explicit-similarity-consent", () =>
    hasInquirySimilarityConsent(parsed.data.inquiryId),
  );
  if (!optedIn) {
    return;
  }

  await context.run("process-consented-inquiry-similarity", () =>
    processInquirySimilarity(parsed.data.inquiryId),
  );
});
