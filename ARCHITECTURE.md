# Kiln Studio Architecture

This document tracks the intended source layout for the v1 application. It follows
the decisions in [PLAN.md](./PLAN.md); update it when files are added, removed, or
their responsibilities change.

## Status key

- **Scaffolded** — the path exists with a minimal starter or placeholder.
- **Present** — supporting project document already exists.
- **Planned** — create it when implementing the corresponding feature.

## Repository layout

```text
.
├── app/
│   ├── (public)/
│   │   ├── page.tsx
│   │   ├── services/page.tsx
│   │   ├── work/page.tsx
│   │   ├── inquiry/page.tsx
│   │   ├── inquiry/confirmation/page.tsx
│   │   ├── account/sign-in/page.tsx
│   │   ├── account/sign-up/page.tsx
│   │   ├── account/projects/page.tsx
│   │   ├── account/projects/[id]/page.tsx
│   │   └── layout.tsx
│   ├── (admin)/
│   │   ├── admin/sign-in/page.tsx
│   │   ├── admin/inquiries/page.tsx
│   │   ├── admin/inquiries/[id]/page.tsx
│   │   └── layout.tsx
│   ├── api/
│   │   ├── inquiries/route.ts
│   │   ├── client/
│   │   │   └── auth/route.ts
│   │   └── admin/
│   │       ├── auth/route.ts
│   │       └── inquiries/
│   │           ├── route.ts
│   │           └── [id]/route.ts
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── public/
│   ├── inquiry/
│   ├── client/
│   └── admin/
├── lib/
│   ├── auth/
│   │   ├── require-client.ts
│   │   └── require-studio-member.ts
│   ├── http/read-json.ts
│   ├── inquiries/schema.ts
│   ├── rate-limit/inquiry.ts
│   └── supabase/
│       ├── database.types.ts
│       ├── public-inquiry.ts
│       └── session.ts
├── supabase/
│   └── migrations/
├── tests/
│   ├── unit/
│   ├── api/
│   └── e2e/
├── .env.example
├── .gitignore
├── ARCHITECTURE.md
├── DATABASE.md
├── next-env.d.ts
├── next.config.ts
├── package.json
├── pnpm-lock.yaml
├── PLAN.md
├── README.md
├── tsconfig.json
└── vitest.config.mts
```

Route groups `(public)` and `(admin)` organize page layouts without changing
public URLs. API Route Handlers remain under `app/api`.

## File responsibilities and status

### Application routes

| File | Status | Why it exists |
| --- | --- | --- |
| `app/layout.tsx` | Scaffolded | Provides the shared document shell, metadata, and global styles. |
| `app/globals.css` | Implemented | Defines responsive public/admin styling, typography, color tokens, and accessible focus states. |
| `app/(public)/layout.tsx` | Implemented | Provides public navigation, the demo notice, and footer. |
| `app/(public)/page.tsx` | Implemented | Introduces the fictional studio and links to the inquiry flow. |
| `app/(public)/services/page.tsx` | Implemented | Describes its three design services. |
| `app/(public)/work/page.tsx` | Implemented | Displays clearly labeled fictional concept work. |
| `app/(public)/inquiry/page.tsx` | Implemented | Presents privacy context and the working inquiry form, and pre-fills it from an authenticated client profile when available. |
| `app/(public)/inquiry/confirmation/page.tsx` | Implemented | Shows confirmation only after a successful submission in the current browser session. |
| `app/(public)/account/sign-in/page.tsx` | Implemented | Presents the client sign-in view for project tracking. |
| `app/(public)/account/sign-up/page.tsx` | Implemented | Creates a client account and saves the requested profile details. |
| `app/(public)/account/projects/page.tsx` | Implemented | Lists only the authenticated client's project requests and statuses. |
| `app/(public)/account/projects/[id]/page.tsx` | Implemented | Shows the details of a single project request for the signed-in client. |
| `app/(admin)/layout.tsx` | Implemented | Provides the admin route-group wrapper without adding public content. |
| `app/(admin)/admin/sign-in/page.tsx` | Implemented | Presents private studio-member sign-in; there is no public registration. |
| `app/(admin)/admin/inquiries/page.tsx` | Implemented | Protects and displays the paginated, filterable inquiry inbox. |
| `app/(admin)/admin/inquiries/[id]/page.tsx` | Implemented | Protects inquiry detail and allowed status controls. |

### API Route Handlers

| File | Status | Why it exists |
| --- | --- | --- |
| `app/api/inquiries/route.ts` | Implemented | Validates and normalizes input, checks the honeypot, rate-limits, and attaches the client profile when the sender is signed in. |
| `app/api/client/auth/route.ts` | Implemented | Signs clients in and up with Supabase Auth and stores the linked client profile in `client_profiles`. |
| `app/api/admin/auth/route.ts` | Implemented | Signs in provisioned members and signs out through Supabase Auth; public registration is not provided. |
| `app/api/admin/inquiries/route.ts` | Implemented | Requires a studio-member session and returns a paginated, newest-first list with optional status filtering. |
| `app/api/admin/inquiries/[id]/route.ts` | Implemented | Requires a studio-member session for detail reads and status-only updates. |

### Shared code

| File or directory | Status | Why it exists |
| --- | --- | --- |
| `components/public/` | Scaffolded | Holds reusable public-site presentation components. |
| `components/inquiry/` | Implemented | Holds the inquiry form and save-gated confirmation flow. |
| `components/inquiry/inquiry-form.tsx` | Implemented | Posts inquiry fields, shows validation/server errors, and only navigates after a successful save. |
| `components/inquiry/confirmation-gate.tsx` | Implemented | Prevents a direct visit from looking like a successful submission. |
| `components/client/sign-in-form.tsx` | Implemented | Signs clients in through the client auth API and redirects to the project dashboard. |
| `components/client/sign-up-form.tsx` | Implemented | Creates a client account with a linked profile and password. |
| `components/admin/admin-frame.tsx` | Implemented | Provides authenticated workspace navigation and sign-out. |
| `components/admin/sign-in-form.tsx` | Implemented | Signs in provisioned members through the auth API. |
| `components/admin/inquiry-inbox.tsx` | Implemented | Loads, filters, paginates, and links to inquiry records. |
| `components/admin/inquiry-detail.tsx` | Implemented | Displays inquiry information and updates only its status. |
| `lib/inquiries/schema.ts` | Implemented | Defines allowed fields/options, trims and normalizes submissions, and maps form data to database inserts. |
| `lib/auth/require-client.ts` | Implemented | Verifies a valid client session and enforces the client access level for project pages. |
| `lib/auth/require-studio-member.ts` | Implemented | Verifies the Supabase session and trusted `app_metadata.access_level` claim for admin handlers. |
| `lib/auth/require-studio-member-page.ts` | Implemented | Redirects unauthenticated/non-member visitors away from private admin pages. |
| `lib/supabase/session.ts` | Implemented | Creates the cookie-bound Supabase client used for authentication and RLS-protected admin operations. |
| `lib/supabase/public-inquiry.ts` | Implemented | Exposes only the server-side inquiry insert using the service-role key. |
| `lib/supabase/database.types.ts` | Implemented | Defines typed inquiry rows and inserts for Supabase queries. |
| `lib/rate-limit/inquiry.ts` | Implemented | Applies a shared Upstash sliding-window limit to public inquiry submissions. |
| `lib/http/read-json.ts` | Implemented | Validates JSON content type and bounds request body size before parsing. |

### Data, tests, and project documentation

| File or directory | Status | Why it exists |
| --- | --- | --- |
| `supabase/migrations/20261107000000_create_inquiries.sql` | Implemented | Creates the inquiry table, constraints, indexes, update timestamp trigger, RLS policies, and narrow grants. |
| `supabase/migrations/20261107010000_client_accounts_and_project_access.sql` | Implemented | Adds the `client_profiles` table, links inquiries to the profile, and restricts project reads to the signed-in client. |
| `tests/unit/inquiry-schema.test.ts` | Implemented | Tests validation, normalization, option restrictions, and honeypot exclusion from persistence. |
| `tests/unit/read-json.test.ts` | Implemented | Tests JSON content type handling and request-size limits. |
| `tests/api/public-inquiry.test.ts` | Implemented | Tests valid persistence flow, honeypot rejection, rate limiting, and persistence failure behavior. |
| `tests/api/admin-inquiries.test.ts` | Implemented | Confirms the inquiry list returns the authorization response before private data access. |
| `tests/unit/` | Implemented | Contains isolated validation and request-body tests. |
| `tests/api/` | Implemented | Contains public endpoint and authorization-gate tests; authenticated Supabase/RLS integration coverage remains to be added. |
| `tests/e2e/` | Scaffolded | Will verify the complete inquiry-to-admin flow using synthetic data. |
| `.env.example` | Present | Documents required environment variable names with placeholders only; never put secrets here. |
| `.gitignore` | Present | Excludes local secrets, generated files, and dependency output from version control. |
| `package.json` | Present | Declares the Next.js app, backend dependencies, and test/build scripts. |
| `pnpm-lock.yaml` | Present | Locks the JavaScript dependency graph for repeatable pnpm installs. |
| `tsconfig.json` | Present | Enables strict TypeScript checking for the application. |
| `next.config.ts` | Present | Holds the Next.js application configuration. |
| `next-env.d.ts` | Present | Provides Next.js generated TypeScript declarations. |
| `vitest.config.mts` | Present | Configures the focused unit-test suite. |
| `PLAN.md` | Present | Defines product scope, decisions, workflows, and completion criteria. |
| `README.md` | Present | Explains local setup, API routes, test commands, and current implementation limits. |
| `ARCHITECTURE.md` | Present | Tracks the intended file layout and each file's responsibility. |
| `DATABASE.md` | Present | Describes the proposed Supabase schema, RLS boundaries, migration workflow, and setup checks. |

## Boundaries to preserve

- Public and admin page components remain layout scaffolds. The backend handlers
  now exist, but must be configured with rotated Supabase/Upstash credentials,
  tested against a migrated project, and connected to the UI before release.
- Keep authorization in server Route Handlers and enforce private data access with
  PostgreSQL Row Level Security; page visibility alone is not protection.
- Use the authenticated user's Supabase session for admin reads and updates.
- Keep any service-role client server-only and limited to the validated public
  inquiry insert. Never use it for admin operations or expose it to the browser.
- Do not store the honeypot value, collect attachments, or log inquiry contents.
- Use shared domain validation so UI and endpoint behavior remain consistent;
  server-side validation is authoritative.
- Keep email, public registration, and other explicitly deferred features out of
  the v1 structure unless the plan is deliberately revised.
