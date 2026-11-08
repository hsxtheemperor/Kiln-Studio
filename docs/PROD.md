# Production direction: durable team collaboration and Slack integration

The Team workspace now uses durable project membership and message storage for
project channels. Slack can be added as an external collaboration surface
without making Slack the source of truth for project permissions.

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

### Stage 2: Integrate Slack

- Create a Slack app with only the required scopes and an explicit workspace
  installation process.
- Map Kiln Studio users to Slack user IDs using verified OAuth identity; do not
  assume matching email alone is sufficient.
- Create or map a Slack channel per eligible project and store its workspace and
  channel IDs in the database.
- Send app messages to Slack through a server-side integration worker.
- Receive Slack events through a public webhook endpoint that verifies Slack's
  request signature and timestamp before processing.
- Persist an idempotency key/event ID and provider message ID to deduplicate
  retries and prevent sync loops.
- Track delivery/sync state and retries; surface failed syncs instead of
  silently losing messages.
- Keep provider credentials in server-side secret storage.

## Two-way message flow

```text
Kiln Studio composer → authorized app API → database/outbox → Slack API
Slack event webhook → signature verification → dedupe → database → app UI
```

Treat sync as an asynchronous, retryable pipeline. Do not make a client-facing
inquiry submission depend on Slack availability. Preserve authorship, timestamps,
thread relationships, edit/delete semantics, and failure status deliberately.

## Identity, channels, and permissions

- OAuth should establish a verified app-user-to-Slack-user mapping.
- SCIM is optional and depends on Slack plan/admin approval; it is not required
  merely to attribute messages.
- Keep app roles and project permissions authoritative in Kiln Studio.
- A Slack channel does not itself grant app access. Before displaying messages
  in the website, check current project membership.
- On membership removal, revoke app access immediately and define the desired
  Slack channel removal/archive behavior.
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

Slack API, OAuth/SCIM provisioning, webhook ingestion, and bidirectional sync
are future work; none is currently implemented.
