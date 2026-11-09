# Kiln Studio

Kiln Studio is a fictional design-studio portfolio and operations demo built with
Next.js, TypeScript, Supabase, and Upstash. It demonstrates public project
inquiries, client request tracking, studio/designer workspaces, prioritization,
and an early team collaboration interface. It is not a real studio; inquiries
are synthetic/demo data and are not monitored as client leads.

## About

Kiln Studio is a fictional design-studio portfolio and operations demo built to
show a realistic inquiry-to-project workflow, live admin views, and a durable
team collaboration foundation. The app is intentionally synthetic and designed to
be easy to explain in a recruiter-facing walkthrough.

## What is implemented

- Public home, services, concept-work, and multi-step inquiry experience.
- Server-side inquiry validation, a honeypot, rate limiting, and Supabase
  persistence.
- Optional client sign-up/sign-in and an account page for viewing that client's
  requests. The sign-up form accepts at most one company name.
- Private admin and designer sign-in using Supabase Auth and trusted
  `app_metadata` access levels.
- Admin inquiry inbox/detail with status and priority updates, plus a dashboard
  with inquiry counts, latest inquiries, and a priority overview.
- Explicit inquiry acceptance that creates a project record (inquiries remain
  inquiries unless accepted), with a project deadline and admin-assigned PM.
- A dedicated channel created for every project, with inquiry details as its
  description. Completing a project is PM-only, locks/archives its channel, and
  leaves its history available to existing members.
- Project channels are ordered by inquiry priority (highest first), then nearest
  deadline; only studio members can read the system activity feed.
- The admin dashboard shows the latest system activity and streams new database
  audit events live through Supabase Realtime.
- Project chat messages are stored in Supabase and streamed to the website with
  Realtime. When Slack is configured, app messages sync through a durable
  outbox, Slack messages are stored back in Supabase, and private Slack project
  channel membership follows linked active project members.
- Designers link their Slack account from `/designer/team`; a studio member
  installs or reconnects the workspace from `/admin/team`.
- Designer priority queue, client-request detail, and request-message endpoint.
- Admin and designer Team pages with live project membership, project roles,
  channel history, PM assignment, and completion controls. Availability editing
  and general/announcement chat remain future work.
- Supabase migrations for inquiry briefs and priority, projects/channels,
  database-level finance and quarterly reports, client/company records, team
  assignments, request messages, and access policies.
- Vercel Speed Insights integration.

Finance tables and database functions exist but do not yet have a
finance UI/workflow. Legacy finance summaries remain pending data reconciliation.
The Slack worker requires the latest migrations, deployment secrets, a public
Slack Events URL, and a configured cron scheduler before it can synchronize a
real workspace. See
[docs/DEMO.md](./docs/DEMO.md) and [docs/PLAN.md](./docs/PLAN.md) for details.

## Local development

Requirements: Node.js supported by the installed Next.js version, pnpm, and a
configured Supabase project. Upstash is required for public inquiry and
authenticated project-message rate limits.

1. Install dependencies:

   ```sh
   pnpm install --frozen-lockfile
   ```

2. Copy `.env.example` to `.env.local` and fill in valid provider values. Never
   commit `.env.local` or expose the service-role key.
3. Apply the committed SQL migrations to the intended Supabase project. See
   [docs/DATABASE.md](./docs/DATABASE.md).
4. Privately provision the Supabase Auth users and trusted app metadata required
   for admin/designer access; there is no public studio registration.
5. Start the development server:

   ```sh
   pnpm dev
   ```

The site runs at `http://localhost:3000`. If Supabase is unreachable, protected
data and sign-in operations cannot be verified; check the project URL, project
availability, and local network before debugging credentials.

## Routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/` | Public | Studio landing page. |
| `/services`, `/work` | Public | Service overview and concept work. |
| `/inquiry` | Public | Inquiry and design-brief form. |
| `/account/sign-up`, `/account/sign-in` | Public | Client account access. |
| `/account/projects` | Client | Client's submitted requests. |
| `/account/projects/:id` | Client | One owned request's details. |
| `/admin/sign-in` | Public sign-in | Studio-member authentication. |
| `/admin` | Studio member | Inquiry and team overview. |
| `/admin/inquiries` | Studio member | Inquiry inbox. |
| `/admin/inquiries/:id` | Studio member | Inquiry details and status update. |
| `/admin/team` | Studio member | Team and collaboration demo. |
| `/designer/sign-in` | Public sign-in | Designer authentication. |
| `/designer` | Designer or studio member | Priority queue and request links. |
| `/designer/requests/:id` | Designer or studio member | Request details and project room. |
| `/designer/team` | Designer or studio member | Team and collaboration demo. |

## API

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /api/inquiries` | Public | Validates, rate-limits, checks honeypot, saves inquiry and brief/priority data. |
| `POST /api/client/auth` | Public | Client sign-in or sign-up, selected by `action`. |
| `POST`, `DELETE /api/admin/auth` | Public/session | Studio sign-in and sign-out. |
| `POST /api/designer/auth` | Public sign-in | Designer sign-in. |
| `GET /api/admin/inquiries` | Studio member | Paginated inquiry list; `page`, `pageSize`, and `status` filters. |
| `GET /api/admin/inquiries/:id` | Studio member | Inquiry and brief detail. |
| `PATCH /api/admin/inquiries/:id` | Studio member | Updates inquiry status and/or priority. |
| `GET`, `POST /api/designer/messages?inquiry_id=:id` | Designer or studio member | Reads or posts messages for an inquiry. |
| `GET /api/slack/status` | Designer or studio member | Reports whether the workspace is installed and the current user's Slack identity is linked. |
| `GET /api/slack/install`, `GET /api/slack/connect` | Studio member / designer | Starts verified Slack workspace installation or user linking. |
| `GET /api/slack/callback` | Signed-in user | Completes the OAuth callback and stores encrypted tokens or verified identity mapping. |
| `POST /api/slack/events` | Slack signature | Verifies Slack Events API requests, handles uninstall, and persists eligible messages. |
| `POST /api/slack/sync` | Cron bearer secret | Processes project-channel, membership-reconciliation, and message-outbox jobs. |
| `POST /api/projects/:id/messages` | Designer or studio member | Stores project messages in Supabase and enqueues Slack delivery. |
| `POST`, `DELETE /api/projects/:id/members` | Project manager or studio member | Updates project membership/roles; triggers Slack membership reconciliation. |

Slack member mapping is required for workspace participation. Project manager
and member roles remain authoritative in Kiln Studio; standard Slack channel
membership does not provide equivalent per-project moderator permissions.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
```

Tests cover selected schemas, priority logic, and API/auth flows. Passing these
tests does not replace an end-to-end browser test.

## Continuous integration

The [CI workflow](./.github/workflows/ci.yml) runs for pull requests, pushes to
`main`, and manual dispatches. It installs dependencies from the lockfile, runs
the application tests, type-checks and builds Next.js, then starts a disposable
local Supabase stack, applies every migration, lints the public schema, and runs
the pgTAP integration/RLS tests. It uses no hosted Supabase credentials and does
not deploy.

## License

This project is licensed under the [MIT License](./LICENSE).

## Documentation

- [Architecture and file responsibilities](./docs/ARCHITECTURE.md)
- [Database schema, migrations, and access boundaries](./docs/DATABASE.md)
- [Current demo behavior and limitations](./docs/DEMO.md)
- [Implementation status and follow-up checklist](./docs/PLAN.md)
- [Future production and Slack integration direction](./docs/PROD.md)
