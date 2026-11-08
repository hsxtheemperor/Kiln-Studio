ALTER TABLE public.inquiries
  ADD COLUMN priority_score smallint NOT NULL DEFAULT 0
    CHECK (priority_score BETWEEN 0 AND 10);

UPDATE public.inquiries AS inquiries
SET priority_score = briefs.priority_score
FROM public.project_briefs AS briefs
WHERE briefs.inquiry_id = inquiries.id
  AND briefs.priority_score IS NOT NULL;

ALTER TABLE public.project_briefs
  RENAME TO inquiry_briefs;

DROP INDEX IF EXISTS public.project_briefs_inquiry_id_idx;
DROP INDEX IF EXISTS public.project_briefs_priority_score_idx;
CREATE INDEX inquiry_briefs_inquiry_id_idx
  ON public.inquiry_briefs (inquiry_id);
CREATE INDEX inquiries_priority_score_created_at_idx
  ON public.inquiries (priority_score DESC, created_at DESC);

ALTER TABLE public.inquiry_briefs
  DROP COLUMN priority_score,
  DROP COLUMN priority_label;

REVOKE INSERT ON TABLE public.inquiries FROM service_role;
GRANT INSERT (
  client_id, name, email, company, service, project_brief,
  budget_range, timeline, priority_score
) ON TABLE public.inquiries TO service_role;
GRANT UPDATE (priority_score) ON TABLE public.inquiries TO authenticated;

CREATE OR REPLACE FUNCTION public.create_public_inquiry_with_brief(
  p_inquiry jsonb,
  p_brief jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_inquiry_id uuid;
BEGIN
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

  RETURN new_inquiry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_inquiry_with_brief(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_public_inquiry_with_brief(jsonb, jsonb)
  TO service_role;

DROP TRIGGER IF EXISTS project_briefs_refresh_project_channel_description
  ON public.inquiry_briefs;

CREATE OR REPLACE FUNCTION public.refresh_project_channel_description(p_project_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.project_channels AS channels
  SET description = pg_catalog.concat_ws(
    E'\n',
    'Inquiry details',
    'Contact: ' || inquiries.name,
    'Email: ' || inquiries.email,
    CASE WHEN inquiries.company IS NOT NULL THEN 'Company: ' || inquiries.company END,
    CASE WHEN inquiries.service IS NOT NULL THEN 'Service: ' || inquiries.service END,
    CASE WHEN inquiries.budget_range IS NOT NULL THEN 'Budget: ' || inquiries.budget_range END,
    CASE WHEN inquiries.timeline IS NOT NULL THEN 'Timeline: ' || inquiries.timeline END,
    'Brief: ' || inquiries.project_brief,
    CASE WHEN briefs.design_goal <> '' THEN 'Design goal: ' || briefs.design_goal END,
    CASE WHEN briefs.brand_message <> '' THEN 'Brand message: ' || briefs.brand_message END,
    CASE WHEN briefs.target_audience IS NOT NULL THEN 'Target audience: ' || briefs.target_audience END,
    CASE WHEN briefs.desired_outcomes IS NOT NULL THEN 'Desired outcomes: ' || briefs.desired_outcomes END,
    CASE WHEN briefs."references" IS NOT NULL THEN 'References: ' || briefs."references" END,
    CASE WHEN briefs.time_budget IS NOT NULL THEN 'Time budget: ' || briefs.time_budget END,
    CASE WHEN briefs.design_complexity IS NOT NULL THEN 'Design complexity: ' || briefs.design_complexity::text END,
    CASE
      WHEN inquiries.priority_score > 0
      THEN 'Priority: ' || inquiries.priority_score::text || '/10'
      ELSE 'Priority: unknown'
    END
  )
  FROM public.projects AS projects
  JOIN public.inquiries AS inquiries
    ON inquiries.id = projects.inquiry_id
  LEFT JOIN public.inquiry_briefs AS briefs
    ON briefs.inquiry_id = inquiries.id
  WHERE projects.id = p_project_id
    AND channels.project_id = projects.id;
$$;

DO $$
BEGIN
  PERFORM public.refresh_project_channel_description(projects.id)
  FROM public.projects;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_channel_description_from_brief()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_inquiry_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_inquiry_id := OLD.inquiry_id;
  ELSE
    affected_inquiry_id := NEW.inquiry_id;
  END IF;

  PERFORM public.refresh_project_channel_description(projects.id)
  FROM public.projects
  WHERE projects.inquiry_id = affected_inquiry_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inquiry_briefs_refresh_project_channel_description
  AFTER INSERT OR UPDATE OR DELETE
  ON public.inquiry_briefs
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_channel_description_from_brief();

DROP TRIGGER IF EXISTS inquiries_refresh_project_channel_description
  ON public.inquiries;
CREATE TRIGGER inquiries_refresh_project_channel_description
  AFTER UPDATE OF
    name, email, company, service, budget_range, timeline, project_brief, priority_score
  ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_channel_description_from_inquiry();

CREATE OR REPLACE FUNCTION public.list_project_channels()
RETURNS SETOF public.project_channels
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT channels.*
  FROM public.project_channels AS channels
  JOIN public.projects AS projects
    ON projects.id = channels.project_id
  JOIN public.inquiries AS inquiries
    ON inquiries.id = projects.inquiry_id
  WHERE channels.channel_type = 'project'
  ORDER BY
    channels.is_archived ASC,
    inquiries.priority_score DESC,
    projects.deadline_date ASC NULLS LAST,
    channels.created_at DESC;
$$;

DROP POLICY IF EXISTS system_activity_logs_select_for_studio
  ON public.system_activity_logs;
CREATE POLICY system_activity_logs_select_for_studio
  ON public.system_activity_logs
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
  );

CREATE TYPE public.expense_category AS ENUM (
  'software',
  'rent',
  'tools',
  'equipment',
  'services',
  'travel',
  'other'
);

CREATE TABLE public.project_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  entry_type text NOT NULL DEFAULT 'revenue'
    CHECK (entry_type IN ('revenue', 'refund')),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  received_on date NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_revenue_project_received_idx
  ON public.project_revenue (project_id, received_on);

CREATE TABLE public.project_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE RESTRICT,
  role_name text NOT NULL CHECK (char_length(btrim(role_name)) BETWEEN 1 AND 80),
  entry_type text NOT NULL DEFAULT 'payout'
    CHECK (entry_type IN ('payout', 'refund')),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'paid')),
  paid_on date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'paid' AND paid_on IS NOT NULL)
    OR (status = 'planned' AND paid_on IS NULL)
  )
);

CREATE INDEX project_payouts_project_paid_idx
  ON public.project_payouts (project_id, paid_on)
  WHERE status = 'paid';
CREATE INDEX project_payouts_member_idx
  ON public.project_payouts (team_member_id, paid_on)
  WHERE status = 'paid';

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  category public.expense_category NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  incurred_on date NOT NULL,
  notes text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (voided_at IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND char_length(btrim(void_reason)) > 0)
  )
);

CREATE INDEX expenses_incurred_on_idx
  ON public.expenses (incurred_on)
  WHERE voided_at IS NULL;

CREATE TABLE public.recurring_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  category public.expense_category NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  frequency text NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
  starts_on date NOT NULL,
  ends_on date,
  notes text,
  voided_at timestamptz,
  void_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (
    (voided_at IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND char_length(btrim(void_reason)) > 0)
  )
);

CREATE INDEX recurring_expenses_dates_idx
  ON public.recurring_expenses (starts_on, ends_on)
  WHERE voided_at IS NULL;

CREATE TABLE public.quarterly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year smallint NOT NULL CHECK (period_year BETWEEN 2000 AND 9999),
  period_quarter smallint NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),
  version integer NOT NULL CHECK (version > 0),
  supersedes_report_id uuid REFERENCES public.quarterly_reports(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL CHECK (currency = 'USD'),
  total_revenue numeric(12, 2) NOT NULL,
  total_payouts numeric(12, 2) NOT NULL,
  total_expenses numeric(12, 2) NOT NULL CHECK (total_expenses >= 0),
  total_recurring_expenses numeric(12, 2) NOT NULL CHECK (total_recurring_expenses >= 0),
  net_result numeric(12, 2) NOT NULL CHECK (
    net_result = total_revenue - total_payouts - total_expenses - total_recurring_expenses
  ),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_year, period_quarter, version),
  CHECK (period_end >= period_start),
  CHECK (
    (version = 1 AND supersedes_report_id IS NULL)
    OR (version > 1 AND supersedes_report_id IS NOT NULL)
  ),
  CHECK (
    (status = 'draft' AND published_at IS NULL)
    OR (status = 'published' AND published_at IS NOT NULL)
  )
);

CREATE INDEX quarterly_reports_period_version_idx
  ON public.quarterly_reports (period_year, period_quarter, version DESC);

CREATE TABLE public.quarterly_report_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.quarterly_reports(id) ON DELETE RESTRICT,
  line_type text NOT NULL
    CHECK (line_type IN ('revenue', 'payout', 'expense', 'recurring_expense')),
  project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  label text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quarterly_report_lines_report_idx
  ON public.quarterly_report_lines (report_id, line_type, id);

CREATE FUNCTION public.set_finance_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_finance_updated_at();
CREATE TRIGGER recurring_expenses_set_updated_at
  BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_finance_updated_at();

CREATE FUNCTION public.guard_expense_void()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.voided_at IS NOT NULL
    OR NEW.voided_at IS NULL
    OR NEW.voided_at IS NOT DISTINCT FROM OLD.voided_at
    OR (pg_catalog.to_jsonb(NEW) - ARRAY['voided_at', 'void_reason', 'updated_at'])
      IS DISTINCT FROM
       (pg_catalog.to_jsonb(OLD) - ARRAY['voided_at', 'void_reason', 'updated_at'])
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Expenses may only be voided once; all other corrections require a replacement row.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_void_guard
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_expense_void();
CREATE TRIGGER recurring_expenses_void_guard
  BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_expense_void();

CREATE FUNCTION public.guard_payout_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status <> 'planned'
    OR NEW.status <> 'paid'
    OR NEW.paid_on IS NULL
    OR (pg_catalog.to_jsonb(NEW) - ARRAY['status', 'paid_on'])
      IS DISTINCT FROM
       (pg_catalog.to_jsonb(OLD) - ARRAY['status', 'paid_on'])
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'A payout may only transition once from planned to paid.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER project_payouts_transition_guard
  BEFORE UPDATE ON public.project_payouts
  FOR EACH ROW EXECUTE FUNCTION public.guard_payout_transition();

CREATE FUNCTION public.guard_published_report()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  report_status text;
BEGIN
  IF TG_TABLE_NAME = 'quarterly_reports' THEN
    report_status := OLD.status;
  ELSE
    SELECT status INTO report_status
    FROM public.quarterly_reports
    WHERE id = OLD.report_id;
  END IF;

  IF report_status = 'published' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Published quarterly reports and their lines are immutable.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER quarterly_reports_immutable
  BEFORE UPDATE OR DELETE ON public.quarterly_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_report();
CREATE TRIGGER quarterly_report_lines_immutable
  BEFORE UPDATE OR DELETE ON public.quarterly_report_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_report();

CREATE FUNCTION public.recurring_expense_occurrences(p_from date, p_to date)
RETURNS TABLE (
  recurring_expense_id uuid,
  due_on date,
  name text,
  category public.expense_category,
  amount numeric,
  currency text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    expenses.id,
    (expenses.starts_on + occurrences.n * CASE expenses.frequency
      WHEN 'monthly' THEN interval '1 month'
      WHEN 'quarterly' THEN interval '3 months'
      ELSE interval '1 year'
    END)::date,
    expenses.name,
    expenses.category,
    expenses.amount,
    expenses.currency
  FROM public.recurring_expenses AS expenses
  CROSS JOIN LATERAL pg_catalog.generate_series(
    0,
    greatest(
      0,
      (p_to - expenses.starts_on) / CASE expenses.frequency
        WHEN 'monthly' THEN 28
        WHEN 'quarterly' THEN 89
        ELSE 365
      END + 1
    )
  ) AS occurrences(n)
  WHERE expenses.voided_at IS NULL
    AND p_from <= p_to
    AND expenses.starts_on <= p_to
    AND (expenses.ends_on IS NULL OR expenses.ends_on >= p_from)
    AND (expenses.starts_on + occurrences.n * CASE expenses.frequency
      WHEN 'monthly' THEN interval '1 month'
      WHEN 'quarterly' THEN interval '3 months'
      ELSE interval '1 year'
    END)::date BETWEEN p_from AND p_to
    AND (
      expenses.ends_on IS NULL
      OR (expenses.starts_on + occurrences.n * CASE expenses.frequency
        WHEN 'monthly' THEN interval '1 month'
        WHEN 'quarterly' THEN interval '3 months'
        ELSE interval '1 year'
      END)::date <= expenses.ends_on
    );
$$;

CREATE FUNCTION public.compute_quarter_totals(p_year integer, p_quarter integer)
RETURNS TABLE (
  currency text,
  total_revenue numeric,
  total_payouts numeric,
  total_expenses numeric,
  total_recurring_expenses numeric,
  net_result numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  period_start date;
  period_end date;
  currency_count integer;
BEGIN
  IF p_year NOT BETWEEN 2000 AND 9999 OR p_quarter NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid reporting year or quarter.';
  END IF;

  period_start := pg_catalog.make_date(p_year, (p_quarter - 1) * 3 + 1, 1);
  period_end := (period_start + interval '3 months - 1 day')::date;

  WITH currencies AS (
    SELECT project_revenue.currency
    FROM public.project_revenue
    WHERE project_revenue.received_on BETWEEN period_start AND period_end
    UNION ALL
    SELECT project_payouts.currency
    FROM public.project_payouts
    WHERE project_payouts.status = 'paid'
      AND project_payouts.paid_on BETWEEN period_start AND period_end
    UNION ALL
    SELECT expenses.currency
    FROM public.expenses
    WHERE expenses.voided_at IS NULL
      AND expenses.incurred_on BETWEEN period_start AND period_end
    UNION ALL
    SELECT recurring.currency
    FROM public.recurring_expense_occurrences(period_start, period_end) AS recurring
  )
  SELECT pg_catalog.count(DISTINCT currencies.currency)
  INTO currency_count
  FROM currencies;

  IF currency_count > 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Quarter totals cannot combine multiple currencies.';
  END IF;

  RETURN QUERY
  WITH totals AS (
    SELECT
      COALESCE(pg_catalog.sum(
        CASE project_revenue.entry_type
          WHEN 'refund' THEN -project_revenue.amount
          ELSE project_revenue.amount
        END
      ), 0)::numeric AS revenue
    FROM public.project_revenue
    WHERE project_revenue.received_on BETWEEN period_start AND period_end
  ), payout_totals AS (
    SELECT COALESCE(pg_catalog.sum(
      CASE project_payouts.entry_type
        WHEN 'refund' THEN -project_payouts.amount
        ELSE project_payouts.amount
      END
    ), 0)::numeric AS payouts
    FROM public.project_payouts
    WHERE project_payouts.status = 'paid'
      AND project_payouts.paid_on BETWEEN period_start AND period_end
  ), expense_totals AS (
    SELECT COALESCE(pg_catalog.sum(expenses.amount), 0)::numeric AS expenses
    FROM public.expenses
    WHERE expenses.voided_at IS NULL
      AND expenses.incurred_on BETWEEN period_start AND period_end
  ), recurring_totals AS (
    SELECT COALESCE(pg_catalog.sum(recurring.amount), 0)::numeric AS expenses
    FROM public.recurring_expense_occurrences(period_start, period_end) AS recurring
  )
  SELECT
    'USD'::text,
    totals.revenue,
    payout_totals.payouts,
    expense_totals.expenses,
    recurring_totals.expenses,
    totals.revenue - payout_totals.payouts - expense_totals.expenses - recurring_totals.expenses
  FROM totals, payout_totals, expense_totals, recurring_totals;
END;
$$;

CREATE FUNCTION public.publish_quarterly_report(p_year integer, p_quarter integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  report_totals record;
  new_report_id uuid;
  previous_report_id uuid;
  next_version integer;
  period_start date;
  period_end date;
BEGIN
  IF auth.jwt() -> 'app_metadata' ->> 'access_level' IS DISTINCT FROM 'studio_member' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Studio admin access is required.';
  END IF;
  IF p_year NOT BETWEEN 2000 AND 9999 OR p_quarter NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid reporting year or quarter.';
  END IF;

  period_start := pg_catalog.make_date(p_year, (p_quarter - 1) * 3 + 1, 1);
  period_end := (period_start + interval '3 months - 1 day')::date;

  SELECT * INTO report_totals
  FROM public.compute_quarter_totals(p_year, p_quarter);

  SELECT id, version INTO previous_report_id, next_version
  FROM public.quarterly_reports
  WHERE quarterly_reports.period_year = p_year
    AND quarterly_reports.period_quarter = p_quarter
    AND quarterly_reports.status = 'published'
  ORDER BY quarterly_reports.version DESC
  LIMIT 1
  FOR UPDATE;

  next_version := COALESCE(next_version, 0) + 1;

  INSERT INTO public.quarterly_reports (
    period_year,
    period_quarter,
    version,
    supersedes_report_id,
    period_start,
    period_end,
    currency,
    total_revenue,
    total_payouts,
    total_expenses,
    total_recurring_expenses,
    net_result,
    status,
    published_at,
    published_by
  )
  VALUES (
    p_year,
    p_quarter,
    next_version,
    previous_report_id,
    period_start,
    period_end,
    report_totals.currency,
    report_totals.total_revenue,
    report_totals.total_payouts,
    report_totals.total_expenses,
    report_totals.total_recurring_expenses,
    report_totals.net_result,
    'draft',
    NULL,
    NULL
  )
  RETURNING id INTO new_report_id;

  INSERT INTO public.quarterly_report_lines (report_id, line_type, project_id, label, amount)
  SELECT new_report_id, 'revenue', revenue.project_id,
    COALESCE(revenue.description, revenue.entry_type),
    CASE WHEN revenue.entry_type = 'refund' THEN -revenue.amount ELSE revenue.amount END
  FROM public.project_revenue AS revenue
  WHERE revenue.received_on BETWEEN period_start AND period_end;

  INSERT INTO public.quarterly_report_lines (report_id, line_type, project_id, label, amount)
  SELECT new_report_id, 'payout', payouts.project_id,
    payouts.team_member_id::text || ': ' || payouts.role_name || ' (' || payouts.entry_type || ')',
    CASE WHEN payouts.entry_type = 'refund' THEN -payouts.amount ELSE payouts.amount END
  FROM public.project_payouts AS payouts
  WHERE payouts.status = 'paid'
    AND payouts.paid_on BETWEEN period_start AND period_end;

  INSERT INTO public.quarterly_report_lines (report_id, line_type, label, amount)
  SELECT new_report_id, 'expense', expenses.name, expenses.amount
  FROM public.expenses
  WHERE expenses.voided_at IS NULL
    AND expenses.incurred_on BETWEEN period_start AND period_end;

  INSERT INTO public.quarterly_report_lines (report_id, line_type, label, amount)
  SELECT new_report_id, 'recurring_expense',
    recurring.name || ' (' || recurring.due_on::text || ')',
    recurring.amount
  FROM public.recurring_expense_occurrences(period_start, period_end) AS recurring;

  UPDATE public.quarterly_reports
  SET status = 'published',
      published_at = pg_catalog.now(),
      published_by = auth.uid()
  WHERE id = new_report_id;

  RETURN new_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_finance_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_expense_void() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_payout_transition() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_published_report() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_expense_occurrences(date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.compute_quarter_totals(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_quarterly_report(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recurring_expense_occurrences(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_quarter_totals(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_quarterly_report(integer, integer) TO authenticated;

ALTER TABLE public.project_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quarterly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quarterly_report_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_revenue_studio_only
  ON public.project_revenue FOR SELECT TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');
CREATE POLICY project_revenue_insert_studio_only
  ON public.project_revenue FOR INSERT TO authenticated
  WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');

CREATE POLICY project_payouts_studio_only
  ON public.project_payouts FOR SELECT TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');
CREATE POLICY project_payouts_insert_studio_only
  ON public.project_payouts FOR INSERT TO authenticated
  WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');
CREATE POLICY project_payouts_update_studio_only
  ON public.project_payouts FOR UPDATE TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member')
  WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');

CREATE POLICY expenses_studio_only
  ON public.expenses FOR SELECT TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');
CREATE POLICY expenses_insert_studio_only
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');

CREATE POLICY recurring_expenses_studio_only
  ON public.recurring_expenses FOR SELECT TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');
CREATE POLICY recurring_expenses_insert_studio_only
  ON public.recurring_expenses FOR INSERT TO authenticated
  WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');

CREATE POLICY quarterly_reports_studio_only
  ON public.quarterly_reports FOR SELECT TO authenticated
  USING (auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member');
CREATE POLICY quarterly_report_lines_studio_only
  ON public.quarterly_report_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.quarterly_reports AS reports
      WHERE reports.id = quarterly_report_lines.report_id
        AND auth.jwt() -> 'app_metadata' ->> 'access_level' = 'studio_member'
    )
  );

REVOKE ALL ON TABLE
  public.project_revenue,
  public.project_payouts,
  public.expenses,
  public.recurring_expenses,
  public.quarterly_reports,
  public.quarterly_report_lines
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT (
  project_id, entry_type, amount, currency, received_on, description, created_by
) ON TABLE public.project_revenue TO authenticated;
GRANT SELECT, INSERT (
  project_id, team_member_id, role_name, entry_type, amount, currency,
  status, paid_on, notes, created_by
) ON TABLE public.project_payouts TO authenticated;
GRANT UPDATE (status, paid_on) ON TABLE public.project_payouts TO authenticated;
GRANT SELECT, INSERT (
  name, category, amount, currency, incurred_on, notes, created_by
) ON TABLE public.expenses TO authenticated;
GRANT SELECT, INSERT (
  name, category, amount, currency, frequency, starts_on, ends_on, notes, created_by
) ON TABLE public.recurring_expenses TO authenticated;
GRANT SELECT ON TABLE public.quarterly_reports, public.quarterly_report_lines TO authenticated;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'inquiry_briefs',
    'project_revenue',
    'project_payouts',
    'expenses',
    'recurring_expenses',
    'quarterly_reports',
    'quarterly_report_lines'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_application_row_change()',
      table_name || '_system_activity_audit',
      table_name
    );
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS project_briefs_system_activity_audit
  ON public.inquiry_briefs;
