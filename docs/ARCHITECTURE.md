# Kiln Studio Architecture

This is the current implementation map. It distinguishes working application
flows from demo-only UI and future production work; update it when routes or
file responsibilities change.

## System overview

```text
Public browser
  ├─ Public site and inquiry form
  │    └─ POST /api/inquiries
  │         ├─ Zod validation, honeypot, Upstash rate limit
  │         ├─ server-only atomic inquiry + brief persistence
  │         └─ computed priority on the inquiry
  └─ Client account
       └─ Supabase Auth cookie session → client profile / owned inquiries

Studio browser
  ├─ Admin sign-in → studio_member app_metadata
  │    ├─ dashboard and inquiry inbox
  │    └─ project operations: PM assignment, deadlines, completion, channel ordering
  └─ Designer sign-in → designer or studio_member app_metadata
       ├─ priority queue and inquiry message room
       └─ Team page with live project membership and persistent channel messages

Next.js server and Route Handlers
  └─ Supabase Auth/Postgres; cookie-bound client for user-scoped operations
       ├─ inquiry and extended-brief RPC
       ├─ project lifecycle and system activity triggers
       ├─ authenticated project-membership and channel-message writes
       └─ database-only finance and quarterly-report schema
```

The browser UI is not a security boundary. Server-side auth checks and database
RLS must protect private data. Project membership and channel history are
loaded through the user's Supabase session; message writes, membership changes,
and project management remain subject to database policies.

## Route groups

Next.js route groups organize layouts without adding URL prefixes.

| Path | Responsibility |
| --- | --- |
| `app/(public)/` | Public site, inquiry form, client sign-in/up, and client request pages. |
| `app/(admin)/admin/` | Studio-member dashboard, inquiry management, and Team view. |
| `app/(designer)/designer/` | Designer priority queue, inquiry room, and Team view. |
| `app/api/` | Server-side inquiry, auth, admin-inquiry, designer-message, and project collaboration handlers. |

## Important files

### Pages and components

| File | Responsibility |
| --- | --- |
| `app/layout.tsx` | Root metadata/styles and Vercel Speed Insights. |
| `app/globals.css` | Shared public, admin, designer, and Team visual system. |
| `app/(public)/page.tsx`, `services/page.tsx`, `work/page.tsx` | Public landing, service, and fictional concept-work pages. |
| `app/(public)/inquiry/page.tsx` | Inquiry entry point and optional client prefill. |
| `components/inquiry/inquiry-form.tsx` | Client-side form UX; server validation remains authoritative. |
| `components/inquiry/confirmation-gate.tsx` | Prevents direct access from appearing to confirm an unsaved request. |
| `app/(public)/account/` and `components/client/` | Client auth forms and request-list/detail views. |
| `app/(admin)/admin/page.tsx` | Loads and renders the admin dashboard. |
| `components/admin/admin-dashboard.tsx` | Inquiry summary, top priority, latest inquiries, live system activity, and team overview. |
| `components/admin/admin-frame.tsx` | Admin shell/navigation and sign-out UI. |
| `components/admin/activity-feed.tsx` | Admin-only initial activity list and live Supabase Realtime subscription, rendered with RLS-protected session data. |
| `components/admin/inquiry-inbox.tsx`, `inquiry-detail.tsx` | Inquiry list/filter/pagination and status update UI. |
| `components/team/team-workspace.tsx` | Active team directory, project membership management, and persisted project-channel conversations. |
| `components/designer/designer-project-room.tsx` | Designer/client-request message interface. |

### API and shared server logic

| File | Responsibility |
| --- | --- |
| `app/api/inquiries/route.ts` | Public request validation, abuse controls, priority computation, and atomic inquiry/brief persistence. |
| `app/api/client/auth/route.ts` | Client sign-in/up; creates/updates profile and optional single company record. |
| `app/api/admin/auth/route.ts` | Studio-member sign-in/sign-out. |
| `app/api/designer/auth/route.ts` | Designer/studio-member sign-in gate. |
| `app/api/admin/inquiries/route.ts`, `[id]/route.ts` | Protected inquiry list/detail and status/priority updates. |
| `app/api/designer/messages/route.ts` | Protected inquiry-linked designer message reads/writes. |
| `app/api/projects/[id]/members/route.ts` | Adds and removes project team members using the authenticated session; RLS authorizes administrators/project managers. |
| `app/api/projects/[id]/messages/route.ts` | Persists project-channel messages with sender identity derived from the authenticated team profile. |
| `lib/studio/project-channels.ts` | Loads RLS-filtered ordered project channels, current memberships, and recent channel messages. |
| `lib/inquiries/schema.ts` | Inquiry options, validation, normalization, and database insert mapping. |
| `lib/project-priority.ts` | Priority score and label computation. |
| `lib/studio/constants.ts` | UI constants/types for availability, roles, channels, and labels. |
| `lib/auth/require-*.ts` | Cookie-bound session verification and access-level checks. |
| `lib/supabase/session.ts` | Supabase server client and cookie adapter. In Server Components, cookie refresh writes may not be applied; writable cookie operations belong in Route Handlers/Actions. |
| `lib/supabase/browser.ts` | Cookie-bound browser Supabase client for authenticated Realtime subscriptions. |
| `lib/studio/activity-feed.ts` | Safe audit-event summaries and bounded/deduplicated feed merging. |
| `lib/supabase/public-inquiry.ts` | Narrow server-only call to the database RPC that creates an inquiry and extended brief atomically. |
| `lib/rate-limit/inquiry.ts`, `lib/http/read-json.ts` | Shared rate limit and bounded JSON parsing. |

### Database, tests, and docs

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/20261107000000_create_inquiries.sql` | Base inquiry table, constraints, RLS, and grants. |
| `supabase/migrations/20261107010000_client_accounts_and_project_access.sql` | Client profiles, inquiry ownership, and client access policies. |
| `supabase/migrations/20261107020000_client_company_relationships.sql` | Client-company relation and migration from the old profile company field. |
| `supabase/migrations/20261107030000_designer_messages_and_finance_tracking.sql` | Inquiry messages, request logs, and company-expense records. |
| `supabase/migrations/20261107040000_team_roles_and_channels.sql` | Team members, inquiry assignments, channels, members, and channel messages. |
| `supabase/migrations/20261107050000_team_statuses_and_channel_roles.sql` | Availability/channel role constraints and a legacy one-PM-per-inquiry index. |
| `supabase/migrations/20261107060000_project_briefs_priority.sql` | Historical migration that added extended brief fields and priority; migration 13 moved priority to `inquiries` and renamed the brief table. |
| `supabase/migrations/20261108000000_projects_and_system_activity.sql` | Converts accepted inquiries into projects, adds project teams/deadlines/project channels, and logs app-table changes for the system activity channel. |
| `supabase/migrations/20261108010000_harden_table_grants.sql` | Removes broad table privileges and grants only the operations needed by authenticated policies. |
| `supabase/migrations/20261108020000_fix_studio_access_policies.sql` | Aligns studio/designer RLS with trusted app-metadata claims. |
| `supabase/migrations/20261108030000_allow_project_brief_upserts.sql` | Adds the service-role SELECT privilege required for project-brief upserts. |
| `supabase/migrations/20261108040000_enforce_message_sender_identity.sql` | Enforces message sender identity and retains the archived-channel posting lock. |
| `supabase/migrations/20261108050000_align_inquiry_priority_and_finance.sql` | Renames briefs to `inquiry_briefs`, moves priority onto inquiries, restricts the activity feed to studio members, and adds normalized finance and quarterly-report tables/functions. |
| `supabase/migrations/20261108060000_enable_system_activity_realtime.sql` | Adds the RLS-protected system activity table to Supabase Realtime publication. |
| `supabase/migrations/20261108070000_restrict_membership_changes_to_active_projects.sql` | Prevents adding or changing project roles after completion while preserving membership removal for access revocation. |
| `supabase/tests/` | pgTAP coverage for inquiry priority/atomic writes, project lifecycle and RLS, finance/report behavior, grants, team roles, and channel rules. |
| `.github/workflows/ci.yml` | Runs application tests/typecheck/build and clean local Supabase migration, lint, and pgTAP checks on PRs and pushes to `main`; no deployment. |
| `lib/supabase/database.types.ts` | Application-side Supabase row/insert types. |
| `tests/unit/`, `tests/lib/`, `tests/api/` | Focused validation, priority, and API/auth tests. |
| `tests/e2e/` | Placeholder for browser-level workflows. |
| `docs/` | Current architecture, schema, demo, project status, and production direction. |

## Authentication boundaries

- Supabase Auth owns credentials and cookie-bound sessions.
- Admin routes require trusted `app_metadata.access_level = "studio_member"`.
- Designer routes accept trusted `access_level = "designer"` or
  `"studio_member"`.
- Client routes accept the client access levels checked by the client guard.
- Do not use editable `user_metadata` as an authorization source.
- The service-role key is server-only and bypasses RLS; keep its use narrow.

## Implemented versus demo-only

**Connected to backend:** public inquiry and brief persistence, inquiry priority,
client account/profile flows, admin inquiry reads and status/priority updates,
and designer inquiry messaging (subject to the deployed Supabase policies and
configuration).

The Team page shows the active team directory and RLS-filtered project channels.
Admins assign project managers; admins and project managers can add/remove
project members and assign supported project roles. Project messages are stored
in PostgreSQL and the page loads up to the latest 100 messages per visible
channel. Project completion requires its PM, archives the channel against new
messages, and retains history only for current members. Project channels are
ranked by priority descending, then nearest deadline via
`list_project_channels()`. Availability editing, general/announcement chat,
and message pagination are not implemented. Channel messages stream over
Supabase Realtime.
See [DATABASE.md](./DATABASE.md) and [PLAN.md](./PLAN.md).

**Slack synchronization:** workspace installation and designer account linking
use verified OAuth. The Postgres outbox creates private project channels,
reconciles membership for linked active project members, and delivers app
messages. Verified Slack message events are deduplicated and stored in
Postgres. Upstash Redis is used for message rate limits, not durable chat
storage. The standard Slack channel API does not mirror Kiln's role-based
moderator permissions; database authorization remains authoritative.

Project channel descriptions are generated from the related inquiry and brief
and refreshed if inquiry/brief details change. System audit events record the
database columns changed, not the values, and are attached to the System
activity channel.

**System activity:** the database records inserts, updates, and deletes on the
listed operational tables as audit events containing table, row ID, operation,
changed column names, actor, and timestamp. It intentionally does not copy
before/after values (which may contain client data). Only studio members can
read these events. The admin dashboard loads the newest 25 events and subscribes
to inserts over Supabase Realtime; the browser session remains subject to RLS.
The System channel is event-only and is not a chat composer.

**Finance:** normalized revenue, payout, expense, recurring-expense, and
quarterly-report tables plus database totals/publishing functions are present.
Finance APIs, entry forms, and report screens are not implemented. Legacy
`project_request_logs` and `company_expenses` remain for later reviewed data
reconciliation and should not receive new finance records.

## Boundaries to preserve

- Validate public input on the server and do not report success when persistence
  fails.
- Keep authorization checks on the server and verify RLS in Supabase itself.
- Never expose secrets, session tokens, or service-role credentials to client
  code or tracked files.
- Keep the inquiry priority logic in `lib/project-priority.ts` rather than
  duplicating formulas across dashboards.
- Label sample names, assignments, and conversations as demo content until they
  are replaced with persistent records.
