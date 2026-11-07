# Demo plan: embedded studio chat and collaboration workflow

This document describes the current demo we are building inside the Kiln Studio app. The goal is to prove the product workflow in a simple, hosted website experience without locking the project to third-party system requirements too early.

## What the demo is doing right now

The current demo is focused on a lightweight internal coordination layer for the studio team:

- Admin users can monitor incoming client requests.
- Designers can review the same active inquiry queue from their own dashboard.
- Both roles have a shared internal team room for communication and coordination.
- Team members can be assigned roles such as design lead, client liaison, project owner, and research/UX owner.
- A simple chat thread lets the studio quickly align on priorities, next steps, and handoffs.

This is intentionally a front-end-first prototype to test the workflow and the user experience before building a production-grade backend sync layer.

## Demo scope

### Admin dashboard

The admin view shows:

- total inquiry counts
- recent leads
- urgent or high-priority work
- live project requests from clients
- assigned team members and role changes
- internal team chat for coordination

### Designer dashboard

The designer view shows:

- the priority queue for active briefs
- client request context
- urgency and complexity information
- a team room for internal discussion and assignment

### Chat MVP behavior

The demo chat is intentionally simple:

- it is embedded directly inside the dashboard
- it is local UI state only for now
- it demonstrates the workflow, not a production-grade real-time infrastructure
- it acts as a stand-in for Slack-style collaboration during the product validation phase

## Why this is the right MVP

This is the fastest path to validating the product:

1. It reveals whether the studio workflow feels useful.
2. It lets us prove the internal coordination process on the website itself.
3. It keeps the project moving without third-party API overhead.
4. It gives us a clean foundation to upgrade to real Slack sync later.

## What to treat as future work

The demo does not yet include:

- persistent chat storage in the database
- real-time multi-user sync across browsers
- employee auth and permission enforcement for team chats
- message retention rules or moderation
- Slack API integration or webhook handling
- identity mapping between website users and Slack users

## Production upgrade path

The current chat is a placeholder for the production model. Once the workflow feels right, we can replace the embedded in-memory chat with a backed system that syncs with Slack and preserves project context for team discussions.

See [PROD.md](./PROD.md) for the production plan.
