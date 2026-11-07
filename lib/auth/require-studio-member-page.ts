import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseSessionClient } from "@/lib/supabase/session";

export async function requireStudioMemberPage() {
  const supabase = await createSupabaseSessionClient();
  const { data, error } = await supabase.auth.getUser();

  if (
    error &&
    error.name !== "AuthSessionMissingError" &&
    error.status !== 400 &&
    error.status !== 401
  ) {
    throw new Error("Could not verify studio-member access.");
  }

  if (
    !data.user ||
    data.user.app_metadata.access_level !== "studio_member"
  ) {
    redirect("/admin/sign-in");
  }

  return data.user;
}
