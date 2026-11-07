# Production plan: Slack-first studio communication and project sync

This document outlines the production upgrade path for the team communication layer. The current demo uses a simple embedded chat object inside the admin and designer workflows. The production version can evolve to include real Slack-based coordination and durable project communication.

## Recommended production direction

The best long-term architecture is a hybrid system:

- the website remains the primary client and project management surface
- Slack becomes the team communication layer for real-time conversations
- project messages and assignments are stored in the app database for cross-system consistency
- employee identity and team roles are mapped between the app and Slack

This keeps the product intuitive for clients and gives the studio a familiar communication tool for internal team work.

## Option A: MVP embedded chat (current demo)

Use this for the prototype and early validation:

- built directly into the admin/designer dashboard
- no external API dependencies
- fast to ship and easy to demo
- enough to validate team collaboration UX

This is the right move for a product demo because it reduces complexity and gets feedback quickly.

## Option B: Slack sync production architecture

Once the workflow is validated, move to a Slack-backed communication plan.

### Core idea

- the website posts a message to a Slack channel when a project is discussed internally
- the website can also ingest new Slack messages and persist them into the app database
- a project has a channel, thread, or message stream associated with it
- team members can be mapped to Slack users by user ID or email

### Two-way sync flow

1. A project conversation starts on the website.
2. The app sends the message to the matching Slack channel or thread.
3. A team member replies in Slack.
4. Slack webhooks push the message back to the app.
5. The app persists it against the matching project record.
6. Staff and designers see the same timeline from both interfaces.

### Identity and account sync

To keep team messages clear and accurate, map website users to Slack users:

- a website employee record should store Slack user IDs or workspace IDs
- Slack OAuth or SCIM can be used for identity sync
- message attribution should use the real employee identity instead of a generic bot name
- roles and permissions still remain enforced by the app's server-side auth layer

### Channel strategy

Use a practical channel structure such as:

- project-specific channels for active work
- a studio-wide announcements channel
- a client-facing communication channel only when the client is approved for direct contact
- a private design review channel for internal comments

### Implementation pattern

Recommended production pipeline:

- app database stores project and message records
- Slack app receives events through webhooks and OAuth
- secure server route handlers validate incoming payloads
- message sync is idempotent and deduplicated
- the app keeps a sync status flag for each message or thread

## Security concerns to plan for

Production integration requires careful controls:

- secure Slack app credentials in environment variables
- strict verification of Slack signatures
- separate service accounts for bot behavior
- permission scopes limited to what the app actually needs
- audit logs for message sync events and failed payloads
- avoid exposing token secrets to the browser

## Best long-term architecture

The recommended end-state is:

- website handles project management, client views, and internal team workflows
- Slack is used as the real-time team communication surface
- the app database remains the source of truth for project records, messages, user metadata, and workflow state
- sync is implemented as a reliable, reversible event pipeline instead of direct one-off message writes

This is the right production upgrade path because it keeps the product simple for clients while preserving a familiar communication layer for the design team.
