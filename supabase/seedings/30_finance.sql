INSERT INTO public.project_revenue (
  id, project_id, entry_type, amount, received_on, description, created_by
)
VALUES
  (
    'f6000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.projects WHERE inquiry_id = 'f3000000-0000-4000-8000-000000000003'),
    'revenue',
    15000,
    current_date - 20,
    'Northstar identity project deposit',
    'f1000000-0000-4000-8000-000000000001'
  ),
  (
    'f6000000-0000-4000-8000-000000000002',
    (SELECT id FROM public.projects WHERE inquiry_id = 'f3000000-0000-4000-8000-000000000003'),
    'refund',
    500,
    current_date - 12,
    'Northstar billing adjustment',
    'f1000000-0000-4000-8000-000000000001'
  ),
  (
    'f6000000-0000-4000-8000-000000000003',
    (SELECT id FROM public.projects WHERE inquiry_id = 'f3000000-0000-4000-8000-000000000007'),
    'revenue',
    9000,
    current_date - 8,
    'Wildfern project milestone',
    'f1000000-0000-4000-8000-000000000001'
  ),
  (
    'f6000000-0000-4000-8000-000000000004',
    (SELECT id FROM public.projects WHERE inquiry_id = 'f3000000-0000-4000-8000-000000000009'),
    'revenue',
    22000,
    current_date - 4,
    'Fieldnotes product discovery deposit',
    'f1000000-0000-4000-8000-000000000001'
  );

INSERT INTO public.project_payouts (
  id, project_id, team_member_id, role_name, entry_type,
  amount, status, paid_on, notes, created_by
)
VALUES
  (
    'f6100000-0000-4000-8000-000000000001',
    (SELECT id FROM public.projects WHERE inquiry_id = 'f3000000-0000-4000-8000-000000000003'),
    'f2000000-0000-4000-8000-000000000004',
    'Brand Designer',
    'payout',
    4000,
    'paid',
    current_date - 10,
    'Northstar identity milestone',
    'f1000000-0000-4000-8000-000000000001'
  ),
  (
    'f6100000-0000-4000-8000-000000000002',
    (SELECT id FROM public.projects WHERE inquiry_id = 'f3000000-0000-4000-8000-000000000007'),
    'f2000000-0000-4000-8000-000000000004',
    'Brand Designer',
    'payout',
    1800,
    'paid',
    current_date - 3,
    'Wildfern packaging exploration',
    'f1000000-0000-4000-8000-000000000001'
  ),
  (
    'f6100000-0000-4000-8000-000000000003',
    (SELECT id FROM public.projects WHERE inquiry_id = 'f3000000-0000-4000-8000-000000000009'),
    'f2000000-0000-4000-8000-000000000005',
    'Product Designer',
    'payout',
    2500,
    'planned',
    NULL,
    'Fieldnotes discovery milestone',
    'f1000000-0000-4000-8000-000000000001'
  );

INSERT INTO public.expenses (
  id, name, category, amount, incurred_on, notes, created_by
)
VALUES
  (
    'f6200000-0000-4000-8000-000000000001',
    'Design software subscriptions',
    'software',
    420,
    current_date - 5,
    'Synthetic quarterly software expense',
    'f1000000-0000-4000-8000-000000000001'
  ),
  (
    'f6200000-0000-4000-8000-000000000002',
    'Studio equipment replacement',
    'equipment',
    275,
    current_date - 6,
    'Voided example; excluded from quarterly totals.',
    'f1000000-0000-4000-8000-000000000001'
  );

UPDATE public.expenses
SET voided_at = now(),
    void_reason = 'Seed example for the voided-expense exclusion path.'
WHERE id = 'f6200000-0000-4000-8000-000000000002';

INSERT INTO public.recurring_expenses (
  id, name, category, amount, frequency, starts_on, ends_on, notes, created_by
)
VALUES
  (
    'f6300000-0000-4000-8000-000000000001',
    'Cloud and design tools',
    'software',
    49,
    'monthly',
    date_trunc('quarter', current_date)::date,
    NULL,
    'Active monthly synthetic subscription.',
    'f1000000-0000-4000-8000-000000000001'
  ),
  (
    'f6300000-0000-4000-8000-000000000002',
    'Quarterly studio insurance',
    'services',
    350,
    'quarterly',
    date_trunc('quarter', current_date)::date,
    NULL,
    'Active quarterly synthetic expense.',
    'f1000000-0000-4000-8000-000000000001'
  );

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
