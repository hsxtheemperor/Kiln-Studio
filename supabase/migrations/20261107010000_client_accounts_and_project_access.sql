CREATE TABLE public.client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL
    CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 120),
  email text NOT NULL UNIQUE
    CHECK (
      char_length(email) BETWEEN 3 AND 254
      AND email = lower(email)
      AND email = btrim(email)
    ),
  company text
    CHECK (
      company IS NULL
      OR char_length(btrim(company)) BETWEEN 1 AND 120
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_profiles_email_idx
  ON public.client_profiles (email);

CREATE INDEX client_profiles_user_id_idx
  ON public.client_profiles (user_id);

ALTER TABLE public.inquiries
  ADD COLUMN client_id uuid REFERENCES public.client_profiles(id) ON DELETE SET NULL;

CREATE INDEX inquiries_client_id_created_at_id_idx
  ON public.inquiries (client_id, created_at DESC, id DESC);

CREATE FUNCTION public.set_client_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_client_profile_updated_at() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER client_profiles_set_updated_at
  BEFORE UPDATE ON public.client_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_client_profile_updated_at();

ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own profile"
  ON public.client_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Clients can update their own profile"
  ON public.client_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Clients can insert their own profile"
  ON public.client_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Clients can read their own inquiries"
  ON public.inquiries
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'access_level') = 'client'
    AND client_id IS NOT NULL
    AND client_id IN (
      SELECT cp.id
      FROM public.client_profiles cp
      WHERE cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Clients can insert their own inquiries"
  ON public.inquiries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'access_level') = 'client'
    AND client_id IS NOT NULL
    AND client_id IN (
      SELECT cp.id
      FROM public.client_profiles cp
      WHERE cp.user_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.client_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE (full_name, company)
  ON TABLE public.client_profiles TO authenticated;
GRANT SELECT ON TABLE public.client_profiles TO service_role;
GRANT INSERT (user_id, full_name, email, company)
  ON TABLE public.client_profiles TO service_role;
GRANT UPDATE (full_name, company)
  ON TABLE public.client_profiles TO service_role;

REVOKE ALL ON TABLE public.inquiries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.inquiries TO authenticated;
GRANT INSERT (client_id, name, email, company, service, project_brief, budget_range, timeline)
  ON TABLE public.inquiries TO authenticated;
GRANT UPDATE (status) ON TABLE public.inquiries TO authenticated;
GRANT INSERT (name, email, company, service, project_brief, budget_range, timeline)
  ON TABLE public.inquiries TO service_role;
