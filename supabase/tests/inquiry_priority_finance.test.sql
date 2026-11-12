BEGIN;

SELECT no_plan();

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES (
  '10000000-0000-0000-0000-000000000198',
  'authenticated', 'authenticated', 'priority-deal-lead@example.test', '',
  now(), '{"access_level":"deal_lead"}', '{}', now(), now()
);

INSERT INTO public.inquiries (id, name, email, project_brief, priority_score, status)
VALUES (
  '30000000-0000-0000-0000-000000000091',
  'Finance Test',
  'finance-test@example.test',
  'Finance and priority test inquiry',
  10,
  'new'
);

UPDATE public.engagements
SET review_state = 'suitable',
    deal_lead_id = '10000000-0000-0000-0000-000000000198',
    claimed_at = now()
WHERE inquiry_id = '30000000-0000-0000-0000-000000000091';

UPDATE public.inquiries
SET status = 'accepted'
WHERE id = '30000000-0000-0000-0000-000000000091';

SELECT is(
  (SELECT priority_score FROM public.inquiries
   WHERE id = '30000000-0000-0000-0000-000000000091'),
  10::smallint,
  'priority score accepts the upper bound'
);

INSERT INTO public.inquiries (id, name, email, project_brief, priority_score)
VALUES (
  '30000000-0000-0000-0000-000000000092',
  'Low Priority',
  'low-priority@example.test',
  'Lower boundary',
  1
);
SELECT is(
  (SELECT priority_score FROM public.inquiries
   WHERE id = '30000000-0000-0000-0000-000000000092'),
  1::smallint,
  'priority score accepts the lower scored bound'
);

SELECT throws_ok(
  $$ INSERT INTO public.inquiries (name, email, project_brief, priority_score)
     VALUES ('Too Low', 'priority-low@example.test', 'Invalid', -1) $$,
  '23514',
  NULL,
  'priority score rejects negative values'
);
SELECT throws_ok(
  $$ INSERT INTO public.inquiries (name, email, project_brief, priority_score)
     VALUES ('Too High', 'priority-high@example.test', 'Invalid', 11) $$,
  '23514',
  NULL,
  'priority score rejects values above ten'
);
SELECT is(
  (SELECT priority_score FROM public.inquiries
   WHERE id = '30000000-0000-0000-0000-000000000091'),
  10::smallint,
  'priority defaults remain distinct from the tested scored range'
);

SELECT ok(
  NOT has_column_privilege('authenticated', 'public.inquiries', 'priority_score', 'INSERT')
  AND has_column_privilege('service_role', 'public.inquiries', 'priority_score', 'INSERT'),
  'only service role may set priority during inquiry submission'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.create_public_inquiry_with_brief(jsonb,jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.create_public_inquiry_with_brief(jsonb,jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.create_public_inquiry_with_brief(jsonb,jsonb)',
    'EXECUTE'
  ),
  'only service role can execute the public inquiry persistence RPC'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_activity_logs'
  ),
  'system activity logs are included in the Realtime publication'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inquiry_briefs'
      AND column_name IN ('priority_score', 'priority_label')
  ),
  'inquiry briefs store scoring inputs, not a duplicated score or label'
);

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$ SELECT public.create_public_inquiry_with_brief(
       '{"name":"Atomic Inquiry","email":"atomic@example.test","project_brief":"Atomic brief","priority_score":8}',
       '{"design_goal":"Atomic goal","brand_message":"Atomic message","design_complexity":5}'
     ) $$,
  'service role can create an inquiry and its brief in one transaction'
);
RESET ROLE;

SELECT is(
  (SELECT priority_score FROM public.inquiries WHERE email = 'atomic@example.test'),
  8::smallint,
  'atomic inquiry persistence stores computed priority'
);
SELECT is(
  (SELECT design_goal FROM public.inquiry_briefs
   WHERE inquiry_id = (SELECT id FROM public.inquiries WHERE email = 'atomic@example.test')),
  'Atomic goal',
  'atomic inquiry persistence stores its linked brief'
);
SELECT is(
  (SELECT count(*) FROM public.inquiry_briefs
   WHERE inquiry_id = (SELECT id FROM public.inquiries WHERE email = 'atomic@example.test')),
  1::bigint,
  'an inquiry submission creates exactly one extended brief'
);

UPDATE public.inquiries
SET priority_score = 6
WHERE id = '30000000-0000-0000-0000-000000000092';
SELECT is(
  (SELECT priority_score FROM public.inquiries
   WHERE id = '30000000-0000-0000-0000-000000000092'),
  6::smallint,
  'a studio admin can override priority'
);

INSERT INTO public.team_members (id, user_id, full_name, email)
VALUES (
  '20000000-0000-0000-0000-000000000091',
  '10000000-0000-0000-0000-000000000091',
  'Finance Team Member',
  'finance-member@example.test'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"access_level":"studio_member"}}',
  true
);
UPDATE public.projects
SET project_manager_id = '20000000-0000-0000-0000-000000000091',
    deadline_date = '2026-03-31'
WHERE inquiry_id = '30000000-0000-0000-0000-000000000091';

INSERT INTO public.project_revenue (
  project_id, entry_type, amount, received_on, description
)
SELECT id, 'revenue', 1000, '2026-01-15', 'Initial payment'
FROM public.projects
WHERE inquiry_id = '30000000-0000-0000-0000-000000000091';
INSERT INTO public.project_revenue (
  project_id, entry_type, amount, received_on, description
)
SELECT id, 'refund', 100, '2026-02-15', 'Partial refund'
FROM public.projects
WHERE inquiry_id = '30000000-0000-0000-0000-000000000091';

INSERT INTO public.project_payouts (
  project_id, team_member_id, role_name, entry_type, amount, status, paid_on
)
SELECT id, '20000000-0000-0000-0000-000000000091', 'DESIGNER', 'payout', 300, 'paid', '2026-02-01'
FROM public.projects
WHERE inquiry_id = '30000000-0000-0000-0000-000000000091';
INSERT INTO public.project_payouts (
  project_id, team_member_id, role_name, entry_type, amount, status, paid_on
)
SELECT id, '20000000-0000-0000-0000-000000000091', 'DESIGNER', 'refund', 25, 'paid', '2026-03-01'
FROM public.projects
WHERE inquiry_id = '30000000-0000-0000-0000-000000000091';
INSERT INTO public.project_payouts (project_id, team_member_id, role_name, amount)
SELECT id, '20000000-0000-0000-0000-000000000091', 'DESIGNER', 999
FROM public.projects
WHERE inquiry_id = '30000000-0000-0000-0000-000000000091';

INSERT INTO public.expenses (name, category, amount, incurred_on)
VALUES ('Design software', 'software', 50, '2026-02-10');
INSERT INTO public.recurring_expenses (name, category, amount, frequency, starts_on, ends_on)
VALUES ('Studio rent', 'rent', 25, 'monthly', '2026-01-15', '2026-03-15');

SELECT is(
  (SELECT count(*) FROM public.recurring_expense_occurrences('2026-01-01', '2026-03-31')),
  3::bigint,
  'monthly recurring expense expands to each anchored due date in the quarter'
);
SELECT is(
  (SELECT sum(amount) FROM public.recurring_expense_occurrences('2026-01-01', '2026-03-31')),
  75::numeric,
  'recurring occurrences preserve the full amount per due date'
);

SELECT is(
  (SELECT total_revenue FROM public.compute_quarter_totals(2026, 1)),
  900::numeric,
  'quarter revenue subtracts refund adjustment entries'
);
SELECT is(
  (SELECT total_payouts FROM public.compute_quarter_totals(2026, 1)),
  275::numeric,
  'quarter payouts include paid entries and subtract payout refunds'
);
SELECT is(
  (SELECT total_expenses FROM public.compute_quarter_totals(2026, 1)),
  50::numeric,
  'quarter totals include active one-time expenses'
);
SELECT is(
  (SELECT total_recurring_expenses FROM public.compute_quarter_totals(2026, 1)),
  75::numeric,
  'quarter totals include recurring occurrences due in the quarter'
);
SELECT is(
  (SELECT net_result FROM public.compute_quarter_totals(2026, 1)),
  500::numeric,
  'quarter net result uses the documented revenue-minus-costs formula'
);

UPDATE public.expenses
SET voided_at = '2026-04-01T00:00:00Z',
    void_reason = 'Entered in error'
WHERE name = 'Design software';
SELECT is(
  (SELECT total_expenses FROM public.compute_quarter_totals(2026, 1)),
  0::numeric,
  'voided expenses are excluded from computed quarter totals'
);
SELECT throws_ok(
  $$ UPDATE public.expenses
     SET voided_at = NULL, void_reason = NULL
     WHERE name = 'Design software' $$,
  '42501',
  NULL,
  'a voided expense cannot be un-voided'
);
SELECT throws_ok(
  $$ UPDATE public.recurring_expenses
     SET amount = 40, voided_at = now(), void_reason = 'Correction'
     WHERE name = 'Studio rent' $$,
  '42501',
  NULL,
  'voiding cannot be combined with changing the original expense data'
);

SELECT throws_ok(
  $$ INSERT INTO public.expenses (name, category, amount, currency, incurred_on)
     VALUES ('Wrong currency', 'other', 1, 'INR', '2026-01-01') $$,
  '23514',
  NULL,
  'expense entries must use the single configured reporting currency'
);
SELECT throws_ok(
  $$ INSERT INTO public.project_payouts (
       project_id, team_member_id, role_name, amount, status
     )
     SELECT id, '20000000-0000-0000-0000-000000000091', 'DESIGNER', 1, 'paid'
     FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000091' $$,
  '23514',
  NULL,
  'paid payouts require a payment date'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000091","app_metadata":{"access_level":"studio_member"}}',
  true
);
SELECT lives_ok(
  $$ INSERT INTO public.project_payouts (
       project_id, team_member_id, role_name, amount
     )
     SELECT id, '20000000-0000-0000-0000-000000000091', 'DESIGNER', 10
     FROM public.projects WHERE inquiry_id = '30000000-0000-0000-0000-000000000091' $$,
  'studio admin can add an upcoming payout'
);
SELECT lives_ok(
  $$ UPDATE public.project_payouts
     SET status = 'paid', paid_on = '2026-03-20'
     WHERE amount = 10 AND status = 'planned' $$,
  'studio admin can mark a planned payout paid'
);
SELECT throws_ok(
  $$ UPDATE public.project_payouts SET amount = 11 WHERE amount = 10 $$,
  '42501',
  NULL,
  'a payout amount cannot be edited during the paid transition'
);
SELECT throws_ok(
  $$ UPDATE public.expenses SET notes = 'Changed' WHERE name = 'Design software' $$,
  '42501',
  NULL,
  'expense entries cannot be edited through authenticated access'
);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000092","app_metadata":{"access_level":"designer"}}',
  true
);
SELECT is(
  (SELECT count(*) FROM public.project_payouts),
  0::bigint,
  'designers cannot read finance payout rows'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000001","app_metadata":{"access_level":"studio_member"}}',
  true
);
SELECT is(
  (SELECT total_revenue FROM public.compute_quarter_totals(2026, 1)),
  900::numeric,
  'studio admin can compute finance totals'
);
SELECT lives_ok(
  $$ SELECT public.publish_quarterly_report(2026, 1) $$,
  'studio admin can publish a quarterly snapshot'
);
RESET ROLE;

SELECT is(
  (SELECT status FROM public.quarterly_reports
   WHERE period_year = 2026 AND period_quarter = 1 AND version = 1),
  'published',
  'report publishing marks the snapshot immutable'
);
SELECT is(
  (SELECT total_expenses FROM public.quarterly_reports
   WHERE period_year = 2026 AND period_quarter = 1 AND version = 1),
  0::numeric,
  'report captures the voided-expense-adjusted snapshot'
);
SELECT ok(
  (SELECT count(*) > 0 FROM public.quarterly_report_lines
   WHERE report_id = (
     SELECT id FROM public.quarterly_reports
     WHERE period_year = 2026 AND period_quarter = 1 AND version = 1
   )),
  'published report stores its auditable line-item breakdown'
);
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000092","app_metadata":{"access_level":"designer"}}',
  true
);
SELECT is((SELECT count(*) FROM public.project_revenue), 0::bigint,
  'designers cannot read project revenue');
SELECT is((SELECT count(*) FROM public.project_payouts), 0::bigint,
  'designers cannot read project payouts');
SELECT is((SELECT count(*) FROM public.expenses), 0::bigint,
  'designers cannot read company expenses');
SELECT is((SELECT count(*) FROM public.recurring_expenses), 0::bigint,
  'designers cannot read recurring expenses');
SELECT is((SELECT count(*) FROM public.quarterly_reports), 0::bigint,
  'designers cannot read quarterly reports');
SELECT is((SELECT count(*) FROM public.quarterly_report_lines), 0::bigint,
  'designers cannot read quarterly report lines');
RESET ROLE;
SELECT throws_ok(
  $$ UPDATE public.quarterly_reports
     SET total_revenue = total_revenue + 1
     WHERE period_year = 2026 AND period_quarter = 1 AND version = 1 $$,
  '42501',
  NULL,
  'published report snapshots cannot be updated'
);
SELECT throws_ok(
  $$ DELETE FROM public.quarterly_report_lines
     WHERE report_id = (
       SELECT id FROM public.quarterly_reports
       WHERE period_year = 2026 AND period_quarter = 1 AND version = 1
     ) $$,
  '42501',
  NULL,
  'published report lines cannot be deleted'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"10000000-0000-0000-0000-000000000001","app_metadata":{"access_level":"studio_member"}}',
  true
);
SELECT lives_ok(
  $$ SELECT public.publish_quarterly_report(2026, 1) $$,
  'a corrected quarter can be republished as a new snapshot'
);
RESET ROLE;
SELECT is(
  (SELECT supersedes_report_id::text
   FROM public.quarterly_reports
   WHERE period_year = 2026 AND period_quarter = 1 AND version = 2),
  (SELECT id::text
   FROM public.quarterly_reports
   WHERE period_year = 2026 AND period_quarter = 1 AND version = 1),
  'a later report version links to the previous published snapshot'
);

SELECT * FROM finish();
ROLLBACK;
