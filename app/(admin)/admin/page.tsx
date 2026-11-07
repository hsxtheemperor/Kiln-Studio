import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AdminFrame } from "@/components/admin/admin-frame";
import { requireStudioMemberPage } from "@/lib/auth/require-studio-member-page";
import { createSupabaseSessionClient } from "@/lib/supabase/session";

export default async function AdminDashboardPage() {
  await requireStudioMemberPage();
  const supabase = await createSupabaseSessionClient();

  return (
    <AdminFrame>
      <AdminDashboard supabase={supabase} />
    </AdminFrame>
  );
}
