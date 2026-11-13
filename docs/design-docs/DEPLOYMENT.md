# GitHub and Vercel deployment

Kiln Studio is deployed as a Next.js website. It is not published as an npm
package or a GitHub Container Registry image.

## Deployment targets

| Target | Git source | Environment |
| --- | --- | --- |
| Production | `main` | Vercel Production |
| Preview | Pull requests and non-production branches, including `dev` | Vercel Preview |
| Development | Local checkout; optionally `vercel dev` | Vercel Development |

The GitHub Actions workflow runs tests, type checking, build, and local
Supabase checks. Vercel's native Git integration is responsible for deployments
and posts deployment checks back to the relevant GitHub commit or pull request.
There is no second deployment workflow in GitHub Actions.
GitHub Actions Environments are not configured: Vercel owns the
Production/Preview/Development variable targets for this deployment model.

## Vercel project configuration

The Vercel project `kiln-studio` is connected to the public GitHub repository
[`hsxtheemperor/Kiln-Studio`](https://github.com/hsxtheemperor/Kiln-Studio)
with `main` as its production branch. To confirm or repair that link from a
checkout linked to the project, run:

```sh
vercel git connect https://github.com/hsxtheemperor/Kiln-Studio
```

In Vercel project settings, confirm:

- The connected repository is `hsxtheemperor/Kiln-Studio`.
- The production branch is `main`.
- Preview deployments are enabled for pull requests and non-production
  branches.
- The project uses Node.js 22.x, matching GitHub Actions and `package.json`.
- The package manager is pnpm; automatic install detection should use the
  repository's `pnpm-lock.yaml`.
- Preview deployments are enabled by default; confirm a pull request receives
  a Preview deployment and a push to `main` receives a Production deployment.

The project is intentionally not wired to publish packages. A branch push or
pull request should create a Vercel deployment, not a registry release.

## Environment variables

Vercel has three standard variable targets: Production, Preview, and
Development. Configure the values each feature needs in each target; having a
variable name in all targets does not prove that its value, provider account,
or callback URL is correct.

- Use separate Supabase projects and provider credentials for Production and
  Preview/Development. The non-production projects should contain synthetic
  data only.
- Set `NEXT_PUBLIC_SITE_URL` to the canonical production origin for Production,
  the preview origin where supported for Preview, and `http://localhost:3000`
  for local Development.
- Keep OAuth callback and webhook URLs consistent with the relevant
  environment. Slack integrations should use a dedicated test workspace for
  Preview/Development.
- Keep service-role, signing, OAuth, and provider keys server-side. Never add
  their values to GitHub source, `.env.example`, or client-side variables.
- `OPENAI_API_KEY` is the documented local name. The app also accepts the
  existing Vercel name `OPENAI_API` for compatibility; standardize the Vercel
  variable on `OPENAI_API_KEY` when rotating/configuring the key.

Use the Vercel dashboard to review variable names and targets without printing
or copying secret values. Local development can pull the Development target
into an ignored environment file with `vercel env pull`; do not commit that
file.

## GitHub checks and review

The repository's CI workflow runs on pull requests, pushes to all branches,
and manual dispatch. In GitHub Settings, protect `main` and require its
successful checks before merging.
Vercel deployment checks should also be visible on pull requests after the Git
integration is connected. Review the generated Preview deployment before
merging; merging to `main` creates the Production deployment.

## Verify the integration

1. Open a pull request from `dev` (or another feature branch) and verify that
   GitHub shows both CI results and a Vercel Preview deployment.
2. Open the preview URL and confirm public pages render with Preview
   credentials and synthetic data.
3. Merge only after required checks pass; verify a Production deployment is
   created from `main`.
4. Confirm the production domain and daily Cron in Vercel. The Cron is defined
   by [`vercel.json`](../../vercel.json).
5. Confirm local `pnpm dev` works with Development Supabase/provider values;
   optionally use `vercel dev` when Vercel-specific local behavior is needed.

The GitHub CI build uses non-secret placeholder Supabase settings and local
Supabase integration tests. A passing CI build does not verify Vercel
credentials, hosted database access, or third-party provider behavior.
