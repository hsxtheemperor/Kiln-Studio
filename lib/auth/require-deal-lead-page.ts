import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseSessionClient } from "@/lib/supabase/session";

export async function requireDealLeadPage() {
  const supabase = await createSupabaseSessionClient();
  const { data, error } = await supabase.auth.getUser();

  if (
    error &&
    error.name !== "AuthSessionMissingError" &&
    error.status !== 400 &&
    error.status !== 401
  ) {
    throw new Error("Could not verify deal-lead access.");
  }

  const accessLevel = data.user?.app_metadata.access_level;
  if (!data.user || (accessLevel !== "deal_lead" && accessLevel !== "studio_member")) {
    redirect("/admin/sign-in");
  }

  return { user: data.user, accessLevel };
}
