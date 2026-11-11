import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DesignerProjectRoom } from "@/components/designer/designer-project-room";
import { requireDesigner } from "@/lib/auth/require-designer";

const InquiryIdSchema = z.string().uuid();

export default async function DesignerRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const authorization = await requireDesigner();

  if (!authorization.authorized) {
    redirect("/designer/sign-in");
  }

  const { id } = await params;
  if (!InquiryIdSchema.safeParse(id).success) {
    return (
      <main className="admin-main">
        <Link className="detail-back" href="/designer">← Back to dashboard</Link>
        <p className="empty-state">This request is unavailable or is not assigned to you.</p>
      </main>
    );
  }

  const { data: canAccessInquiry, error: accessError } = await authorization.supabase.rpc(
    "can_access_inquiry_project",
    { p_inquiry_id: id },
  );
  if (accessError) {
    console.error("Designer request assignment could not be verified.", accessError.message);
    return (
      <main className="admin-main">
        <Link className="detail-back" href="/designer">← Back to dashboard</Link>
        <p className="form-error" role="alert">This request is temporarily unavailable.</p>
      </main>
    );
  }
  if (!canAccessInquiry) {
    return (
      <main className="admin-main">
        <Link className="detail-back" href="/designer">← Back to dashboard</Link>
        <p className="empty-state">This request is unavailable or is not assigned to you.</p>
      </main>
    );
  }

  const { data: inquiry, error } = await authorization.supabase
    .from("inquiries")
    .select("id, name, email, company, service, project_brief, budget_range, timeline, status, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !inquiry) {
    return (
      <main className="admin-main">
        <Link className="detail-back" href="/designer">← Back to dashboard</Link>
        <p className="empty-state">This client request could not be found.</p>
      </main>
    );
  }

  return (
    <main className="admin-main">
      <Link className="detail-back" href="/designer">← Back to dashboard</Link>

      <div className="detail-top">
        <div>
          <p className="eyebrow">Client request</p>
          <h1 className="admin-detail-title">{inquiry.name}</h1>
        </div>
      </div>

      <section className="detail-card">
        <div className="detail-meta">
          <div>
            <span>Email</span>
            <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a>
          </div>
          <div>
            <span>Company</span>
            <strong>{inquiry.company || "Not provided"}</strong>
          </div>
          <div>
            <span>Service</span>
            <strong>{inquiry.service?.replaceAll("_", " ") || "Not specified"}</strong>
          </div>
          <div>
            <span>Budget</span>
            <strong>{inquiry.budget_range?.replaceAll("_", " ") || "Not specified"}</strong>
          </div>
          <div>
            <span>Timeline</span>
            <strong>{inquiry.timeline || "Not specified"}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{inquiry.status}</strong>
          </div>
        </div>

        <div className="detail-section">
          <span className="detail-section-label">Project brief</span>
          <p className="detail-brief">{inquiry.project_brief}</p>
        </div>
      </section>

      <div style={{ marginTop: "24px" }}>
        <DesignerProjectRoom inquiryId={inquiry.id} />
      </div>
    </main>
  );
}
