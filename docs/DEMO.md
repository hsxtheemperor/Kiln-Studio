# Demo behavior and scope

Kiln Studio is a fictional design-studio operations demo. Its public inquiry
flow and selected account/admin/designer paths use Supabase, while some
collaboration views are intentionally illustrative. This document distinguishes
the connected features from the prototype UI.

## Public and client experience

- Public landing, service, and fictional concept-work pages.
- Inquiry form captures contact information, requested service, budget/timeline,
  and design-brief fields such as goals, audience, references, complexity, and
  outcomes.
- The server validates and normalizes values, checks a honeypot, applies shared
  rate limiting, computes priority, and atomically stores the inquiry and
  extended brief.
- New inquiries remain inquiries. When a studio admin sets an inquiry's status
  to `Accepted`, the database creates one project record and one dedicated
  project channel. The project record has a deadline date field and an
  admin-assigned project manager.
- Client account sign-up/sign-in and request list/detail views are present.
- Sign-up allows no company or one company name; no multi-company sign-up
  control is offered.

## Studio and designer experience

- Admin sign-in is private/provisioned, not public registration.
- The admin dashboard shows inquiry counts, latest requests, priority context,
  and a team overview.
- Admin inquiry inbox supports status-filtered/paginated results, detail, and
  status/priority updates.
- Designer sign-in is separate. Designers can review the priority queue,
  request details, and inquiry-linked project messages.
- Admin and designer workspaces each include a separate **Team** route.

## Team workspace: prototype boundary

The Team page currently renders sample team members, project assignments,
availability, and sample chat messages from React component state. Sending a
Team chat message updates only the current page state; it is not written to
Supabase and does not synchronize between browsers. Project channels are live:
the Team page lists them in database priority/deadline order, lets admins assign
a PM and set a deadline, and lets the assigned PM set a deadline or complete
the project. Projects get dedicated channels automatically, with inquiry
details as the channel description.

The UI illustrates the intended workflow:

- availability options: `AVAILABLE`, `BUSY`, `AWAY`, `ON_LEAVE`;
- example working roles and PM role;
- General, Announcements, and project channel concepts;
- member and assignment visibility.

It does **not** currently implement live user-set availability, database-backed
team roster, project membership editing, channel chat, announcement write
permissions, or the System activity feed viewer. The database enforces project
membership access and allows current project members to read archived channel
history; removed members lose access. The Team page must not be used to
coordinate confidential real work.

## Other modeled but not fully surfaced data

- `inquiry_briefs` is persisted with each submitted inquiry. Priority is stored
  on the inquiry; the brief keeps its scoring inputs.
- `project_messages` has a designer API and request room; this is separate from
  the local Team chat prototype.
- `project_revenue`, `project_payouts`, `expenses`, `recurring_expenses`, and
  quarterly report tables/functions model finance, but no finance API or UI is
  implemented. Legacy `project_request_logs` and `company_expenses` remain for
  later reconciliation and should not receive new finance records.
- `system_activity_logs` records operational table changes and is readable by
  studio members only. The System channel is an event feed, not a chat composer,
  and its viewer UI is not yet implemented.
- The database-backed project channel list is live; roster, member editing, and
  regular Team chat still use sample/local state.

## Demo setup and walkthrough

1. Configure Supabase and Upstash using `.env.example` as the variable-name
   reference.
2. Apply the full SQL migration chain to a development database.
3. Provision test accounts through a trusted Supabase admin mechanism and set
   the proper `app_metadata.access_level`; do not add passwords or privileged
   keys to docs or source.
4. Run `pnpm dev`, submit a synthetic inquiry, and verify it is persisted before
   the confirmation page is shown.
5. Sign in as a provisioned client to inspect owned requests, as a studio
   member to review/update inquiry status, or as a designer to inspect the
   priority queue and message room.
6. Visit `/admin/team` or `/designer/team` to see the sample collaboration UI;
   remember its chat and roster are not live backend data.

## Release cautions

Do not present the fictional studio or sample project names as real client
work. Do not publish actual inquiry data. The documented 14-day cleanup policy
is not an automated guarantee until a cleanup task is implemented and tested.
See [DATABASE.md](./DATABASE.md) for schema and security boundaries and
[PROD.md](./PROD.md) for the future integration path.
