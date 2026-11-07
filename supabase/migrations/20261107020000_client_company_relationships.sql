CREATE TABLE IF NOT EXISTS public.client_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  company_name text NOT NULL
    CHECK (
      char_length(btrim(company_name)) BETWEEN 1 AND 120
    ),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, company_name)
);

CREATE INDEX IF NOT EXISTS client_companies_client_id_idx
  ON public.client_companies (client_id, is_primary DESC, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_client_company_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_companies_set_updated_at ON public.client_companies;
CREATE TRIGGER client_companies_set_updated_at
  BEFORE UPDATE ON public.client_companies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_client_company_updated_at();

INSERT INTO public.client_companies (client_id, company_name, is_primary)
SELECT cp.id, cp.company, true
FROM public.client_profiles cp
WHERE cp.company IS NOT NULL
ON CONFLICT (client_id, company_name) DO NOTHING;

ALTER TABLE public.client_profiles
  DROP COLUMN IF EXISTS company;

ALTER TABLE public.client_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view their own companies"
  ON public.client_companies
  FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT cp.id
      FROM public.client_profiles cp
      WHERE cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Clients can insert their own companies"
  ON public.client_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id IN (
      SELECT cp.id
      FROM public.client_profiles cp
      WHERE cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Clients can update their own companies"
  ON public.client_companies
  FOR UPDATE
  TO authenticated
  USING (
    client_id IN (
      SELECT cp.id
      FROM public.client_profiles cp
      WHERE cp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT cp.id
      FROM public.client_profiles cp
      WHERE cp.user_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.client_companies FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE (company_name, is_primary)
  ON TABLE public.client_companies TO authenticated;
GRANT SELECT ON TABLE public.client_companies TO service_role;
GRANT INSERT (client_id, company_name, is_primary)
  ON TABLE public.client_companies TO service_role;
GRANT UPDATE (company_name, is_primary)
  ON TABLE public.client_companies TO service_role;
