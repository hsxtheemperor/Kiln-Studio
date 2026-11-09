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

## Deployment checklist

1. Apply the reviewed migrations to the intended Supabase project, including
   `20261108080000`, `20261108090000`, and `20261109000000`.
2. Set the Slack OAuth client ID/secret, callback URL, signing secret, OAuth
   state secret, token-encryption key, Supabase service-role key, Upstash
   credentials, and Vercel `CRON_SECRET` as server-side environment variables.
   Never commit these values or expose them to browser code.
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
