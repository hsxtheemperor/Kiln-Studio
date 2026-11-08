import Link from "next/link";
import { redirect } from "next/navigation";
import { StudioOperationsPanel } from "@/components/studio/studio-operations-panel";
import { requireDesigner } from "@/lib/auth/require-designer";
import { getPriorityLabel } from "@/lib/project-priority";

export default async function DesignerHomePage() {
  const authorization = await requireDesigner();

  if (!authorization.authorized) {
    redirect("/designer/sign-in");
  }

  const { data: briefs, error } = await authorization.supabase
    .from("inquiry_briefs")
    .select("id, inquiry_id, design_complexity")
    .limit(20);

  if (error) {
    console.error("Priority dashboard could not be loaded.", error.message);
  }

  const safeBriefs: Array<{
    id: string;
    inquiry_id: string;
    design_complexity: number | null;
  }> = Array.isArray(briefs)
    ? (briefs as Array<{
        id: string;
        inquiry_id: string;
        design_complexity: number | null;
      }>)
    : [];
  const inquiryIds = safeBriefs.map((brief) => brief.inquiry_id);
  let inquiryMap = new Map<string, { name?: string | null; email?: string | null; company?: string | null; status?: string | null; priority_score?: number }>();

  if (inquiryIds.length > 0) {
    const { data: inquiries } = await authorization.supabase
      .from("inquiries")
      .select("id, name, email, company, status, priority_score")
      .in("id", inquiryIds);

    inquiryMap = new Map((inquiries ?? []).map((inquiry) => [inquiry.id, inquiry]));
  }

  const items = safeBriefs
    .map((brief) => ({
      ...brief,
      inquiry: inquiryMap.get(brief.inquiry_id) ?? null,
      priority_score: inquiryMap.get(brief.inquiry_id)?.priority_score ?? 0,
    }))
    .sort((left, right) => right.priority_score - left.priority_score);

  return (
    <div className="admin-page">
      <header className="admin-header">
        <Link className="admin-brand" href="/designer">
          <strong className="brand-mark">
            <span className="brand-symbol" aria-hidden="true">k</span>
            kiln studio
          </strong>
          <span>Designer workspace</span>
        </Link>
        <nav className="admin-nav" aria-label="Designer navigation">
          <Link href="/designer">Dashboard</Link>
          <Link href="/designer/team">Team</Link>
          <Link href="/">Home</Link>
        </nav>
      </header>
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
                  <span className="status-pill" data-status={getPriorityLabel(brief.priority_score)}>
                    {getPriorityLabel(brief.priority_score)} · {brief.priority_score}/10
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
    </div>
  );
}
