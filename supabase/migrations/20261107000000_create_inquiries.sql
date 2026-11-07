CREATE TABLE public.inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  email text NOT NULL
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
  service text
    CHECK (service IS NULL OR service IN ('brand_identity', 'web_design', 'product_design')),
  project_brief text NOT NULL
    CHECK (char_length(btrim(project_brief)) BETWEEN 1 AND 5000),
  budget_range text
    CHECK (
      budget_range IS NULL
      OR budget_range IN ('under_5k', '5k_10k', '10k_25k', '25k_50k', '50k_plus', 'not_sure')
    ),
  timeline text
      CHECK (
        timeline IS NULL
        OR char_length(btrim(timeline)) BETWEEN 1 AND 120
      ),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'in_progress', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inquiries_created_at_id_idx
  ON public.inquiries (created_at DESC, id DESC);

CREATE INDEX inquiries_status_created_at_id_idx
  ON public.inquiries (status, created_at DESC, id DESC);

CREATE FUNCTION public.set_inquiry_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_inquiry_updated_at() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER inquiries_set_updated_at
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inquiry_updated_at();

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Studio members can read inquiries"
  ON public.inquiries
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'access_level') = 'studio_member');

CREATE POLICY "Studio members can update inquiry status"
  ON public.inquiries
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'access_level') = 'studio_member')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'access_level') = 'studio_member');

REVOKE ALL ON TABLE public.inquiries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.inquiries TO authenticated;
GRANT UPDATE (status) ON TABLE public.inquiries TO authenticated;
GRANT INSERT (name, email, company, service, project_brief, budget_range, timeline)
  ON TABLE public.inquiries TO service_role;
