import Link from "next/link";
import { redirect } from "next/navigation";
import { StudioOperationsPanel } from "@/components/studio/studio-operations-panel";
import { requireDesigner } from "@/lib/auth/require-designer";

export default async function DesignerHomePage() {
  const authorization = await requireDesigner();

  if (!authorization.authorized) {
    redirect("/designer/sign-in");
  }

  const { data: briefs, error } = await authorization.supabase
    .from("project_briefs")
    .select("id, inquiry_id, priority_score, priority_label, design_complexity")
    .order("priority_score", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Priority dashboard could not be loaded.", error.message);
  }

  const inquiryIds = (briefs ?? []).map((brief) => brief.inquiry_id);
  let inquiryMap = new Map<string, { name?: string | null; email?: string | null; company?: string | null; status?: string | null }>();

  if (inquiryIds.length > 0) {
    const { data: inquiries } = await authorization.supabase
      .from("inquiries")
      .select("id, name, email, company, status")
      .in("id", inquiryIds);

    inquiryMap = new Map((inquiries ?? []).map((inquiry) => [inquiry.id, inquiry]));
  }

  const items = (briefs ?? []).map((brief) => ({
    ...brief,
    inquiry: inquiryMap.get(brief.inquiry_id) ?? null,
  }));

  return (
    <main className="admin-main">
      <div className="admin-heading-row">
        <div>
          <p className="eyebrow">Designer workspace</p>
          <h1>Priority queue</h1>
          <p>Projects ranked by expected impact, complexity, and urgency.</p>
        </div>
        <Link href="/" className="button-secondary">Back to site</Link>
      </div>

      <div className="inbox-table-wrap">
        <table className="inbox-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Project</th>
              <th>Priority</th>
              <th>Complexity</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <p className="empty-state">No project briefs are queued yet.</p>
                </td>
              </tr>
            )}
            {items.map((brief) => (
              <tr key={brief.id}>
                <td>
                  <strong>{brief.inquiry?.name ?? "Unknown client"}</strong>
                  <div className="inbox-brief">{brief.inquiry?.email ?? "—"}</div>
                </td>
                <td>
                  <div className="inbox-brief">
                    {brief.inquiry?.company || brief.inquiry?.name || "Project brief"}
                  </div>
                </td>
                <td>
                  <span className="status-pill" data-status={brief.priority_label ?? "unknown"}>
                    {brief.priority_label ?? "unknown"} · {brief.priority_score ?? 0}/10
                  </span>
                </td>
                <td>{brief.design_complexity ?? "—"}</td>
                <td>
                  <span className="status-pill" data-status={brief.inquiry?.status ?? "new"}>
                    {brief.inquiry?.status ?? "new"}
                  </span>
                </td>
                <td>
                  <Link className="button-secondary designer-open-request" href={`/designer/requests/${brief.inquiry_id}`}>
                    Open request
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <StudioOperationsPanel
        scope="designer"
        requests={(items ?? []).map((brief) => ({
          id: brief.inquiry_id,
          name: brief.inquiry?.name ?? "Unknown client",
          email: brief.inquiry?.email ?? "No email on file",
          company: brief.inquiry?.company ?? "Design request",
          status: brief.inquiry?.status ?? "new",
          created_at: new Date().toISOString(),
        }))}
      />
    </main>
  );
}
