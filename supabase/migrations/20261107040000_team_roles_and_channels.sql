CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.team_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE,
    full_name text NOT NULL,
    email text NOT NULL UNIQUE,
    title text,
    specialty text,
    availability_status text NOT NULL DEFAULT 'available' CHECK (availability_status IN ('available', 'in_review', 'busy', 'unassigned')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id uuid NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
    team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
    role_name text NOT NULL,
    is_project_manager boolean NOT NULL DEFAULT false,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (inquiry_id, team_member_id)
);

CREATE TABLE IF NOT EXISTS public.project_channels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id uuid REFERENCES public.inquiries(id) ON DELETE CASCADE,
    channel_name text NOT NULL,
    channel_type text NOT NULL CHECK (channel_type IN ('project', 'general', 'announcement')),
    moderator_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_channel_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid NOT NULL REFERENCES public.project_channels(id) ON DELETE CASCADE,
    team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
    joined_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (channel_id, team_member_id)
);

CREATE TABLE IF NOT EXISTS public.project_channel_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id uuid NOT NULL REFERENCES public.project_channels(id) ON DELETE CASCADE,
    sender_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
    sender_name text NOT NULL,
    sender_role text,
    body text NOT NULL CHECK (char_length(trim(body)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_assignments_inquiry_idx
    ON public.project_assignments (inquiry_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS project_assignments_member_idx
    ON public.project_assignments (team_member_id, inquiry_id);

CREATE INDEX IF NOT EXISTS project_channels_inquiry_idx
    ON public.project_channels (inquiry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_channel_members_channel_idx
    ON public.project_channel_members (channel_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS project_channel_messages_channel_idx
    ON public.project_channel_messages (channel_id, created_at DESC);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_channel_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_members_select_for_studio ON public.team_members;
DROP POLICY IF EXISTS project_assignments_select_for_studio ON public.project_assignments;
DROP POLICY IF EXISTS project_channels_select_for_studio ON public.project_channels;
DROP POLICY IF EXISTS project_channel_members_select_for_studio ON public.project_channel_members;
DROP POLICY IF EXISTS project_channel_messages_select_for_studio ON public.project_channel_messages;

CREATE POLICY team_members_select_for_studio
    ON public.team_members
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            auth.jwt() ->> 'access_level' IN ('designer', 'studio_member')
            OR auth.jwt() ->> 'role' IN ('designer', 'studio_member')
        )
    );

CREATE POLICY project_assignments_select_for_studio
    ON public.project_assignments
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            auth.jwt() ->> 'access_level' IN ('designer', 'studio_member')
            OR auth.jwt() ->> 'role' IN ('designer', 'studio_member')
        )
    );

CREATE POLICY project_channels_select_for_studio
    ON public.project_channels
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            auth.jwt() ->> 'access_level' IN ('designer', 'studio_member')
            OR auth.jwt() ->> 'role' IN ('designer', 'studio_member')
        )
    );

CREATE POLICY project_channel_members_select_for_studio
    ON public.project_channel_members
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            auth.jwt() ->> 'access_level' IN ('designer', 'studio_member')
            OR auth.jwt() ->> 'role' IN ('designer', 'studio_member')
        )
    );

CREATE POLICY project_channel_messages_select_for_studio
    ON public.project_channel_messages
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            auth.jwt() ->> 'access_level' IN ('designer', 'studio_member')
            OR auth.jwt() ->> 'role' IN ('designer', 'studio_member')
        )
    );
