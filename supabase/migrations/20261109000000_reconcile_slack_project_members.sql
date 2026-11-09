ALTER TABLE public.slack_installations
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.slack_installations
  ALTER COLUMN encrypted_bot_token DROP NOT NULL;

ALTER TABLE public.slack_project_sync_jobs
  DROP CONSTRAINT slack_project_sync_jobs_action_check;

ALTER TABLE public.slack_project_sync_jobs
  ADD CONSTRAINT slack_project_sync_jobs_action_check
  CHECK (action IN ('create', 'archive', 'sync_members'));

CREATE OR REPLACE FUNCTION public.enqueue_slack_member_reconciliation(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.slack_project_sync_jobs (
    project_id, action, status, available_at, claimed_at, last_error
  )
  SELECT projects.id, 'sync_members', 'pending', pg_catalog.now(), NULL, NULL
  FROM public.projects AS projects
  JOIN public.slack_project_channels AS mappings
    ON mappings.project_id = projects.id
  WHERE projects.id = p_project_id
    AND projects.status = 'active'
  ON CONFLICT (project_id)
  DO UPDATE SET
    action = 'sync_members',
    status = 'pending',
    available_at = pg_catalog.now(),
    claimed_at = NULL,
    last_error = NULL,
    updated_at = pg_catalog.now();
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_slack_member_reconciliation(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enqueue_slack_member_reconciliation_for_project_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_slack_member_reconciliation(OLD.project_id);
    RETURN OLD;
  END IF;

  PERFORM public.enqueue_slack_member_reconciliation(NEW.project_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_slack_member_reconciliation_for_project_member()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER project_members_enqueue_slack_reconciliation
  AFTER INSERT OR UPDATE OR DELETE
  ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_slack_member_reconciliation_for_project_member();

CREATE OR REPLACE FUNCTION public.enqueue_slack_member_reconciliation_for_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team_member_id uuid;
  v_project_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_team_member_id := OLD.team_member_id;
  ELSE
    v_team_member_id := NEW.team_member_id;
  END IF;

  FOR v_project_id IN
    SELECT memberships.project_id
    FROM public.project_members AS memberships
    JOIN public.projects AS projects
      ON projects.id = memberships.project_id
    JOIN public.slack_project_channels AS channels
      ON channels.project_id = memberships.project_id
    WHERE memberships.team_member_id = v_team_member_id
      AND projects.status = 'active'
  LOOP
    PERFORM public.enqueue_slack_member_reconciliation(v_project_id);
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_slack_member_reconciliation_for_mapping()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER slack_user_mappings_enqueue_reconciliation
  AFTER INSERT OR UPDATE OR DELETE
  ON public.slack_user_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_slack_member_reconciliation_for_mapping();

CREATE OR REPLACE FUNCTION public.enqueue_slack_member_reconciliation_for_active_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_id uuid;
BEGIN
  FOR v_project_id IN
    SELECT memberships.project_id
    FROM public.project_members AS memberships
    JOIN public.projects AS projects
      ON projects.id = memberships.project_id
    JOIN public.slack_project_channels AS channels
      ON channels.project_id = memberships.project_id
    WHERE memberships.team_member_id = NEW.id
      AND projects.status = 'active'
  LOOP
    PERFORM public.enqueue_slack_member_reconciliation(v_project_id);
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_slack_member_reconciliation_for_active_status()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER team_members_enqueue_slack_reconciliation
  AFTER UPDATE OF is_active
  ON public.team_members
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.enqueue_slack_member_reconciliation_for_active_status();

CREATE OR REPLACE FUNCTION public.enqueue_slack_channel_description_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.channel_type = 'project' AND NEW.project_id IS NOT NULL THEN
    PERFORM public.enqueue_slack_member_reconciliation(NEW.project_id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_slack_channel_description_sync()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER project_channels_enqueue_slack_description_sync
  AFTER UPDATE OF description
  ON public.project_channels
  FOR EACH ROW
  WHEN (OLD.description IS DISTINCT FROM NEW.description)
  EXECUTE FUNCTION public.enqueue_slack_channel_description_sync();

CREATE OR REPLACE FUNCTION public.enqueue_slack_projects_on_installation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_should_enqueue boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should_enqueue := NEW.is_active;
  ELSE
    v_should_enqueue := NEW.is_active AND (
      OLD.is_active IS DISTINCT FROM NEW.is_active
      OR OLD.encrypted_bot_token IS DISTINCT FROM NEW.encrypted_bot_token
    );
  END IF;

  IF v_should_enqueue THEN
    INSERT INTO public.slack_project_sync_jobs (
      project_id, action, status, available_at, claimed_at, last_error
    )
    SELECT projects.id,
           CASE WHEN mappings.project_id IS NULL THEN 'create' ELSE 'sync_members' END,
           'pending',
           pg_catalog.now(),
           NULL,
           NULL
    FROM public.projects AS projects
    LEFT JOIN public.slack_project_channels AS mappings
      ON mappings.project_id = projects.id
    WHERE projects.status = 'active'
    ON CONFLICT (project_id)
    DO UPDATE SET
      action = EXCLUDED.action,
      status = 'pending',
      available_at = pg_catalog.now(),
      claimed_at = NULL,
      last_error = NULL,
      updated_at = pg_catalog.now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_slack_projects_on_installation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER slack_installations_enqueue_project_sync
  AFTER INSERT OR UPDATE
  ON public.slack_installations
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_slack_projects_on_installation();

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

  SELECT channels.id, members.team_member_id, team.full_name, members.role_name
  INTO v_channel_id, v_member_id, v_member_name, v_role_name
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

INSERT INTO public.slack_project_sync_jobs (
  project_id, action, status, available_at, claimed_at, last_error
)
SELECT projects.id, 'sync_members', 'pending', pg_catalog.now(), NULL, NULL
FROM public.projects AS projects
JOIN public.slack_project_channels AS mappings
  ON mappings.project_id = projects.id
WHERE projects.status = 'active'
ON CONFLICT (project_id)
DO UPDATE SET
  action = 'sync_members',
  status = 'pending',
  available_at = pg_catalog.now(),
  claimed_at = NULL,
  last_error = NULL,
  updated_at = pg_catalog.now();
