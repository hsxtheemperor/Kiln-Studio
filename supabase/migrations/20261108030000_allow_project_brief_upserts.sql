-- The server persists project briefs with INSERT ... ON CONFLICT (inquiry_id)
-- DO UPDATE. PostgreSQL requires table-level SELECT for this upsert even
-- though the service-role request does not return rows.
GRANT SELECT ON TABLE public.project_briefs TO service_role;
