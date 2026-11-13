SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"access_level":"studio_member"}}',
  false
);
SELECT set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', false);

UPDATE public.projects
SET project_name = CASE inquiries.id
      WHEN 'f3000000-0000-4000-8000-000000000003' THEN 'Northstar Pantry identity'
      WHEN 'f3000000-0000-4000-8000-000000000004' THEN 'Atlas Fieldwork website'
      WHEN 'f3000000-0000-4000-8000-000000000007' THEN 'Wildfern identity and packaging'
      WHEN 'f3000000-0000-4000-8000-000000000009' THEN 'Fieldnotes Health onboarding'
    END,
    project_manager_id = CASE inquiries.id
      WHEN 'f3000000-0000-4000-8000-000000000003' THEN 'f2000000-0000-4000-8000-000000000001'::uuid
      WHEN 'f3000000-0000-4000-8000-000000000004' THEN 'f2000000-0000-4000-8000-000000000002'::uuid
      WHEN 'f3000000-0000-4000-8000-000000000007' THEN 'f2000000-0000-4000-8000-000000000003'::uuid
      WHEN 'f3000000-0000-4000-8000-000000000009' THEN 'f2000000-0000-4000-8000-000000000001'::uuid
    END,
    deadline_date = CASE inquiries.id
      WHEN 'f3000000-0000-4000-8000-000000000003' THEN current_date + 45
      WHEN 'f3000000-0000-4000-8000-000000000004' THEN current_date + 75
      WHEN 'f3000000-0000-4000-8000-000000000007' THEN current_date + 30
      WHEN 'f3000000-0000-4000-8000-000000000009' THEN current_date + 100
    END
FROM public.inquiries
WHERE inquiries.id = public.projects.inquiry_id
  AND inquiries.id IN (
    'f3000000-0000-4000-8000-000000000003',
    'f3000000-0000-4000-8000-000000000004',
    'f3000000-0000-4000-8000-000000000007',
    'f3000000-0000-4000-8000-000000000009'
  );

INSERT INTO public.project_members (project_id, team_member_id, role_name)
SELECT projects.id, members.team_member_id, members.role_name
FROM (
  VALUES
    ('f3000000-0000-4000-8000-000000000003'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid, 'DESIGNER'),
    ('f3000000-0000-4000-8000-000000000004'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'DESIGNER'),
    ('f3000000-0000-4000-8000-000000000007'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid, 'DESIGNER'),
    ('f3000000-0000-4000-8000-000000000009'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid, 'DESIGNER')
) AS members(inquiry_id, team_member_id, role_name)
JOIN public.projects ON projects.inquiry_id = members.inquiry_id;

INSERT INTO public.project_assignments (
  inquiry_id, team_member_id, role_name, is_project_manager
)
SELECT projects.inquiry_id, projects.project_manager_id, 'PROJECT_MANAGER', true
FROM public.projects
WHERE projects.inquiry_id IN (
  'f3000000-0000-4000-8000-000000000003',
  'f3000000-0000-4000-8000-000000000004',
  'f3000000-0000-4000-8000-000000000007',
  'f3000000-0000-4000-8000-000000000009'
);

INSERT INTO public.project_assignments (
  inquiry_id, team_member_id, role_name, is_project_manager
)
SELECT projects.inquiry_id, members.team_member_id, 'DESIGNER', false
FROM (
  VALUES
    ('f3000000-0000-4000-8000-000000000003'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid),
    ('f3000000-0000-4000-8000-000000000004'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid),
    ('f3000000-0000-4000-8000-000000000007'::uuid, 'f2000000-0000-4000-8000-000000000004'::uuid),
    ('f3000000-0000-4000-8000-000000000009'::uuid, 'f2000000-0000-4000-8000-000000000005'::uuid)
) AS members(inquiry_id, team_member_id)
JOIN public.projects ON projects.inquiry_id = members.inquiry_id;

INSERT INTO public.project_channels (
  channel_name, channel_type, description
)
VALUES
  (
    'Studio General',
    'general',
    'General studio coordination for the local synthetic workspace.'
  ),
  (
    'Studio Announcements',
    'announcement',
    'Announcements for the local synthetic workspace.'
  );

INSERT INTO public.project_channel_members (channel_id, team_member_id, role)
SELECT channels.id, members.id, 'member'
FROM public.project_channels AS channels
CROSS JOIN public.team_members AS members
WHERE channels.channel_name IN ('Studio General', 'Studio Announcements')
ON CONFLICT (channel_id, team_member_id) DO NOTHING;

INSERT INTO public.project_channel_messages (
  channel_id, sender_member_id, sender_name, sender_role, body
)
SELECT
  channels.id,
  members.id,
  members.full_name,
  members.title,
  messages.body
FROM (
  VALUES
    ('Studio General', 'f2000000-0000-4000-8000-000000000001'::uuid, 'Welcome to the local Kiln Studio workspace.'),
    ('Studio General', 'f2000000-0000-4000-8000-000000000004'::uuid, 'The Northstar moodboard is ready for review.'),
    ('Studio Announcements', 'f2000000-0000-4000-8000-000000000001'::uuid, 'This workspace contains synthetic data only.')
) AS messages(channel_name, team_member_id, body)
JOIN public.project_channels AS channels
  ON channels.channel_name = messages.channel_name
JOIN public.team_members AS members
  ON members.id = messages.team_member_id;

INSERT INTO public.project_channel_messages (
  channel_id, sender_member_id, sender_name, sender_role, body
)
SELECT
  channels.id,
  members.id,
  members.full_name,
  members.title,
  'Kickoff notes are ready. Please add questions and references here.'
FROM public.projects
JOIN public.project_channels AS channels ON channels.project_id = projects.id
JOIN public.team_members AS members ON members.id = projects.project_manager_id;

INSERT INTO public.project_messages (
  inquiry_id, sender_type, sender_id, sender_name, body
)
VALUES
  (
    'f3000000-0000-4000-8000-000000000003',
    'client',
    NULL,
    'Priya Shah',
    'We would like the packaging to work for both market stalls and retail shelves.'
  ),
  (
    'f3000000-0000-4000-8000-000000000003',
    'team',
    'f1000000-0000-4000-8000-000000000001',
    'Avery Stone',
    'We will include both use cases in the first round of concepts.'
  ),
  (
    'f3000000-0000-4000-8000-000000000004',
    'designer',
    'f1000000-0000-4000-8000-000000000005',
    'Riley Patel',
    'I have a first pass at the research-services navigation ready.'
  );

INSERT INTO public.project_request_logs (
  inquiry_id, completed_at, payout_amount, status, notes
)
VALUES
  (
    'f3000000-0000-4000-8000-000000000003',
    NULL,
    0,
    'in_progress',
    'Discovery and identity exploration are underway.'
  ),
  (
    'f3000000-0000-4000-8000-000000000004',
    now() - interval '2 days',
    1800,
    'completed',
    'Completed the initial information architecture review.'
  );

INSERT INTO public.company_expenses (
  inquiry_id, gross_revenue, total_paid_out, contributor_name,
  contributor_amount, contributor_role
)
VALUES (
  'f3000000-0000-4000-8000-000000000003',
  15000,
  4000,
  'Jordan Kim',
  4000,
  'Brand Designer'
);

INSERT INTO public.inquiry_reference_files (
  id, object_path, file_name, content_type, byte_size
)
VALUES
  (
    'f4000000-0000-4000-8000-000000000001',
    'pending/f4000000-0000-4000-8000-000000000001',
    'northstar-packaging-sketch.png',
    'image/png',
    184320
  ),
  (
    'f4000000-0000-4000-8000-000000000002',
    'pending/f4000000-0000-4000-8000-000000000002',
    'wildfern-label-reference.jpg',
    'image/jpeg',
    251904
  );

INSERT INTO public.customer_support_messages (
  request_id, question, answer, model
)
VALUES (
  'f5000000-0000-4000-8000-000000000001',
  'What should I prepare before submitting an inquiry?',
  'A short project brief, desired timeline, budget range, and any useful references help the studio scope the request.',
  'synthetic-seed'
);
