# Kiln Studio

Kiln Studio is a fictional design studio demo. It is not client work and its
inquiries are not monitored as real leads. The public and admin pages are still
scaffolds; this stage implements the inquiry API and Supabase database layer.

## Local setup

1. Rotate any Supabase service-role key or Upstash token that was previously
   exposed in a tracked file. `.env.example` now contains placeholders only.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Create `.env.local` from `.env.example` if you do not already have a local
   environment file. Set the Supabase URL, publishable key, service-role key,
   and Upstash REST URL/token. Never commit `.env.local`.
4. Apply the migration to the intended Supabase project using the CLI workflow
   in [DATABASE.md](./DATABASE.md). For local Supabase, initialize the CLI
   configuration, start the local stack, and apply migrations before testing
   persistence.
5. Run `pnpm dev`.

The public inquiry route requires both Supabase and Upstash configuration. It
returns a service-unavailable response when persistence or shared rate limiting
is not available; it does not pretend a submission succeeded.

## Backend routes

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /api/inquiries` | Public | Validates and rate-limits a submission, checks the `website` honeypot field, then inserts it. |
| `POST /api/admin/auth` | Public sign-in | Signs in with email/password; only accounts with trusted `app_metadata.access_level = "studio_member"` are accepted. |
| `DELETE /api/admin/auth` | Session | Signs out the current Supabase session. |
| `GET /api/admin/inquiries` | Studio member | Lists inquiries newest first; accepts `page`, `pageSize`, and `status` query parameters. |
| `GET /api/admin/inquiries/:id` | Studio member | Reads one inquiry. |
| `PATCH /api/admin/inquiries/:id` | Studio member | Updates only `status`, to `new`, `contacted`, `in_progress`, or `closed`. |

Admin requests use the member's cookie-bound Supabase client so RLS applies.
The service-role client is server-only and exposes only the public insert
operation. See [DATABASE.md](./DATABASE.md) for the schema, grants, RLS policy
design, migration workflow, and release checks.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

## Try the interface

1. Apply the committed inquiry migration to the Supabase project configured in
   `.env.local`.
2. Confirm the provisioned Supabase Auth account has trusted
   `app_metadata.access_level = "studio_member"` and public registration is
   disabled.
3. Configure the Upstash REST URL/token and ensure the deployment proxy sets
   `x-real-ip` so rate limiting can distinguish visitors.
4. Open `/`, submit a synthetic inquiry at `/inquiry`, and confirm the success
   page appears only after the save succeeds.
5. Open `/admin/sign-in`, sign in with the provisioned account, then review the
   record in `/admin/inquiries` and change its status.

The public and admin UI flows are now connected to the backend. The demo is
still not ready for real leads: verify the hosted migration and RLS policies,
test the complete flow with synthetic data, and implement/test 14-day cleanup
before opening it publicly.