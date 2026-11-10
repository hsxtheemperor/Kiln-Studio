# Production direction: durable team collaboration and Slack integration

The Team workspace uses durable project membership and message storage for
project channels. Slack is an optional collaboration surface, while Supabase
remains authoritative for project membership, roles, and message history.

## Recommended source of truth

- Kiln Studio's database owns inquiries, projects, assignments, canonical roles,
  channel membership, message references, and workflow status.
- The application enforces access through trusted server-side identity checks,
  database RLS, and audited service operations.
- Slack is an optional transport/collaboration surface synchronized through a
  controlled integration.

New projects have project-scoped memberships and dedicated channels. The Team
workspace reads project membership and channel history from Supabase; the
authenticated API writes messages and adds/removes members, while RLS remains
the final authorization boundary. Project manager assignment remains separate
from project-team roles.

## Staged approach

### Stage 1: Make the in-app workflow real

The project-channel foundation is implemented:

1. Introduce or confirm a first-class `projects` entity and its inquiry lifecycle.
2. Keep project manager assignment separate from project-team roles; synchronize
   project memberships with channel membership in the database.
3. Enforce PM/admin membership editing and membership-based message-history
   access in PostgreSQL RLS, with authenticated server routes for writes.
4. Connect project team views, channel membership, and persistent project
   messages to the database.
5. Test project-channel access, role assignment, sender identity, and history
   revocation.

Availability management and general/announcement chat are not part of this
project-channel foundation. The current message view loads the latest 100
messages per visible project channel; pagination and realtime updates remain
future work.

### Slack integration status

The repository includes Slack OAuth installation and designer account linking,
encrypted bot-token storage, workspace and user mappings, project-channel
creation, channel membership reconciliation, app-to-Slack message delivery,
Slack-to-Supabase message ingestion, event deduplication, retries, and an
authenticated sync worker. App chat messages are stored in Supabase first and
streamed to the website with Supabase Realtime; Slack is synchronized
asynchronously through the outbox.

The worker is scheduled once per minute by Vercel Cron. Production deployment
requires every `SLACK_*` secret in `.env.example`, `CRON_SECRET`, an active
Supabase migration chain, the callback URL registered in the Slack app, and a
public Events API request URL for `/api/slack/events`. The Slack app must
subscribe to `message.groups` and `app_uninstalled`. Real workspace behavior
has not been verified until that deployed configuration is installed and tested.

Project managers and roles remain enforced in the Kiln Studio database.
Slack's standard channel APIs do not provide this app with a per-project
moderator/role system matching the database roles; channel membership is
reconciled to active, linked project members, but all role-based controls must
continue to be enforced by the website and database.

## Two-way message flow

```text
Kiln Studio composer → authorized app API → database/outbox → Slack API
Slack event webhook → signature verification → dedupe → database → app UI
```

Treat sync as an asynchronous, retryable pipeline. Do not make a client-facing
inquiry submission depend on Slack availability. Current synchronization covers
new message delivery and ingestion; thread relationships and message edit/delete
semantics are not yet synchronized.

## Identity, channels, and permissions

- OAuth should establish a verified app-user-to-Slack-user mapping.
- SCIM is optional and depends on Slack plan/admin approval; it is not required
  merely to attribute messages.
- Keep app roles and project permissions authoritative in Kiln Studio.
- A Slack channel does not itself grant app access. Before displaying messages
  in the website, check current project membership.
- On membership removal or deactivation, enqueue reconciliation to remove the
  person from the mapped Slack project channel.
- General and announcement channels should be managed explicitly and have
  permissions consistent with the in-app rules.
- Audit project manager changes, membership changes, token installation, and
  message synchronization events.
- Preserve `system_activity_logs` as the audit source of truth; project and
  Slack message events should link to projects and must not expose private
  inquiry/profile values through the global System feed.

## Operational and security requirements

- Inquiry reference images are optional, private, limited to four JPEG/PNG/WebP
  files of at most 8 MB each and 24 MB total, and not publicly browsable.
  Signed upload URLs are issued server-side; uploaded bytes are verified before
  short-lived admin preview links are generated.
- Configure the QStash token and both signing keys from `.env.example`, and set
  `NEXT_PUBLIC_SITE_URL` to the canonical deployed origin. Register
  `https://<deployed-host>/api/inquiries/process-reference` as the QStash
  destination. QStash retries failed verification deliveries; local development
  processes image verification inline when QStash is not configured.
- Apply migration `20261109010000_add_inquiry_reference_uploads.sql` before
  deploying the inquiry form/API changes. The existing 14-day retention task
  deletes private image objects and abandoned uploads as well as inquiry rows.
- Verify Slack signatures using the raw request body and protect against replay.
- Request the smallest feasible OAuth scopes and document why each is needed.
- Encrypt provider tokens at rest and rotate/revoke them on uninstall.
- Implement durable event deduplication, retries, backoff, dead-letter handling,
  and reconciliation for missed events.
- Avoid logging message contents or credentials unless an explicit retention
  policy requires it.
- Test unauthorized users, project-to-channel mapping errors, Slack outages,
  duplicate events, revoked tokens, and webhook retries.
- Obtain workspace owner/admin approval and satisfy Slack's review requirements
  before broad distribution.

Slack app installation, published event URL verification, hosted migrations,
real workspace testing, and production scheduler configuration remain
deployment steps. Do not test by posting exploratory messages or creating
channels in an unintended workspace.

## Inquiry similarity, Workflow, and client assistant

The inquiry similarity MVP is explicit-opt-in and advisory-only. Supabase
retains consent, review metrics, and match references; Upstash Vector contains
only vectors plus inquiry IDs. OpenAI receives only the approved design brief
text fields, not names, email addresses, reference URLs, or uploaded images.
Similarity must not silently change the inquiry's priority or determine
acceptance. Studio members can review matches, record complexity/hours, retry
processing, or remove consent.

For the MVP, reviewed complexity and observed hours from similar opted-in
requests are shown as simple neighbor averages. This is a human-facing
reference only, not a trained classifier or priority formula. Keep the existing
priority score independent until a separately reviewed outcome dataset and
evaluation method exist.

Upstash Workflow handles the asynchronous similarity and client-assistant
steps. Production requires the QStash token and signing keys, the canonical
`NEXT_PUBLIC_SITE_URL`, and the deployed workflow endpoints. Do not point
hosted integration tests at a real project as a substitute for local migration
validation.

The public assistant is restricted to public studio/demo information, is
rate-limited, and does not have access to client or studio records. Gemini
function calling is limited to static public tools (services, inquiry checklist,
and fictional portfolio concepts); it cannot take external actions. Upstash
Workflow carries each answer; Redis stores the polling result for ten minutes.
Supabase stores the question/answer pair for manual FAQ curation without an
separate account, email, or IP metadata field. Submitted text is stored as-is,
without automatic PII scrubbing. The table is service-role-only; there is not
yet a FAQ admin interface or automatic training flow. Keep the disclosure
visible, do not send personal or sensitive information, and never expose
provider credentials to the browser.

Team online/typing state uses Redis keys scoped to active project membership.
Presence expires automatically, while messages remain in Supabase. It is not
an authoritative availability schedule or proof of a user's identity/state.

The finance page is currently a studio-member-only, read-only overview over the
existing normalized tables and reports. Do not add transaction entry, payment
reconciliation, or report publishing until the accounting rules and
authorization workflow are specified and tested.

## Deferred: Upstash Box and Lead-Generator repository

The Box-based lead-generation idea is intentionally parked until the
Lead-Generator repository has its actual application implemented. The planned
future flow is:

1. Use the existing repository `hsxtheemperor/Lead-Generator` as the application
   source and clone it inside an isolated Upstash Box environment.
2. Keep any Kiln-generated application code in a dedicated `codegen/` folder
   inside that Box/repository workflow, separate from the lead-generator
   implementation.
3. Decide how generated code is reviewed, tested, and proposed to the
   repository. No Box credential, repository write token, push operation, or
   autonomous publishing is configured by this note.
4. Only after the lead source and permitted acquisition method are defined,
   anonymize approved records, generate embeddings, compare against opted-in
   records, and persist the lead plus Vector reference through a tested
   Workflow.

Upstash Box is an isolated execution environment for agents; it does not itself
provide prospect data. Do not implement scraping, source leads, clone/push
repository changes, or grant Box repository access until the user supplies and
approves the working lead-generator code and its acquisition/source policy.

## Remaining roadmap boundaries

- **Redis caching:** no additional cache is introduced for the current routes.
  Public pages are statically rendered by Next.js, while inquiry, finance,
  membership, and chat data are dynamic or authorization-sensitive. Pick a
  concrete public read/query and invalidation policy before caching it in Redis.
- **Inquiry notifications:** the inquiry is persisted before background
  similarity work, but the Workflow does not yet notify a team. Choose the
  destination (Slack channel, email, or both), failure behavior, and message
  contents before adding a side effect. Do not let notification outages reject
  an inquiry.
- **Agentic automation:** no autonomous actions are enabled. Define a narrow
  task, allowed data, human approval point, and failure/rollback policy before
  introducing an agent to operate on studio records.
- **Slack archive/backfill:** inbound events are retained in Supabase, but an
  historical Slack import/reconciliation job is not implemented. Define scope,
  authorization, deletion behavior, and rate-limit handling before relying on
  it to recover messages that predate app installation.
- **Database verification:** application tests, TypeScript checks, and builds
  do not replace fresh-database migration, schema lint, or pgTAP verification.
  Run those in GitHub CI or a local Docker/Podman-capable environment; do not
  point a reset command at the hosted project.

## Deployment checklist

1. Apply the reviewed migrations to the intended Supabase project, including
   `20261108080000`, `20261108090000`, `20261109000000`,
   `20261109010000`, and `20261109020000`.
2. Set the Slack OAuth client ID/secret, callback URL, signing secret, OAuth
   state secret, token-encryption key, Supabase service-role key, Upstash
   Redis credentials, QStash token/signing keys, canonical app origin, and
   Vercel `CRON_SECRET` as server-side environment variables. Never commit
   secrets or expose them to browser code.
3. Register the exact public callback URL
   (`https://<deployed-host>/api/slack/callback`) and configure the Slack Events
   API request URL as `https://<deployed-host>/api/slack/events`.
4. Subscribe the bot to `message.groups` and `app_uninstalled`. The bot scopes
   used by the worker are `chat:write`, `groups:history`, `groups:read`, and
   `groups:write`; user scopes are `openid`, `profile`, and `email`.
5. Confirm the deployment scheduler can invoke `/api/slack/sync` every minute.
   Vercel Cron uses `CRON_SECRET` as a bearer token. Monitor failed sync jobs
   and outbox rows in Supabase.
6. A studio admin installs the workspace from `/admin/team`. Each designer
   signs in to Kiln Studio and links their Slack account from `/designer/team`.
   Project assignment, role, PM selection, and completion remain controlled
   from the app.
7. Test only with a synthetic project in the intended test workspace: channel
   creation, linked-member add/removal, both message directions, duplicate
   event delivery, PM reassignment, project completion/archive, and app
   uninstall/reinstall.

For app-originated chat, the website writes to Supabase first and the Slack
outbox delivers the message. Slack-originated messages are signature-verified,
workspace-checked, mapped to an active project member, deduplicated, then stored
in Supabase and broadcast by Realtime. Upstash Redis supports shared
rate-limiting; it is not used as message storage.
