BEGIN;

SELECT plan(19);

SELECT ok(
  NOT has_table_privilege('anon', 'public.project_messages', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.project_request_logs', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.company_expenses', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.team_members', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.project_assignments', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.project_channels', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.project_channel_members', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.project_channel_messages', 'SELECT'),
  'anonymous has no read privileges on studio tables'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.project_messages', 'SELECT')
  AND has_table_privilege('authenticated', 'public.project_request_logs', 'SELECT')
  AND has_table_privilege('authenticated', 'public.company_expenses', 'SELECT')
  AND has_table_privilege('authenticated', 'public.team_members', 'SELECT')
  AND has_table_privilege('authenticated', 'public.project_assignments', 'SELECT')
  AND has_table_privilege('authenticated', 'public.project_channels', 'SELECT')
  AND has_table_privilege('authenticated', 'public.project_channel_members', 'SELECT')
  AND has_table_privilege('authenticated', 'public.project_channel_messages', 'SELECT'),
  'authenticated has table-level read privileges for RLS-filtered studio data'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.project_messages', 'UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.project_request_logs', 'UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.company_expenses', 'UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.team_members', 'UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.project_assignments', 'UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.project_channels', 'UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.project_channel_members', 'UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('authenticated', 'public.project_channel_messages', 'UPDATE,DELETE,TRUNCATE'),
  'authenticated cannot update, delete, or truncate studio tables'
);

SELECT ok(
  NOT has_table_privilege('service_role', 'public.project_messages', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('service_role', 'public.project_request_logs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('service_role', 'public.company_expenses', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('service_role', 'public.team_members', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('service_role', 'public.project_assignments', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('service_role', 'public.project_channels', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('service_role', 'public.project_channel_members', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('service_role', 'public.project_channel_messages', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  'service role has no table-level privileges on hardened studio tables'
);

SELECT ok(
  has_column_privilege('authenticated', 'public.project_messages', 'inquiry_id', 'INSERT')
  AND has_column_privilege('authenticated', 'public.project_messages', 'body', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.project_messages', 'updated_at', 'INSERT')
  AND has_column_privilege('authenticated', 'public.project_messages', 'sender_id', 'INSERT'),
  'message inserts are limited to explicitly granted columns and policy-checked identity'
);

SELECT ok(
  has_column_privilege('authenticated', 'public.project_request_logs', 'inquiry_id', 'INSERT')
  AND has_column_privilege('authenticated', 'public.project_request_logs', 'status', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.project_request_logs', 'created_at', 'INSERT'),
  'request-log inserts do not allow caller-controlled timestamps'
);

SELECT ok(
  has_column_privilege('authenticated', 'public.company_expenses', 'contributor_name', 'INSERT')
  AND has_column_privilege('authenticated', 'public.company_expenses', 'contributor_amount', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.company_expenses', 'updated_at', 'INSERT'),
  'expense inserts are limited to explicitly granted columns'
);

SELECT ok(
  has_column_privilege('authenticated', 'public.project_channel_messages', 'channel_id', 'INSERT')
  AND has_column_privilege('authenticated', 'public.project_channel_messages', 'body', 'INSERT')
  AND NOT has_column_privilege('authenticated', 'public.project_channel_messages', 'created_at', 'INSERT'),
  'channel-message inserts do not allow caller-controlled timestamps'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.set_project_messages_updated_at()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.set_project_messages_updated_at()', 'EXECUTE'),
  'trigger function is not directly executable by API roles'
);

INSERT INTO public.inquiries (id, name, email, project_brief)
VALUES (
  '00000000-0000-0000-0000-000000000091',
  'Grant Test',
  'grant-test@example.test',
  'Grant test inquiry'
);

INSERT INTO public.team_members (id, user_id, full_name, email)
VALUES (
  '20000000-0000-0000-0000-000000000091',
  '10000000-0000-0000-0000-000000000091',
  'Grant Test Designer',
  'grant-designer@example.test'
);

INSERT INTO public.project_messages (inquiry_id, sender_type, sender_name, body)
SELECT id, 'team', 'Seed', 'Seed message'
FROM public.inquiries
WHERE email = 'grant-test@example.test';

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT * FROM public.team_members $$,
  '42501',
  NULL,
  'anonymous cannot select team members'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000092","app_metadata":{}}',
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.team_members),
  0::bigint,
  'a signed-in user without a trusted studio claim sees no team members'
);
SELECT throws_ok(
  $$ INSERT INTO public.project_messages (inquiry_id, sender_type, sender_name, body)
     VALUES ('00000000-0000-0000-0000-000000000091', 'team', 'Unauthorized', 'Denied') $$,
  '42501',
  NULL,
  'a signed-in user without a trusted studio claim cannot insert messages'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000091","app_metadata":{"access_level":"designer"}}',
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.team_members),
  1::bigint,
  'trusted designer claim grants team read access'
);
SELECT lives_ok(
  $$ INSERT INTO public.project_messages (inquiry_id, sender_type, sender_id, sender_name, body)
     VALUES (
       '00000000-0000-0000-0000-000000000091',
       'designer',
       '10000000-0000-0000-0000-000000000091',
       'Grant Test Designer',
       'Allowed'
     ) $$,
  'trusted designer claim permits an allowed message insert'
);
SELECT throws_ok(
  $$ INSERT INTO public.project_messages (inquiry_id, sender_type, sender_id, sender_name, body)
     VALUES (
       '00000000-0000-0000-0000-000000000091',
       'designer',
       '10000000-0000-0000-0000-000000000092',
       'Impersonated User',
       'Denied'
     ) $$,
  '42501',
  NULL,
  'designer cannot insert a message as another user'
);
SELECT throws_ok(
  $$ INSERT INTO public.project_messages (inquiry_id, sender_type, sender_id, sender_name, body)
     VALUES (
       '00000000-0000-0000-0000-000000000091',
       'team',
       '10000000-0000-0000-0000-000000000091',
       'Grant Test Designer',
       'Denied'
     ) $$,
  '42501',
  NULL,
  'designer cannot claim a studio-member sender type'
);
SELECT throws_ok(
  $$ UPDATE public.project_messages SET body = 'Edited' $$,
  '42501',
  NULL,
  'designer cannot update messages'
);
SELECT throws_ok(
  $$ DELETE FROM public.project_messages $$,
  '42501',
  NULL,
  'designer cannot delete messages'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ SELECT * FROM public.company_expenses $$,
  '42501',
  NULL,
  'service role cannot access hardened finance tables'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
