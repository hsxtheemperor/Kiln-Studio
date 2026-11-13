# Implementation status and next steps

This document is a short status snapshot, not an exhaustive design backlog.
The [README](../../README.md) is the user-facing feature specification;
[DEMO.md](../DEMO.md) explains the walkthrough and limitations;
[ARCHITECTURE.md](../design-docs/ARCHITECTURE.md) and
[DATABASE.md](../design-docs/DATABASE.md) describe the implementation and
schema.

## Implemented

- Public portfolio, validated inquiry flow, extended briefs, priority
  calculation, optional private reference uploads, and client request views.
- Studio inquiry review and designer request/message workspaces with
  Supabase-authenticated access.
- Deal-lead engagement review with suitability notes, first-claim-wins
  ownership, studio-member reassignment, audited transitions, and database
  enforcement that blocks project acceptance until suitability and assignment.
- Inquiry acceptance to project/channel lifecycle, project membership, durable
  project messages, Realtime delivery, and Redis ephemeral presence.
- Optional consent-based similarity recommendations using embeddings and
  Upstash Vector, with human review and no automated priority changes.
- Optional Slack OAuth and two-way synchronization architecture, with
  Supabase as the source of truth.
- Gemini public-support assistant with bounded allowlisted tools, Workflow
  processing, Redis polling, and persisted Q&A pairs for manual FAQ review.
- Read-only finance overview, studio-only Realtime audit feed, and
  demo-retention endpoint.
- Supabase migrations and pgTAP tests, Vitest unit/API coverage, TypeScript
  checks, production build, and GitHub Actions validation.

## Deliberate boundaries / next work

1. Add browser-level end-to-end coverage for inquiry-to-project and
   collaboration workflows.
2. Continue the small-team lifecycle with pricing policy, negotiation,
   meetings, contracts, client-side review, and completion workflows as
   specified in [PLANv2.md](./PLANv2.md).
3. Verify each optional external integration in an isolated test account or
   workspace; automated tests mock provider calls and do not establish that
   production credentials, quotas, schedules, or Slack settings are correct.
4. Keep finance read-only until write permissions, reconciliation, and
   correction/audit requirements are defined.
5. Define Q&A retention, deletion, manual FAQ review, and privacy handling
   before treating support questions as approved knowledge. The current system
   stores submitted text as-is and does not redact it.
6. Add assistant PII detection or redaction only after a clear policy and
   failure behavior are specified.
7. Preserve explicit opt-in and human review for inquiry similarity; do not
   convert it into an automatic score or decision without separate evaluation.
8. Treat Upstash Box/Lead-Generator automation and autonomous studio-record
   changes as deferred.

## Decisions to preserve

- Supabase/PostgreSQL owns durable operational and message data; Redis is
  auxiliary and ephemeral.
- Server-side authorization and database RLS remain the security boundary.
- Inquiry priority is independent of similarity recommendations.
- Project roles and membership in Kiln Studio are authoritative; Slack
  membership is only a synchronized transport surface.
- Demo users, inquiries, finance rows, portfolio examples, and conversations
  must remain synthetic until the project is intentionally redesigned for real
  operations.

## Verification commands

```sh
pnpm test
pnpm typecheck
pnpm build
```

GitHub Actions also starts a disposable local Supabase stack, applies the
migrations, lints the schema, and runs pgTAP tests. Neither these checks nor a
local build verify hosted-provider configuration or external workspace
behavior.
