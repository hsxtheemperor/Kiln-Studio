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

## Website features

- **Public portfolio:** responsive home, services, and fictional concept work.
- **Customer-support chatbot:** site-wide helping-hand widget and full-page
  assistant, powered by Gemini 3.8 Flash with Gemini 3.5 Flash-Lite fallback.
  A bounded agent loop can retrieve only static public service, inquiry, and
  portfolio information; it cannot access private studio or client data.
  Upstash Rate Limits and Workflow protect and retry requests, Redis keeps
  transient polling results for ten minutes, and Supabase stores each
  question/answer pair for future FAQ curation without separate account or IP
  metadata. Submitted text is not automatically scrubbed; visitors are warned
  not to include personal or sensitive information. Google AI free-tier
  availability and quotas depend on the account and current provider terms.
- **Inquiry intake:** validated inquiry and extended design brief, honeypot
  protection, shared Redis rate limiting, and atomic Supabase persistence.
- **Reference uploads:** optional private JPEG/PNG/WebP references, signed
  upload URLs, server-side content verification, and temporary admin previews.
- **Opt-in similarity advisory:** client-controlled consent, approved brief
  text embeddings, Upstash Vector matching, human complexity/hour review, and
  no automatic priority changes.
- **Client portal:** optional account sign-up/sign-in and client-owned inquiry
  list/detail pages.
- **Studio/admin workspace:** protected sign-in, inquiry inbox and detail,
  status/priority updates, review notes, similarity recommendations, and a
  dashboard with inquiry and live system-activity summaries.
- **Designer workspace:** protected sign-in, priority queue, request details,
  and inquiry-linked messages.
- **Project lifecycle:** accepted inquiries create projects; studio admins
  manage project managers and deadlines; project completion is PM-controlled.
- **Project collaboration:** project-specific membership and roles, persistent
  Supabase messages and Realtime delivery, membership-gated history, and
  short-lived Redis online/typing indicators.
- **Slack synchronization:** optional OAuth workspace install and designer
  account linking, private project channels, member reconciliation, durable
  outbound delivery, and verified inbound message persistence. Supabase remains
  the source of truth; Slack roles do not replace app/database permissions.
- **Background processing:** QStash reference verification and retryable
  Upstash Workflow runs for opted-in similarity and chatbot answers.
- **Finance overview:** protected, read-only view of recent revenue, payouts,
  expenses, and the latest quarterly report from the existing normalized
  schema. Transaction entry, reconciliation, and report publishing UI are not
  implemented.
- **Retention and audit:** protected scheduled cleanup for stale demo inquiries
  and abandoned uploads; studio-only audit events omit record values.
- **Security and CI:** Supabase Auth/RLS, server-side authorization, pgTAP
  database tests, Vitest endpoint/unit tests, TypeScript checks, and production
  build validation.
- **Vercel Speed Insights** integration.

The site is a fictional demo. Do not submit sensitive information. See
[docs/DEMO.md](./docs/DEMO.md), [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md),
and [docs/PROD.md](./docs/PROD.md) for system boundaries and deployment gaps.

## Local development

Requirements: Node.js supported by the installed Next.js version, pnpm, a
configured Supabase project, and Upstash credentials for rate limits,
background work, and enabled optional features.

1. Install dependencies:

   ```sh
   pnpm install --frozen-lockfile
   ```

2. Copy `.env.example` to `.env.local` and fill in valid provider values. Never
   commit `.env.local` or expose the service-role key.
3. Apply reviewed SQL migrations to the intended Supabase project using the
   Supabase CLI; see [docs/DATABASE.md](./docs/DATABASE.md). Do not run
   `supabase db reset` against a hosted project.
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
| `/assistant` | Public | Full-page customer-support chatbot. |
| `/account/sign-up`, `/account/sign-in` | Public | Client account access. |
| `/account/projects` | Client | Client's submitted requests. |
| `/account/projects/:id` | Client | One owned request's details. |
| `/admin/sign-in` | Public sign-in | Studio-member authentication. |
| `/admin` | Studio member | Inquiry and team overview. |
| `/admin/inquiries` | Studio member | Inquiry inbox. |
| `/admin/inquiries/:id` | Studio member | Inquiry details, priority/status, references, and similarity review. |
| `/admin/team` | Studio member | Team and collaboration demo. |
| `/admin/finance` | Studio member | Read-only finance and latest quarterly report overview. |
| `/designer/sign-in` | Public sign-in | Designer authentication. |
| `/designer` | Designer or studio member | Priority queue and request links. |
| `/designer/requests/:id` | Designer or studio member | Request details and project room. |
| `/designer/team` | Designer or studio member | Team and collaboration demo. |

## API

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /api/inquiries` | Public | Validates, rate-limits, checks honeypot, saves inquiry and brief/priority data. |
| `POST /api/inquiries/reference-uploads` | Public | Creates staged metadata and signed URLs for optional private reference uploads. |
| `POST /api/inquiries/process-reference` | QStash signature | Verifies uploaded reference contents. |
| `POST /api/inquiries/process-similarity` | QStash signature | Processes queued opt-in similarity work. |
| `POST /api/workflows/inquiry-similarity` | Upstash Workflow | Durable consent-check and inquiry similarity steps. |
| `POST /api/workflows/client-chat` | Upstash Workflow | Runs the bounded Gemini tool loop, stores an idempotent Q&A pair in Supabase, and publishes a short-lived Redis result. |
| `POST /api/client-chat` | Public | Rate-limited chatbot question submission with bounded conversation context. |
| `GET /api/client-chat?id=:uuid` | Public | Polls the short-lived Redis response. |
| `POST`, `DELETE /api/client/auth` | Public/session | Client sign-in/up and sign-out, selected by `action` for POST. |
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
| `PATCH /api/projects/:id` | Project manager or studio member | Updates project manager, deadline, or lifecycle details as authorized. |
| `POST`, `DELETE /api/projects/:id/members` | Project manager or studio member | Updates project membership/roles; triggers Slack membership reconciliation. |
| `GET`, `POST`, `DELETE /api/projects/:id/presence` | Project member | Reads/writes short-lived online and typing state in Redis. |
| `GET /api/cron/demo-retention` | Cron bearer secret | Removes stale synthetic inquiries and abandoned reference uploads. |

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
all branches, and manual dispatches. It installs dependencies from the
lockfile, runs application and QStash/Workflow tests, type-checks and builds
Next.js, then starts a disposable local Supabase stack, applies every
migration, lints the public schema, and runs the pgTAP integration/RLS tests.
It uses no hosted Supabase credentials and does not deploy.

## License

This project is licensed under the [MIT License](./LICENSE).

## Documentation

- [Architecture and file responsibilities](./docs/ARCHITECTURE.md)
- [Database schema, migrations, and access boundaries](./docs/DATABASE.md)
- [Current demo behavior and limitations](./docs/DEMO.md)
- [Implementation status and follow-up checklist](./docs/PLAN.md)
- [Future production and Slack integration direction](./docs/PROD.md)
