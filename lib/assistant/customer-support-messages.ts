import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function persistCustomerSupportMessage(input: {
  requestId: string;
  question: string;
  answer: string;
  model: string;
}) {
  const { error } = await createSupabaseServiceClient()
    .from("customer_support_messages")
    .upsert(
      {
        request_id: input.requestId,
        question: input.question,
        answer: input.answer,
        model: input.model,
      },
      { onConflict: "request_id", ignoreDuplicates: true },
    );

  if (error) {
    throw new Error("The customer support message could not be saved.");
  }
}
