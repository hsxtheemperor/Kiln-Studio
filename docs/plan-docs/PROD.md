# Production boundaries and deferred roadmap

Kiln Studio is built as a CV/demo project, not as a production design agency
platform. The public portfolio and business records are fictional. Use
synthetic data, and do not enter sensitive information. A successful local
build or test run does not mean external providers or a hosted deployment have
been fully verified.

## Current architecture decisions

- **Supabase PostgreSQL is the source of truth** for inquiries, projects,
  membership, project messages, Slack mappings/outbox, and audit records.
- **Auth and database policy:** Supabase Auth sessions, trusted
  `app_metadata` access levels, server-side authorization, grants, and RLS.
- **Realtime:** Supabase Realtime broadcasts durable project messages and
  studio-only audit events. Redis is not durable message storage.
- **Upstash Redis:** shared rate limiting, short-lived assistant polling
  results, and ephemeral project online/typing state.
- **Async processing:** QStash verifies private inquiry-reference uploads;
  Upstash Workflow runs retryable similarity and assistant jobs.
- **Similarity:** client-controlled opt-in, approved brief text, OpenAI
  embeddings, and Upstash Vector neighbor lookup. Results are advisory and
  reviewed by a person; no model changes priority, price, or acceptance.
- **Assistant:** Gemini answers only questions about public studio/demo
  information through a bounded allowlist of static tools. It has no access to
  private studio/client records and cannot perform external actions. Q&A text is
  saved for manual FAQ curation without separate account/IP metadata, but the
  text itself is stored as submitted and is not automatically scrubbed.
- **Slack:** optional two-way synchronization layered over the app's durable
  project messaging. App messages trigger signed QStash delivery jobs; one
  daily Vercel Hobby cron is only an outbox recovery sweep. Kiln's database
  remains authoritative for access, roles, and history.

## Known feature limits

- Finance has a protected read-only overview, but no transaction entry,
  reconciliation, or report-publishing UI.
- Project-channel message history is fetched on demand in pages of up to 50.
  Only the open conversation subscribes to Realtime or sends presence and
  heartbeat requests.
- Availability self-service, general/announcement chat composition, and
  channel message edit/delete/thread synchronization are not implemented.
- There is no FAQ curation interface, automatic FAQ training, or assistant
  transcript history. The assistant does not scrub personal information from
  submitted question text.
- Inquiry similarity has no trained predictive model and must not be presented
  as one.
- Slack historical import/backfill is not implemented. Slack roles do not
  provide equivalent app-side project permissions.
- Upstash Box and the Lead-Generator repository workflow are deferred. No
  autonomous agent is enabled to modify studio records.
- No complete browser end-to-end suite currently covers provider/workspace
  behavior.

## Deployment checklist

1. Apply reviewed migrations from `supabase/migrations/` to the intended
   Supabase environment. Support-message storage and its narrow upsert
   permission are migrations `20261111000000` and `20261111010000`. Use a
   development project for migration rehearsal; never run destructive local
   reset commands against a hosted project.
2. Provision test accounts through a trusted Supabase admin mechanism and set
   the required `app_metadata.access_level`; there is no public studio
   registration.
3. Configure only the provider credentials for features being deployed. Use
   `.env.example` for variable names and keep actual values in the hosting
   provider's secret store. Never copy secrets into docs, issues, or client
   bundles. Do not treat `.env.production` as a public reference.
4. For the assistant, configure `GOOGLEAI_API`, Upstash Redis, QStash token and
   signing keys, and the canonical `NEXT_PUBLIC_SITE_URL`. Confirm provider
   model availability, quota, and current usage terms; free-tier availability
   is not guaranteed.
5. For inquiry similarity, configure the OpenAI embedding key and Upstash
   Vector endpoint. Verify explicit consent, deletion/revocation behavior, and
   that only approved brief fields leave the application.
6. Configure QStash and monitor the single daily Vercel Cron at
   `/api/cron/daily`. QStash handles event-driven outbound Slack message
   delivery and retries; the cron sweeps any remaining outbox work and runs
   14-day demo-data cleanup. Do not assume the cleanup is active merely
   because its route exists.
7. For Slack, configure OAuth callback, Events API URL, event subscriptions,
   encryption/signing secrets, and test only in a dedicated workspace with
   synthetic records; see [SLACK.md](../design-docs/SLACK.md).
8. Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and the local Supabase
   migration/schema/pgTAP checks in CI. Validate provider setup and authorization
   in an explicitly designated test environment.

## Deferred work

- **FAQ curation:** create a studio-only review/export workflow before using
  stored Q&A as approved public FAQ content or training material.
- **Assistant privacy improvements:** decide on retention, deletion, and
  optional PII detection/redaction before accepting real visitor text.
- **Inquiry notifications:** define a destination and failure policy; inquiry
  persistence must not depend on notification-provider availability.
- **Finance operations:** define accounting, audit, and correction rules before
  adding write APIs or entry screens.
- **Slack recovery:** specify permission, deletion, and rate-limit behavior
  before implementing historical import or message synchronization beyond
  current new-message flows.
- **Box/Lead-Generator:** the idea is parked until the separate repository has
  working lead acquisition code and a clear, permitted source policy. Box does
  not itself supply lead data.
- **Autonomous actions:** any future agent that changes records needs narrow
  permissions, an explicit approval point, and tested rollback/failure
  handling.

The canonical application/data map is in
[ARCHITECTURE.md](../design-docs/ARCHITECTURE.md) and
[DATABASE.md](../design-docs/DATABASE.md). For what a visitor or reviewer can
currently exercise, see [DEMO.md](../DEMO.md).
