import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { InquiryInsert } from "./database.types";
import type { Database } from "./database.types";

export async function createPublicInquiry(
  inquiry: InquiryInsert & { client_id?: string | null },
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

  const payload = { ...inquiry };
  if (payload.client_id === undefined) {
    delete payload.client_id;
  }

  const { data, error } = await supabase
    .from("inquiries")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Public inquiry could not be persisted.");
  }

  return { id: data.id };
}
