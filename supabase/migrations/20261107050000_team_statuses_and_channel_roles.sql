ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_availability_status_check;

UPDATE public.team_members
SET availability_status = CASE availability_status
    WHEN 'in_review' THEN 'busy'
    WHEN 'unassigned' THEN 'available'
    ELSE availability_status
END
WHERE availability_status IN ('in_review', 'unassigned');

ALTER TABLE public.team_members
    ADD CONSTRAINT team_members_availability_status_check
    CHECK (availability_status IN ('available', 'busy', 'away', 'on_leave'));

WITH ranked_project_managers AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY inquiry_id
            ORDER BY assigned_at ASC, id ASC
        ) AS manager_rank
    FROM public.project_assignments
    WHERE is_project_manager = true
)
UPDATE public.project_assignments AS assignments
SET is_project_manager = false
FROM ranked_project_managers
WHERE assignments.id = ranked_project_managers.id
  AND ranked_project_managers.manager_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS project_assignments_single_pm_idx
    ON public.project_assignments (inquiry_id)
    WHERE is_project_manager = true;

ALTER TABLE public.project_channel_members
    ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

ALTER TABLE public.project_channel_members
    DROP CONSTRAINT IF EXISTS project_channel_members_role_check;

ALTER TABLE public.project_channel_members
    ADD CONSTRAINT project_channel_members_role_check
    CHECK (role IN ('moderator', 'member'));

ALTER TABLE public.project_channels
    DROP CONSTRAINT IF EXISTS project_channels_type_check;

ALTER TABLE public.project_channels
    ADD CONSTRAINT project_channels_type_check
    CHECK (channel_type IN ('general', 'announcement', 'project'));
