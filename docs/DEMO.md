# Demo behavior and scope

Kiln Studio is a fictional design-studio portfolio and operations demo. This
guide describes the implemented user experience and identifies the boundaries
that matter in a portfolio walkthrough. The public inquiry form is not a real
lead channel. Use synthetic data only.

## Public visitor experience

- Browse the studio landing page, service catalog, and fictional concept work.
- Submit an inquiry with service, goals, audience, desired outcomes, budget,
  timing, and optional visual references.
- Optionally create a client account to view inquiries associated with that
  account.
- Ask the site-wide Gemini assistant questions about public services, concept
  work, or how the demo inquiry flow works.

Inquiry submissions are validated server-side, checked against a honeypot and
shared rate limit, assigned a centralized priority score, then saved with their
extended brief in one database operation. Optional reference files use private
storage and server-side content verification. A successful confirmation is
shown only after the inquiry is persisted.

The assistant has a bounded function-calling loop over static public
information. It cannot access accounts, inquiries, project data, or team
records, and cannot perform external actions. It saves question/answer text to
Supabase for manual FAQ curation. The schema has no separate account/IP
metadata, but submitted text is stored as-is and is not automatically
scrubbed; visitors are told not to include personal or sensitive details.

## Studio and designer workflow

- Studio members sign in through provisioned accounts; there is no public
  studio-member registration.
- Deal leads also use provisioned accounts and sign in through the private
  studio sign-in page. They can review open engagements and claim suitable
  work; studio members can oversee and reassign it.
- The studio dashboard summarizes inquiries and provides a live,
  studio-restricted system-activity feed.
- The inquiry inbox supports status filtering, pagination, and inquiry detail
  review, including priority, private verified references, and optional
  similarity recommendations.
- Designers use a separate sign-in and priority queue. The queue exposes only
  minimal request fields before assignment; inquiry/brief details and
  inquiry-linked messages are available only to assigned designers and studio
  members.
- A studio member accepting an inquiry creates a distinct project and its
  dedicated project channel, but only after its engagement has been marked
  suitable and assigned to a deal lead. PostgreSQL enforces this prerequisite.

## Project and team collaboration

The admin and designer Team routes use authenticated Supabase data for active
team members and project channels. Administrators assign project managers and
deadlines. Project managers and administrators can manage project membership
and roles within the database authorization rules. A project manager completes
their project; completion archives the channel and prevents new messages.

Project-channel messages persist in PostgreSQL and are delivered to connected
clients through Supabase Realtime. The workspace loads message history on
demand in pages of up to 50, and only the open conversation subscribes to
Realtime and sends presence/heartbeat requests. Redis stores short-lived
online/typing indicators; these are ephemeral and are not a durable presence
history.

Slack is an optional synchronized surface. The app database remains the source
of truth for projects, app membership, roles, and messages. The worker creates
and reconciles private project channels for mapped Slack users, delivers
app-originated messages through a durable outbox, and ingests verified,
deduplicated Slack events. Slack channel membership does not replace app
authorization or provide equivalent project-role permissions.

## Similarity, finance, and audit

- Inquiry similarity is opt-in and advisory. Approved brief text is embedded;
  Upstash Vector holds similarity vectors and inquiry references. Human review
  is authoritative, and similarity does not automatically alter priority,
  acceptance, or pricing.
- The finance screen is a protected, read-only overview backed by normalized
  finance/report tables. There is no transaction-entry, reconciliation, or
  report-publishing UI.
- System audit rows record operation, table, row identifier, changed columns,
  actor, and timestamp—not before/after record values. Only studio members can
  read them; the admin dashboard receives new audit events through Realtime.
- The demo retention endpoint removes stale synthetic inquiries and abandoned
  reference uploads after the configured 14-day window. Scheduled execution
  must be configured and monitored in the deployment.

## Walkthrough

1. Configure a development Supabase project and required provider credentials
   using `.env.example` as the variable-name reference.
2. Apply the repository migrations to a development database and provision
   test accounts with trusted `app_metadata.access_level` values.
3. Start the app with `pnpm dev` and submit a synthetic inquiry.
4. Sign in as a client to view owned inquiries; as a deal lead to review and
   claim a suitable engagement; as a studio member to review, reassign, and
   convert a qualified inquiry; or as a designer to inspect the queue and
   messaging.
5. Accept a suitable, assigned synthetic inquiry, then inspect its project,
   channel, membership, Realtime messages, and PM-controlled completion.
6. Exercise optional Slack, similarity, upload, and assistant flows only when
   their providers are configured for the intended test environment.

## Not included / not production-ready

- The fictional portfolio and inquiry form are not real client services.
- No FAQ management interface, automatic FAQ extraction/training, or automatic
  PII scrubbing is provided.
- No autonomous agent can change studio records or make business decisions.
- Finance entry and accounting reconciliation are not available in the UI.
- Negotiation, policy-based pricing, meetings, contracts, emails, and
  completion review are not part of the implemented deal-lead slice.
- Availability self-service and general/announcement chat composition are not
  implemented.
- Slack history import/backfill, full edit/delete/thread synchronization, and
  per-project Slack moderator permissions are not implemented.
- Upstash Box and the Lead-Generator repository workflow are deferred.
- A successful local test/build does not verify external provider credentials,
  Slack workspace behavior, deployment schedules, or hosted RLS configuration.

See [ARCHITECTURE.md](./design-docs/ARCHITECTURE.md) for the application map,
[DATABASE.md](./design-docs/DATABASE.md) for persistence and access policies,
and [PROD.md](./plan-docs/PROD.md) for deployment prerequisites and deferred
work.
