ALTER TABLE public.inquiries
  ADD COLUMN similarity_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN similarity_opted_in_at timestamptz,
  ADD COLUMN similarity_status text NOT NULL DEFAULT 'not_requested'
    CHECK (similarity_status IN ('not_requested', 'pending', 'processing', 'ready', 'failed')),
  ADD COLUMN similarity_matches jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(similarity_matches) = 'array'),
  ADD COLUMN reviewed_complexity smallint
    CHECK (reviewed_complexity BETWEEN 1 AND 10),
  ADD COLUMN actual_hours numeric(8, 2)
    CHECK (actual_hours BETWEEN 0 AND 100000),
  ADD COLUMN review_notes text
    CHECK (review_notes IS NULL OR char_length(review_notes) <= 1000),
  ADD CONSTRAINT inquiries_similarity_consent_state_check
    CHECK (
      similarity_opt_in
      OR (
        similarity_status = 'not_requested'
        AND similarity_matches = '[]'::jsonb
      )
    ),
  ADD CONSTRAINT inquiries_similarity_consent_timestamp_check
    CHECK (
      NOT similarity_opt_in
      OR similarity_opted_in_at IS NOT NULL
    );

GRANT INSERT (
  client_id, name, email, company, service, project_brief,
  budget_range, timeline, priority_score, similarity_opt_in,
  similarity_opted_in_at, similarity_status
) ON TABLE public.inquiries TO service_role;

GRANT SELECT, DELETE ON TABLE public.inquiries TO service_role;
GRANT UPDATE (
  similarity_opt_in,
  similarity_opted_in_at,
  similarity_status,
  similarity_matches
) ON TABLE public.inquiries TO service_role;
GRANT SELECT ON TABLE public.inquiry_briefs TO service_role;

GRANT UPDATE (
  similarity_opt_in,
  similarity_opted_in_at,
  similarity_status,
  similarity_matches,
  reviewed_complexity,
  actual_hours,
  review_notes
) ON TABLE public.inquiries TO authenticated;

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
  total_reference_bytes bigint;
  allow_similarity boolean := COALESCE(
    (p_inquiry ->> 'similarity_opt_in')::boolean,
    false
  );
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

  SELECT
    pg_catalog.count(*),
    COALESCE(pg_catalog.sum(reference_files.byte_size), 0)
  INTO available_reference_count, total_reference_bytes
  FROM public.inquiry_reference_files AS reference_files
  WHERE reference_files.id = ANY(COALESCE(p_reference_ids, ARRAY[]::uuid[]))
    AND reference_files.inquiry_id IS NULL
    AND reference_files.status = 'awaiting_upload';

  IF available_reference_count <> reference_count
    OR total_reference_bytes > 25165824
  THEN
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
    priority_score,
    similarity_opt_in,
    similarity_opted_in_at,
    similarity_status
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
    COALESCE((p_inquiry ->> 'priority_score')::smallint, 0),
    allow_similarity,
    CASE WHEN allow_similarity THEN pg_catalog.now() ELSE NULL END,
    CASE WHEN allow_similarity THEN 'pending' ELSE 'not_requested' END
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
