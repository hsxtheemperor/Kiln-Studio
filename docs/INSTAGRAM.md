# Instagram opt-in lead capture plan

**Status: proposed; not implemented.** Kiln Studio is a fictional demo. Any
implementation, walkthrough, and stored records must use synthetic data unless
the studio later completes Meta's access and review requirements and makes a
deliberate decision to operate a real account.

## Goal

Explore a permission-based path from an Instagram post to the existing inquiry
workflow:

1. A post clearly invites a person to comment with a specific request or
   keyword if they want the studio to follow up.
2. A subscribed Instagram webhook delivers the qualifying comment to Kiln.
3. Kiln validates and deduplicates the event, then stores a minimal lead.
4. A studio member reviews the lead and can link it to an existing inquiry or
   start a prefilled inquiry flow.
5. Only after the required Meta access is approved should Kiln offer a
   compliant private reply. The initial receiver/review demo must work with
   synthetic webhook fixtures and must not send real messages.

This is preferable to scraping: the person initiates contact in response to a
clear invitation, and Kiln records only what is needed to review and follow up.
Do not treat every comment as consent to receive a private message.

## Proposed first release

### Included

- One configured Instagram professional account and the comment event types
  approved for the selected Meta API setup.
- A public HTTPS webhook callback with Meta's subscription-verification
  handshake and request-signature validation.
- Prompt acknowledgement and asynchronous, idempotent event processing.
- A minimal Supabase lead table, protected studio review list/detail, and a
  link from a lead to an existing inquiry.
- Synthetic event fixtures and tests that exercise valid, invalid, duplicate,
  unsupported, and delayed events without contacting Meta.
- A documented manual setup checklist for a Meta developer app and test
  professional account.

### Not included initially

- Scraping, cold outreach, contact discovery, or bulk messaging.
- Automatic private replies, AI-written replies, or an autonomous agent.
- Multiple customer accounts, campaign analytics, ads ingestion, Instagram
  Live comments, or historical comment backfill.
- Storing Instagram passwords, broad profile data, or unnecessary personal
  information.
- Upstash Box. A verified webhook, durable database record, and queued
  processing are a better fit for this workflow.

## Meta platform requirements and policy constraints

Meta has multiple Instagram API authorization setups (Unified Login,
Instagram Login, and Facebook Login); required account connections, tokens,
webhook configuration, fields, and permissions differ. Before writing the
provider adapter, select the setup based on the account Kiln needs to support
and confirm the current permissions and access level in Meta's dashboard.

The current platform overview says Standard Access is intended for app-role
accounts and development/testing. Supporting professional accounts outside
the app's roles requires Advanced Access, App Review, and Business
Verification. A professional account is required for the Instagram Platform;
whether a Facebook Page is needed depends on the selected login setup.

Private-reply rules are restrictive: the current guide allows one private
reply to a post, ad, or Reel comment within seven days; for Live comments the
reply must be sent during the broadcast. Further conversation is allowed
within the 24-hour messaging window only after the person responds. Permissions
and token requirements vary by API setup. Do not ship message sending until
the selected API setup, account eligibility, permissions, review, and exact
current policy have been verified.

Official references (reviewed 2026-11-11; re-check before implementation):

- [Instagram Platform overview](https://developers.facebook.com/documentation/instagram-platform/overview)
- [Instagram webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks)
- [Private replies](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/private-replies)
- [Webhook setup](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup)
- [Webhook fields and permissions](https://developers.facebook.com/documentation/instagram-platform/webhooks/fields)

## Architecture

```text
Instagram professional account
  └─ Meta comment webhook (HTTPS)
       ├─ Verify callback challenge during subscription setup
       ├─ Verify event signature over the exact raw request body
       ├─ Reject malformed or unsupported events
       ├─ Enqueue verified event through QStash
       └─ Return success promptly
            └─ QStash/Workflow processing
                 ├─ Deduplicate by provider comment/event ID
                 ├─ Confirm account, event type, and explicit opt-in rule
                 ├─ Persist minimal lead through server-only Supabase client
                 └─ Make lead available to studio review under RLS
```

### Webhook boundary

- Use separate GET verification and POST event handling at a dedicated route,
  for example `/api/webhooks/instagram`.
- Keep the Meta app secret and verification token server-side. Compare
  signatures using constant-time comparison and the raw body; never validate a
  parsed-and-reserialized payload.
- Verify the exact signature header and HMAC algorithm required by Meta for
  the selected API. Fail closed on missing or invalid signatures.
- Validate event shape, configured Instagram account ID, subscribed field,
  event type, and timestamp before enqueueing. Ignore unsupported events
  explicitly and log a safe reason without logging secrets or full payloads.
- Acknowledge only after successful verification and durable enqueue. Use
  QStash retries for processor failures; database uniqueness makes redelivery
  safe. Do not perform slow provider or database workflows in the webhook
  request.
- Apply request-size limits and rate controls appropriate to signed provider
  traffic. Do not treat a public webhook URL as authentication.

### Data and access

Add a migration for a minimal `instagram_leads` table. Proposed fields:

| Field | Purpose |
| --- | --- |
| `id` | Internal UUID primary key. |
| `provider` | Explicit source identifier, initially Instagram. |
| `account_id` | Configured Instagram professional account receiving the comment. |
| `comment_id` | Provider comment identifier; unique with account/provider for idempotency and eligible private-reply reference. |
| `media_id` | Optional post/Reel identifier when present and needed for review. |
| `comment_text` | Comment content needed to evaluate the opt-in invitation; limit length and retention. |
| `commented_at` | Provider event time, stored in UTC. |
| `status` | Small checked state set, initially `new`, `reviewed`, `linked`, or `ignored`. |
| `inquiry_id` | Nullable link to `public.inquiries`; do not create an inquiry automatically. |
| `reviewed_by`, `reviewed_at` | Studio review attribution. |
| `created_at`, `updated_at` | Kiln processing timestamps. |

Do not store an Instagram password, access token in the lead row, commenter
email/phone, or full webhook payload. Avoid retaining a username or profile
data unless the selected private-reply API demonstrably requires it. If later
required, document its use, access, and retention separately.

Enable RLS and revoke broad table grants. Only a server-side service client may
ingest and deduplicate provider events. Authenticated reads/updates must be
limited to studio members; clients and designers must not gain access through
existing inquiry/project policies. Validate any `inquiry_id` link server-side
and retain audit attribution for review/link actions. Define a retention and
deletion rule before real user data is accepted.

### Review and inquiry handoff

Provide a studio-only lead inbox with status, received time, post context when
available, and the comment text. Review actions should be explicit and
audited. Linking to an inquiry must validate that the inquiry exists and avoid
changing its score, priority, owner, or status. If no inquiry exists, link to
the existing public inquiry form with only safe, user-approved prefill; never
copy comment text into a new inquiry silently.

For the first release, review is manual and there is no outbound message
action. A later messaging increment can add a fixed, reviewed private-reply
template and an explicit send action after Meta approval. Enforce one-send
idempotency, the applicable time window, current policy, and a durable outcome
record. No automatic follow-up or AI-generated message.

## Delivery stages

1. **Access and consent decision:** choose the Meta API/login setup; create a
   developer app and test professional account; confirm webhook fields,
   permissions, token model, access level, review requirements, and a clear
   post-level opt-in instruction. Record what works with Standard Access and
   what is blocked pending Advanced Access/App Review.
2. **Synthetic webhook receiver:** implement challenge verification,
   raw-body signature validation, payload schema checks, prompt acknowledgement,
   and safe logs. Add unit/API tests using signed synthetic requests; no live
   account required.
3. **Durable ingestion:** add the migration, unique provider-event key,
   server-only idempotent persistence, QStash processing/retries, and pgTAP
   coverage for grants, RLS, duplicate handling, and inquiry-link integrity.
4. **Studio review:** add a protected lead inbox and review/link/ignore actions
   with route tests for authentication, authorization, validation, and audit
   fields. Keep client/designer access denied.
5. **Meta test delivery:** only when credentials and test-account access are
   available, subscribe the test account and verify the full provider webhook
   flow. Do not use a production account or send a private reply at this stage.
6. **Optional approved private replies:** after required access/review, implement
   one fixed opt-in response with policy-window checks, a manual studio action,
   idempotent sending, and explicit error/retry states. Reconfirm Meta's current
   rules before release.

## Acceptance criteria

- A valid signed synthetic comment event creates exactly one lead even if
  Meta/QStash deliver it repeatedly.
- Invalid signatures, wrong account IDs, unsupported event types, malformed
  payloads, and expired/out-of-policy events cannot create a lead or trigger a
  message.
- Webhook success is returned only after durable handoff; processing failure
  is retried and visible to operators.
- No Instagram token or app secret is returned to the browser or written to
  logs. Full payloads are not retained.
- Only studio members can list, inspect, review, or link a lead; RLS tests
  confirm unauthorized roles cannot read or modify the records.
- Lead-to-inquiry linking is explicit, validated, and does not change the
  inquiry's priority or workflow status.
- CI can run all receiver, persistence, route, and database tests with
  synthetic fixtures and no Meta credentials.
- There is no outbound message path until the final optional stage has passed
  Meta access/policy checks and manual-send tests.

## Risks and open implementation decisions

- Meta permissions, webhook fields, token flows, review requirements, and
  account eligibility can change and vary by API setup. Re-check the official
  docs and dashboard at implementation time.
- Advanced Access/App Review may block a public demo. The receiver and review
  experience must remain demonstrable with synthetic fixtures.
- Define the exact comment opt-in keyword/invitation, data retention period,
  and deletion process before connecting a real account.
- Confirm what event identifier and payload fields are available in the
  selected setup before finalizing the schema. Store only what the webhook and
  review flow actually need.
- Do not add a new public lead-to-inquiry path that bypasses current inquiry
  validation, honeypot, rate limiting, or consent requirements.