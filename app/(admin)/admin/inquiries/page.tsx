import { AdminFrame } from "@/components/admin/admin-frame";
import { InquiryInbox } from "@/components/admin/inquiry-inbox";
import { requireStudioMemberPage } from "@/lib/auth/require-studio-member-page";

export default async function AdminInquiriesPage() {
  await requireStudioMemberPage();

  return (
    <AdminFrame>
      <InquiryInbox />
    </AdminFrame>
  );
}
