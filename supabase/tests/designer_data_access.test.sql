BEGIN;

SELECT plan(17);

INSERT INTO public.team_members (id, user_id, full_name, email)
VALUES
  ('20000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000101', 'Assigned Designer', 'assigned@example.test'),
  ('20000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000102', 'Other Designer', 'other@example.test');

INSERT INTO public.inquiries (
  id, name, email, company, service, project_brief, status, priority_score
)
VALUES
  ('30000000-0000-0000-0000-000000000101', 'Unassigned Client', 'unassigned@example.test', 'Unassigned Co', 'brand_identity', 'Private first brief', 'new', 10),
  ('30000000-0000-0000-0000-000000000102', 'Assigned Client', 'assigned-client@example.test', 'Assigned Co', 'web_design', 'Private second brief', 'accepted', 9);

INSERT INTO public.inquiry_briefs (inquiry_id, design_goal, brand_message)
VALUES
  ('30000000-0000-0000-0000-000000000101', 'Private goal one', 'Private brand message one'),
  ('30000000-0000-0000-0000-000000000102', 'Private goal two', 'Private brand message two');

INSERT INTO public.project_members (project_id, team_member_id, role_name)
SELECT id, '20000000-0000-0000-0000-000000000101', 'DESIGNER'
FROM public.projects
WHERE inquiry_id = '30000000-0000-0000-0000-000000000102';

INSERT INTO public.project_assignments (inquiry_id, team_member_id, role_name)
VALUES
  ('30000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000102', 'DESIGNER'),
  ('30000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000101', 'DESIGNER');

INSERT INTO public.project_messages (inquiry_id, sender_type, sender_name, body)
VALUES
  ('30000000-0000-0000-0000-000000000101', 'team', 'Seed', 'Unassigned private message'),
  ('30000000-0000-0000-0000-000000000102', 'team', 'Seed', 'Assigned project message');

INSERT INTO public.project_request_logs (inquiry_id, payout_amount, status)
VALUES ('30000000-0000-0000-0000-000000000102', 1250, 'completed');

INSERT INTO public.company_expenses (inquiry_id, contributor_name, contributor_amount)
VALUES ('30000000-0000-0000-0000-000000000102', 'Designer', 800);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000101","app_metadata":{"access_level":"designer"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000101', true);

SELECT is(
  (SELECT count(*) FROM public.get_designer_priority_queue()),
  2::bigint,
  'designer queue includes a minimal entry for assigned and unassigned requests'
);

SELECT ok(
  (SELECT bool_and(
    (SELECT array_agg(key ORDER BY key)
     FROM jsonb_object_keys(to_jsonb(queue)) AS keys(key))
      = ARRAY['created_at', 'inquiry_id', 'priority_score', 'service', 'status']::text[]
  ) FROM public.get_designer_priority_queue() AS queue),
  'designer queue exposes only minimal non-sensitive fields'
);

SELECT is(
  public.can_access_inquiry_project('30000000-0000-0000-0000-000000000102'),
  true,
  'designer can access an inquiry assigned through project membership'
);

SELECT is(
  public.can_access_inquiry_project('30000000-0000-0000-0000-000000000101'),
  false,
  'designer cannot access an unassigned inquiry'
);

SELECT is(
  (SELECT count(*) FROM public.inquiries),
  1::bigint,
  'inquiry RLS exposes only assigned inquiry details to designers'
);

SELECT is(
  (SELECT count(*) FROM public.projects),
  1::bigint,
  'project RLS exposes only assigned projects to designers'
);

SELECT is(
  (SELECT count(*) FROM public.project_members),
  1::bigint,
  'project membership RLS exposes only assigned project rosters'
);

SELECT is(
  (SELECT count(*) FROM public.project_assignments),
  0::bigint,
  'legacy inquiry assignments remain studio-only'
);

SELECT is(
  (SELECT count(*) FROM public.inquiry_briefs),
  1::bigint,
  'inquiry brief RLS exposes only assigned briefs to designers'
);

SELECT is(
  (SELECT count(*) FROM public.project_messages),
  1::bigint,
  'legacy message RLS exposes only assigned project history'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_messages (inquiry_id, sender_type, sender_id, sender_name, body)
     VALUES (
       '30000000-0000-0000-0000-000000000101',
       'designer',
       '10000000-0000-0000-0000-000000000101',
       'Assigned Designer',
       'Unauthorized message'
     ) $$,
  '42501',
  NULL,
  'designer cannot insert a message for an unassigned inquiry'
);

SELECT ok(
  (SELECT count(*) FROM public.project_request_logs) = 0
  AND (SELECT count(*) FROM public.company_expenses) = 0,
  'designer cannot read legacy finance records'
);

SELECT throws_ok(
  $$ INSERT INTO public.company_expenses (contributor_name, contributor_amount)
     VALUES ('Unauthorized', 10) $$,
  '42501',
  NULL,
  'designer cannot insert legacy finance records'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000104","app_metadata":{"access_level":"client"}}',
  true
);
SELECT throws_ok(
  $$ SELECT * FROM public.get_designer_priority_queue() $$,
  '42501',
  NULL,
  'clients cannot execute the designer priority queue'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000103","app_metadata":{"access_level":"studio_member"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000103', true);

SELECT is(
  (SELECT count(*) FROM public.project_request_logs),
  1::bigint,
  'studio members retain access to legacy finance records'
);

SELECT is(
  (SELECT count(*) FROM public.inquiries),
  2::bigint,
  'studio members retain access to all inquiry details'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.get_designer_priority_queue()', 'EXECUTE'),
  'anonymous users cannot execute the designer queue RPC'
);

SELECT * FROM finish();
ROLLBACK;
