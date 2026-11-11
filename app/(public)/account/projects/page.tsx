import Link from "next/link";
import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth/require-client";

const PAGE_SIZE = 25;

export default async function ClientProjectListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const authorization = await requireClient();

  if (!authorization.authorized) {
    redirect("/account/sign-in");
  }

  const { page: pageParam } = await searchParams;
  const requestedPage = Number(pageParam ?? "1");
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 1000
    ? requestedPage
    : 1;
  const start = (page - 1) * PAGE_SIZE;

  const { data: profileData, error: profileError } = await authorization.supabase
    .from("client_profiles")
    .select("id, full_name, email")
    .eq("user_id", authorization.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Client profile could not be loaded.", profileError.message);
  }

  const clientProfile = !profileError && profileData && typeof profileData === "object" && "full_name" in profileData
    ? profileData
    : null;

  const { data: primaryCompany, error: companyError } = await authorization.supabase
    .from("client_companies")
    .select("company_name")
    .eq("client_id", clientProfile?.id ?? "")
    .eq("is_primary", true)
    .maybeSingle();

  if (companyError) {
    console.error("Client company could not be loaded.", companyError.message);
  }

  const primaryCompanyData = !companyError && primaryCompany && typeof primaryCompany === "object" && "company_name" in primaryCompany
    ? primaryCompany
    : null;

  const { data: requests, error: requestsError } = await authorization.supabase
    .from("inquiries")
    .select("id, name, company, service, status, updated_at")
    .eq("client_id", clientProfile?.id ?? "")
    .order("created_at", { ascending: false })
    .range(start, start + PAGE_SIZE);

  if (requestsError) {
    console.error("Client project list could not be loaded.", requestsError.message);
  }
  const hasMoreRequests = !requestsError && (requests?.length ?? 0) > PAGE_SIZE;
  const visibleRequests = requests?.slice(0, PAGE_SIZE) ?? [];

  return (
    <main className="admin-main">
      <div className="admin-heading-row">
        <div>
          <p className="eyebrow">Client dashboard</p>
          <h1>My projects</h1>
        </div>
        <Link className="button-secondary" href="/inquiry">
          Start a new project
        </Link>
      </div>

      <div className="detail-card">
        <div className="detail-meta">
          <div>
            <span>Client</span>
            <strong>{clientProfile?.full_name ?? authorization.user.email ?? "Your account"}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{clientProfile?.email ?? authorization.user.email ?? "—"}</strong>
          </div>
          <div>
            <span>Company</span>
            <strong>{primaryCompanyData?.company_name ?? "—"}</strong>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "24px" }}>
        {requestsError && (
          <p className="form-error" role="alert">Your project requests could not be loaded.</p>
        )}
        {!requestsError && visibleRequests.length === 0 && (
          <div className="empty-state">
            You do not have any project requests yet. Start a new project to send a brief.
          </div>
        )}

        {visibleRequests.length > 0 && (
          <div className="inbox-table-wrap">
            <table className="inbox-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <Link className="inbox-open" href={`/account/projects/${request.id}`}>
                        {request.company || request.name}
                      </Link>
                    </td>
                    <td>{request.service ?? "—"}</td>
                    <td>
                      <span className="status-pill" data-status={request.status}>
                        {request.status}
                      </span>
                    </td>
                    <td>{new Date(request.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!requestsError && (page > 1 || hasMoreRequests) && (
          <nav className="admin-heading-row" aria-label="Project request pages">
            {page > 1 ? (
              <Link className="button-secondary" href={`/account/projects?page=${page - 1}`}>
                Previous projects
              </Link>
            ) : <span />}
            <span>Page {page}</span>
            {hasMoreRequests && page < 1000 ? (
              <Link className="button-secondary" href={`/account/projects?page=${page + 1}`}>
                More projects
              </Link>
            ) : <span />}
          </nav>
        )}
      </div>
    </main>
  );
}
