INSERT INTO public.inquiries (
  id,
  client_id,
  name,
  email,
  company,
  service,
  project_brief,
  budget_range,
  timeline,
  status,
  priority_score,
  similarity_opt_in,
  similarity_opted_in_at,
  similarity_status,
  similarity_matches,
  created_at
)
SELECT
  ('f3000000-0000-4000-8000-' || lpad(generated.number::text, 12, '0'))::uuid,
  CASE generated.number % 10
    WHEN 0 THEN 'f1100000-0000-4000-8000-000000000001'::uuid
    WHEN 5 THEN 'f1100000-0000-4000-8000-000000000002'::uuid
    ELSE NULL
  END,
  CASE generated.number % 10
    WHEN 0 THEN 'Sam Rivera'
    WHEN 5 THEN 'Alex Chen'
    ELSE names.person
  END,
  CASE generated.number % 10
    WHEN 0 THEN 'client-one@example.test'
    WHEN 5 THEN 'client-two@example.test'
    ELSE 'contact-' || lpad(generated.number::text, 3, '0') || '@example.test'
  END,
  CASE generated.number % 10
    WHEN 0 THEN 'Juniper Coffee'
    WHEN 5 THEN 'Fieldnotes Research'
    ELSE companies.company
  END,
  services.service,
  briefs.project_brief,
  budgets.budget_range,
  (4 + generated.number % 17)::text || ' weeks',
  'new',
  (generated.number * 7) % 11,
  generated.number % 3 = 0,
  CASE
    WHEN generated.number % 3 = 0 THEN now() - (generated.number % 30) * interval '1 day'
    ELSE NULL
  END,
  CASE
    WHEN generated.number % 3 <> 0 THEN 'not_requested'
    WHEN generated.number % 4 = 0 THEN 'ready'
    WHEN generated.number % 4 = 1 THEN 'pending'
    WHEN generated.number % 4 = 2 THEN 'failed'
    ELSE 'processing'
  END,
  CASE
    WHEN generated.number % 3 = 0 AND generated.number % 4 = 0
      THEN jsonb_build_array(jsonb_build_object(
        'id', 'f9000000-0000-4000-8000-' || lpad(generated.number::text, 12, '0'),
        'score', ((generated.number % 20) + 70)::numeric / 100,
        'label', 'Synthetic related project'
      ))
    ELSE '[]'::jsonb
  END,
  now() - (generated.number % 90) * interval '1 day'
FROM generate_series(11, 100) AS generated(number)
CROSS JOIN LATERAL (
  SELECT (ARRAY[
    'Morgan Ellis', 'Ari Bennett', 'Sasha Cole', 'Devon Hayes', 'Kendall Price',
    'Emery Flores', 'Cameron Blake', 'Noah Sinclair', 'Skyler James', 'Reese Jordan'
  ])[((generated.number - 11) % 10) + 1] AS person
) AS names
CROSS JOIN LATERAL (
  SELECT CASE generated.number % 10
    WHEN 0 THEN 'Juniper Coffee'
    WHEN 5 THEN 'Fieldnotes Research'
    ELSE (ARRAY[
      'Bluebird Provisions', 'Morrow Studio', 'Alder House', 'Goodwell Supply',
      'Open Lane Learning', 'Small Hours Coffee', 'Brightside Clinic',
      'Kindred Outdoors', 'Copperline Press', 'Meadowlark Market',
      'Common Ground Labs', 'Pine & Parcel', 'Westward Objects',
      'Lumen Community', 'Harborlight Works'
    ])[((generated.number - 11) % 15) + 1]
  END AS company
) AS companies
CROSS JOIN LATERAL (
  SELECT (ARRAY['brand_identity', 'web_design', 'product_design'])
    [((generated.number - 11) % 3) + 1] AS service
) AS services
CROSS JOIN LATERAL (
  SELECT (ARRAY['under_5k', '5k_10k', '10k_25k', '25k_50k', '50k_plus', 'not_sure'])
    [((generated.number - 11) % 6) + 1] AS budget_range
) AS budgets
CROSS JOIN LATERAL (
  SELECT 'Synthetic request ' || generated.number::text || ': '
    || CASE generated.number % 3
      WHEN 0 THEN 'create a cohesive identity and launch toolkit'
      WHEN 1 THEN 'improve the customer journey across a public website'
      ELSE 'prototype a focused digital product experience'
    END || ' for ' || companies.company || '.'
    AS project_brief
) AS briefs;

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
SELECT
  inquiries.id,
  'Synthetic goal ' || generated.number || ': make the experience clear and distinctive.',
  'A useful, memorable experience for ' || inquiries.company || '.',
  CASE generated.number % 4
    WHEN 0 THEN 'Local customers and community partners'
    WHEN 1 THEN 'Small teams adopting a new digital service'
    WHEN 2 THEN 'Returning customers and first-time visitors'
    ELSE 'Independent professionals and growing organizations'
  END,
  'A practical design system and measurable improvement to the customer journey.',
  CASE WHEN generated.number % 4 = 0
    THEN 'https://example.test/synthetic-reference-' || generated.number
    ELSE NULL
  END,
  inquiries.timeline,
  1 + generated.number % 10
FROM generate_series(11, 100) AS generated(number)
JOIN public.inquiries
  ON inquiries.id = (
    'f3000000-0000-4000-8000-' || lpad(generated.number::text, 12, '0')
  )::uuid;

DO $$
DECLARE
  inquiry_row record;
  review_state text;
  deal_lead_id uuid;
BEGIN
  FOR inquiry_row IN
    SELECT inquiries.id, right(inquiries.id::text, 12)::integer AS seed_number
    FROM public.inquiries
    WHERE inquiries.id BETWEEN
      'f3000000-0000-4000-8000-000000000011'::uuid
      AND 'f3000000-0000-4000-8000-000000000100'::uuid
    ORDER BY inquiries.id
  LOOP
    IF inquiry_row.seed_number % 10 = 9 THEN
      CONTINUE;
    ELSIF inquiry_row.seed_number % 10 IN (0, 1, 2, 3, 4) THEN
      review_state := 'suitable';
    ELSIF inquiry_row.seed_number % 10 IN (5, 6) THEN
      review_state := 'needs_info';
    ELSE
      review_state := 'not_suitable';
    END IF;

    deal_lead_id := CASE
      WHEN inquiry_row.seed_number % 2 = 0
        THEN 'f1000000-0000-4000-8000-000000000002'::uuid
      ELSE 'f1000000-0000-4000-8000-000000000003'::uuid
    END;

    PERFORM set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub', deal_lead_id,
        'role', 'authenticated',
        'app_metadata', jsonb_build_object('access_level', 'deal_lead')
      )::text,
      true
    );
    PERFORM set_config('request.jwt.claim.sub', deal_lead_id::text, true);

    PERFORM public.review_engagement(
      inquiry_row.id,
      review_state,
      'Synthetic seed review for workflow and queue testing.'
    );

    IF review_state = 'suitable' THEN
      PERFORM public.claim_engagement(inquiry_row.id);
    END IF;
  END LOOP;
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"access_level":"studio_member"}}',
  false
);
SELECT set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', false);

UPDATE public.inquiries
SET status = 'accepted'
WHERE id BETWEEN
    'f3000000-0000-4000-8000-000000000011'::uuid
    AND 'f3000000-0000-4000-8000-000000000100'::uuid
  AND right(id::text, 12)::integer % 10 IN (0, 1, 2);

UPDATE public.inquiries
SET status = 'contacted'
WHERE id BETWEEN
    'f3000000-0000-4000-8000-000000000011'::uuid
    AND 'f3000000-0000-4000-8000-000000000100'::uuid
  AND right(id::text, 12)::integer % 10 IN (5, 6);

UPDATE public.inquiries
SET status = 'closed'
WHERE id BETWEEN
    'f3000000-0000-4000-8000-000000000011'::uuid
    AND 'f3000000-0000-4000-8000-000000000100'::uuid
  AND right(id::text, 12)::integer % 10 IN (7, 8);
