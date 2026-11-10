import { AdminFrame } from "@/components/admin/admin-frame";
import { requireStudioMemberPage } from "@/lib/auth/require-studio-member-page";
import { createSupabaseSessionClient } from "@/lib/supabase/session";
import type {
  ExpenseRow,
  ProjectPayoutRow,
  ProjectRevenueRow,
  QuarterlyReportRow,
} from "@/lib/supabase/database.types";

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString();
}

function getQuarterLabel(report: QuarterlyReportRow) {
  return `Q${report.period_quarter} ${report.period_year}`;
}

export default async function AdminFinancePage() {
  await requireStudioMemberPage();
  const supabase = await createSupabaseSessionClient();
  const [revenueResult, payoutResult, expenseResult, reportResult] = await Promise.all([
    supabase
      .from("project_revenue")
      .select("id, project_id, entry_type, amount, currency, received_on, description, created_by, created_at")
      .order("received_on", { ascending: false })
      .limit(25),
    supabase
      .from("project_payouts")
      .select("id, project_id, team_member_id, role_name, entry_type, amount, currency, status, paid_on, notes, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("expenses")
      .select("id, name, category, amount, currency, incurred_on, notes, voided_at, void_reason, created_by, created_at, updated_at")
      .is("voided_at", null)
      .order("incurred_on", { ascending: false })
      .limit(25),
    supabase
      .from("quarterly_reports")
      .select("id, period_year, period_quarter, version, supersedes_report_id, period_start, period_end, currency, total_revenue, total_payouts, total_expenses, total_recurring_expenses, net_result, status, generated_at, published_at, published_by, created_at")
      .order("period_year", { ascending: false })
      .order("period_quarter", { ascending: false })
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const queryError =
    revenueResult.error || payoutResult.error || expenseResult.error || reportResult.error;
  if (queryError) {
    console.error("Finance overview could not be loaded.", queryError.message);
  }

  const revenues = (revenueResult.data ?? []) as ProjectRevenueRow[];
  const payouts = (payoutResult.data ?? []) as ProjectPayoutRow[];
  const expenses = (expenseResult.data ?? []) as ExpenseRow[];
  const latestReport = reportResult.data as QuarterlyReportRow | null;

  return (
    <AdminFrame>
      <main className="admin-content finance-page">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Studio operations</p>
            <h1>Finance</h1>
            <p>Read-only view of recorded project transactions and quarterly reports.</p>
          </div>
        </header>

        {queryError && (
          <p className="form-error" role="alert">
            Finance data is temporarily unavailable. Please try again later.
          </p>
        )}

        <section className="finance-summary-grid" aria-label="Latest quarterly report">
          {latestReport ? (
            <>
              <article className="finance-summary-card">
                <span>Latest report</span>
                <strong>{getQuarterLabel(latestReport)}</strong>
                <small>{latestReport.status === "published" ? "Published" : "Draft"} report</small>
              </article>
              <article className="finance-summary-card">
                <span>Revenue</span>
                <strong>{formatCurrency(latestReport.total_revenue, latestReport.currency)}</strong>
                <small>Quarterly report total</small>
              </article>
              <article className="finance-summary-card">
                <span>Project payouts</span>
                <strong>{formatCurrency(latestReport.total_payouts, latestReport.currency)}</strong>
                <small>Quarterly report total</small>
              </article>
              <article className="finance-summary-card">
                <span>Net result</span>
                <strong>{formatCurrency(latestReport.net_result, latestReport.currency)}</strong>
                <small>After recorded expenses</small>
              </article>
            </>
          ) : (
            <article className="finance-summary-card finance-summary-empty">
              <span>Quarterly reporting</span>
              <strong>No report available</strong>
              <small>Totals appear here after a quarterly report is generated.</small>
            </article>
          )}
        </section>

        <section className="finance-table-grid">
          <article className="team-panel">
            <div className="ops-card-header">
              <h2>Recent project revenue</h2>
              <span>Latest 25 entries</span>
            </div>
            {revenues.length ? (
              <div className="finance-entry-list">
                {revenues.map((entry) => (
                  <div className="finance-entry" key={entry.id}>
                    <div>
                      <strong>{entry.description || entry.entry_type}</strong>
                      <small>{entry.project_id} · {formatDate(entry.received_on)}</small>
                    </div>
                    <span>{formatCurrency(entry.amount, entry.currency)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No project revenue has been recorded.</p>
            )}
          </article>

          <article className="team-panel">
            <div className="ops-card-header">
              <h2>Recent payouts</h2>
              <span>Latest 25 entries</span>
            </div>
            {payouts.length ? (
              <div className="finance-entry-list">
                {payouts.map((entry) => (
                  <div className="finance-entry" key={entry.id}>
                    <div>
                      <strong>{entry.role_name} · {entry.status}</strong>
                      <small>{entry.project_id} · {entry.paid_on ? formatDate(entry.paid_on) : "Not paid"}</small>
                    </div>
                    <span>{formatCurrency(entry.amount, entry.currency)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No project payouts have been recorded.</p>
            )}
          </article>

          <article className="team-panel">
            <div className="ops-card-header">
              <h2>Current expenses</h2>
              <span>Latest 25 entries</span>
            </div>
            {expenses.length ? (
              <div className="finance-entry-list">
                {expenses.map((entry) => (
                  <div className="finance-entry" key={entry.id}>
                    <div>
                      <strong>{entry.name}</strong>
                      <small>{entry.category} · {formatDate(entry.incurred_on)}</small>
                    </div>
                    <span>{formatCurrency(entry.amount, entry.currency)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No active expenses have been recorded.</p>
            )}
          </article>
        </section>

        <p className="finance-readonly-note">
          This view does not create transactions or reconcile payments. Finance changes remain in the
          database schema until entry workflows and reconciliation rules are implemented.
        </p>
      </main>
    </AdminFrame>
  );
}
