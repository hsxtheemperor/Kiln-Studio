SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"access_level":"studio_member"}}',
  false
);
SELECT set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', false);

UPDATE public.projects
SET project_name = inquiries.company || ' - synthetic project',
    project_manager_id = CASE right(inquiries.id::text, 12)::integer % 3
      WHEN 0 THEN 'f2000000-0000-4000-8000-000000000001'::uuid
      WHEN 1 THEN 'f2000000-0000-4000-8000-000000000002'::uuid
      ELSE 'f2000000-0000-4000-8000-000000000003'::uuid
    END,
    deadline_date = current_date + (14 + right(inquiries.id::text, 12)::integer % 120)
FROM public.inquiries
WHERE inquiries.id = projects.inquiry_id
  AND inquiries.id BETWEEN
    'f3000000-0000-4000-8000-000000000011'::uuid
    AND 'f3000000-0000-4000-8000-000000000100'::uuid
  AND right(inquiries.id::text, 12)::integer % 10 IN (0, 1, 2);

INSERT INTO public.project_members (project_id, team_member_id, role_name)
SELECT projects.id,
       CASE slot.member_number
         WHEN 1 THEN 'f2000000-0000-4000-8000-000000000004'::uuid
         ELSE 'f2000000-0000-4000-8000-000000000005'::uuid
       END,
       CASE slot.member_number
         WHEN 1 THEN 'DESIGNER'
         ELSE 'RESEARCHER'
       END
FROM public.projects
CROSS JOIN generate_series(1, 2) AS slot(member_number)
WHERE projects.inquiry_id BETWEEN
  'f3000000-0000-4000-8000-000000000011'::uuid
  AND 'f3000000-0000-4000-8000-000000000100'::uuid
ON CONFLICT (project_id, team_member_id) DO NOTHING;

INSERT INTO public.project_assignments (
  inquiry_id, team_member_id, role_name, is_project_manager
)
SELECT projects.inquiry_id, projects.project_manager_id, 'PROJECT_MANAGER', true
FROM public.projects
WHERE projects.inquiry_id BETWEEN
  'f3000000-0000-4000-8000-000000000011'::uuid
  AND 'f3000000-0000-4000-8000-000000000100'::uuid
ON CONFLICT (inquiry_id, team_member_id) DO NOTHING;

INSERT INTO public.project_assignments (
  inquiry_id, team_member_id, role_name, is_project_manager
)
SELECT projects.inquiry_id,
       CASE slot.member_number
         WHEN 1 THEN 'f2000000-0000-4000-8000-000000000004'::uuid
         ELSE 'f2000000-0000-4000-8000-000000000005'::uuid
       END,
       CASE slot.member_number
         WHEN 1 THEN 'DESIGNER'
         ELSE 'RESEARCHER'
       END,
       false
FROM public.projects
CROSS JOIN generate_series(1, 2) AS slot(member_number)
WHERE projects.inquiry_id BETWEEN
  'f3000000-0000-4000-8000-000000000011'::uuid
  AND 'f3000000-0000-4000-8000-000000000100'::uuid
ON CONFLICT (inquiry_id, team_member_id) DO NOTHING;

INSERT INTO public.project_channel_messages (
  channel_id, sender_member_id, sender_name, sender_role, body, created_at
)
SELECT
  channels.id,
  team.id,
  team.full_name,
  team.title,
  CASE messages.message_number
    WHEN 1 THEN 'Kickoff: confirm project goals, decision-makers, and review dates.'
    WHEN 2 THEN 'Concept round is ready. Please add feedback before the next check-in.'
    ELSE 'Progress update: the latest changes are available for the team to review.'
  END,
  now() - (messages.message_number * interval '3 days')
FROM public.projects
JOIN public.project_channels AS channels ON channels.project_id = projects.id
JOIN public.team_members AS team ON team.id = projects.project_manager_id
CROSS JOIN generate_series(1, 3) AS messages(message_number)
WHERE projects.inquiry_id BETWEEN
  'f3000000-0000-4000-8000-000000000011'::uuid
  AND 'f3000000-0000-4000-8000-000000000100'::uuid;

INSERT INTO public.project_messages (
  inquiry_id, sender_type, sender_id, sender_name, body, created_at
)
SELECT
  projects.inquiry_id,
  CASE messages.message_number WHEN 1 THEN 'team' ELSE 'designer' END,
  CASE messages.message_number
    WHEN 1 THEN 'f1000000-0000-4000-8000-000000000001'::uuid
    ELSE designers.user_id
  END,
  CASE messages.message_number WHEN 1 THEN 'Avery Stone' ELSE designers.full_name END,
  CASE messages.message_number
    WHEN 1 THEN 'We have prepared a first working direction based on your brief.'
    ELSE 'The updated work reflects the feedback from our last review.'
  END,
  now() - (messages.message_number * interval '2 days')
FROM public.projects
JOIN public.team_members AS designers
  ON designers.id = CASE right(projects.inquiry_id::text, 12)::integer % 2
    WHEN 0 THEN 'f2000000-0000-4000-8000-000000000004'::uuid
    ELSE 'f2000000-0000-4000-8000-000000000005'::uuid
  END
CROSS JOIN generate_series(1, 2) AS messages(message_number)
WHERE projects.inquiry_id BETWEEN
  'f3000000-0000-4000-8000-000000000011'::uuid
  AND 'f3000000-0000-4000-8000-000000000100'::uuid;

INSERT INTO public.project_request_logs (
  inquiry_id, created_at, completed_at, payout_amount, status, notes
)
SELECT
  projects.inquiry_id,
  now() - interval '20 days',
  CASE WHEN right(projects.inquiry_id::text, 12)::integer % 3 = 0
    THEN now() - interval '4 days'
    ELSE NULL
  END,
  CASE WHEN right(projects.inquiry_id::text, 12)::integer % 3 = 0
    THEN 750 + right(projects.inquiry_id::text, 12)::integer % 2500
    ELSE 0
  END,
  CASE WHEN right(projects.inquiry_id::text, 12)::integer % 3 = 0
    THEN 'completed'
    ELSE 'in_progress'
  END,
  'Synthetic delivery checkpoint for workflow testing.'
FROM public.projects
WHERE projects.inquiry_id BETWEEN
  'f3000000-0000-4000-8000-000000000011'::uuid
  AND 'f3000000-0000-4000-8000-000000000100'::uuid;

INSERT INTO public.company_expenses (
  inquiry_id, gross_revenue, total_paid_out, contributor_name,
  contributor_amount, contributor_role
)
SELECT
  projects.inquiry_id,
  5000 + right(projects.inquiry_id::text, 12)::integer % 20000,
  1000 + right(projects.inquiry_id::text, 12)::integer % 5000,
  designers.full_name,
  1000 + right(projects.inquiry_id::text, 12)::integer % 5000,
  designers.title
FROM public.projects
JOIN public.team_members AS designers
  ON designers.id = CASE right(projects.inquiry_id::text, 12)::integer % 2
    WHEN 0 THEN 'f2000000-0000-4000-8000-000000000004'::uuid
    ELSE 'f2000000-0000-4000-8000-000000000005'::uuid
  END
WHERE projects.inquiry_id BETWEEN
  'f3000000-0000-4000-8000-000000000011'::uuid
  AND 'f3000000-0000-4000-8000-000000000100'::uuid;

INSERT INTO public.inquiry_reference_files (
  id, inquiry_id, object_path, file_name, content_type, byte_size,
  status, processed_at
)
SELECT
  ('f4000000-0000-4000-8000-' || right(inquiries.id::text, 12))::uuid,
  inquiries.id,
  'pending/' || ('f4000000-0000-4000-8000-' || right(inquiries.id::text, 12))::uuid::text,
  'synthetic-reference-' || right(inquiries.id::text, 4) || '.png',
  'image/png',
  64000 + right(inquiries.id::text, 12)::integer % 100000,
  'ready',
  now() - interval '1 day'
FROM public.inquiries
WHERE inquiries.id BETWEEN
  'f3000000-0000-4000-8000-000000000011'::uuid
  AND 'f3000000-0000-4000-8000-000000000100'::uuid
  AND right(inquiries.id::text, 12)::integer % 3 = 0;
