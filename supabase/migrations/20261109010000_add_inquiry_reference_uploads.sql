INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'inquiry-references',
  'inquiry-references',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.inquiry_reference_files (
  id uuid PRIMARY KEY,
  inquiry_id uuid REFERENCES public.inquiries(id) ON DELETE CASCADE,
  object_path text NOT NULL UNIQUE,
  file_name text NOT NULL
    CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 180),
  content_type text NOT NULL
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 8388608),
  status text NOT NULL DEFAULT 'awaiting_upload'
    CHECK (status IN ('awaiting_upload', 'queued', 'ready', 'rejected')),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CHECK (object_path = 'pending/' || id::text),
  CHECK (
    (status = 'rejected' AND failure_reason IS NOT NULL)
    OR (status <> 'rejected' AND failure_reason IS NULL)
  )
);

CREATE INDEX inquiry_reference_files_inquiry_id_idx
  ON public.inquiry_reference_files (inquiry_id, created_at)
  WHERE inquiry_id IS NOT NULL;

CREATE INDEX inquiry_reference_files_unattached_created_at_idx
  ON public.inquiry_reference_files (created_at)
  WHERE inquiry_id IS NULL;

ALTER TABLE public.inquiry_reference_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inquiry_reference_files
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inquiry_reference_files
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_public_inquiry_with_references(
  p_inquiry jsonb,
  p_brief jsonb,
  p_reference_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_inquiry_id uuid;
  reference_count integer := COALESCE(pg_catalog.cardinality(p_reference_ids), 0);
  available_reference_count bigint;
BEGIN
  IF reference_count > 4
    OR reference_count <> (
      SELECT pg_catalog.count(DISTINCT reference_id)
      FROM pg_catalog.unnest(COALESCE(p_reference_ids, ARRAY[]::uuid[]))
        AS selected(reference_id)
    )
  THEN
    RAISE EXCEPTION 'Invalid reference file selection.';
  END IF;

  SELECT pg_catalog.count(*)
  INTO available_reference_count
  FROM public.inquiry_reference_files AS reference_files
  WHERE reference_files.id = ANY(COALESCE(p_reference_ids, ARRAY[]::uuid[]))
    AND reference_files.inquiry_id IS NULL
    AND reference_files.status = 'awaiting_upload';

  IF available_reference_count <> reference_count THEN
    RAISE EXCEPTION 'One or more reference files are unavailable.';
  END IF;

  INSERT INTO public.inquiries (
    client_id,
    name,
    email,
    company,
    service,
    project_brief,
    budget_range,
    timeline,
    priority_score
  )
  VALUES (
    NULLIF(p_inquiry ->> 'client_id', '')::uuid,
    p_inquiry ->> 'name',
    p_inquiry ->> 'email',
    p_inquiry ->> 'company',
    p_inquiry ->> 'service',
    p_inquiry ->> 'project_brief',
    p_inquiry ->> 'budget_range',
    p_inquiry ->> 'timeline',
    COALESCE((p_inquiry ->> 'priority_score')::smallint, 0)
  )
  RETURNING id INTO new_inquiry_id;

  INSERT INTO public.inquiry_briefs (
    inquiry_id,
    design_goal,
    brand_message,
    target_audience,
    desired_outcomes,
    "references",
    time_budget,
    design_complexity
  )
  VALUES (
    new_inquiry_id,
    COALESCE(p_brief ->> 'design_goal', ''),
    COALESCE(p_brief ->> 'brand_message', ''),
    p_brief ->> 'target_audience',
    p_brief ->> 'desired_outcomes',
    p_brief ->> 'references',
    p_brief ->> 'time_budget',
    NULLIF(p_brief ->> 'design_complexity', '')::smallint
  );

  UPDATE public.inquiry_reference_files
  SET inquiry_id = new_inquiry_id, status = 'queued'
  WHERE id = ANY(COALESCE(p_reference_ids, ARRAY[]::uuid[]));

  RETURN new_inquiry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_inquiry_with_references(jsonb, jsonb, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_public_inquiry_with_references(jsonb, jsonb, uuid[])
  TO service_role;
