# Kiln Studio: implementation status and next steps

This document records the current project scope and distinguishes completed
application flows from unimplemented parts of the larger team-workspace plan.
The checklist reflects repository code, not just the intended design.

## Project

Kiln Studio is a fictional design-studio demo. It supports the public inquiry
journey and provides admin, client, and designer surfaces. The internal team
workspace is backed by Supabase for project membership and messaging; Slack is
an optional synchronized collaboration surface.

## Implemented

- [x] Public site pages for home, services, and fictional work.
- [x] Validated public inquiry submission with honeypot, shared rate limiting,
  and no success-shaped response when persistence fails.
- [x] Extended design brief fields and centralized priority score/label logic.
- [x] Keep inquiries separate from projects; accepting an inquiry creates one
  project with a deadline field and a dedicated channel.
- [x] Add project manager, project-member roles, project/channel membership
  synchronization, and database activity logging for operational table changes.
- [x] Project channels contain refreshed inquiry details, require PM-only
  completion, archive/lock on completion, and have a priority/deadline ordering
  query.
- [x] Supabase migrations for inquiries, client accounts/companies, project
  briefs and priority, inquiry messages, normalized database finance/report
  records, and project/team/channel schema.
- [x] Client sign-up/sign-in and client-owned request list/detail surfaces.
- [x] Studio-member sign-in, inquiry list/detail, filtering/pagination, and
  status and priority updates.
- [x] Designer sign-in, priority queue, request detail, and inquiry message API.
- [x] Admin dashboard overview and distinct admin/designer Team routes.
- [x] Vercel Speed Insights package and root-layout integration.
- [x] Unit/API tests and TypeScript check scripts.

## Partially implemented / demo-only

- [x] Team directory and project channels load from `team_members` and project
  tables; dashboard team overview still uses sample data.
- [ ] Availability values are displayed but are not persisted or updated by each
  signed-in member.
- [ ] Project-member add/remove and role selection are connected; editing an
  existing member's role still needs an API/UI flow.
- [x] Project-channel messages persist in Postgres and update through Supabase
  Realtime.
- [ ] The database creates one project channel per accepted project, syncs
  memberships, and archives on PM completion. Slack creates its mapped private
  channel asynchronously and reconciles linked active project members.
- [ ] Legacy `project_assignments` remain inquiry-linked for compatibility;
  accepted work now has a first-class `projects` entity and `project_members`.
- [ ] Finance tables have no complete API, finance UI, or reconciliation flow.
- [x] System audit events are stored for studio members and the admin dashboard
  displays recent events live through Supabase Realtime.
- [ ] System activity feed pagination and retention policy.
- [x] Project channels are ordered by priority and deadline through a database
  function used by the Team page.
- [x] Slack workspace OAuth, designer account linking, encrypted bot-token
  storage, channel creation, linked-member reconciliation, event verification,
  inbound persistence, and durable outbound message delivery.
- [x] Project chat rate limits use Upstash Redis; Supabase Postgres and Realtime
  remain the durable message store and live delivery path.
- [x] Slack API, OAuth, rate-limit, project collaboration, and database behavior
  have automated application and pgTAP coverage.
- [x] Demo inquiries older than 14 days are removed by a protected scheduled
  cleanup route.
- [ ] Slack production setup still needs the latest migrations applied to the
  intended hosted Supabase project, a public Events API URL, configured
  subscriptions/secrets, and an approved live workspace test.
- [ ] Slack's standard channel API does not expose the app's per-project
  moderator permissions. Keep permission checks in Kiln Studio and RLS.
- [ ] The dashboard's team overview uses sample team data and therefore does not
  yet match a database-backed Team page.
- [ ] No complete e2e browser suite is present. The pgTAP RLS suite passes on
  local Supabase; it still needs execution against a safely targeted hosted
  project.

## Next implementation sequence

### 1. Align and harden the data model

- [x] Accepted inquiries become distinct `projects` records.
- [ ] Define canonical DB enum values to match `lib/studio/constants.ts`.
- [ ] Enforce one assignment per person per project and exactly one PM at the
  database/service boundary.
- [x] Use database triggers for project membership and app-channel membership
  synchronization; Slack reconciliation is queued through durable jobs.
- [ ] Review grants and RLS on all newer tables; ensure channel message history
  is readable only by current channel members.
- [ ] Define a normalized finance model for project revenue and contributor
  payouts before storing real financial records.

### 2. Implement backend operations and tests

- [ ] Implement admin project creation/opening from an inquiry and automatic
  project-channel creation on acceptance. (The database trigger now performs
  the initial conversion and channel creation.)
- [ ] Add project-member role editing and self-availability operations with
  centralized authorization.
- [ ] Restrict PM operations to their own project; only admin can assign/change
  the PM.
- [ ] Enforce admin-only Announcements posting and project membership for
  project channels (the database migration provides the initial policies;
  verify them against a real Supabase database).
- [x] Remove app-channel history access on project membership removal and queue
  Slack channel removal for the next sync.
- [ ] Add tests for each permission case, channel/assignment sync, and current
  membership history access.

### 3. Connect the Team UI and dashboard

- [ ] Replace mock roster/assignments/channels with authenticated database
  queries.
- [ ] Add loading, empty, and error states to Team and dashboard team sections.
- [ ] Add assigned/unassigned and availability filters.
- [ ] Add current-user availability editing.
- [x] Add durable project-channel reads/writes and archived-channel read-only
  states.
- [ ] Reuse one team query/component model for both Team and dashboard so their
  data cannot diverge.

### 4. Operations and release readiness

- [ ] Verify all migrations on a fresh and upgraded development database; the
  latest Slack migration and pgTAP suite have passed on the local stack.
- [ ] Run integration tests for RLS with distinct anon/client/designer/admin
  accounts.
- [ ] Add browser-level end-to-end coverage for inquiry to admin workflow and
  project assignment/channel lifecycle.
- [x] Implement automated 14-day demo-data cleanup.
- [ ] Review secrets, logs, retention, privacy copy, and production environment
  before public deployment.

## Project decisions to preserve

- One person may have many project assignments and exactly one role per
  project; multiple people may share a non-PM role.
- Exactly one PM per project; only admin assigns or changes the PM.
- PM can manage membership/roles only on their own project; admin can manage
  any project.
- Availability is self-managed and uses `AVAILABLE`, `BUSY`, `AWAY`, or
  `ON_LEAVE`.
- General is readable/writable by all studio users; Announcements is readable
  by all but writable only by admin.
- Removed project members must lose access to that project's channel and
  history, if this behavior is retained for the production system.

## Verification commands

```sh
pnpm typecheck
pnpm test
pnpm build
```

These commands check application code and the current automated test suite.
They do not replace Supabase migration/RLS integration tests or browser
end-to-end verification.
