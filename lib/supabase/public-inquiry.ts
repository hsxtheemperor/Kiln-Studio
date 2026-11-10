import "server-only";

import type { InquiryBriefInsert, InquiryInsert } from "./database.types";
import { createSupabaseServiceClient } from "./service";

export async function createPublicInquiry(
  inquiry: InquiryInsert & { client_id?: string | null; priority_score: number },
  brief: Omit<InquiryBriefInsert, "inquiry_id">,
  referenceIds: string[] = [],
): Promise<{ id: string }> {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase.rpc("create_public_inquiry_with_references", {
    p_inquiry: inquiry,
    p_brief: brief,
    p_reference_ids: referenceIds,
  });

  if (error || !data) {
    throw new Error("Public inquiry could not be persisted.");
  }

  return { id: data };
}
