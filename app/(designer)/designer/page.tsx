import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDesigner } from "@/lib/auth/require-designer";
import { getPriorityLabel } from "@/lib/project-priority";

export default async function DesignerHomePage() {
  const authorization = await requireDesigner();

  if (!authorization.authorized) {
    redirect("/designer/sign-in");
  }

  const { data: items, error: queueError } = await authorization.supabase.rpc(
    "get_designer_priority_queue",
  );

  if (queueError) {
    console.error("Priority dashboard queue could not be loaded.", queueError.message);
  }

  const safeItems = queueError ? [] : items ?? [];

  return (
    <div className="admin-page">
      <header className="admin-header">
        <Link className="admin-brand" href="/designer">
          <strong className="brand-mark">
            <span className="brand-symbol" aria-hidden="true">✦</span>
            Kiln Studio
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
          <p>Requests are ranked by priority; full details remain assignment-scoped.</p>
        </div>
        <Link href="/" className="button-secondary">Back to site</Link>
      </div>

      <div className="inbox-table-wrap">
        <table className="inbox-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Service</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Received</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {safeItems.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <p
                    className={queueError ? "form-error" : "empty-state"}
                    role={queueError ? "alert" : undefined}
                  >
                    {queueError ? "The priority queue is temporarily unavailable." : "No requests are queued yet."}
                  </p>
                </td>
              </tr>
            )}
            {safeItems.map((item) => (
              <tr key={item.inquiry_id}>
                <td>
                  <div className="inbox-brief">
                    Request {item.inquiry_id.slice(0, 8)}
                  </div>
                </td>
                <td>{item.service?.replaceAll("_", " ") || "Not specified"}</td>
                <td>
                  <span className="status-pill" data-status={getPriorityLabel(item.priority_score)}>
                    {getPriorityLabel(item.priority_score)} · {item.priority_score}/10
                  </span>
                </td>
                <td>
                  <span className="status-pill" data-status={item.status}>
                    {item.status}
                  </span>
                </td>
                <td>{new Date(item.created_at).toLocaleDateString()}</td>
                <td>
                  <Link className="button-secondary designer-open-request" href={`/designer/requests/${item.inquiry_id}`}>
                    View details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="empty-state">Request details become available after you are added to the project.</p>
      </main>
    </div>
  );
}
