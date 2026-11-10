import { serve } from "@upstash/workflow/nextjs";
import { z } from "zod";
import {
  generateClientChatAnswer,
} from "@/lib/assistant/client-chat";
import { storeClientChatAnswer } from "@/lib/assistant/client-chat-queue";

export const runtime = "nodejs";

const PayloadSchema = z.object({
  requestId: z.string().uuid(),
  message: z.string().trim().min(1).max(1000),
}).strict();

export const { POST } = serve<z.infer<typeof PayloadSchema>>(async (context) => {
  const parsed = PayloadSchema.safeParse(context.requestPayload);
  if (!parsed.success) {
    throw new Error("Invalid client assistant workflow payload.");
  }

  const answer = await context.run("answer-public-studio-question", () =>
    generateClientChatAnswer(parsed.data.message),
  );
  await context.run("store-short-lived-assistant-result", () =>
    storeClientChatAnswer(parsed.data.requestId, answer),
  );
});
