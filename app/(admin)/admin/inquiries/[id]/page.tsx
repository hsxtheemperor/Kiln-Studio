import { AdminFrame } from "@/components/admin/admin-frame";
import { InquiryDetail } from "@/components/admin/inquiry-detail";
import { requireStudioMemberPage } from "@/lib/auth/require-studio-member-page";

export default async function AdminInquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStudioMemberPage();
  const { id } = await params;

  return (
    <AdminFrame>
      <InquiryDetail id={id} />
    </AdminFrame>
  );
}
