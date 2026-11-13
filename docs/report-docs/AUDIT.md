# Kiln Studio Performance and Security Audit

## Current review — 2026-11-12

### Summary

- **Security:** An independent source review found no substantiated security
  vulnerabilities in the current repository changes.
- **Performance:** The unfiltered engagement queue's missing ordering index
  has been added in
  `20261112133000_add_engagement_queue_order_index.sql`. A local `EXPLAIN`
  now uses `engagements_created_at_id_idx` instead of a sequential scan and
  sort. Exact counts remain; cursor pagination/count strategy can be revisited
  if queue size warrants it.

### Current findings

| ID | Severity | Confidence | Finding |
| --- | --- | --- | --- |
| P5 | Medium at larger engagement counts — **remediated** | High | The default engagement queue's `(created_at DESC, id DESC)` ordering did not have a matching index; a local `EXPLAIN` showed a sequential scan followed by a sort. |

**Evidence:** [`app/api/admin/engagements/route.ts`](../../app/api/admin/engagements/route.ts)
applies the ordered, exact-count, offset-paginated query. The index in
[`20261112100000_add_engagement_review_foundation.sql`](../../supabase/migrations/20261112100000_add_engagement_review_foundation.sql)
starts with `review_state`, which did not support the unfiltered ordering. On
the clean local database before the fix, PostgreSQL planned
`Limit -> Sort -> Seq Scan` for the unfiltered query (estimated 430 rows).
This was a plan-level finding, not a production latency measurement.

**Remediation:** Added `engagements_created_at_id_idx` in the forward-only
queue-index migration, retaining the state-leading index for filtered views.
Local `EXPLAIN` confirms the unfiltered ordered query uses the new index.

**Remaining consideration:** Exact counts are still requested on every page.
If queue volume grows substantially, consider cursor pagination and avoiding
an exact count on every page. The new index adds write and storage cost.

**Scope and limitations:** Source review and local `EXPLAIN` only. No
production data, production traces, penetration test, or realistic concurrent
load test was used. This review does not certify external provider
configuration.

**Local verification:** Clean `supabase db reset --no-seed` applied the full
migration chain; schema lint passed; all 207 pgTAP assertions passed; the
unfiltered queue `EXPLAIN` selected `engagements_created_at_id_idx`. Remote
application of `20261112133000_add_engagement_queue_order_index.sql` is
verified in the linked project's migration history and catalog; a remote dry
run reports no pending migrations.

## Remediation status

The recommendations below have been implemented in the application and a new
forward-only local migration, `20261112000000_scope_designer_access_and_bound_workspace_reads.sql`.
After local pgTAP passed, the migration was applied to the linked hosted
Kiln-Studio project.

- **S1 / F1 — Designer inquiry and message access:** Designers now receive a
  minimal top-20 queue projection. Inquiry, brief, project, project-member,
  and legacy-message reads are limited to assigned project membership; the
  legacy message API checks access, rate-limits writes, and paginates history.
- **S2 — Legacy finance:** Legacy finance reads are studio-member-only and
  authenticated inserts are revoked. New finance tables remain unchanged.
- **P1 — Channel/message loading:** The channel list uses 50-item pages.
  Message history is loaded only when one conversation is open, in 50-row
  pages; the page subscribes to Realtime only for that open channel.
- **P2 — Presence:** Heartbeat and refresh run only for the open conversation,
  with in-flight guards preventing overlapping interval calls.
- **P3 — Assistant polling:** Poll intervals back off from 500 ms to a 5-second
  cap while preserving the 30-second timeout.
- **P4 — Growing lists:** Client projects use 25-row pages; legacy designer
  messages use 50-row cursor pages.

Verification after these changes: the complete application suite passed
(142 tests), the QStash/Workflow selector passed (45 tests), TypeScript passed,
the production build succeeded, local schema lint passed, and local pgTAP
passed (172 tests). The remote migration history matches local history; hosted
schema lint passed, and read-only checks confirmed the new RPCs/policy and
revoked legacy finance insert grants.

**Review date:** 2026-11-11  
**Scope:** Source/configuration review of the current application and database
migrations. No production data was accessed or changed.

## Executive summary

The application has useful safeguards: server-side Supabase user verification,
trusted `app_metadata` role checks, row-level security, bounded JSON/task bodies,
rate limits on public inquiries and assistant prompts, signed QStash/Slack
callbacks, encrypted Slack tokens, and a durable Slack outbox.

The review found two actionable authorization/data-scope issues and one
frontend/backend role mismatch in older inquiry/message/finance tables. It also
identified scaling costs in project collaboration polling and channel loading.
These are source-level findings, not measured production latency or load-test
results.

## Security findings

### S1 — Designer role can read and write legacy messages across inquiries

**Severity: Medium**  
**Confidence: High**

The RLS policies on `project_messages` authorize any authenticated
`designer` or `studio_member` for SELECT and INSERT based on role alone. The
insert grant includes `inquiry_id`, and the policy in the later sender-identity
migration checks sender role/type/ID but not project assignment or inquiry
membership. The designer messages API uses this table and does not add a
project-membership check.

As a result, a designer account can retrieve messages for inquiries outside
their assigned projects and can insert messages associated with arbitrary
inquiry IDs. This is broader than the project-scoped behavior of the newer
`project_channel_messages` model.

Relevant code:

- `supabase/migrations/20261108020000_fix_studio_access_policies.sql:39-54`
- `supabase/migrations/20261108040000_enforce_message_sender_identity.sql:1-20`
- `supabase/migrations/20261108010000_harden_table_grants.sql:44-45`
- `app/api/designer/messages/route.ts:9-75`

**Remediation:** A forward migration scopes legacy reads and writes to
assigned project membership; the API additionally checks assignment before
reading or writing. Cross-assignment and pagination assertions were added to
pgTAP and API tests.

### S2 — Designer role has global read/insert access to legacy finance records

**Severity: Medium**  
**Confidence: High**

`project_request_logs` and `company_expenses` policies allow every designer and
studio-member account to read and insert rows, without a project-membership or
studio-admin restriction. The corresponding grants permit inserts of payout,
revenue, and contributor amounts. This differs from the application’s
studio-admin-protected, read-only finance interface. The migration itself
notes that these permissions were retained as a product decision.

Relevant code:

- `supabase/migrations/20261108020000_fix_studio_access_policies.sql:57-90`
- `supabase/migrations/20261108010000_harden_table_grants.sql:47-51`

The demo data is synthetic, but this should be revisited before storing real
financial or client information.

**Remediation:** Legacy finance SELECT is restricted to `studio_member`;
authenticated INSERT grants and policies are removed. pgTAP assertions cover
designer denial and studio-member access.

## Frontend/backend consistency

### F1 — Designer inquiry views query rows their RLS role cannot read

**Severity: High functional impact**  
**Confidence: High**

The designer home page and request detail page query `public.inquiries` through
the authenticated session client. The inquiry table’s SELECT policies permit
studio members and owning clients; they do not include designers. PostgreSQL
RLS therefore filters out the rows for designer sessions. The home page can
show an empty queue, and the request page can report that a request was not
found even when the designer can see inquiry-brief metadata.

Relevant code:

- `supabase/migrations/20261107000000_create_inquiries.sql:62-77`
- `supabase/migrations/20261107010000_client_accounts_and_project_access.sql:72-84`
- `app/(designer)/designer/page.tsx:8-42`
- `app/(designer)/designer/requests/[id]/page.tsx:8-27`

This may be intentional data minimization, but the current UI expects those
inquiry rows. The access model needs an explicit decision: grant designers only
the required inquiry rows/columns under an assignment-scoped policy, or provide
a server-only authorized projection that enforces the desired assignment
boundary. Add integration tests for the intended designer experience and
cross-assignment denial.

## Performance findings

### P1 — Project workspace loads messages with per-channel query fan-out

**Severity: Medium at larger project counts**  
**Confidence: High**

`getProjectChannels` loads the channel listing without a limit, then issues one
message query per returned channel, each fetching up to 100 messages. The
queries are launched together with `Promise.all`. The team workspace also
creates one Realtime subscription per channel. Page data, database query count,
and subscriptions therefore grow with the number of project channels; a large
workspace can return thousands of messages and start many concurrent queries.

Relevant code:

- `lib/studio/project-channels.ts:42-45`
- `lib/studio/project-channels.ts:148-158`
- `components/team/team-workspace.tsx:147-166`

**Remediation:** History loads on demand for the single open conversation,
older pages are fetched explicitly, channel pages are capped at 50, and only
the open channel receives a Realtime subscription.

### P2 — Presence refresh and heartbeat requests scale linearly per active channel

**Severity: Medium at larger workspace sizes**  
**Confidence: High**

Every active channel receives an individual presence GET every 10 seconds and
an individual heartbeat POST every 20 seconds. That is approximately
`0.15 × active channels` HTTP requests per second per open workspace tab,
before typing updates and Realtime traffic. Multiple team members multiply this
load, and slow requests can overlap interval ticks.

Relevant code:

- `components/team/team-workspace.tsx:248-259`

**Remediation:** Presence refresh and heartbeat are limited to the single open
conversation, and in-flight guards prevent overlapping calls. Load testing
with realistic concurrent-user counts remains outstanding.

### P3 — Assistant responses are polled every second

**Severity: Low to Medium, depending on usage**  
**Confidence: High**

The browser polls `/api/client-chat?id=...` once per second for up to 30 seconds.
Each successful assistant response can therefore create up to 30 API reads,
even when the Workflow finishes quickly after the previous poll.

Relevant code:

- `components/assistant/client-chat.tsx:58-64`

**Remediation:** The browser uses bounded exponential backoff and retains its
30-second maximum wait and explicit timeout state.

### P4 — Some account and legacy message lists are unbounded

**Severity: Low until the tables grow**  
**Confidence: High**

The client project list selects every inquiry row for the client without
pagination. The legacy designer message endpoint returns the full message
history in ascending order with no limit. These payloads and query work grow
with account/message history.

Relevant code:

- `app/(public)/account/projects/page.tsx:41-45`
- `app/api/designer/messages/route.ts:24-31`

**Remediation:** Client requests and legacy messages now use explicit page-size
limits and pagination; older messages load on demand.

## Existing protections reviewed

- Server-side session checks use `auth.getUser()` and trusted
  `app_metadata.access_level`; the service-role key is referenced in server
  modules/routes, not client components.
- QStash callback routes validate signatures before processing task payloads;
  Slack Events validates the Slack request signature and timestamp.
- Slack OAuth uses signed state, an HTTP-only state cookie, short expiry, and
  workspace checks; bot tokens are encrypted at rest.
- Public inquiry/reference upload and assistant inputs are schema-validated,
  body-size bounded, and rate-limited; reference uploads are private and checked
  for declared size/type and file signatures before use.
- High-impact project and client tables have RLS enabled, and several database
  functions pin `search_path` and restrict execute grants.

These controls reduce risk but do not offset the role-scope gaps described
above. This review did not perform penetration testing or attempt live
provider/account attacks.

## Validation and limitations

- `pnpm audit --prod`: **No known vulnerabilities found** in the production
  dependency tree at review time. This does not cover application logic or
  guarantee future dependency status.
- Existing project test results from the preceding application audit: Vitest
  passed (137 tests), QStash/Workflow selector passed (45 tests), typecheck and
  production build passed, and local Supabase pgTAP passed (154 assertions).
- No browser-level load test, production trace, or external provider exercise
  was performed. Performance severity is based on query/request fan-out in code,
  not measured latency.
- Application and migration changes were made after the initial audit; the
  reviewed migration was applied to the linked hosted project only after local
  migration and pgTAP validation.
