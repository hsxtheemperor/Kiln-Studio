BEGIN;

SELECT plan(7);

INSERT INTO public.inquiries (id, name, email, project_brief)
VALUES (
  '30000000-0000-0000-0000-000000000101',
  'Team Role Test',
  'team-role-test@example.test',
  'Team role test inquiry'
);

INSERT INTO public.team_members (id, user_id, full_name, email, availability_status)
VALUES
  ('20000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000101', 'Available Member', 'available@example.test', 'available'),
  ('20000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000102', 'Busy Member', 'busy@example.test', 'busy'),
  ('20000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000103', 'Away Member', 'away@example.test', 'away'),
  ('20000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000104', 'Leave Member', 'leave@example.test', 'on_leave');

SELECT is(
  (SELECT count(*) FROM public.team_members
   WHERE id BETWEEN '20000000-0000-0000-0000-000000000101'::uuid
     AND '20000000-0000-0000-0000-000000000104'::uuid),
  4::bigint,
  'all supported availability statuses can be stored'
);

SELECT throws_ok(
  $$ INSERT INTO public.team_members (user_id, full_name, email, availability_status)
     VALUES ('10000000-0000-0000-0000-000000000105', 'Legacy Review', 'legacy-review@example.test', 'in_review') $$,
  '23514',
  NULL,
  'legacy in_review availability is no longer accepted'
);

SELECT throws_ok(
  $$ INSERT INTO public.team_members (user_id, full_name, email, availability_status)
     VALUES ('10000000-0000-0000-0000-000000000106', 'Legacy Unassigned', 'legacy-unassigned@example.test', 'unassigned') $$,
  '23514',
  NULL,
  'unassigned is not an availability status'
);

INSERT INTO public.project_assignments (inquiry_id, team_member_id, role_name, is_project_manager)
VALUES (
  '30000000-0000-0000-0000-000000000101',
  '20000000-0000-0000-0000-000000000101',
  'PROJECT_MANAGER',
  true
);

SELECT throws_ok(
  $$ INSERT INTO public.project_assignments (inquiry_id, team_member_id, role_name, is_project_manager)
     VALUES (
       '30000000-0000-0000-0000-000000000101',
       '20000000-0000-0000-0000-000000000102',
       'PROJECT_MANAGER',
       true
     ) $$,
  '23505',
  NULL,
  'legacy inquiry assignments allow at most one project manager'
);

INSERT INTO public.project_channels (channel_name, channel_type)
VALUES ('Role test General', 'general');

INSERT INTO public.project_channel_members (channel_id, team_member_id)
SELECT id, '20000000-0000-0000-0000-000000000102'
FROM public.project_channels
WHERE channel_name = 'Role test General';

SELECT is(
  (SELECT role
   FROM public.project_channel_members
   WHERE team_member_id = '20000000-0000-0000-0000-000000000102'
     AND channel_id = (
       SELECT id FROM public.project_channels WHERE channel_name = 'Role test General'
     )),
  'member',
  'channel memberships default to the member role'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_channels (channel_name, channel_type)
     VALUES ('Invalid channel', 'private') $$,
  '23514',
  NULL,
  'channel type is restricted to supported values'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_channel_members (channel_id, team_member_id, role)
     SELECT id, '20000000-0000-0000-0000-000000000101', 'owner'
     FROM public.project_channels WHERE channel_name = 'Role test General' $$,
  '23514',
  NULL,
  'channel membership role is restricted to moderator or member'
);

SELECT * FROM finish();
ROLLBACK;
