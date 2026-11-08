import Link from "next/link";
import { StudioOperationsPanel } from "@/components/studio/studio-operations-panel";
import {
  AvailabilityStatus,
  type AvailabilityStatusValue,
  getAvailabilityClassName,
  getAvailabilityLabel,
} from "@/lib/studio/constants";
import type { createSupabaseSessionClient } from "@/lib/supabase/session";
import { getPriorityLabel, PRIORITY_MAX } from "@/lib/project-priority";

const teamOverview: Array<{
  id: string;
  name: string;
  role: string;
  project: string;
  status: AvailabilityStatusValue;
}> = [
  {
    id: "maya",
    name: "Maya Sol",
    role: "Project owner",
    project: "Northlane rebrand",
    status: AvailabilityStatus.AVAILABLE,
  },
  {
    id: "leo",
    name: "Leo Grant",
    role: "Design lead",
    project: "Northlane rebrand",
    status: AvailabilityStatus.AWAY,
  },
  {
    id: "nina",
    name: "Nina Park",
    role: "Research lead",
    project: "Brookline app",
    status: AvailabilityStatus.BUSY,
  },
  {
    id: "omar",
    name: "Omar Singh",
    role: "Client liaison",
    project: "Harvest retail identity",
    status: AvailabilityStatus.AVAILABLE,
  },
  {
    id: "sofia",
    name: "Sofia Voss",
    role: "Production handoff",
    project: "Brookline app",
    status: AvailabilityStatus.AVAILABLE,
  },
];

export async function AdminDashboard({
  supabase,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseSessionClient>>;
}) {
  const [{ count: totalCount }, { count: openCount }, { count: urgentCount }, { data: inquiriesData }, { data: priorityInquiries }] = await Promise.all([
    supabase.from("inquiries").select("id", { count: "exact", head: true }),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).gte("priority_score", 8),
    supabase.from("inquiries").select("id, name, email, company, status, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("inquiries").select("id, name, company, priority_score").order("priority_score", { ascending: false }).order("created_at", { ascending: false }).limit(5),
  ]);

  const recent = inquiriesData ?? [];
  const topPriorityList = priorityInquiries ?? [];

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

      <div className="team-overview-grid" style={{ marginTop: "24px" }}>
        <div className="team-metric-card">
          <span>Top priority</span>
          <strong>{topPriorityList[0]?.priority_score ?? 0}/10</strong>
          <small>{topPriorityList[0]?.name ?? "No active inquiry"}</small>
        </div>
        <div className="team-metric-card">
          <span>Latest inquiries</span>
          <strong>{recent.length}</strong>
          <small>Most recent client requests</small>
        </div>
        <div className="team-metric-card">
          <span>Team available</span>
          <strong>{teamOverview.filter((member) => member.status === AvailabilityStatus.AVAILABLE).length}</strong>
          <small>Ready to scope or start work</small>
        </div>
        <div className="team-metric-card">
          <span>Assigned</span>
          <strong>{teamOverview.length}</strong>
          <small>Studio members currently tied to projects</small>
        </div>
      </div>

      <div className="ops-grid" style={{ marginTop: "24px" }}>
        <div className="ops-card">
          <div className="ops-card-header">
            <h3>Top priority inquiries</h3>
            <span>{topPriorityList.length} ranked</span>
          </div>
          <div className="team-list">
            {topPriorityList.length === 0 && (
              <p className="empty-state">No inquiries have been scored yet.</p>
            )}
            {topPriorityList.map((item) => (
              <div className="team-member" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.company ?? "No company listed"}</p>
                </div>
                <div className="member-assignment">
                  <span className="status-pill" data-status={getPriorityLabel(item.priority_score)}>
                    {getPriorityLabel(item.priority_score)} · {item.priority_score}/10
                  </span>
                  <span className="project-tag">{item.priority_score === 0 ? "Unscored" : `${item.priority_score}/${PRIORITY_MAX}`}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ops-card">
          <div className="ops-card-header">
            <h3>Current team status</h3>
            <span>{teamOverview.length} people</span>
          </div>
          <div className="team-list">
            {teamOverview.map((member) => (
              <div className="team-member" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <p>
                    {member.role} · {member.project}
                  </p>
                </div>
                <div className="member-assignment">
                  <span className={`availability-pill ${getAvailabilityClassName(member.status)}`}>
                    {getAvailabilityLabel(member.status)}
                  </span>
                </div>
              </div>
            ))}
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

      <StudioOperationsPanel
        scope="admin"
        requests={recent.map((item) => ({
          id: item.id,
          name: item.name,
          email: item.email,
          company: item.company ?? "Independent studio request",
          status: item.status,
          created_at: item.created_at,
        }))}
      />
    </main>
  );
}
