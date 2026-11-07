CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.project_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
    sender_type text NOT NULL CHECK (sender_type IN ('client', 'designer', 'team')),
    sender_id uuid,
    sender_name text NOT NULL,
    body text NOT NULL CHECK (char_length(trim(body)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_messages_inquiry_id_idx
    ON public.project_messages (inquiry_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.project_request_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    payout_amount numeric(12,2) NOT NULL DEFAULT 0,
    payout_currency text NOT NULL DEFAULT 'USD',
    status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed', 'cancelled')),
    notes text
);

CREATE INDEX IF NOT EXISTS project_request_logs_inquiry_id_idx
    ON public.project_request_logs (inquiry_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.company_expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id uuid REFERENCES public.inquiries(id) ON DELETE SET NULL,
    gross_revenue numeric(12,2) NOT NULL DEFAULT 0,
    total_paid_out numeric(12,2) NOT NULL DEFAULT 0,
    contributor_name text NOT NULL,
    contributor_amount numeric(12,2) NOT NULL DEFAULT 0,
    contributor_role text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_expenses_inquiry_id_idx
    ON public.company_expenses (inquiry_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_project_messages_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.project_messages
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS project_messages_set_updated_at ON public.project_messages;
CREATE TRIGGER project_messages_set_updated_at
    BEFORE UPDATE ON public.project_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.set_project_messages_updated_at();

ALTER TABLE public.company_expenses
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS company_expenses_set_updated_at ON public.company_expenses;
CREATE TRIGGER company_expenses_set_updated_at
    BEFORE UPDATE ON public.company_expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.set_project_messages_updated_at();

ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_messages_select_for_designers ON public.project_messages;
DROP POLICY IF EXISTS project_messages_insert_for_designers ON public.project_messages;
DROP POLICY IF EXISTS project_request_logs_select_for_designers ON public.project_request_logs;
DROP POLICY IF EXISTS project_request_logs_insert_for_designers ON public.project_request_logs;
DROP POLICY IF EXISTS company_expenses_select_for_designers ON public.company_expenses;
DROP POLICY IF EXISTS company_expenses_insert_for_designers ON public.company_expenses;

CREATE POLICY project_messages_select_for_designers
    ON public.project_messages
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            auth.jwt() ->> 'access_level' IN ('designer', 'studio_member')
            OR auth.jwt() ->> 'role' IN ('designer', 'studio_member')
        )
    );

CREATE POLICY project_messages_insert_for_designers
    ON public.project_messages
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            auth.jwt() ->> 'access_level' IN ('designer', 'studio_member')
            OR auth.jwt() ->> 'role' IN ('designer', 'studio_member')
        )
    );

CREATE POLICY project_request_logs_select_for_designers
    ON public.project_request_logs
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            auth.jwt() ->> 'access_level' IN ('designer', 'studio_member')
            OR auth.jwt() ->> 'role' IN ('designer', 'studio_member')
        )
    );

CREATE POLICY project_request_logs_insert_for_designers
    ON public.project_request_logs
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            auth.jwt() ->> 'access_level' IN ('designer', 'studio_member')
            OR auth.jwt() ->> 'role' IN ('designer', 'studio_member')
        )
    );

CREATE POLICY company_expenses_select_for_designers
    ON public.company_expenses
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            auth.jwt() ->> 'access_level' IN ('designer', 'studio_member')
            OR auth.jwt() ->> 'role' IN ('designer', 'studio_member')
        )
    );

CREATE POLICY company_expenses_insert_for_designers
    ON public.company_expenses
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            auth.jwt() ->> 'access_level' IN ('designer', 'studio_member')
            OR auth.jwt() ->> 'role' IN ('designer', 'studio_member')
        )
    );
