# Kiln Studio Application Audit

**Review date:** 2026-11-11

## Executive summary

The application’s main frontend-to-backend contracts are aligned: public inquiry
submissions, reference uploads, similarity opt-in, authenticated workspaces,
project collaboration, support chat, Slack delivery, and scheduled recovery all
have corresponding server-side validation and persistence paths.

The audit found two user-visible consistency issues and fixed them:

1. The designer queue ranked only an arbitrary first 20 briefs, rather than the
   highest-priority inquiries overall.
2. The admin inquiry detail endpoint could return HTTP 200 with an empty brief
   when loading that brief failed.

No schema migration was needed. No production database changes were made during
this audit.

## Scope and method

- Mapped application pages, API routes, test files, CI jobs, and the configured
  daily Vercel Cron.
- Traced key page/component requests through their route validation, Supabase
  reads/writes, async queue handling, and returned response shapes.
- Reviewed inquiry/brief validation, role-gated project updates, project
  messaging and presence, assistant request/polling behavior, Slack outbox
  handling, and database/RLS tests.
- Ran application tests, type checking, production build, Supabase pgTAP tests,
  database lint, and the CI-specific QStash/Workflow test selector.

This was a code and automated-test audit, not a live-provider exercise or
browser-based end-to-end test.

## Findings and changes

### 1. Designer queue could omit higher-priority inquiries — fixed

Previously, the page fetched up to 20 unordered `inquiry_briefs`, then looked up
their inquiries and sorted only that subset. A higher-priority request outside
the initial slice could therefore be missing from the displayed queue.

The page now selects the 20 highest-priority inquiries first, using
`priority_score DESC` and `created_at DESC`, then loads their briefs. The
displayed list is ordered by the same absolute score, with newest inquiry as a
tie-breaker. Brief/inquiry query failures now display an unavailable message
instead of appearing as an empty queue.

Coverage added for queue ordering and inquiry/brief matching.

### 2. Admin detail could hide brief-load failures — fixed

The admin detail route logged a brief query error but continued with a
success-shaped response containing an empty `inquiry_briefs` array. The route
now returns HTTP 503 with an explicit error and `Cache-Control: no-store`.

Coverage added for this failure path.

### No other confirmed frontend/backend contract mismatch found

During the traced flows:

- Inquiry form fields and optional reference IDs are validated by the public
  inquiry schema before atomic inquiry/brief persistence.
- Similarity processing is opt-in and remains advisory; the reviewed code does
  not use similarity to alter the stored priority score.
- The assistant client sends the request shape accepted by its API, polls with
  the returned request ID, and handles pending/ready/error responses.
- Team workspace message, presence, membership, deadline, manager, and
  completion requests correspond to their project API routes and server-side
  validation/authorization.
- App-originated project messages are persisted before QStash delivery is
  queued; the outbox and scheduled recovery remain the durable fallback.
- The daily Cron configuration uses one schedule, consistent with the Hobby
  plan constraint documented by the project.

## Validation results

| Check | Result |
| --- | --- |
| `pnpm test` | Passed — 35 files, 137 tests |
| `pnpm test:qstash` | Passed — 11 files, 45 tests |
| `pnpm typecheck` | Passed |
| `pnpm build` | Passed — all application routes built |
| `supabase test db` | Passed — 9 files, 154 pgTAP assertions |
| `supabase db lint --schema public --fail-on error` | Passed with one non-failing warning |
| `git diff --check` | Passed |

The database linter warning is an existing unused variable, `v_project_id`, in
`public.persist_slack_inbound_message`. It is unrelated to the audit changes and
was not modified.

The production build emitted “Supabase session client is unavailable” messages
during static generation because the build used placeholder CI settings rather
than live credentials. The build completed successfully; this does not verify
hosted Supabase connectivity.

## Remaining verification gaps

- `tests/e2e/` has no browser-level tests. The automated checks do not confirm
  visual behavior, browser navigation, or complete real-user flows.
- Slack OAuth, Slack API calls, Gemini, QStash, and Upstash behavior were not
  exercised against live provider accounts in this audit; relevant application
  tests use controlled responses/mocks.
- Supabase pgTAP tests validate the local schema and migrations, not the hosted
  production database.
- The database lint warning should be reviewed separately if the Slack inbound
  function is next changed.

## Changed files

- `app/(designer)/designer/page.tsx` — rank inquiries before applying the
  queue limit and show query failures.
- `lib/studio/designer-queue.ts` — build and consistently order the queue.
- `app/api/admin/inquiries/[id]/route.ts` — return an explicit failure when
  inquiry brief data is unavailable.
- `tests/unit/designer-queue.test.ts` — queue ordering and matching coverage.
- `tests/api/project-updates.test.ts` — project update validation, authorization,
  and response contract coverage.
- `tests/api/admin-inquiry-detail.test.ts` — admin detail failure-path coverage.
