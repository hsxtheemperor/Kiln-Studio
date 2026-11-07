import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database, ProjectBriefInsert } from "@/lib/supabase/database.types";

export async function createProjectBrief(input: ProjectBriefInsert): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Project brief persistence is not configured.");
  }

  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const { error } = await supabase.from("project_briefs").upsert({
    inquiry_id: input.inquiry_id,
    design_goal: input.design_goal,
    brand_message: input.brand_message,
    target_audience: input.target_audience,
    desired_outcomes: input.desired_outcomes,
    references: input.references,
    time_budget: input.time_budget,
    design_complexity: input.design_complexity,
    priority_score: input.priority_score,
    priority_label: input.priority_label,
  }, { onConflict: "inquiry_id" });

  if (error) {
    throw new Error("Project brief could not be persisted.");
  }
}
