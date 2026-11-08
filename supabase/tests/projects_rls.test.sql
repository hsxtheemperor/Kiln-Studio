BEGIN;

SELECT plan(41);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"access_level":"studio_member"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

INSERT INTO public.team_members (id, user_id, full_name, email)
VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Project PM One', 'pm-one@example.test'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'Designer One', 'designer-one@example.test'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 'Project PM Two', 'pm-two@example.test'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005', 'Designer Two', 'designer-two@example.test'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Studio Admin', 'studio-admin@example.test');

INSERT INTO public.inquiries (
  id, name, email, company, service, project_brief, status, priority_score
)
VALUES
  ('30000000-0000-0000-0000-000000000001', 'Client One', 'client-one@example.test', 'Studio One', 'brand_identity', 'First project brief', 'new', 7),
  ('30000000-0000-0000-0000-000000000002', 'Client Two', 'client-two@example.test', 'Studio Two', 'web_design', 'Second project brief', 'accepted', 9);

SELECT is(
  (SELECT count(*) FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001'),
  0::bigint,
  'an unaccepted inquiry does not create a project'
);

UPDATE public.inquiries
SET status = 'accepted'
WHERE id = '30000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT count(*) FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001'),
  1::bigint,
  'acceptance creates exactly one project'
);

SELECT is(
  (SELECT count(*) FROM public.project_channels WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001')),
  1::bigint,
  'project creation creates exactly one dedicated channel'
);

UPDATE public.projects
SET project_manager_id = '20000000-0000-0000-0000-000000000001',
    deadline_date = '2026-11-25'
WHERE inquiry_id = '30000000-0000-0000-0000-000000000001';

UPDATE public.projects
SET project_manager_id = '20000000-0000-0000-0000-000000000003',
    deadline_date = '2026-11-20'
WHERE inquiry_id = '30000000-0000-0000-0000-000000000002';

INSERT INTO public.inquiry_briefs (
  inquiry_id, design_goal, brand_message
)
VALUES
  ('30000000-0000-0000-0000-000000000001', 'First goal', 'First message'),
  ('30000000-0000-0000-0000-000000000002', 'Second goal', 'Second message');

INSERT INTO public.project_members (project_id, team_member_id, role_name)
SELECT projects.id, '20000000-0000-0000-0000-000000000002', 'DESIGNER'
FROM public.projects
WHERE inquiry_id = '30000000-0000-0000-0000-000000000001';

INSERT INTO public.project_channels (channel_name, channel_type)
VALUES ('Test General', 'general'), ('Test Announcements', 'announcement');

INSERT INTO public.project_channel_messages (channel_id, sender_member_id, sender_name, body)
SELECT channels.id, '20000000-0000-0000-0000-000000000001', 'Project PM One', 'Existing project message'
FROM public.project_channels AS channels
JOIN public.projects ON projects.id = channels.project_id
WHERE projects.inquiry_id = '30000000-0000-0000-0000-000000000001';

SELECT ok(
  (SELECT description LIKE '%Client One%' AND description LIKE '%Studio One%'
   FROM public.project_channels
   WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001')),
  'project channel description includes inquiry details'
);

SELECT is(
  (SELECT role FROM public.project_channel_members
   WHERE channel_id = (SELECT id FROM public.project_channels WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001'))
     AND team_member_id = '20000000-0000-0000-0000-000000000001'),
  'moderator',
  'assigned project manager is synchronized as channel moderator'
);

SELECT is(
  (SELECT channel_type FROM public.project_channels
   WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001')),
  'project',
  'accepted project is represented as a project channel'
);

SELECT is(
  (SELECT project_id::text FROM public.list_project_channels() LIMIT 1),
  (SELECT id::text FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000002'),
  'channel listing puts higher priority projects first'
);

UPDATE public.inquiries
SET priority_score = 7
WHERE id IN (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002'
);

SELECT is(
  (SELECT project_id::text FROM public.list_project_channels() LIMIT 1),
  (SELECT id::text FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000002'),
  'nearest deadline sorts first when project priorities tie'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_members (project_id, team_member_id, role_name)
     SELECT id, '20000000-0000-0000-0000-000000000002', 'ANOTHER_ROLE'
     FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001' $$,
  '23505',
  NULL,
  'a person can have only one membership row per project'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_members (project_id, team_member_id, role_name)
     SELECT id, '20000000-0000-0000-0000-000000000003', 'PROJECT_MANAGER'
     FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001' $$,
  '23505',
  NULL,
  'a project can have only one project-manager role'
);

SELECT set_config(
  'test.project_channel_one',
  (SELECT id::text FROM public.project_channels WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001')),
  true
);
SELECT set_config(
  'test.project_channel_two',
  (SELECT id::text FROM public.project_channels WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000002')),
  true
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"access_level":"designer"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

SELECT is(
  (SELECT count(*) FROM public.project_channels
   WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001')),
  1::bigint,
  'a project manager can read their own project channel'
);

SELECT is(
  (SELECT count(*) FROM public.project_channels
   WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000002')),
  0::bigint,
  'a project manager cannot read another project channel'
);

SELECT is(
  (SELECT count(*) FROM public.project_channel_messages AS messages
   JOIN public.project_channels AS channels ON channels.id = messages.channel_id
   JOIN public.projects ON projects.id = channels.project_id
   WHERE projects.inquiry_id = '30000000-0000-0000-0000-000000000001'),
  1::bigint,
  'a project manager can read their own channel history'
);

INSERT INTO public.project_channel_messages (
  channel_id, sender_member_id, sender_name, sender_role, body
)
VALUES (
  current_setting('test.project_channel_one')::uuid,
  '20000000-0000-0000-0000-000000000001',
  'Project PM One',
  'PROJECT_MANAGER',
  'A durable project update'
);

SELECT is(
  (SELECT count(*) FROM public.project_channel_messages
   WHERE channel_id = current_setting('test.project_channel_one')::uuid
     AND body = 'A durable project update'),
  1::bigint,
  'a project manager can persist a message in their own channel'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_channel_messages (
       channel_id, sender_member_id, sender_name, sender_role, body
     )
     VALUES (
       current_setting('test.project_channel_two')::uuid,
       '20000000-0000-0000-0000-000000000001',
       'Project PM One',
       'PROJECT_MANAGER',
       'Cross-project message'
     ) $$,
  '42501',
  NULL,
  'a project manager cannot post to another project channel'
);

INSERT INTO public.project_members (project_id, team_member_id, role_name)
SELECT id, '20000000-0000-0000-0000-000000000004', 'DESIGNER'
FROM public.projects
WHERE inquiry_id = '30000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT count(*) FROM public.project_channel_members
   WHERE team_member_id = '20000000-0000-0000-0000-000000000004'
     AND channel_id = (SELECT id FROM public.project_channels WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001'))),
  1::bigint,
  'adding a project member adds them to its channel'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_members (project_id, team_member_id, role_name)
     SELECT id, '20000000-0000-0000-0000-000000000004', 'DESIGNER'
     FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000002' $$,
  '42501',
  NULL,
  'a project manager cannot add members to another project'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"access_level":"designer"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

SELECT is(
  (SELECT count(*) FROM public.system_activity_logs),
  0::bigint,
  'designers cannot read system activity logs'
);

SELECT is(
  (SELECT count(*) FROM public.project_channels
   WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001')),
  1::bigint,
  'a project member can read their assigned channel'
);

SELECT is(
  (SELECT count(*) FROM public.project_channels
   WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000002')),
  0::bigint,
  'a project member cannot read an unassigned channel'
);

SELECT is(
  (SELECT count(*) FROM public.project_channel_messages AS messages
   JOIN public.project_channels AS channels ON channels.id = messages.channel_id
   JOIN public.projects ON projects.id = channels.project_id
   WHERE projects.inquiry_id = '30000000-0000-0000-0000-000000000002'),
  0::bigint,
  'a project member cannot read another project history'
);

UPDATE public.projects
SET deadline_date = '2026-12-01'
WHERE inquiry_id = '30000000-0000-0000-0000-000000000001';

RESET ROLE;
SELECT is(
  (SELECT deadline_date::text FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001'),
  '2026-11-25',
  'a non-manager cannot modify project settings'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"access_level":"designer"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

UPDATE public.projects
SET status = 'completed'
WHERE inquiry_id = '30000000-0000-0000-0000-000000000001';

RESET ROLE;
SELECT is(
  (SELECT status FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001'),
  'active',
  'a non-manager cannot complete a project'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"access_level":"designer"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

SELECT is(
  auth.uid()::text,
  '10000000-0000-0000-0000-000000000002',
  'the project manager JWT identity is active for completion'
);

SELECT ok(
  public.is_project_manager((SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001')),
  'database recognizes the assigned project manager'
);

UPDATE public.projects
SET status = 'completed'
WHERE inquiry_id = '30000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT status FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001'),
  'completed',
  'the assigned project manager can complete their project'
);

SELECT ok(
  (SELECT completed_at IS NOT NULL FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001'),
  'completion records a timestamp'
);

SELECT ok(
  (SELECT is_archived FROM public.project_channels
   WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001')),
  'completion archives the project channel'
);

SELECT is(
  (SELECT count(*) FROM public.project_channel_messages AS messages
   JOIN public.project_channels AS channels ON channels.id = messages.channel_id
   JOIN public.projects ON projects.id = channels.project_id
   WHERE projects.inquiry_id = '30000000-0000-0000-0000-000000000001'),
  2::bigint,
  'current members retain read access to archived history'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_channel_messages (channel_id, sender_member_id, sender_name, body)
     SELECT channels.id, '20000000-0000-0000-0000-000000000001', 'Project PM One', 'Too late'
     FROM public.project_channels AS channels
     JOIN public.projects ON projects.id = channels.project_id
     WHERE projects.inquiry_id = '30000000-0000-0000-0000-000000000001' $$,
  '42501',
  NULL,
  'archived project channels reject new messages'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_members (project_id, team_member_id, role_name)
     SELECT id, '20000000-0000-0000-0000-000000000005', 'DESIGNER'
     FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001' $$,
  '42501',
  NULL,
  'completed projects cannot gain new members'
);

DELETE FROM public.project_members
WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000001')
  AND team_member_id = '20000000-0000-0000-0000-000000000002';

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","app_metadata":{"access_level":"designer"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

SELECT is(
  (SELECT count(*) FROM public.project_channel_messages AS messages
   JOIN public.project_channels AS channels ON channels.id = messages.channel_id
   JOIN public.projects ON projects.id = channels.project_id
   WHERE projects.inquiry_id = '30000000-0000-0000-0000-000000000001'),
  0::bigint,
  'a removed member loses access to channel history'
);

INSERT INTO public.project_channel_messages (channel_id, sender_member_id, sender_name, body)
SELECT id, '20000000-0000-0000-0000-000000000002', 'Designer One', 'General is open'
FROM public.project_channels
WHERE channel_type = 'general' AND channel_name = 'Test General';

SELECT is(
  (SELECT count(*) FROM public.project_channel_messages AS messages
   JOIN public.project_channels AS channels ON channels.id = messages.channel_id
   WHERE channels.channel_name = 'Test General' AND messages.body = 'General is open'),
  1::bigint,
  'designers can post to General'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_channel_messages (channel_id, sender_member_id, sender_name, body)
     SELECT id, '20000000-0000-0000-0000-000000000004', 'Designer Two', 'Impersonated'
     FROM public.project_channels
     WHERE channel_type = 'general' AND channel_name = 'Test General' $$,
  '42501',
  NULL,
  'a team member cannot post to General as another member'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_channel_messages (channel_id, sender_member_id, sender_name, body)
     SELECT id, '20000000-0000-0000-0000-000000000002', 'Studio Admin', 'Impersonated'
     FROM public.project_channels
     WHERE channel_type = 'general' AND channel_name = 'Test General' $$,
  '42501',
  NULL,
  'a team member cannot spoof another member name'
);

SELECT throws_ok(
  $$ INSERT INTO public.project_channel_messages (channel_id, sender_member_id, sender_name, body)
     SELECT id, '20000000-0000-0000-0000-000000000002', 'Designer One', 'Not an announcement'
     FROM public.project_channels
     WHERE channel_type = 'announcement' AND channel_name = 'Test Announcements' $$,
  '42501',
  NULL,
  'designers cannot post announcements'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"access_level":"studio_member"}}',
  true
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

SELECT is(
  (SELECT count(*) FROM public.system_activity_logs
   WHERE record_id = '30000000-0000-0000-0000-000000000001'
     AND table_name = 'inquiries'
     AND operation = 'UPDATE'
     AND changed_columns @> ARRAY['status']),
  1::bigint,
  'studio admins can read inquiry status changes in system activity logs'
);

INSERT INTO public.project_channel_messages (channel_id, sender_member_id, sender_name, body)
SELECT id, '20000000-0000-0000-0000-000000000005', 'Studio Admin', 'Admin announcement'
FROM public.project_channels
WHERE channel_type = 'announcement' AND channel_name = 'Test Announcements';

SELECT is(
  (SELECT count(*) FROM public.project_channel_messages AS messages
   JOIN public.project_channels AS channels ON channels.id = messages.channel_id
   WHERE channels.channel_name = 'Test Announcements' AND messages.body = 'Admin announcement'),
  1::bigint,
  'studio admins can post announcements'
);

UPDATE public.projects
SET project_manager_id = '20000000-0000-0000-0000-000000000004'
WHERE inquiry_id = '30000000-0000-0000-0000-000000000002';

SELECT is(
  (SELECT role_name FROM public.project_members
   WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000002')
     AND team_member_id = '20000000-0000-0000-0000-000000000003'),
  'TEAM_MEMBER',
  'admin PM reassignment demotes the previous project manager'
);

SELECT is(
  (SELECT role FROM public.project_channel_members
   WHERE team_member_id = '20000000-0000-0000-0000-000000000004'
     AND channel_id = (SELECT id FROM public.project_channels WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000002'))),
  'moderator',
  'admin PM reassignment makes the new project manager channel moderator'
);

SELECT throws_ok(
  $$ UPDATE public.projects SET status = 'completed'
     WHERE inquiry_id = '30000000-0000-0000-0000-000000000002' $$,
  '42501',
  NULL,
  'admin privileges do not bypass the project-manager-only completion rule'
);

SELECT * FROM finish();
ROLLBACK;
