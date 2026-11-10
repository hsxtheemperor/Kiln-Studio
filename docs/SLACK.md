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
  delivered asynchronously through the message outbox.
- Slack Events API requests are signature-verified. Eligible inbound messages
  are workspace-checked, mapped to an active project member, deduplicated, and
  persisted to Supabase.
- Slack uninstall and project membership changes queue reconciliation work.
- The authenticated sync worker processes pending channel and message jobs;
  project-channel messages in the app are delivered with Supabase Realtime.

```text
Kiln Studio message → Supabase message/outbox → Slack API
Slack event → signature + workspace/member checks → Supabase → app Realtime
```

## Roles and history

Project managers, team roles, and app permissions remain in Kiln Studio.
Slack's standard channel APIs do not expose the same per-project moderator
model. Keep all sensitive reads and writes behind app authorization and
database RLS. Project messages remain in Supabase; Slack is not the historical
source of truth.

New messages are synchronized. Historical Slack backfill, thread relationships,
and message edit/delete synchronization are not implemented. Slack event
subscriptions also depend on app configuration and workspace approval.

## Deployment prerequisites

Before testing a workspace, configure the Slack credentials and secrets listed
in `.env.example`, apply the reviewed database migrations, register the exact
OAuth callback URL, configure the Events API request URL, and enable the event
subscriptions/scopes used by the app. The Vercel Hobby configuration runs
`/api/slack/sync` through the single `/api/cron/daily` entry point once per day,
alongside demo-data retention. This meets Hobby's daily cron restriction, but
Slack delivery and reconciliation can be delayed until that run. Use a Vercel
plan that supports more frequent schedules or a separately secured external
scheduler if faster Slack sync is required. Monitor failed sync/outbox jobs.

Use only a workspace intended for testing and synthetic projects/messages.
Do not post exploratory messages or create channels in an unrelated workspace.
See [PROD.md](./PROD.md) for deployment boundaries and [DATABASE.md](./DATABASE.md)
for the schema, grants, and RLS model.
