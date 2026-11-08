INSERT INTO public.slack_project_sync_jobs (project_id, action, status)
SELECT projects.id,
       CASE WHEN projects.status = 'completed' THEN 'archive' ELSE 'create' END,
       'pending'
FROM public.projects AS projects
JOIN public.project_channels AS channels
  ON channels.project_id = projects.id
 AND channels.channel_type = 'project'
ON CONFLICT (project_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_slack_project_sync_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.slack_project_sync_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ready_jobs AS (
    SELECT jobs.project_id
    FROM public.slack_project_sync_jobs AS jobs
    WHERE (
        jobs.status IN ('pending', 'retry')
        OR (jobs.status = 'processing' AND jobs.claimed_at < pg_catalog.now() - interval '5 minutes')
      )
      AND jobs.available_at <= pg_catalog.now()
    ORDER BY jobs.available_at, jobs.project_id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 20)
  )
  UPDATE public.slack_project_sync_jobs AS jobs
  SET status = 'processing',
      attempt_count = jobs.attempt_count + 1,
      claimed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  FROM ready_jobs
  WHERE jobs.project_id = ready_jobs.project_id
  RETURNING jobs.*;
$$;

CREATE OR REPLACE FUNCTION public.claim_slack_message_outbox(p_limit integer DEFAULT 20)
RETURNS SETOF public.slack_message_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ready_jobs AS (
    SELECT jobs.id
    FROM public.slack_message_outbox AS jobs
    WHERE (
        jobs.status IN ('pending', 'retry')
        OR (jobs.status = 'processing' AND jobs.claimed_at < pg_catalog.now() - interval '5 minutes')
      )
      AND jobs.available_at <= pg_catalog.now()
    ORDER BY jobs.available_at, jobs.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 50)
  )
  UPDATE public.slack_message_outbox AS jobs
  SET status = 'processing',
      attempt_count = jobs.attempt_count + 1,
      claimed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  FROM ready_jobs
  WHERE jobs.id = ready_jobs.id
  RETURNING jobs.*;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_channel_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.project_channel_messages;
  END IF;
END;
$$;
