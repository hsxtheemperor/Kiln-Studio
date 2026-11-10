CREATE OR REPLACE FUNCTION public.claim_slack_message_outbox_by_message_id(
  p_message_id uuid
)
RETURNS SETOF public.slack_message_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ready_job AS (
    SELECT jobs.id
    FROM public.slack_message_outbox AS jobs
    WHERE jobs.project_channel_message_id = p_message_id
      AND (
        jobs.status IN ('pending', 'retry')
        OR (
          jobs.status = 'processing'
          AND jobs.claimed_at < pg_catalog.now() - interval '5 minutes'
        )
      )
      AND jobs.available_at <= pg_catalog.now()
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.slack_message_outbox AS jobs
  SET status = 'processing',
      attempt_count = jobs.attempt_count + 1,
      claimed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  FROM ready_job
  WHERE jobs.id = ready_job.id
  RETURNING jobs.*;
$$;

REVOKE ALL ON FUNCTION public.claim_slack_message_outbox_by_message_id(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_slack_message_outbox_by_message_id(uuid)
  TO service_role;
