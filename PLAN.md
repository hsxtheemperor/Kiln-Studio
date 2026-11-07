# Kiln Studio Lead Website — Project Plan

> **Portfolio demo:** Kiln Studio is fictional. This is a personal project, not client work or a claim of employment by a real studio.

## 1. Purpose

Build a polished website for a fictional design studio that demonstrates the backend behind a realistic small-business website.

The public site will introduce the studio and its services, show a small set of clearly fictional work samples, and let potential clients send project inquiries. A private admin area will let studio members review inquiries and track follow-up.

This project complements my existing experience: I contribute to backend development on NoteBooks Framework and designed and built GLSC-AI end to end. The demo gives founders and design-led teams a focused example of how I turn a product need into a working, tested backend.

## 2. Product concept

- **Studio:** Kiln Studio, a fictional design studio for early-stage startups and small teams.
- **Services:** Brand identity, web design, and product/UI design.
- **Visual direction:** Warm, editorial, high-contrast typography with restrained color. The interface should feel designed, not like a generic admin template.
- **Sample work:** Two or three fictional or self-created examples, clearly labeled as concept work. Do not imply they are client projects.
- **Primary action:** Submit a project inquiry.
- **Admin goal:** Review an inquiry and update its follow-up status.

## 3. Decisions for v1

| Area | Decision |
| --- | --- |
| Application | Next.js App Router with TypeScript and Route Handlers in one deployable application. |
| Database | Supabase PostgreSQL with versioned SQL migrations. |
| Authentication | Supabase Auth. Studio accounts are provisioned privately; there is no public registration. |
| Authorization | One `studio_member` access level for v1. Enforce access in Route Handlers and with database Row Level Security (RLS). No role-management interface. |
| Hosting | Vercel for the web application and Supabase for database and authentication. |
| Public endpoint protection | Server-side validation, a honeypot, and Upstash Redis rate limiting. |
| Email | Excluded from v1. The admin inbox is the source of truth; do not make inquiry submission depend on email. |
| Demo release | Keep private during development. Open the demo only after the release checks pass, with a clear demo notice, a privacy notice, and a 14-day cleanup policy for submissions. |

Admin database requests use the authenticated user's Supabase session so RLS remains active. The public inquiry Route Handler may use a server-only service-role client for the single validated insert operation; keep that client inside a narrow server module, never expose it to the browser, and never use it for admin reads or updates. Database constraints still validate persisted data.

## 4. Scope

### Included in v1

- Responsive public pages: home, services, sample work, inquiry form, and confirmation.
- Server-validated inquiry submission with clear field-level errors.
- PostgreSQL persistence for inquiry records.
- Private sign-in and an admin inbox with list, detail, and status-update views.
- Server-side authorization and RLS policies for private inquiry data.
- Rate limiting and a honeypot on the public inquiry endpoint.
- Automated tests for validation, API behavior, access control, and status changes.
- Setup instructions and a portfolio case study explaining the architecture and trade-offs.

### Not included in v1

- Sending email or managing notification retries.
- Public account creation, staff invitations, multiple access levels, or a role-management UI.
- A full CRM, analytics dashboard, or complex search.
- Real-time staff chat, project assignment, or turning inquiries into project records.
- Payments, file uploads, or collection of sensitive information.

Keep the first version focused on the complete inquiry-to-admin workflow. Add later capabilities only when a clear need arises.

## 5. User flows

### Public inquiry

1. A visitor reviews the studio and its services.
2. They submit their name, email, and a short project brief. Company, service, budget range, and timeline are optional.
3. The server validates and normalizes the submission, checks the honeypot, and applies rate limiting.
4. A valid inquiry is stored in PostgreSQL.
5. The visitor receives confirmation only after the inquiry has been saved. If saving fails, show an error and do not claim success.

### Studio member

1. A provisioned member signs in through Supabase Auth.
2. They see a paginated list of inquiries, newest first, with status filters.
3. They open an inquiry and update its status: `new`, `contacted`, `in_progress`, or `closed`.
4. Every list, detail, and update request is authenticated and authorized on the server and constrained by RLS.

## 6. Architecture

```text
Visitor browser
    │
    ├── Public pages and inquiry form
    │       └── POST /api/inquiries
    │              ├── Validate input, honeypot, and rate limit
    │              └── Insert inquiry into Supabase PostgreSQL
    │
    └── Studio member browser
            └── Supabase Auth session
                    └── Protected Next.js Route Handlers
                           └── Supabase PostgreSQL under RLS
                                  ├── List and read inquiries
                                  └── Update inquiry status
```

Keep responsibilities clear:

- **UI:** Displays the public site and admin inbox; it is not a security boundary.
- **Route Handlers:** Validate requests, apply public endpoint controls, check the signed-in user for admin operations, and return consistent responses.
- **Supabase Auth:** Handles sign-in and sessions for provisioned studio members.
- **PostgreSQL and RLS:** Store inquiry data and restrict which authenticated users can read or update it. Anonymous database access cannot read, update, or delete inquiries.
- **Public insert:** The inquiry Route Handler uses a server-only client after validation and rate limiting. Keep its create-only operation isolated; never pass the privileged client to admin code or the browser.
- **Upstash Redis:** Provides shared rate-limit state suitable for serverless deployments; do not use an in-memory counter that resets between function instances.

## 7. Data model

### `inquiries`

- `id` — UUID primary key.
- `name` — required, length-limited.
- `email` — required, validated and length-limited.
- `company` — optional, length-limited.
- `service` — optional value from a controlled list.
- `project_brief` — required, length-limited text.
- `budget_range` — optional value from a controlled list.
- `timeline` — optional, length-limited.
- `status` — `new`, `contacted`, `in_progress`, or `closed`; defaults to `new`.
- `created_at` and `updated_at` — timestamps.

Add database constraints for required fields, allowed status values, and sensible maximum lengths. Keep account data in Supabase Auth rather than duplicating passwords or credentials in application tables. Add a profile table only if the UI needs additional member information.

The honeypot field is used only during request validation and is never stored. Do not collect attachments or sensitive client material in v1.

## 8. Backend contract

### Public

- `POST /api/inquiries` — validate and save an inquiry. Return a confirmation response without exposing internal record data.

### Authenticated

- `GET /api/admin/inquiries` — return a paginated list; support a status filter and stable, newest-first ordering.
- `GET /api/admin/inquiries/:id` — return one inquiry or a not-found response.
- `PATCH /api/admin/inquiries/:id` — update only the inquiry status.

Use a consistent JSON response and appropriate HTTP status codes. Validate all request data on the server, even when the browser also validates it. Do not accept arbitrary fields in the status-update endpoint.

## 9. Security, privacy, and reliability

- Enforce authentication and authorization on every admin Route Handler. Hiding the admin page in the UI is not enough.
- Enable RLS and test policies for anonymous and authenticated users. Anonymous database access must never read, update, or delete inquiry records; public creation happens only through the validated and rate-limited Route Handler.
- Use trusted Supabase Auth application metadata or an equivalent server-controlled mechanism for studio access. Never authorize from user-editable profile metadata.
- Keep Supabase and Upstash secrets in server-side environment variables. Commit only a documented example environment file with placeholder values.
- Validate type, format, length, and allowed values on the server; normalize fields consistently.
- Apply a reasonable rate limit to the public endpoint. Use the honeypot as a low-friction spam check; add CAPTCHA only if testing or real abuse justifies the extra friction.
- Avoid logging names, email addresses, project briefs, session tokens, or secrets. Log enough non-sensitive context to diagnose failures.
- Do not silently return success when persistence fails. If the database is unavailable, show an actionable retry message.
- Show a short privacy notice explaining what the form collects and why. Use synthetic data for screenshots and public examples; do not publish actual visitor inquiries.
- Treat submitted names, email addresses, and project briefs as personal data, even though the studio is fictional. Tell visitors that submissions are for demonstration and are not monitored as real client requests.
- Delete stored demo inquiries after 14 days and provide a way to remove them sooner on request. Use synthetic data for screenshots and examples; never publish visitor inquiries.

## 10. Build and verification sequence

### Phase 1 — Define the experience

- Confirm the studio copy, service list, visual tokens, and fictional sample work.
- Sketch the public pages, inquiry states, and admin inbox.
- Finalize inquiry fields, status transitions, and error/empty states before designing the schema.

### Phase 2 — Set up the foundation

- Create the Next.js TypeScript application and Supabase project.
- Add migrations for the inquiry schema and RLS policies.
- Provision a private studio account; leave public registration disabled.
- Configure local and deployment environment variables without committing secrets.

### Phase 3 — Implement the backend first

- Add shared server-side input schemas and validation.
- Implement `POST /api/inquiries`, persistence, honeypot checks, and Upstash rate limiting.
- Implement authenticated list, detail, and status-update endpoints.
- Test RLS and server authorization before connecting the admin UI.

### Phase 4 — Build the interfaces

- Create the public site using the agreed visual direction and responsive layouts.
- Build the inquiry form, loading/success/error states, and accessible field feedback.
- Build the protected admin inbox and connect it to the real endpoints.
- Ensure keyboard navigation, focus visibility, semantic headings, and usable mobile layouts.

### Phase 5 — Test the complete workflow

- Test valid, malformed, missing, oversized, and rate-limited submissions.
- Verify confirmation appears only after successful persistence.
- Verify anonymous users cannot list, read, or update inquiries.
- Verify signed-out users cannot access admin data and signed-in studio members can perform only the allowed operations.
- Test empty lists, invalid record IDs, pagination, status filters, and database failures.
- Run the end-to-end inquiry-to-admin flow in a private Vercel preview using synthetic data.

### Phase 6 — Publish the portfolio demo

- Review the privacy notice, 14-day retention and cleanup, rate limits, and production environment settings.
- Open the public demo only when the release checks pass; display a clear demo notice, explain that inquiries are not monitored as real leads, and ask visitors not to submit sensitive information.
- Write the repository README with the problem, architecture, API, local setup, tests, security decisions, limitations, and honest tool-use disclosure.
- Include a concise request-flow diagram and screenshots or a short walkthrough.
- Label Kiln Studio and all sample work as fictional/concept work.

## 11. Definition of done

- A visitor can submit a valid inquiry and sees confirmation only after it is saved.
- Invalid and abusive submissions are rejected with appropriate feedback.
- A provisioned studio member can securely list, read, and update inquiry status.
- Anonymous and signed-out users cannot read or modify stored inquiries.
- RLS, validation, authorization, and core endpoint behavior are covered by automated tests.
- Public demo submissions are covered by the privacy notice and 14-day deletion policy; screenshots use synthetic data and no secret is exposed.
- The repository explains how to run, configure, test, and understand the project, including what is fictional and which tools assisted development.

## 12. Explicitly deferred

If the core demo proves useful, later versions may add:

- Email notifications after an inquiry has been saved.
- Additional account roles and invitation management.
- Converting inquiries into projects, project assignments, or internal collaboration tools.
- CAPTCHA or more advanced abuse detection if the honeypot and rate limit are insufficient.

Do not add these to v1 preemptively. Revisit them only when a concrete requirement and a simple implementation path are clear.
