# Local synthetic database seed

These SQL files create a complete, disposable local workspace for manual
development and database exploration. They are loaded in filename order by
`supabase db reset`.

The fixtures cover studio, deal-lead, designer, and client identities; 100
inquiries with varied review, priority, consent, client-ownership, and lifecycle
states; 31 generated projects; project teams, assignments, and collaboration
history; reserved reference-file metadata; and expanded project/company finance
with a published quarterly report. Most of the inquiries and their related
activity are generated deterministically from the SQL in this directory.
`99_assert_seed_integrity.sql` raises an error if expected fixture volumes,
relationships, or generated records are missing.

All accounts use `@example.test` addresses and the local-only password
`kiln-local-demo`. Never use these credentials outside the local Supabase
instance. Slack installation, tokens, provider messages, and uploaded storage
objects are intentionally not fabricated: they require real provider or
storage state and could make a synthetic record look externally deliverable.
Seeded project channels do create pending Slack sync jobs. With no Slack
installation, those jobs cannot create external channels; connecting a
workspace and running the sync can create channels for the seeded projects.
Use a dedicated test workspace only, never an unrelated team workspace.

To load the data locally:

```sh
supabase start --exclude vector
supabase db reset
```

The reset applies migrations and then these seeds. To run isolated pgTAP
integration tests against a clean database, use:

```sh
supabase db reset --no-seed
supabase test db
```

CI already uses `--no-seed`, so its tests continue to validate the schema
without depending on demonstration fixtures.
