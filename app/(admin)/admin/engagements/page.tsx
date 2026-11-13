import { AdminFrame } from "@/components/admin/admin-frame";
import { EngagementInbox } from "@/components/admin/engagement-inbox";
import { requireDealLeadPage } from "@/lib/auth/require-deal-lead-page";

export default async function AdminEngagementsPage() {
  const { accessLevel, user } = await requireDealLeadPage();

  return (
    <AdminFrame dealLeadOnly={accessLevel === "deal_lead"}>
      <EngagementInbox
        canReassign={accessLevel === "studio_member"}
        currentUserId={user.id}
      />
    </AdminFrame>
  );
}
