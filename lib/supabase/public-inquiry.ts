import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { InquiryBriefInsert, InquiryInsert, Database } from "./database.types";

export async function createPublicInquiry(
  inquiry: InquiryInsert & { client_id?: string | null; priority_score: number },
  brief: Omit<InquiryBriefInsert, "inquiry_id">,
): Promise<{ id: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Public inquiry persistence is not configured.");
  }

  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.rpc("create_public_inquiry_with_brief", {
    p_inquiry: inquiry,
    p_brief: brief,
  });

  if (error || !data) {
    throw new Error("Public inquiry could not be persisted.");
  }

  return { id: data };
}
