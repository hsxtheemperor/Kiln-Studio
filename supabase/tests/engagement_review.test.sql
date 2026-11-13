BEGIN;

SELECT plan(35);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('10000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'lead-one@example.test', '', now(), '{"access_level":"deal_lead"}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'lead-two@example.test', '', now(), '{"access_level":"deal_lead"}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000203', 'authenticated', 'authenticated', 'admin@example.test', '', now(), '{"access_level":"studio_member"}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000204', 'authenticated', 'authenticated', 'designer@example.test', '', now(), '{"access_level":"designer"}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000205', 'authenticated', 'authenticated', 'client@example.test', '', now(), '{"access_level":"client"}', '{}', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.inquiries (
  id, name, email, company, service, project_brief, status, priority_score
)
VALUES
  ('30000000-0000-0000-0000-000000000201', 'Engagement Client One', 'engagement-one@example.test', 'Demo One', 'brand_identity', 'Synthetic engagement brief one', 'new', 8),
  ('30000000-0000-0000-0000-000000000202', 'Engagement Client Two', 'engagement-two@example.test', 'Demo Two', 'web_design', 'Synthetic engagement brief two', 'new', 6);

INSERT INTO public.inquiry_briefs (inquiry_id, design_goal, brand_message)
VALUES
  ('30000000-0000-0000-0000-000000000201', 'Clarify the identity', 'Warm and useful'),
  ('30000000-0000-0000-0000-000000000202', 'Improve the website', 'Direct and clear');

SELECT is(
  (SELECT count(*) FROM public.engagements),
  2::bigint,
  'new inquiries automatically receive one engagement each'
);

SELECT is(
  (SELECT count(*) FROM public.engagements WHERE review_state = 'pending'),
  2::bigint,
  'engagements start in the pending review state'
);

SELECT is(
  (SELECT count(*) FROM public.engagement_events WHERE event_type = 'created'),
  2::bigint,
  'engagement creation is recorded in its audit history'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'engagements_created_at_id_idx'
      AND indexdef LIKE '%(created_at DESC, id DESC)%'
  ),
  'an index supports unfiltered engagement queue ordering'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000201","app_metadata":{"access_level":"deal_lead"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000201', true);

SELECT ok(public.is_deal_lead_or_studio_member(), 'deal leads pass the staff-role helper');
SELECT is((SELECT count(*) FROM public.engagements), 2::bigint, 'deal leads can read engagements');
SELECT is((SELECT count(*) FROM public.inquiries), 2::bigint, 'deal leads can read inquiry details');
SELECT is((SELECT count(*) FROM public.inquiry_briefs), 2::bigint, 'deal leads can read inquiry briefs');

SELECT is(
  (public.review_engagement(
    '30000000-0000-0000-0000-000000000201',
    'suitable',
    'Good fit for the current portfolio.'
  )).review_state,
  'suitable',
  'deal lead marks an inquiry suitable through the transition function'
);

SELECT is(
  (SELECT review_notes FROM public.engagements WHERE inquiry_id = '30000000-0000-0000-0000-000000000201'),
  'Good fit for the current portfolio.',
  'review notes are stored with the engagement'
);

SELECT is(
  (SELECT count(*) FROM public.engagement_events WHERE event_type = 'reviewed'),
  1::bigint,
  'review transition is audited'
);

SELECT is(
  (public.claim_engagement('30000000-0000-0000-0000-000000000201')).deal_lead_id::text,
  '10000000-0000-0000-0000-000000000201',
  'first deal lead atomically claims a suitable engagement'
);

SELECT ok(
  (SELECT claimed_at IS NOT NULL FROM public.engagements WHERE inquiry_id = '30000000-0000-0000-0000-000000000201'),
  'claim records its timestamp'
);

SELECT is(
  (SELECT count(*) FROM public.engagement_events WHERE event_type = 'claimed'),
  1::bigint,
  'claim transition is audited'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000202","app_metadata":{"access_level":"deal_lead"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000202', true);

SELECT throws_ok(
  $$ SELECT public.review_engagement(
       '30000000-0000-0000-0000-000000000201',
       'needs_info',
       NULL
     ) $$,
  '42501',
  NULL,
  'a different deal lead cannot change an engagement already owned by someone else'
);

SELECT throws_ok(
  $$ SELECT public.claim_engagement('30000000-0000-0000-0000-000000000201') $$,
  '23505',
  NULL,
  'a second deal lead cannot claim an already-owned engagement'
);

SELECT throws_ok(
  $$ SELECT public.claim_engagement('30000000-0000-0000-0000-000000000202') $$,
  '23514',
  NULL,
  'an inquiry must be marked suitable before it can be claimed'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000203","app_metadata":{"access_level":"studio_member"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000203', true);

SELECT is(
  (public.reassign_engagement(
    '30000000-0000-0000-0000-000000000201',
    '10000000-0000-0000-0000-000000000202'
  )).deal_lead_id::text,
  '10000000-0000-0000-0000-000000000202',
  'studio member can reassign an engagement to a provisioned deal lead'
);

SELECT throws_ok(
  $$ UPDATE public.inquiries
     SET status = 'accepted'
     WHERE id = '30000000-0000-0000-0000-000000000202' $$,
  '23514',
  NULL,
  'an inquiry cannot be accepted before it is suitable and assigned'
);

SELECT is(
  (SELECT count(*) FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000202'),
  0::bigint,
  'rejected acceptance does not create a project'
);

SELECT is(
  (public.review_engagement(
    '30000000-0000-0000-0000-000000000202',
    'suitable',
    NULL
  )).review_state,
  'suitable',
  'studio member can mark a second inquiry suitable'
);

SELECT is(
  (public.reassign_engagement(
    '30000000-0000-0000-0000-000000000202',
    '10000000-0000-0000-0000-000000000202'
  )).deal_lead_id::text,
  '10000000-0000-0000-0000-000000000202',
  'studio member can assign a suitable inquiry before conversion'
);

UPDATE public.inquiries
SET status = 'accepted'
WHERE id = '30000000-0000-0000-0000-000000000202';

SELECT is(
  (SELECT status FROM public.inquiries WHERE id = '30000000-0000-0000-0000-000000000202'),
  'accepted',
  'a suitable, assigned inquiry can be accepted'
);

SELECT is(
  (SELECT count(*) FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000202'),
  1::bigint,
  'acceptance creates its project only after engagement review and assignment'
);

SELECT throws_ok(
  $$ SELECT public.review_engagement(
       '30000000-0000-0000-0000-000000000202',
       'not_suitable',
       NULL
     ) $$,
  '23514',
  NULL,
  'an accepted inquiry cannot be moved back through review'
);

SELECT is(
  (SELECT count(*) FROM public.engagement_events WHERE event_type = 'reassigned'),
  2::bigint,
  'both admin assignments are audited'
);

SELECT is(
  (SELECT count(*) FROM public.engagement_events WHERE event_type = 'claimed'),
  1::bigint,
  'only the deal lead claim is recorded as claimed'
);

SELECT throws_ok(
  $$ SELECT public.reassign_engagement(
       '30000000-0000-0000-0000-000000000201',
       '10000000-0000-0000-0000-000000000204'
     ) $$,
  '22023',
  NULL,
  'studio member cannot assign an engagement to a designer'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000205","app_metadata":{"access_level":"client"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000205', true);

SELECT ok(NOT public.is_deal_lead_or_studio_member(), 'client does not pass the staff-role helper');
SELECT is((SELECT count(*) FROM public.engagements), 0::bigint, 'client cannot read engagements');
SELECT throws_ok(
  $$ SELECT public.review_engagement(
       '30000000-0000-0000-0000-000000000202',
       'suitable',
       NULL
     ) $$,
  '42501',
  NULL,
  'client cannot change an engagement'
);

RESET ROLE;

SELECT ok(
  NOT has_function_privilege('anon', 'public.review_engagement(uuid,text,text)', 'EXECUTE'),
  'anonymous users cannot execute engagement review'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.claim_engagement(uuid)', 'EXECUTE'),
  'anonymous users cannot claim engagements'
);

DELETE FROM public.inquiries
WHERE id = '30000000-0000-0000-0000-000000000201';

SELECT is(
  (SELECT count(*) FROM public.engagements WHERE inquiry_id = '30000000-0000-0000-0000-000000000201'),
  0::bigint,
  'demo retention can delete an inquiry and its engagement'
);

SELECT is(
  (SELECT count(*) FROM public.engagement_events
   WHERE engagement_id NOT IN (SELECT id FROM public.engagements)),
  0::bigint,
  'engagement events cascade with deleted inquiries'
);

SELECT * FROM finish();
ROLLBACK;
