# Slack integration notes

This document is intentionally brief. The authoritative product direction lives in
[PROD.md](./PROD.md). This file exists only as a pointer for the repo history
and to keep the Slack-related work discoverable without duplicating the main
technical plan.

## Current position

- Kiln Studio keeps project access, membership, and message history in the app
  database as the system of record.
- Slack remains an optional synchronization surface, not the authority for roles,
  access, or project lifecycle.
- OAuth, webhook verification, event deduplication, and project-to-channel
  mapping are implemented as a foundation layer, but deployment still requires
  real workspace credentials and a reviewed operational setup.

## Source of truth

Use [PROD.md](./PROD.md) for the production-facing design decisions and rollout
notes. If a future deployment adds a Slack workspace, keep the database-backed
model authoritative and do not rely on Slack-side history, permissions, or
channel membership as the canonical record.
