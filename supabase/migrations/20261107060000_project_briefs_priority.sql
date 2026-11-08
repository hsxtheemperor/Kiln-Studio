CREATE TABLE IF NOT EXISTS public.project_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL UNIQUE REFERENCES public.inquiries(id) ON DELETE CASCADE,
  design_goal text NOT NULL DEFAULT ''
    CHECK (char_length(btrim(design_goal)) <= 1200),
  brand_message text NOT NULL DEFAULT ''
    CHECK (char_length(btrim(brand_message)) <= 1200),
  target_audience text
    CHECK (target_audience IS NULL OR char_length(btrim(target_audience)) <= 600),
  desired_outcomes text
    CHECK (desired_outcomes IS NULL OR char_length(btrim(desired_outcomes)) <= 1200),
  "references" text
    CHECK ("references" IS NULL OR char_length(btrim("references")) <= 1200),
  time_budget text
    CHECK (time_budget IS NULL OR char_length(btrim(time_budget)) <= 120),
  design_complexity smallint
    CHECK (design_complexity IS NULL OR (design_complexity >= 0 AND design_complexity <= 10)),
  priority_score smallint NOT NULL DEFAULT 0
    CHECK (priority_score >= 0 AND priority_score <= 10),
  priority_label text NOT NULL DEFAULT 'unknown'
    CHECK (priority_label IN ('unknown', 'low', 'medium', 'high', 'urgent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_briefs_inquiry_id_idx
  ON public.project_briefs (inquiry_id, priority_score DESC);

CREATE INDEX IF NOT EXISTS project_briefs_priority_score_idx
  ON public.project_briefs (priority_score DESC, created_at DESC);

CREATE FUNCTION public.set_project_briefs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_briefs_updated_at() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER project_briefs_set_updated_at
  BEFORE UPDATE ON public.project_briefs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_briefs_updated_at();

ALTER TABLE public.project_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_briefs_select_for_authenticated ON public.project_briefs;
DROP POLICY IF EXISTS project_briefs_insert_for_service_role ON public.project_briefs;
DROP POLICY IF EXISTS project_briefs_update_for_service_role ON public.project_briefs;

CREATE POLICY project_briefs_select_for_authenticated
  ON public.project_briefs
  FOR SELECT
  TO authenticated
  USING (
    auth.jwt() -> 'app_metadata' ->> 'access_level' IN ('studio_member', 'designer')
    OR auth.jwt() ->> 'role' IN ('studio_member', 'designer')
  );

CREATE POLICY project_briefs_insert_for_service_role
  ON public.project_briefs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY project_briefs_update_for_service_role
  ON public.project_briefs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.project_briefs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_briefs TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.project_briefs TO service_role;
