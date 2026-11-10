import { serve } from "@upstash/workflow/nextjs";
import { z } from "zod";
import {
  generateClientChatAnswer,
} from "@/lib/assistant/client-chat";
import { persistCustomerSupportMessage } from "@/lib/assistant/customer-support-messages";
import { storeClientChatAnswer } from "@/lib/assistant/client-chat-queue";

export const runtime = "nodejs";

const PayloadSchema = z.object({
  requestId: z.string().uuid(),
  message: z.string().trim().min(1).max(1000),
  history: z.array(
    z.object({
      role: z.enum(["user", "model"]),
      text: z.string().trim().min(1).max(2000),
    }).strict(),
  ).max(8).optional().default([]),
}).strict();

export const { POST } = serve<z.infer<typeof PayloadSchema>>(async (context) => {
  const parsed = PayloadSchema.safeParse(context.requestPayload);
  if (!parsed.success) {
    throw new Error("Invalid client assistant workflow payload.");
  }

  const generated = await context.run("answer-public-studio-question", () =>
    generateClientChatAnswer(parsed.data.message, parsed.data.history),
  );
  await context.run("persist-customer-support-message", () =>
    persistCustomerSupportMessage({
      requestId: parsed.data.requestId,
      question: parsed.data.message,
      answer: generated.answer,
      model: generated.model,
    }),
  );
  await context.run("store-short-lived-assistant-result", () =>
    storeClientChatAnswer(parsed.data.requestId, generated.answer),
  );
});
