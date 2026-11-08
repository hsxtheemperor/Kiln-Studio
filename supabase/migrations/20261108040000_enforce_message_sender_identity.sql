DROP POLICY IF EXISTS project_messages_insert_for_designers ON public.project_messages;
CREATE POLICY project_messages_insert_for_designers
  ON public.project_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'designer'
      AND sender_type = 'designer'
      AND sender_id = auth.uid()
    )
    OR (
      auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
      AND sender_type = 'team'
      AND sender_id = auth.uid()
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
    AND EXISTS (
      SELECT 1
      FROM public.team_members AS team
      WHERE team.id = project_channel_messages.sender_member_id
        AND team.user_id = auth.uid()
        AND team.full_name = project_channel_messages.sender_name
    )
  );
