BEGIN;

SELECT plan(12);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"11000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"access_level":"studio_member"}}',
  true
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  '11000000-0000-0000-0000-000000000099',
  'authenticated', 'authenticated', 'slack-deal-lead@example.test', '',
  now(), '{"access_level":"deal_lead"}', '{}', now(), now()
);

SELECT set_config(
  'request.jwt.claim.sub',
  '11000000-0000-0000-0000-000000000001',
  true
);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  '11000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'slack-admin@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_members (id, user_id, full_name, email)
VALUES
  ('21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'Slack Project PM', 'slack-pm@example.test'),
  ('21000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000002', 'Slack Designer', 'slack-designer@example.test'),
  ('21000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000003', 'Unassigned Slack User', 'slack-unassigned@example.test');

INSERT INTO public.inquiries (
  id, name, email, company, service, project_brief, status, priority_score
)
VALUES (
  '31000000-0000-0000-0000-000000000001',
  'Slack Client',
  'slack-client@example.test',
  'Slack Studio',
  'brand_identity',
  'Slack test project',
  'new',
  5
);

UPDATE public.engagements
SET review_state = 'suitable',
    deal_lead_id = '11000000-0000-0000-0000-000000000099',
    claimed_at = now()
WHERE inquiry_id = '31000000-0000-0000-0000-000000000001';

UPDATE public.inquiries
SET status = 'accepted'
WHERE id = '31000000-0000-0000-0000-000000000001';

UPDATE public.projects
SET project_manager_id = '21000000-0000-0000-0000-000000000001'
WHERE inquiry_id = '31000000-0000-0000-0000-000000000001';

INSERT INTO public.project_members (project_id, team_member_id, role_name)
SELECT id, '21000000-0000-0000-0000-000000000002', 'DESIGNER'
FROM public.projects
WHERE inquiry_id = '31000000-0000-0000-0000-000000000001';

INSERT INTO public.slack_project_channels (project_id, slack_channel_id, slack_channel_name)
SELECT id, 'CSLACKPROJECT', 'kiln-project-test'
FROM public.projects
WHERE inquiry_id = '31000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT count(*) FROM public.slack_project_sync_jobs
   WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '31000000-0000-0000-0000-000000000001')),
  1::bigint,
  'project channel creation queues a Slack sync job'
);

INSERT INTO public.slack_user_mappings (team_member_id, slack_user_id, linked_by)
VALUES
  ('21000000-0000-0000-0000-000000000002', 'USLACKDESIGNER', '11000000-0000-0000-0000-000000000001'),
  ('21000000-0000-0000-0000-000000000003', 'USLACKUNASSIGNED', '11000000-0000-0000-0000-000000000001');

SELECT is(
  (SELECT action FROM public.slack_project_sync_jobs
   WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '31000000-0000-0000-0000-000000000001')),
  'sync_members',
  'linking a Slack user queues project channel membership reconciliation'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.slack_installations', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.slack_user_mappings', 'SELECT')
  AND has_table_privilege('service_role', 'public.slack_installations', 'SELECT'),
  'Slack credentials and identity mappings are private to the service role'
);

INSERT INTO public.project_channel_messages (
  channel_id, sender_member_id, sender_name, sender_role, body
)
SELECT channels.id, '21000000-0000-0000-0000-000000000002',
       'Slack Designer', 'DESIGNER', 'App-originated message'
FROM public.project_channels AS channels
JOIN public.projects ON projects.id = channels.project_id
WHERE projects.inquiry_id = '31000000-0000-0000-0000-000000000001';

SELECT is(
  (SELECT count(*) FROM public.slack_message_outbox
   WHERE project_id = (SELECT id FROM public.projects WHERE inquiry_id = '31000000-0000-0000-0000-000000000001')),
  1::bigint,
  'app-originated messages are placed in the Slack outbox'
);

SET LOCAL ROLE service_role;

SELECT is(
  public.persist_slack_inbound_message(
    'EvSlackTest0001',
    'CSLACKPROJECT',
    '1794172800.000100',
    'USLACKDESIGNER',
    'Slack-originated message'
  ),
  'stored',
  'a linked current project member can persist an inbound Slack message'
);

RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.project_channel_messages
   WHERE message_source = 'slack' AND body = 'Slack-originated message'),
  1::bigint,
  'inbound Slack messages are stored as project channel messages'
);

SET LOCAL ROLE service_role;

SELECT is(
  public.persist_slack_inbound_message(
    'EvSlackTest0001',
    'CSLACKPROJECT',
    '1794172800.000100',
    'USLACKDESIGNER',
    'Slack-originated message'
  ),
  'duplicate',
  'duplicate Slack event IDs are idempotently ignored'
);

SELECT is(
  public.persist_slack_inbound_message(
    'EvSlackTest0002',
    'CSLACKPROJECT',
    '1794172800.000200',
    'USLACKUNASSIGNED',
    'Message from a non-member'
  ),
  'ignored',
  'Slack users without current project membership cannot write to app history'
);

RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.project_channel_messages
   WHERE message_source = 'slack' AND body = 'Message from a non-member'),
  0::bigint,
  'ignored Slack messages are not visible in project history'
);

WITH inserted_message AS (
  INSERT INTO public.project_channel_messages (
    channel_id, sender_member_id, sender_name, sender_role, body
  )
  SELECT channels.id, '21000000-0000-0000-0000-000000000002',
         'Slack Designer', 'DESIGNER', 'Event-driven Slack delivery'
  FROM public.project_channels AS channels
  JOIN public.projects ON projects.id = channels.project_id
  WHERE projects.inquiry_id = '31000000-0000-0000-0000-000000000001'
  RETURNING id
)
SELECT set_config('test.slack_message_id', id::text, true)
FROM inserted_message;

SET LOCAL ROLE service_role;

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_slack_message_outbox_by_message_id(
      current_setting('test.slack_message_id')::uuid
    )
  ),
  1::bigint,
  'event delivery claims only the outbox row for the requested message'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_slack_message_outbox_by_message_id(
      current_setting('test.slack_message_id')::uuid
    )
  ),
  0::bigint,
  'a duplicate event cannot claim an already-processing outbox row'
);

SELECT ok(
  (SELECT count(*) FROM public.claim_slack_message_outbox(10)) > 0,
  'service role can claim ready Slack outbox jobs'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
