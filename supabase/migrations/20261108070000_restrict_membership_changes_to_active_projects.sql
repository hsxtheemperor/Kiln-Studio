DROP POLICY IF EXISTS project_members_insert_for_admin_or_pm ON public.project_members;
CREATE POLICY project_members_insert_for_admin_or_pm
  ON public.project_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    role_name <> 'PROJECT_MANAGER'
    AND EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_members.project_id
        AND projects.status = 'active'
    )
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'access_level' = 'studio_member'
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
    AND EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_members.project_id
        AND projects.status = 'active'
    )
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'access_level' = 'studio_member'
      OR public.is_project_manager(project_members.project_id)
    )
  )
  WITH CHECK (
    role_name <> 'PROJECT_MANAGER'
    AND EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_members.project_id
        AND projects.status = 'active'
    )
    AND (
      (SELECT auth.jwt()) -> 'app_metadata' ->> 'access_level' = 'studio_member'
      OR public.is_project_manager(project_members.project_id)
    )
  );
