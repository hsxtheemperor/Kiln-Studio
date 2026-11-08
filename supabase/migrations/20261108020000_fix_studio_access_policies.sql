-- Fix: studio/designer access policies on tables from migrations
-- 20261107030000 and 20261107040000 read a top-level JWT claim
-- (auth.jwt() ->> 'access_level'). The app stores the trusted access level in
-- app_metadata, so those policies never matched a studio member or designer.
-- The fallback on auth.jwt() ->> 'role' could not match either: that claim is
-- always 'authenticated' / 'anon' / 'service_role'.
--
-- Recreate them to check the trusted app_metadata claim, the same one the
-- inquiries, products and channel policies already use. The set of allowed
-- levels and the operations allowed are unchanged: SELECT everywhere, plus
-- INSERT on project_messages, project_request_logs and company_expenses.
--
-- Not changed here (product decisions to review before storing real data):
--   * project_request_logs and company_expenses (payouts, revenue) stay
--     readable/insertable by designers as well as studio members.
--   * project_messages / project_channel_messages do not force sender_id or
--     sender_member_id to equal the caller, so a sender identity can be set
--     by the inserting user.

DROP POLICY IF EXISTS team_members_select_for_studio ON public.team_members;
CREATE POLICY team_members_select_for_studio
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'access_level') IN ('designer', 'studio_member')
  );

DROP POLICY IF EXISTS project_assignments_select_for_studio ON public.project_assignments;
CREATE POLICY project_assignments_select_for_studio
  ON public.project_assignments
  FOR SELECT
  TO authenticated
  USING (
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'access_level') IN ('designer', 'studio_member')
  );

DROP POLICY IF EXISTS project_messages_select_for_designers ON public.project_messages;
CREATE POLICY project_messages_select_for_designers
  ON public.project_messages
  FOR SELECT
  TO authenticated
  USING (
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'access_level') IN ('designer', 'studio_member')
  );

DROP POLICY IF EXISTS project_messages_insert_for_designers ON public.project_messages;
CREATE POLICY project_messages_insert_for_designers
  ON public.project_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'access_level') IN ('designer', 'studio_member')
  );

DROP POLICY IF EXISTS project_request_logs_select_for_designers ON public.project_request_logs;
CREATE POLICY project_request_logs_select_for_designers
  ON public.project_request_logs
  FOR SELECT
  TO authenticated
  USING (
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'access_level') IN ('designer', 'studio_member')
  );

DROP POLICY IF EXISTS project_request_logs_insert_for_designers ON public.project_request_logs;
CREATE POLICY project_request_logs_insert_for_designers
  ON public.project_request_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'access_level') IN ('designer', 'studio_member')
  );

DROP POLICY IF EXISTS company_expenses_select_for_designers ON public.company_expenses;
CREATE POLICY company_expenses_select_for_designers
  ON public.company_expenses
  FOR SELECT
  TO authenticated
  USING (
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'access_level') IN ('designer', 'studio_member')
  );

DROP POLICY IF EXISTS company_expenses_insert_for_designers ON public.company_expenses;
CREATE POLICY company_expenses_insert_for_designers
  ON public.company_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((SELECT auth.jwt()) -> 'app_metadata' ->> 'access_level') IN ('designer', 'studio_member')
  );
