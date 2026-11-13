# Kiln Studio Security and Performance Review

**Review date:** 2026-11-12  
**Scope:** Current repository source and database migration review, plus local
PostgreSQL query-plan inspection.  
**Limitations:** No penetration test, production data access, production traces,
or representative concurrent-load test was performed.

## Summary

- **Security:** The independent source review found no substantiated security
  vulnerabilities in the current repository changes.
- **Performance:** One scale-dependent issue was identified in the default
  engagement queue.

## Findings

| ID | Severity | Confidence | File | Finding |
| --- | --- | --- | --- | --- |
| P5 | Medium at larger engagement counts | High | `app/api/admin/engagements/route.ts:32-38`; `supabase/migrations/20261112100000_add_engagement_review_foundation.sql:17-18` | The default queue orders all review states by `created_at DESC, id DESC` and requests an exact count on each page. The queue index starts with `review_state`, so it cannot directly satisfy the unfiltered ordering. Local `EXPLAIN` showed a sequential scan followed by a sort (estimated 430 rows). |

No actionable security vulnerabilities were substantiated by the review.

## Recommendation

Add an index beginning with `(created_at DESC, id DESC)` for the unfiltered
queue while retaining the existing state-leading index for filtered views.
For larger queues, consider cursor pagination and avoiding an exact count on
every page. Evaluate write and storage costs before adding indexes.

The local query plan demonstrates the index/order mismatch; it is not a
production latency measurement. External provider configuration and
production-only behavior were not certified.
