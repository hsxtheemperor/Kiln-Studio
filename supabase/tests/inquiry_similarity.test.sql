BEGIN;

SELECT no_plan();

SELECT ok(
  has_column_privilege(
    'service_role',
    'public.inquiries',
    'similarity_opt_in',
    'INSERT'
  )
  AND has_column_privilege(
    'service_role',
    'public.inquiries',
    'similarity_matches',
    'UPDATE'
  ),
  'service role can persist consent and manage similarity state'
);
SELECT ok(
  NOT has_column_privilege(
    'anon',
    'public.inquiries',
    'similarity_opt_in',
    'SELECT'
  )
  AND NOT has_column_privilege(
    'anon',
    'public.inquiries',
    'reviewed_complexity',
    'UPDATE'
  ),
  'anonymous users cannot read consent or alter human review fields'
);
SELECT ok(
  has_column_privilege(
    'authenticated',
    'public.inquiries',
    'actual_hours',
    'UPDATE'
  )
  AND has_column_privilege(
    'authenticated',
    'public.inquiries',
    'review_notes',
    'UPDATE'
  ),
  'authenticated studio routes can update bounded human review fields'
);

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$ SELECT public.create_public_inquiry_with_references(
       '{"name":"Opt-in Inquiry","email":"similarity-opt-in@example.test","project_brief":"A portfolio for an independent bakery","priority_score":3,"similarity_opt_in":true}',
       '{"design_goal":"Build a clear online menu"}',
       ARRAY[]::uuid[]
     ) $$,
  'public inquiry RPC accepts an explicit similarity opt-in'
);
SELECT lives_ok(
  $$ SELECT public.create_public_inquiry_with_references(
       '{"name":"Default Inquiry","email":"similarity-default@example.test","project_brief":"A simple request"}',
       '{}',
       ARRAY[]::uuid[]
     ) $$,
  'public inquiry RPC remains compatible when similarity consent is omitted'
);
RESET ROLE;

SELECT is(
  (SELECT similarity_opt_in FROM public.inquiries
   WHERE email = 'similarity-opt-in@example.test'),
  true,
  'opt-in consent is persisted atomically with the inquiry'
);
SELECT is(
  (SELECT similarity_status FROM public.inquiries
   WHERE email = 'similarity-opt-in@example.test'),
  'pending',
  'opted-in inquiries enter the similarity worker queue'
);
SELECT ok(
  (SELECT similarity_opted_in_at IS NOT NULL
   FROM public.inquiries
   WHERE email = 'similarity-opt-in@example.test'),
  'the opt-in timestamp is recorded'
);
SELECT is(
  (SELECT similarity_opt_in FROM public.inquiries
   WHERE email = 'similarity-default@example.test'),
  false,
  'similarity is disabled unless the client explicitly opts in'
);
SELECT is(
  (SELECT similarity_status FROM public.inquiries
   WHERE email = 'similarity-default@example.test'),
  'not_requested',
  'non-opted-in inquiries do not enter the similarity worker queue'
);

SELECT * FROM finish();
ROLLBACK;
