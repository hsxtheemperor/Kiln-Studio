INSERT INTO public.project_revenue (
  project_id, entry_type, amount, received_on, description, created_by
)
SELECT
  projects.id,
  CASE WHEN right(projects.inquiry_id::text, 12)::integer % 11 = 0
    THEN 'refund'
    ELSE 'revenue'
  END,
  2500 + right(projects.inquiry_id::text, 12)::integer % 18000,
  current_date - (right(projects.inquiry_id::text, 12)::integer % 35),
  'Synthetic project milestone ' || right(projects.inquiry_id::text, 4),
  'f1000000-0000-4000-8000-000000000001'
FROM public.projects
WHERE projects.inquiry_id BETWEEN
  'f3000000-0000-4000-8000-000000000011'::uuid
  AND 'f3000000-0000-4000-8000-000000000100'::uuid;

INSERT INTO public.project_payouts (
  project_id, team_member_id, role_name, entry_type, amount,
  status, paid_on, notes, created_by
)
SELECT
  projects.id,
  CASE right(projects.inquiry_id::text, 12)::integer % 2
    WHEN 0 THEN 'f2000000-0000-4000-8000-000000000004'::uuid
    ELSE 'f2000000-0000-4000-8000-000000000005'::uuid
  END,
  CASE right(projects.inquiry_id::text, 12)::integer % 2
    WHEN 0 THEN 'Brand Designer'
    ELSE 'Product Designer'
  END,
  'payout',
  750 + right(projects.inquiry_id::text, 12)::integer % 4500,
  CASE WHEN right(projects.inquiry_id::text, 12)::integer % 4 = 0
    THEN 'planned'
    ELSE 'paid'
  END,
  CASE WHEN right(projects.inquiry_id::text, 12)::integer % 4 = 0
    THEN NULL
    ELSE current_date - (right(projects.inquiry_id::text, 12)::integer % 24)
  END,
  'Synthetic design milestone payout.',
  'f1000000-0000-4000-8000-000000000001'
FROM public.projects
WHERE projects.inquiry_id BETWEEN
  'f3000000-0000-4000-8000-000000000011'::uuid
  AND 'f3000000-0000-4000-8000-000000000100'::uuid;

INSERT INTO public.expenses (
  name, category, amount, incurred_on, notes, created_by
)
SELECT
  CASE generated.number % 5
    WHEN 0 THEN 'Accessibility review'
    WHEN 1 THEN 'Creative software subscription'
    WHEN 2 THEN 'Studio equipment maintenance'
    WHEN 3 THEN 'Research participant thank-you'
    ELSE 'Project travel and materials'
  END || ' - batch ' || generated.number,
  (ARRAY['services', 'software', 'equipment', 'other', 'travel'])
    [((generated.number - 1) % 5) + 1]::public.expense_category,
  35 + (generated.number * 47) % 1200,
  current_date - (generated.number % 40),
  'Synthetic expense for local finance and reporting tests.',
  'f1000000-0000-4000-8000-000000000001'
FROM generate_series(1, 45) AS generated(number);

INSERT INTO public.recurring_expenses (
  name, category, amount, frequency, starts_on, ends_on, notes, created_by
)
SELECT
  CASE generated.number % 3
    WHEN 0 THEN 'Design and prototyping tools'
    WHEN 1 THEN 'Studio operations service'
    ELSE 'Equipment lease'
  END || ' - plan ' || generated.number,
  CASE generated.number % 3
    WHEN 0 THEN 'software'::public.expense_category
    WHEN 1 THEN 'services'::public.expense_category
    ELSE 'equipment'::public.expense_category
  END,
  25 + generated.number * 13,
  CASE generated.number % 3
    WHEN 0 THEN 'monthly'
    WHEN 1 THEN 'quarterly'
    ELSE 'yearly'
  END,
  (date_trunc('quarter', current_date)::date - (generated.number % 5) * interval '3 months')::date,
  CASE WHEN generated.number % 4 = 0
    THEN current_date - interval '1 month'
    ELSE NULL
  END,
  'Synthetic recurring cost; includes active and expired schedules.',
  'f1000000-0000-4000-8000-000000000001'
FROM generate_series(1, 18) AS generated(number);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"access_level":"studio_member"}}',
  false
);
SELECT set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', false);
SELECT public.publish_quarterly_report(
  extract(year FROM current_date)::integer,
  extract(quarter FROM current_date)::integer
);
