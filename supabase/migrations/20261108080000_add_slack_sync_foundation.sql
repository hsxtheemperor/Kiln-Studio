ALTER TABLE public.project_channel_messages
  ADD COLUMN message_source text NOT NULL DEFAULT 'app'
  CHECK (message_source IN ('app', 'slack'));

CREATE TABLE public.slack_installations (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  workspace_id text NOT NULL UNIQUE,
  workspace_name text NOT NULL,
  bot_user_id text NOT NULL,
  encrypted_bot_token text NOT NULL,
  installed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.slack_user_mappings (
  team_member_id uuid PRIMARY KEY REFERENCES public.team_members(id) ON DELETE CASCADE,
  slack_user_id text NOT NULL UNIQUE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  linked_by uuid NOT NULL
);

CREATE TABLE public.slack_project_channels (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  slack_channel_id text NOT NULL UNIQUE,
  slack_channel_name text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.slack_project_sync_jobs (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('create', 'archive')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'completed', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.slack_message_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_channel_message_id uuid NOT NULL UNIQUE
    REFERENCES public.project_channel_messages(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retry', 'delivered', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  slack_message_ts text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX slack_message_outbox_ready_idx
  ON public.slack_message_outbox (available_at, created_at)
  WHERE status IN ('pending', 'retry');

CREATE TABLE public.slack_event_receipts (
  event_id text PRIMARY KEY,
  outcome text NOT NULL DEFAULT 'processing'
    CHECK (outcome IN ('processing', 'stored', 'ignored')),
  provider_channel_id text,
  provider_message_ts text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE public.slack_provider_messages (
  provider_channel_id text NOT NULL,
  provider_message_ts text NOT NULL,
  project_channel_message_id uuid NOT NULL UNIQUE
    REFERENCES public.project_channel_messages(id) ON DELETE CASCADE,
  PRIMARY KEY (provider_channel_id, provider_message_ts)
);

ALTER TABLE public.slack_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_user_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_project_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_project_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_message_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_provider_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.slack_installations,
  public.slack_user_mappings,
  public.slack_project_channels,
  public.slack_project_sync_jobs,
  public.slack_message_outbox,
  public.slack_event_receipts,
  public.slack_provider_messages
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.slack_installations,
  public.slack_user_mappings,
  public.slack_project_channels,
  public.slack_project_sync_jobs,
  public.slack_message_outbox,
  public.slack_event_receipts,
  public.slack_provider_messages
TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_slack_project_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_id uuid;
  v_action text;
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN
    v_project_id := NEW.id;
    v_action := CASE WHEN NEW.status = 'completed' THEN 'archive' ELSE 'create' END;
  ELSE
    IF NEW.channel_type <> 'project' OR NEW.project_id IS NULL THEN
      RETURN NEW;
    END IF;
    v_project_id := NEW.project_id;
    v_action := 'create';
  END IF;

  INSERT INTO public.slack_project_sync_jobs (project_id, action, status, available_at, claimed_at, last_error)
  VALUES (v_project_id, v_action, 'pending', pg_catalog.now(), NULL, NULL)
  ON CONFLICT (project_id)
  DO UPDATE SET
    action = EXCLUDED.action,
    status = 'pending',
    available_at = pg_catalog.now(),
    claimed_at = NULL,
    last_error = NULL,
    updated_at = pg_catalog.now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_slack_project_sync() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER project_channels_enqueue_slack_sync
  AFTER INSERT
  ON public.project_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_slack_project_sync();

CREATE TRIGGER projects_enqueue_slack_archive
  AFTER UPDATE OF status
  ON public.projects
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.enqueue_slack_project_sync();

CREATE OR REPLACE FUNCTION public.enqueue_slack_message_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  IF NEW.message_source <> 'app' THEN
    RETURN NEW;
  END IF;

  SELECT channels.project_id
  INTO v_project_id
  FROM public.project_channels AS channels
  JOIN public.slack_project_channels AS mappings
    ON mappings.project_id = channels.project_id
  WHERE channels.id = NEW.channel_id
    AND channels.channel_type = 'project'
    AND channels.is_archived = false;

  IF v_project_id IS NOT NULL THEN
    INSERT INTO public.slack_message_outbox (project_id, project_channel_message_id)
    VALUES (v_project_id, NEW.id)
    ON CONFLICT (project_channel_message_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_slack_message_delivery() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER project_channel_messages_enqueue_slack_delivery
  AFTER INSERT
  ON public.project_channel_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_slack_message_delivery();

CREATE OR REPLACE FUNCTION public.claim_slack_project_sync_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.slack_project_sync_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ready_jobs AS (
    SELECT jobs.project_id
    FROM public.slack_project_sync_jobs AS jobs
    WHERE jobs.status IN ('pending', 'retry')
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
    WHERE jobs.status IN ('pending', 'retry')
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

CREATE OR REPLACE FUNCTION public.complete_slack_project_sync(
  p_project_id uuid,
  p_slack_channel_id text,
  p_slack_channel_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.slack_project_channels (
    project_id, slack_channel_id, slack_channel_name, synced_at
  )
  VALUES (p_project_id, p_slack_channel_id, p_slack_channel_name, pg_catalog.now())
  ON CONFLICT (project_id)
  DO UPDATE SET
    slack_channel_id = EXCLUDED.slack_channel_id,
    slack_channel_name = EXCLUDED.slack_channel_name,
    synced_at = EXCLUDED.synced_at;

  UPDATE public.slack_project_sync_jobs
  SET status = 'completed', claimed_at = NULL, last_error = NULL, updated_at = pg_catalog.now()
  WHERE project_id = p_project_id;

  INSERT INTO public.slack_message_outbox (project_id, project_channel_message_id)
  SELECT p_project_id, messages.id
  FROM public.project_channels AS channels
  JOIN public.project_channel_messages AS messages
    ON messages.channel_id = channels.id
  WHERE channels.project_id = p_project_id
    AND channels.is_archived = false
    AND messages.message_source = 'app'
  ON CONFLICT (project_channel_message_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_slack_inbound_message(
  p_event_id text,
  p_provider_channel_id text,
  p_provider_message_ts text,
  p_slack_user_id text,
  p_body text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_channel_id uuid;
  v_project_id uuid;
  v_member_id uuid;
  v_member_name text;
  v_role_name text;
  v_message_id uuid;
BEGIN
  INSERT INTO public.slack_event_receipts (
    event_id, outcome, provider_channel_id, provider_message_ts
  )
  VALUES (p_event_id, 'processing', p_provider_channel_id, p_provider_message_ts)
  ON CONFLICT (event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 'duplicate';
  END IF;

  IF pg_catalog.length(pg_catalog.btrim(p_body)) NOT BETWEEN 1 AND 2000 THEN
    UPDATE public.slack_event_receipts
    SET outcome = 'ignored', processed_at = pg_catalog.now()
    WHERE event_id = p_event_id;
    RETURN 'ignored';
  END IF;

  SELECT channels.id, channels.project_id, members.team_member_id,
         team.full_name, members.role_name
  INTO v_channel_id, v_project_id, v_member_id, v_member_name, v_role_name
  FROM public.slack_project_channels AS mapping
  JOIN public.project_channels AS channels
    ON channels.project_id = mapping.project_id
   AND channels.channel_type = 'project'
   AND channels.is_archived = false
  JOIN public.projects AS projects
    ON projects.id = channels.project_id
   AND projects.status = 'active'
  JOIN public.slack_user_mappings AS users
    ON users.slack_user_id = p_slack_user_id
  JOIN public.project_members AS members
    ON members.project_id = projects.id
   AND members.team_member_id = users.team_member_id
  JOIN public.team_members AS team
    ON team.id = members.team_member_id
   AND team.is_active = true
  WHERE mapping.slack_channel_id = p_provider_channel_id
  LIMIT 1;

  IF v_channel_id IS NULL THEN
    UPDATE public.slack_event_receipts
    SET outcome = 'ignored', processed_at = pg_catalog.now()
    WHERE event_id = p_event_id;
    RETURN 'ignored';
  END IF;

  INSERT INTO public.project_channel_messages (
    channel_id, sender_member_id, sender_name, sender_role, body, message_source
  )
  VALUES (
    v_channel_id, v_member_id, v_member_name, v_role_name, pg_catalog.btrim(p_body), 'slack'
  )
  RETURNING id INTO v_message_id;

  INSERT INTO public.slack_provider_messages (
    provider_channel_id, provider_message_ts, project_channel_message_id
  )
  VALUES (p_provider_channel_id, p_provider_message_ts, v_message_id)
  ON CONFLICT DO NOTHING;

  UPDATE public.slack_event_receipts
  SET outcome = 'stored', processed_at = pg_catalog.now()
  WHERE event_id = p_event_id;

  RETURN 'stored';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_slack_project_sync_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_slack_message_outbox(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_slack_project_sync(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.persist_slack_inbound_message(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_slack_project_sync_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_slack_message_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_slack_project_sync(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_slack_inbound_message(text, text, text, text, text) TO service_role;
