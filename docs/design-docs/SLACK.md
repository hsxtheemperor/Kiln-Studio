# Slack integration

Kiln Studio's Slack integration is an optional collaboration transport. The
application database remains authoritative for project membership, roles,
message history, and lifecycle. Slack channel membership does not grant access
to Kiln Studio or reproduce its project-role permissions.

## Implemented flow

- A studio member installs the Slack workspace through OAuth; a designer can
  link their Slack account to their Kiln team identity.
- The app stores the workspace bot token encrypted and records verified user
  mappings.
- A durable database job creates/maps project channels and reconciles channel
  members for active, linked project members.
- App-originated project messages are persisted to Supabase first, then
  published to QStash with a stable message-ID deduplication key. QStash calls
  the signed delivery endpoint, which claims only that message's outbox row.
- Failed delivery responses are retried by QStash. The same stable message ID
  is sent to Slack as `client_msg_id`; once the database marks the outbox row
  delivered, duplicate QStash deliveries cannot claim or post it again.
- Slack Events API requests are signature-verified. Eligible inbound messages
  are workspace-checked, mapped to an active project member, deduplicated, and
  persisted to Supabase.
- Slack uninstall and project membership changes queue reconciliation work.
- The authenticated sync worker processes pending channel and message jobs;
  project-channel messages in the app are delivered with Supabase Realtime.
- One daily Vercel Hobby cron remains as a safety sweep for messages that could
  not be queued or exhausted QStash retries, and also runs demo retention.

```text
Kiln Studio message → Supabase message/outbox → QStash → signed delivery endpoint → Slack API
Slack event → signature + workspace/member checks → Supabase → app Realtime
```

## Roles and history

Project managers, team roles, and app permissions remain in Kiln Studio.
Slack's standard channel APIs do not expose the same per-project moderator
model. Keep all sensitive reads and writes behind app authorization and
database RLS. Project messages remain in Supabase; Slack is not the historical
source of truth.

The local demo's project conversations are synthetic app-originated records,
not Slack users or messages. The team workspace labels their source, and the
local seed intentionally contains no Slack installation, verified user
mappings, or provider events. A local demo therefore does not verify OAuth,
channel/member reconciliation, outbound delivery, or inbound Events API
handling. The seed does queue project-channel sync jobs; run them only against
a dedicated test workspace because they can create channels for seeded
projects.

New messages are synchronized. Historical Slack backfill, thread relationships,
and message edit/delete synchronization are not implemented. Slack event
subscriptions also depend on app configuration and workspace approval.

## Deployment prerequisites

Before testing a workspace, configure the Slack credentials and secrets listed
in `.env.example`, apply the reviewed database migrations, register the exact
OAuth callback URL, configure the Events API request URL, and enable the event
subscriptions/scopes used by the app. Configure QStash's token and signing
keys, and set the canonical `NEXT_PUBLIC_SITE_URL` so QStash can call
`/api/slack/deliver`. The daily `/api/cron/daily` Vercel Hobby schedule is only
a recovery sweep and retention job; normal outbound messages are event-driven.
Monitor failed sync/outbox jobs.

Use only a workspace intended for testing and synthetic projects/messages.
Do not post exploratory messages or create channels in an unrelated workspace.
See [PROD.md](../plan-docs/PROD.md) for deployment boundaries and
[DATABASE.md](./DATABASE.md)
for the schema, grants, and RLS model.
