BEGIN;

SELECT plan(2);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_channel_messages'
  ),
  'project chat messages are published to Supabase Realtime'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_activity_logs'
  ),
  'system activity logs are published to Supabase Realtime'
);

SELECT * FROM finish();
ROLLBACK;
