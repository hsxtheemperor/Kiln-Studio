-- Hardening: tighten table privileges on the tables created by migrations
-- 20261107030000 and 20261107040000.
--
-- Those migrations enabled RLS but never revoked Supabase's default grants, so
-- anon / authenticated / service_role currently hold every table privilege
-- (including TRUNCATE, which bypasses RLS) on these tables. This migration
-- revokes all of it and re-grants only what the application's RLS policies
-- actually use. Policies are unchanged here; see the next migration for the
-- claim fix.
--
-- Grants kept (authenticated only):
--   * SELECT on all eight tables
--   * column-level INSERT on project_messages, project_request_logs,
--     company_expenses, project_channel_messages (matches the existing INSERT
--     policies; no UPDATE or DELETE policies exist for these tables)
-- Nothing is granted to anon or service_role: no application path uses the
-- service-role key on these tables. Add a narrow grant later if one is needed.
--
-- SECURITY DEFINER trigger functions run as the table owner and are not
-- affected by these revokes.

REVOKE ALL ON TABLE
  public.project_messages,
  public.project_request_logs,
  public.company_expenses,
  public.team_members,
  public.project_assignments,
  public.project_channels,
  public.project_channel_members,
  public.project_channel_messages
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.project_messages,
  public.project_request_logs,
  public.company_expenses,
  public.team_members,
  public.project_assignments,
  public.project_channels,
  public.project_channel_members,
  public.project_channel_messages
TO authenticated;

GRANT INSERT (inquiry_id, sender_type, sender_id, sender_name, body)
  ON TABLE public.project_messages TO authenticated;

GRANT INSERT (inquiry_id, completed_at, payout_amount, payout_currency, status, notes)
  ON TABLE public.project_request_logs TO authenticated;

GRANT INSERT (inquiry_id, gross_revenue, total_paid_out, contributor_name, contributor_amount, contributor_role)
  ON TABLE public.company_expenses TO authenticated;

GRANT INSERT (channel_id, sender_member_id, sender_name, sender_role, body)
  ON TABLE public.project_channel_messages TO authenticated;

-- Shared updated_at trigger function from migration 20261107030000 had a
-- mutable search_path (Supabase security advisor warning) and was executable
-- by API roles. Pin the search_path and revoke EXECUTE like the other trigger
-- functions in this schema.
CREATE OR REPLACE FUNCTION public.set_project_messages_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_messages_updated_at() FROM PUBLIC, anon, authenticated, service_role;
