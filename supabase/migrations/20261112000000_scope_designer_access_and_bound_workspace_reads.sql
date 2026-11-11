CREATE OR REPLACE FUNCTION public.can_access_inquiry_project(p_inquiry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member' THEN true
    WHEN auth.jwt() -> 'app_metadata' ->> 'access_level' IS DISTINCT FROM 'designer' THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.projects AS projects
      JOIN public.project_members AS memberships
        ON memberships.project_id = projects.id
      JOIN public.team_members AS team
        ON team.id = memberships.team_member_id
      WHERE projects.inquiry_id = p_inquiry_id
        AND team.user_id = auth.uid()
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.can_access_inquiry_project(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_inquiry_project(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_designer_priority_queue()
RETURNS TABLE (
  inquiry_id uuid,
  priority_score smallint,
  status text,
  service text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.jwt() -> 'app_metadata' ->> 'access_level' IS DISTINCT FROM 'designer'
     AND auth.jwt() -> 'app_metadata' ->> 'access_level' IS DISTINCT FROM 'studio_member' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Designer access is required.';
  END IF;

  RETURN QUERY
  SELECT inquiries.id, inquiries.priority_score, inquiries.status::text,
         inquiries.service::text, inquiries.created_at
  FROM public.inquiries AS inquiries
  ORDER BY inquiries.priority_score DESC, inquiries.created_at DESC, inquiries.id
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION public.get_designer_priority_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_designer_priority_queue() TO authenticated;

DROP POLICY IF EXISTS projects_select_for_studio ON public.projects;
CREATE POLICY projects_select_for_studio
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'designer'
      AND public.can_access_inquiry_project(projects.inquiry_id)
    )
  );

DROP POLICY IF EXISTS project_members_select_for_studio ON public.project_members;
CREATE POLICY project_members_select_for_studio
  ON public.project_members
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'designer'
      AND EXISTS (
        SELECT 1
        FROM public.projects
        WHERE projects.id = project_members.project_id
          AND public.can_access_inquiry_project(projects.inquiry_id)
      )
    )
  );

DROP POLICY IF EXISTS project_assignments_select_for_studio ON public.project_assignments;
CREATE POLICY project_assignments_select_for_studio
  ON public.project_assignments
  FOR SELECT
  TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');

DROP POLICY IF EXISTS inquiries_select_for_assigned_designers ON public.inquiries;
CREATE POLICY inquiries_select_for_assigned_designers
  ON public.inquiries
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'access_level' = 'designer'
    AND public.can_access_inquiry_project(inquiries.id)
  );

DROP POLICY IF EXISTS project_briefs_select_for_authenticated ON public.inquiry_briefs;
CREATE POLICY project_briefs_select_for_studio_or_assigned_designers
  ON public.inquiry_briefs
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'designer'
      AND public.can_access_inquiry_project(inquiry_briefs.inquiry_id)
    )
  );

DROP POLICY IF EXISTS project_messages_select_for_designers ON public.project_messages;
CREATE POLICY project_messages_select_for_designers
  ON public.project_messages
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
    OR (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'designer'
      AND public.can_access_inquiry_project(project_messages.inquiry_id)
    )
  );

DROP POLICY IF EXISTS project_messages_insert_for_designers ON public.project_messages;
CREATE POLICY project_messages_insert_for_designers
  ON public.project_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
      AND sender_type = 'team'
      AND sender_id = auth.uid()
    )
    OR (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'designer'
      AND sender_type = 'designer'
      AND sender_id = auth.uid()
      AND public.can_access_inquiry_project(project_messages.inquiry_id)
    )
  );

DROP POLICY IF EXISTS project_request_logs_select_for_designers ON public.project_request_logs;
CREATE POLICY project_request_logs_select_for_studio
  ON public.project_request_logs
  FOR SELECT
  TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');

DROP POLICY IF EXISTS project_request_logs_insert_for_designers ON public.project_request_logs;
DROP POLICY IF EXISTS company_expenses_select_for_designers ON public.company_expenses;
CREATE POLICY company_expenses_select_for_studio
  ON public.company_expenses
  FOR SELECT
  TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');

DROP POLICY IF EXISTS company_expenses_insert_for_designers ON public.company_expenses;

REVOKE INSERT ON TABLE public.project_request_logs, public.company_expenses
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT (inquiry_id, completed_at, payout_amount, payout_currency, status, notes)
  ON TABLE public.project_request_logs FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT (inquiry_id, gross_revenue, total_paid_out, contributor_name, contributor_amount, contributor_role)
  ON TABLE public.company_expenses FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.list_project_channels();
CREATE FUNCTION public.list_project_channels(
  p_limit integer DEFAULT 51,
  p_offset integer DEFAULT 0
)
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
  JOIN public.inquiries AS inquiries
    ON inquiries.id = projects.inquiry_id
  WHERE channels.channel_type = 'project'
  ORDER BY
    channels.is_archived ASC,
    inquiries.priority_score DESC,
    projects.deadline_date ASC NULLS LAST,
    channels.created_at DESC,
    channels.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 51), 1), 51)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.list_project_channels(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_project_channels(integer, integer) TO authenticated;
