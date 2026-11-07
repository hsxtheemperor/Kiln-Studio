import Link from "next/link";
import { StudioOperationsPanel } from "@/components/studio/studio-operations-panel";
import type { createSupabaseSessionClient } from "@/lib/supabase/session";

export async function AdminDashboard({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseSessionClient>>;
}) {
  const [{ count: totalCount }, { count: openCount }, { count: urgentCount }, { data: inquiriesData }] = await Promise.all([
    supabase.from("inquiries").select("id", { count: "exact", head: true }),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("project_briefs").select("id", { count: "exact", head: true }).gte("priority_score", 8),
    supabase.from("inquiries").select("id, name, email, company, status, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const recent = inquiriesData ?? [];

  return (
    <main className="admin-main">
      <div className="admin-heading-row">
        <div>
          <p className="eyebrow">Studio dashboard</p>
          <h1>Top admin overview</h1>
        </div>
        <Link className="button-secondary" href="/admin/inquiries">
          Open inquiries
        </Link>
      </div>

      <div className="detail-card">
        <div className="detail-meta">
          <div>
            <span>Total inquiries</span>
            <strong>{totalCount ?? 0}</strong>
          </div>
          <div>
            <span>New leads</span>
            <strong>{openCount ?? 0}</strong>
          </div>
          <div>
            <span>Urgent score</span>
            <strong>{urgentCount ?? 0}</strong>
          </div>
          <div>
            <span>Latest activity</span>
            <strong>{recent[0] ? new Date(recent[0].created_at).toLocaleDateString() : "No activity"}</strong>
          </div>
        </div>
      </div>

      <div className="inbox-table-wrap" style={{ marginTop: "24px" }}>
        <table className="inbox-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Email</th>
              <th>Status</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <p className="empty-state">No inquiries have been submitted yet.</p>
                </td>
              </tr>
            )}
            {recent.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link className="inbox-open" href={`/admin/inquiries/${item.id}`}>
                    {item.name}
                  </Link>
                </td>
                <td>{item.email}</td>
                <td>
                  <span className="status-pill" data-status={item.status}>
                    {item.status}
                  </span>
                </td>
                <td>{new Date(item.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <StudioOperationsPanel scope="admin" requests={recent.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        company: item.company ?? "Independent studio request",
        status: item.status,
        created_at: item.created_at,
      }))} />
    </main>
  );
}
