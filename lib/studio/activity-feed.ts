import type { SystemActivityLogRow } from "@/lib/supabase/database.types";

const tableLabels: Record<string, string> = {
  client_companies: "client company",
  client_profiles: "client profile",
  expenses: "expense",
  inquiries: "inquiry",
  inquiry_briefs: "inquiry brief",
  project_assignments: "inquiry assignment",
  project_briefs: "inquiry brief",
  project_channel_members: "channel membership",
  project_channel_messages: "channel message",
  project_channels: "channel",
  project_members: "project membership",
  project_messages: "inquiry message",
  project_payouts: "project payout",
  project_revenue: "project revenue",
  project_request_logs: "request log",
  projects: "project",
  quarterly_report_lines: "quarterly report line",
  quarterly_reports: "quarterly report",
  recurring_expenses: "recurring expense",
  team_members: "team member",
};

const operationLabels: Record<SystemActivityLogRow["operation"], string> = {
  INSERT: "created",
  UPDATE: "updated",
  DELETE: "deleted",
};

export function getActivitySummary(event: SystemActivityLogRow) {
  const entity = tableLabels[event.table_name] ?? event.table_name.replaceAll("_", " ");
  const changedFields = event.changed_columns
    .filter((column) => column !== "updated_at")
    .map((column) => column.replaceAll("_", " "));

  return {
    title: `${entity} ${operationLabels[event.operation]}`,
    details: changedFields.length > 0 ? changedFields.join(", ") : null,
  };
}

export function mergeActivityEvents(
  current: SystemActivityLogRow[],
  incoming: SystemActivityLogRow[],
) {
  const eventsById = new Map(current.map((event) => [event.id, event]));

  incoming.forEach((event) => eventsById.set(event.id, event));

  return [...eventsById.values()]
    .sort((left, right) => {
      const byTime = right.occurred_at.localeCompare(left.occurred_at);
      return byTime || right.id.localeCompare(left.id);
    })
    .slice(0, 25);
}
