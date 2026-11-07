import Link from "next/link";
import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth/require-client";

export default async function ClientProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const authorization = await requireClient();

  if (!authorization.authorized) {
    redirect("/account/sign-in");
  }

  const { data: profileData, error: profileError } = await authorization.supabase
    .from("client_profiles")
    .select("id")
    .eq("user_id", authorization.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Client profile could not be loaded.", profileError.message);
  }

  const { data: request, error } = await authorization.supabase
    .from("inquiries")
    .select("*")
    .eq("id", id)
    .eq("client_id", profileData?.id ?? "")
    .maybeSingle();

  if (error) {
    console.error("Client project could not be loaded.", error.message);
  }

  if (!request) {
    return (
      <main className="admin-main">
        <Link className="detail-back" href="/account/projects">
          ← Back to my projects
        </Link>
        <div className="empty-state">We could not find that project request.</div>
      </main>
    );
  }

  return (
    <main className="admin-main">
      <Link className="detail-back" href="/account/projects">
        ← Back to my projects
      </Link>

      <div className="detail-top">
        <div>
          <p className="eyebrow">Project request</p>
          <h1 className="admin-detail-title">{request.company || request.name}</h1>
        </div>
        <div className="status-control">
          <label>Status</label>
          <span className="status-pill" data-status={request.status}>
            {request.status}
          </span>
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-meta">
          <div>
            <span>Name</span>
            <strong>{request.name}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{request.email}</strong>
          </div>
          <div>
            <span>Service</span>
            <strong>{request.service ?? "—"}</strong>
          </div>
          <div>
            <span>Budget</span>
            <strong>{request.budget_range ?? "—"}</strong>
          </div>
          <div>
            <span>Timeline</span>
            <strong>{request.timeline ?? "—"}</strong>
          </div>
          <div>
            <span>Submitted</span>
            <strong>{new Date(request.created_at).toLocaleDateString()}</strong>
          </div>
        </div>

        <div className="detail-section">
          <span className="detail-section-label">Project brief</span>
          <p className="detail-brief">{request.project_brief}</p>
        </div>
      </div>
    </main>
  );
}
