# Kiln Studio

Kiln Studio is a fictional design-studio portfolio and operations demo built
for a CV/project walkthrough. It demonstrates how a public inquiry can move
through review, project setup, and team collaboration, with a customer-facing
Gemini assistant and an optional Slack sync layer.

**This is not a real design studio.** Portfolio work and inquiry data are
synthetic. The public inquiry form is not monitored for real leads. Do not enter
personal, confidential, payment, or otherwise sensitive information.

## What this project demonstrates

| Area | Implemented capability |
| --- | --- |
| Public portfolio | Responsive landing page, service catalog, fictional work, inquiry form, and optional design-reference images. |
| Inquiry workflow | Server-validated intake, extended brief, honeypot and rate limits, atomic Supabase persistence, and centralized priority score. |
| Similarity advisory | Explicit opt-in; approved brief text is embedded and matched with Upstash Vector. Similarity and reviewed complexity/hour context are advisory and do not change priority or accept work automatically. |
| Client portal | Supabase Auth sign-up/sign-in and client-owned inquiry list/detail views. |
| Studio workspace | Protected dashboard, status-filtered/paginated inquiry inbox, inquiry detail, status/priority updates, private reference previews, similarity review, and live audit feed. |
| Designer workspace | Protected priority queue, inquiry detail, and inquiry-linked messages. |
| Project lifecycle | Accepting an inquiry creates a project and dedicated channel. Admins manage the PM/deadline; the PM can complete a project. |
| Team collaboration | Live team directory, project membership/roles, persistent project-channel messages with Supabase Realtime, and short-lived Redis presence/typing indicators. |
| Slack sync | Optional OAuth workspace install and designer account linking; project-channel/member reconciliation; durable app-to-Slack delivery; verified, deduplicated inbound message storage. Supabase remains authoritative for access and history. |
| AI support guide | Site-wide widget and `/assistant` page, powered by Gemini Flash with bounded public-information tools. No access to private studio/client records or external actions. |
| Finance overview | Protected, read-only view of recent normalized finance records and the latest report. Transaction entry, reconciliation, and report publishing UI are not implemented. |
| Operations | QStash reference verification, Upstash Workflow for retryable tasks, a single daily Vercel Cron that runs Slack sync and 14-day demo-data cleanup, RLS-protected audit records, CI tests, and Vercel Speed Insights. |

### Technical specifications

- **Application:** Next.js 16 App Router, React 19, TypeScript 5.9, and Node.js Route Handlers.
- **Identity and relational data:** Supabase Auth and PostgreSQL; cookie-bound
  sessions, server-side authorization, and Row Level Security.
- **Live updates:** Supabase Realtime for project-channel messages and studio
  audit events. PostgreSQL is the durable message store.
- **Ephemeral coordination:** Upstash Redis for rate limiting, polling results,
  and short-lived project presence; it is not the chat-history database.
- **Async work:** Upstash QStash for reference-image verification and Upstash
  Workflow for retryable similarity and assistant processing.
- **Semantic matching:** OpenAI embeddings and Upstash Vector for consented
  inquiry similarity; human review remains authoritative.
- **Support assistant:** Gemini 3.8 Flash with Gemini 3.5 Flash-Lite fallback,
  static allowlisted tools, and
  bounded history/agent steps. Q&A is stored in Supabase for manual FAQ
  curation; question text is stored as submitted and is not automatically
  scrubbed. The interface warns against submitting sensitive details.
- **External collaboration:** Slack API with OAuth, encrypted installation
  credentials, verified Events API requests, durable sync/outbox records, and
  reconciliation jobs.
- **Quality gates:** Vitest unit/API tests, TypeScript typecheck, production
  build, Supabase migration/schema checks, and pgTAP tests in GitHub Actions.

### Important demo boundaries

- All portfolio examples and client/business records should be treated as
  synthetic. No real client-service commitments or response SLAs are offered.
- Similarity is a human-reviewed reference, not an ML-trained score or
  automatic acceptance/pricing system.
- Finance is read-only in the app; do not treat demo records as accounting data.
- Slack behavior depends on an installed workspace and valid provider setup;
  Slack does not implement Kiln's project-role authorization.
- The assistant stores question/answer text for FAQ review, without separate
  account/IP metadata. Submitted text is not PII-scrubbed automatically.
- Upstash Box/Lead-Generator automation and autonomous studio-record actions
  are deferred, not shipped features.

For the detailed walkthrough and limitations, see
[docs/DEMO.md](./docs/DEMO.md). Architecture and file responsibilities are in
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md); database schema and RLS are in
[docs/DATABASE.md](./docs/DATABASE.md); integration prerequisites and deferred
work are in [docs/PROD.md](./docs/PROD.md) and [docs/SLACK.md](./docs/SLACK.md).

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

The site runs at `http://localhost:3000`. Configure only the providers needed
for the flows being tested. If Supabase is unreachable, protected data and
sign-in operations cannot be verified.

## Product routes

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
| `/admin/team` | Studio member | Team directory and project collaboration workspace. |
| `/admin/finance` | Studio member | Read-only finance and latest quarterly report overview. |
| `/designer/sign-in` | Public sign-in | Designer authentication. |
| `/designer` | Designer or studio member | Priority queue and request links. |
| `/designer/requests/:id` | Designer or studio member | Request details and project room. |
| `/designer/team` | Designer or studio member | Team directory and project collaboration workspace. |

## API surface

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
| `POST /api/slack/sync` | Cron bearer secret | Processes project-channel, membership-reconciliation, and message-outbox jobs; called by the daily scheduler. |
| `POST /api/projects/:id/messages` | Designer or studio member | Stores project messages in Supabase and enqueues Slack delivery. |
| `PATCH /api/projects/:id` | Project manager or studio member | Updates project manager, deadline, or lifecycle details as authorized. |
| `POST`, `DELETE /api/projects/:id/members` | Project manager or studio member | Updates project membership/roles; triggers Slack membership reconciliation. |
| `GET`, `POST`, `DELETE /api/projects/:id/presence` | Project member | Reads/writes short-lived online and typing state in Redis. |
| `GET /api/cron/daily` | Cron bearer secret | Single daily Vercel Cron entry point; runs Slack sync, then stale demo-data cleanup. |
| `GET /api/cron/demo-retention` | Cron bearer secret | Cleanup operation invoked by the daily scheduler; can also be run manually. |

Slack member mapping is required for workspace participation. Project manager
and member roles remain authoritative in Kiln Studio; standard Slack channel
membership does not provide equivalent per-project permissions.

The Vercel configuration intentionally uses one once-daily cron because the
Hobby plan does not allow the every-minute schedule required for frequent Slack
outbox processing. On Hobby, Slack sync therefore runs with the daily
maintenance task; website messages still persist and update through Supabase
Realtime immediately, but Slack delivery can be delayed. Upgrade the Vercel
plan or use a separately secured external scheduler to run Slack sync more
frequently.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
```

The suite covers validation, auth/authorization behavior, queueing, workflows,
database policies, and key API flows. It does not replace browser-level
end-to-end testing against a configured environment.

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
- [Current implementation status and next steps](./docs/PLAN.md)
- [Slack integration notes](./docs/SLACK.md)
- [Production boundaries and deferred roadmap](./docs/PROD.md)
