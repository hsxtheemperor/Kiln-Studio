ALTER TABLE public.inquiries
  DROP CONSTRAINT IF EXISTS inquiries_status_check;

ALTER TABLE public.inquiries
  ADD CONSTRAINT inquiries_status_check
  CHECK (status IN ('new', 'contacted', 'accepted', 'in_progress', 'closed'));

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL UNIQUE REFERENCES public.inquiries(id) ON DELETE RESTRICT,
  project_name text NOT NULL CHECK (char_length(btrim(project_name)) BETWEEN 1 AND 160),
  deadline_date date,
  project_manager_id uuid REFERENCES public.team_members(id) ON DELETE RESTRICT,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_project_manager_id_idx
  ON public.projects (project_manager_id)
  WHERE project_manager_id IS NOT NULL;

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  role_name text NOT NULL CHECK (char_length(btrim(role_name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, team_member_id)
);

CREATE UNIQUE INDEX project_members_single_pm_idx
  ON public.project_members (project_id)
  WHERE role_name = 'PROJECT_MANAGER';

CREATE INDEX project_members_team_member_idx
  ON public.project_members (team_member_id, project_id);

ALTER TABLE public.project_channels
  ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.project_channels
  ADD COLUMN is_archived boolean NOT NULL DEFAULT false;

UPDATE public.project_channels
SET is_archived = true
WHERE channel_type = 'project'
  AND project_id IS NULL;

ALTER TABLE public.project_channels
  DROP CONSTRAINT IF EXISTS project_channels_type_check;

ALTER TABLE public.project_channels
  DROP CONSTRAINT IF EXISTS project_channels_channel_type_check;

ALTER TABLE public.project_channels
  ADD CONSTRAINT project_channels_type_check
  CHECK (channel_type IN ('project', 'general', 'announcement', 'system'));

CREATE UNIQUE INDEX project_channels_project_id_idx
  ON public.project_channels (project_id)
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX project_channels_system_channel_idx
  ON public.project_channels (channel_type)
  WHERE channel_type = 'system';

CREATE OR REPLACE FUNCTION public.is_project_channel_member(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_channel_members AS memberships
    JOIN public.team_members AS team
      ON team.id = memberships.team_member_id
    JOIN public.project_channels AS channels
      ON channels.id = memberships.channel_id
    WHERE memberships.channel_id = p_channel_id
      AND team.user_id = auth.uid()
      AND channels.project_id IS NOT NULL
      AND channels.is_archived = false
  );
$$;

REVOKE ALL ON FUNCTION public.is_project_channel_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_channel_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.require_project_for_new_project_channel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.channel_type = 'project' AND NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'A project channel must belong to a project.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.require_project_for_new_project_channel() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER project_channels_require_project_on_insert
  BEFORE INSERT
  ON public.project_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.require_project_for_new_project_channel();

CREATE TRIGGER project_channels_require_project_on_update
  BEFORE UPDATE OF channel_type, project_id
  ON public.project_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.require_project_for_new_project_channel();

CREATE OR REPLACE FUNCTION public.set_project_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_updated_at() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_non_admin_pm_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.project_manager_id IS DISTINCT FROM NEW.project_manager_id
    AND auth.jwt() -> 'app_metadata' ->> 'access_level' IS DISTINCT FROM 'studio_member'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only a studio admin can assign or change a project manager.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_non_admin_pm_changes() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER projects_pm_changes_are_admin_only
  BEFORE UPDATE OF project_manager_id
  ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_non_admin_pm_changes();

CREATE OR REPLACE FUNCTION public.create_project_for_accepted_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'accepted'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
  THEN
    INSERT INTO public.projects (inquiry_id, project_name, created_by)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(pg_catalog.btrim(NEW.company), ''), NEW.name || ' project'),
      auth.uid()
    )
    ON CONFLICT (inquiry_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_for_accepted_inquiry() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER inquiries_create_project_on_acceptance_insert
  AFTER INSERT
  ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.create_project_for_accepted_inquiry();

CREATE TRIGGER inquiries_create_project_on_acceptance_update
  AFTER UPDATE OF status
  ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.create_project_for_accepted_inquiry();

CREATE OR REPLACE FUNCTION public.create_project_channel_and_sync_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  previous_manager uuid;
BEGIN
  INSERT INTO public.project_channels (
    project_id,
    channel_name,
    channel_type,
    moderator_member_id
  )
  VALUES (
    NEW.id,
    NEW.project_name,
    'project',
    NEW.project_manager_id
  )
  ON CONFLICT (project_id)
  WHERE project_id IS NOT NULL
  DO UPDATE SET
    channel_name = EXCLUDED.channel_name,
    moderator_member_id = EXCLUDED.moderator_member_id;

  PERFORM public.refresh_project_channel_description(NEW.id);

  IF TG_OP = 'UPDATE' THEN
    previous_manager := OLD.project_manager_id;
  END IF;

  IF previous_manager IS DISTINCT FROM NEW.project_manager_id THEN
    IF previous_manager IS NOT NULL THEN
      UPDATE public.project_members
      SET role_name = 'TEAM_MEMBER'
      WHERE project_id = NEW.id
        AND team_member_id = previous_manager
        AND role_name = 'PROJECT_MANAGER';

      UPDATE public.project_channel_members
      SET role = 'member'
      WHERE channel_id = (
          SELECT id
          FROM public.project_channels
          WHERE project_id = NEW.id
        )
        AND team_member_id = previous_manager;
    END IF;

    IF NEW.project_manager_id IS NOT NULL THEN
      INSERT INTO public.project_members (project_id, team_member_id, role_name)
      VALUES (NEW.id, NEW.project_manager_id, 'PROJECT_MANAGER')
      ON CONFLICT (project_id, team_member_id)
      DO UPDATE SET role_name = EXCLUDED.role_name;

      INSERT INTO public.project_channel_members (channel_id, team_member_id, role)
      SELECT id, NEW.project_manager_id, 'moderator'
      FROM public.project_channels
      WHERE project_id = NEW.id
      ON CONFLICT (channel_id, team_member_id)
      DO UPDATE SET role = EXCLUDED.role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_channel_and_sync_manager() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER projects_create_channel_and_sync_manager_insert
  AFTER INSERT
  ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.create_project_channel_and_sync_manager();

CREATE TRIGGER projects_create_channel_and_sync_manager_update
  AFTER UPDATE OF project_name, project_manager_id
  ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.create_project_channel_and_sync_manager();

CREATE OR REPLACE FUNCTION public.sync_project_member_to_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_channel_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT id INTO v_channel_id
    FROM public.project_channels
    WHERE project_id = OLD.project_id;

    IF v_channel_id IS NOT NULL THEN
      DELETE FROM public.project_channel_members
      WHERE project_channel_members.channel_id = v_channel_id
        AND team_member_id = OLD.team_member_id;
    END IF;

    RETURN OLD;
  END IF;

  SELECT id INTO v_channel_id
  FROM public.project_channels
  WHERE project_id = NEW.project_id;

  IF v_channel_id IS NOT NULL THEN
    INSERT INTO public.project_channel_members (channel_id, team_member_id, role)
    VALUES (
      v_channel_id,
      NEW.team_member_id,
      CASE WHEN NEW.role_name = 'PROJECT_MANAGER' THEN 'moderator' ELSE 'member' END
    )
    ON CONFLICT (channel_id, team_member_id)
    DO UPDATE SET role = EXCLUDED.role;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_project_member_to_channel() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER project_members_sync_channel_insert_delete
  AFTER INSERT OR DELETE
  ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_project_member_to_channel();

CREATE TRIGGER project_members_sync_channel_update
  AFTER UPDATE OF role_name
  ON public.project_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_project_member_to_channel();

CREATE OR REPLACE FUNCTION public.sync_new_team_member_to_system_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.project_channel_members (channel_id, team_member_id, role)
  SELECT id, NEW.id, 'member'
  FROM public.project_channels
  WHERE channel_type = 'system'
  ON CONFLICT (channel_id, team_member_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_new_team_member_to_system_channel() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER team_members_join_system_channel
  AFTER INSERT ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_new_team_member_to_system_channel();

INSERT INTO public.project_channels (channel_name, channel_type)
VALUES ('System activity', 'system')
ON CONFLICT (channel_type) WHERE channel_type = 'system' DO NOTHING;

INSERT INTO public.project_channel_members (channel_id, team_member_id, role)
SELECT channels.id, members.id, 'member'
FROM public.project_channels AS channels
CROSS JOIN public.team_members AS members
WHERE channels.channel_type = 'system'
ON CONFLICT (channel_id, team_member_id) DO NOTHING;

CREATE TABLE public.system_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.project_channels(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  record_id uuid,
  operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_columns text[] NOT NULL DEFAULT ARRAY[]::text[],
  actor_user_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX system_activity_logs_occurred_at_idx
  ON public.system_activity_logs (occurred_at DESC, id DESC);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select_for_studio
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'access_level',
      auth.jwt() ->> 'role'
    ) IN ('studio_member', 'designer')
  );

CREATE POLICY projects_update_for_admin_or_pm
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
    OR EXISTS (
      SELECT 1
      FROM public.project_members AS members
      JOIN public.team_members AS team
        ON team.id = members.team_member_id
      WHERE members.project_id = projects.id
        AND members.role_name = 'PROJECT_MANAGER'
        AND team.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
    OR EXISTS (
      SELECT 1
      FROM public.project_members AS members
      JOIN public.team_members AS team
        ON team.id = members.team_member_id
      WHERE members.project_id = projects.id
        AND members.role_name = 'PROJECT_MANAGER'
        AND team.user_id = auth.uid()
    )
  );

CREATE POLICY project_members_select_for_studio
  ON public.project_members
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'access_level',
      auth.jwt() ->> 'role'
    ) IN ('studio_member', 'designer')
  );

CREATE POLICY project_members_insert_for_admin_or_pm
  ON public.project_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    role_name <> 'PROJECT_MANAGER'
    AND (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
      OR EXISTS (
        SELECT 1
        FROM public.project_members AS managers
        JOIN public.team_members AS team
          ON team.id = managers.team_member_id
        WHERE managers.project_id = project_members.project_id
          AND managers.role_name = 'PROJECT_MANAGER'
          AND team.user_id = auth.uid()
      )
    )
  );

CREATE POLICY project_members_update_for_admin_or_pm
  ON public.project_members
  FOR UPDATE
  TO authenticated
  USING (
    role_name <> 'PROJECT_MANAGER'
    AND (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
      OR EXISTS (
        SELECT 1
        FROM public.project_members AS managers
        JOIN public.team_members AS team
          ON team.id = managers.team_member_id
        WHERE managers.project_id = project_members.project_id
          AND managers.role_name = 'PROJECT_MANAGER'
          AND team.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    role_name <> 'PROJECT_MANAGER'
    AND (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
      OR EXISTS (
        SELECT 1
        FROM public.project_members AS managers
        JOIN public.team_members AS team
          ON team.id = managers.team_member_id
        WHERE managers.project_id = project_members.project_id
          AND managers.role_name = 'PROJECT_MANAGER'
          AND team.user_id = auth.uid()
      )
    )
  );

CREATE POLICY project_members_delete_for_admin_or_pm
  ON public.project_members
  FOR DELETE
  TO authenticated
  USING (
    role_name <> 'PROJECT_MANAGER'
    AND (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
      OR EXISTS (
        SELECT 1
        FROM public.project_members AS managers
        JOIN public.team_members AS team
          ON team.id = managers.team_member_id
        WHERE managers.project_id = project_members.project_id
          AND managers.role_name = 'PROJECT_MANAGER'
          AND team.user_id = auth.uid()
      )
    )
  );

CREATE POLICY system_activity_logs_select_for_studio
  ON public.system_activity_logs
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'access_level',
      auth.jwt() ->> 'role'
    ) IN ('studio_member', 'designer')
  );

REVOKE ALL ON TABLE public.projects FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.project_members FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.system_activity_logs FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.projects TO authenticated;
GRANT UPDATE (project_name, deadline_date, project_manager_id)
  ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE (role_name), DELETE
  ON TABLE public.project_members TO authenticated;
GRANT SELECT ON TABLE public.system_activity_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_application_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_data jsonb;
  new_data jsonb;
  row_data jsonb;
  changed text[];
  system_channel_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_data := pg_catalog.to_jsonb(NEW);
    row_data := new_data;
    SELECT COALESCE(pg_catalog.array_agg(keys.key ORDER BY keys.key), ARRAY[]::text[])
    INTO changed
    FROM pg_catalog.jsonb_object_keys(new_data) AS keys(key);
  ELSIF TG_OP = 'UPDATE' THEN
    old_data := pg_catalog.to_jsonb(OLD);
    new_data := pg_catalog.to_jsonb(NEW);
    row_data := new_data;
    SELECT COALESCE(pg_catalog.array_agg(new_values.key ORDER BY new_values.key), ARRAY[]::text[])
    INTO changed
    FROM pg_catalog.jsonb_each(new_data) AS new_values
    FULL JOIN pg_catalog.jsonb_each(old_data) AS old_values USING (key)
    WHERE new_values.value IS DISTINCT FROM old_values.value;
  ELSE
    old_data := pg_catalog.to_jsonb(OLD);
    row_data := old_data;
    SELECT COALESCE(pg_catalog.array_agg(keys.key ORDER BY keys.key), ARRAY[]::text[])
    INTO changed
    FROM pg_catalog.jsonb_object_keys(old_data) AS keys(key);
  END IF;

  SELECT id INTO system_channel_id
  FROM public.project_channels
  WHERE channel_type = 'system';

  INSERT INTO public.system_activity_logs (
    channel_id,
    table_name,
    record_id,
    operation,
    changed_columns,
    actor_user_id
  )
  VALUES (
    system_channel_id,
    TG_TABLE_NAME,
    NULLIF(row_data ->> 'id', '')::uuid,
    TG_OP,
    changed,
    auth.uid()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_application_row_change() FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'inquiries',
    'client_profiles',
    'client_companies',
    'project_briefs',
    'project_messages',
    'project_request_logs',
    'company_expenses',
    'team_members',
    'project_assignments',
    'project_channels',
    'project_channel_members',
    'project_channel_messages',
    'projects',
    'project_members'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_application_row_change()',
      table_name || '_system_activity_audit',
      table_name
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS project_channels_select_for_studio ON public.project_channels;
CREATE POLICY project_channels_select_for_studio
  ON public.project_channels
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'access_level',
      auth.jwt() ->> 'role'
    ) IN ('studio_member', 'designer')
    AND (
      channel_type IN ('general', 'announcement', 'system')
      OR (
        project_id IS NOT NULL
        AND is_archived = false
        AND public.is_project_channel_member(project_channels.id)
      )
    )
  );

DROP POLICY IF EXISTS project_channel_members_select_for_studio ON public.project_channel_members;
CREATE POLICY project_channel_members_select_for_studio
  ON public.project_channel_members
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'access_level',
      auth.jwt() ->> 'role'
    ) IN ('studio_member', 'designer')
    AND (
      EXISTS (
        SELECT 1
        FROM public.project_channels AS channels
        WHERE channels.id = project_channel_members.channel_id
          AND channels.channel_type IN ('general', 'announcement', 'system')
      )
      OR public.is_project_channel_member(project_channel_members.channel_id)
    )
  );

DROP POLICY IF EXISTS project_channel_messages_select_for_studio ON public.project_channel_messages;
CREATE POLICY project_channel_messages_select_for_studio
  ON public.project_channel_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_channels AS channels
      WHERE channels.id = project_channel_messages.channel_id
        AND (
          channels.channel_type IN ('general', 'announcement', 'system')
          OR public.is_project_channel_member(channels.id)
        )
    )
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'access_level',
      auth.jwt() ->> 'role'
    ) IN ('studio_member', 'designer')
  );

DROP POLICY IF EXISTS project_channel_messages_insert_for_studio ON public.project_channel_messages;
CREATE POLICY project_channel_messages_insert_for_studio
  ON public.project_channel_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.project_channels AS channels
      WHERE channels.id = project_channel_messages.channel_id
        AND (
          channels.channel_type = 'general'
          OR (
            channels.channel_type = 'announcement'
            AND auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
          )
          OR (
            channels.channel_type = 'project'
            AND public.is_project_channel_member(channels.id)
          )
        )
    )
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'access_level',
      auth.jwt() ->> 'role'
    ) IN ('studio_member', 'designer')
  );

ALTER TABLE public.projects
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed')),
  ADD COLUMN completed_at timestamptz;

GRANT UPDATE (status) ON TABLE public.projects TO authenticated;

ALTER TABLE public.project_channels
  ADD COLUMN description text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.refresh_project_channel_description(p_project_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.project_channels AS channels
  SET description = pg_catalog.concat_ws(
    E'\n',
    'Inquiry details',
    'Contact: ' || inquiries.name,
    'Email: ' || inquiries.email,
    CASE WHEN inquiries.company IS NOT NULL THEN 'Company: ' || inquiries.company END,
    CASE WHEN inquiries.service IS NOT NULL THEN 'Service: ' || inquiries.service END,
    CASE WHEN inquiries.budget_range IS NOT NULL THEN 'Budget: ' || inquiries.budget_range END,
    CASE WHEN inquiries.timeline IS NOT NULL THEN 'Timeline: ' || inquiries.timeline END,
    'Brief: ' || inquiries.project_brief,
    CASE WHEN briefs.design_goal IS NOT NULL AND briefs.design_goal <> '' THEN 'Design goal: ' || briefs.design_goal END,
    CASE WHEN briefs.brand_message IS NOT NULL AND briefs.brand_message <> '' THEN 'Brand message: ' || briefs.brand_message END,
    CASE WHEN briefs.target_audience IS NOT NULL THEN 'Target audience: ' || briefs.target_audience END,
    CASE WHEN briefs.desired_outcomes IS NOT NULL THEN 'Desired outcomes: ' || briefs.desired_outcomes END,
    CASE WHEN briefs."references" IS NOT NULL THEN 'References: ' || briefs."references" END,
    CASE WHEN briefs.time_budget IS NOT NULL THEN 'Time budget: ' || briefs.time_budget END,
    CASE WHEN briefs.design_complexity IS NOT NULL THEN 'Design complexity: ' || briefs.design_complexity::text END,
    CASE
      WHEN briefs.priority_score IS NOT NULL
      THEN 'Priority: ' || COALESCE(briefs.priority_label, 'unknown') || ' (' || briefs.priority_score::text || '/10)'
    END
  )
  FROM public.projects AS projects
  JOIN public.inquiries AS inquiries
    ON inquiries.id = projects.inquiry_id
  LEFT JOIN public.project_briefs AS briefs
    ON briefs.inquiry_id = inquiries.id
  WHERE projects.id = p_project_id
    AND channels.project_id = projects.id;
$$;

REVOKE ALL ON FUNCTION public.refresh_project_channel_description(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_channel_description_from_inquiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_inquiry_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_inquiry_id := OLD.id;
  ELSE
    affected_inquiry_id := NEW.id;
  END IF;

  PERFORM public.refresh_project_channel_description(projects.id)
  FROM public.projects
  WHERE projects.inquiry_id = affected_inquiry_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_channel_description_from_inquiry() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER inquiries_refresh_project_channel_description
  AFTER UPDATE OF name, email, company, service, budget_range, timeline, project_brief
  ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_channel_description_from_inquiry();

CREATE OR REPLACE FUNCTION public.refresh_channel_description_from_brief()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_inquiry_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_inquiry_id := OLD.inquiry_id;
  ELSE
    affected_inquiry_id := NEW.inquiry_id;
  END IF;

  PERFORM public.refresh_project_channel_description(projects.id)
  FROM public.projects
  WHERE projects.inquiry_id = affected_inquiry_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_channel_description_from_brief() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER project_briefs_refresh_project_channel_description
  AFTER INSERT OR UPDATE OR DELETE
  ON public.project_briefs
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_channel_description_from_brief();

CREATE OR REPLACE FUNCTION public.enforce_project_completion_by_manager()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
    RAISE EXCEPTION 'A completed project cannot be reopened.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'completed' THEN
    IF NOT public.is_project_manager(NEW.id) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Only the project manager can complete this project.';
    END IF;

    NEW.completed_at := pg_catalog.now();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_project_completion_by_manager() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER projects_completion_requires_manager
  BEFORE UPDATE OF status
  ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_project_completion_by_manager();

CREATE OR REPLACE FUNCTION public.archive_completed_project_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    UPDATE public.project_channels
    SET is_archived = true
    WHERE project_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_completed_project_channel() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER projects_archive_channel_on_completion
  AFTER UPDATE OF status
  ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_completed_project_channel();

CREATE OR REPLACE FUNCTION public.is_project_channel_member(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_channel_members AS memberships
    JOIN public.team_members AS team
      ON team.id = memberships.team_member_id
    JOIN public.project_channels AS channels
      ON channels.id = memberships.channel_id
    WHERE memberships.channel_id = p_channel_id
      AND team.user_id = auth.uid()
      AND channels.project_id IS NOT NULL
  )
  OR auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member';
$$;

CREATE OR REPLACE FUNCTION public.list_project_channels()
RETURNS SETOF public.project_channels
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT channels.*
  FROM public.project_channels AS channels
  JOIN public.projects AS projects
    ON projects.id = channels.project_id
  LEFT JOIN public.project_briefs AS briefs
    ON briefs.inquiry_id = projects.inquiry_id
  WHERE channels.channel_type = 'project'
  ORDER BY
    channels.is_archived ASC,
    COALESCE(briefs.priority_score, 0) DESC,
    projects.deadline_date ASC NULLS LAST,
    channels.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_project_channels() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_project_channels() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_project_manager(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members AS members
    JOIN public.team_members AS team
      ON team.id = members.team_member_id
    WHERE members.project_id = p_project_id
      AND members.role_name = 'PROJECT_MANAGER'
      AND team.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_project_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_manager(uuid) TO authenticated;

DROP POLICY IF EXISTS projects_update_for_admin_or_pm ON public.projects;
CREATE POLICY projects_update_for_admin_or_pm
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
    OR public.is_project_manager(projects.id)
  )
  WITH CHECK (
    auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
    OR public.is_project_manager(projects.id)
  );

DROP POLICY IF EXISTS project_members_insert_for_admin_or_pm ON public.project_members;
CREATE POLICY project_members_insert_for_admin_or_pm
  ON public.project_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    role_name <> 'PROJECT_MANAGER'
    AND (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
      OR public.is_project_manager(project_members.project_id)
    )
  );

DROP POLICY IF EXISTS project_members_update_for_admin_or_pm ON public.project_members;
CREATE POLICY project_members_update_for_admin_or_pm
  ON public.project_members
  FOR UPDATE
  TO authenticated
  USING (
    role_name <> 'PROJECT_MANAGER'
    AND (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
      OR public.is_project_manager(project_members.project_id)
    )
  )
  WITH CHECK (
    role_name <> 'PROJECT_MANAGER'
    AND (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
      OR public.is_project_manager(project_members.project_id)
    )
  );

DROP POLICY IF EXISTS project_members_delete_for_admin_or_pm ON public.project_members;
CREATE POLICY project_members_delete_for_admin_or_pm
  ON public.project_members
  FOR DELETE
  TO authenticated
  USING (
    role_name <> 'PROJECT_MANAGER'
    AND (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
      OR public.is_project_manager(project_members.project_id)
    )
  );

DROP POLICY IF EXISTS project_channels_select_for_studio ON public.project_channels;
CREATE POLICY project_channels_select_for_studio
  ON public.project_channels
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'access_level',
      auth.jwt() ->> 'role'
    ) IN ('studio_member', 'designer')
    AND (
      channel_type IN ('general', 'announcement', 'system')
      OR (
        project_id IS NOT NULL
        AND public.is_project_channel_member(project_channels.id)
      )
    )
  );

DROP POLICY IF EXISTS project_channel_messages_insert_for_studio ON public.project_channel_messages;
CREATE POLICY project_channel_messages_insert_for_studio
  ON public.project_channel_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.project_channels AS channels
      WHERE channels.id = project_channel_messages.channel_id
        AND (
          channels.channel_type = 'general'
          OR (
            channels.channel_type = 'announcement'
            AND auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
          )
          OR (
            channels.channel_type = 'project'
            AND channels.is_archived = false
            AND public.is_project_channel_member(channels.id)
          )
        )
    )
    AND COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'access_level',
      auth.jwt() ->> 'role'
    ) IN ('studio_member', 'designer')
  );
