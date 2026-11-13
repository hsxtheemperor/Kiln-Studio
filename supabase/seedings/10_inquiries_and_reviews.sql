INSERT INTO public.inquiries (
  id,
  client_id,
  name,
  email,
  company,
  service,
  project_brief,
  budget_range,
  timeline,
  status,
  priority_score,
  similarity_opt_in,
  similarity_opted_in_at,
  similarity_status,
  similarity_matches
)
VALUES
  (
    'f3000000-0000-4000-8000-000000000001',
    NULL,
    'Jamie Brooks',
    'jamie@cedarandstone.example.test',
    'Cedar & Stone',
    'brand_identity',
    'Create a warm identity system for a neighborhood bakery expanding to a second location.',
    '10k_25k',
    '12 weeks',
    'new',
    8,
    false,
    NULL,
    'not_requested',
    '[]'::jsonb
  ),
  (
    'f3000000-0000-4000-8000-000000000002',
    NULL,
    'Nico Alvarez',
    'nico@orbit.example.test',
    'Orbit Learning',
    'product_design',
    'Improve onboarding and course discovery for a small online learning platform.',
    '5k_10k',
    '6 weeks',
    'new',
    6,
    false,
    NULL,
    'not_requested',
    '[]'::jsonb
  ),
  (
    'f3000000-0000-4000-8000-000000000003',
    NULL,
    'Priya Shah',
    'priya@northstar.example.test',
    'Northstar Pantry',
    'brand_identity',
    'Build a flexible identity for a pantry brand focused on local ingredients.',
    '10k_25k',
    '10 weeks',
    'new',
    9,
    true,
    now() - interval '12 days',
    'ready',
    '[{"id":"f9000000-0000-4000-8000-000000000001","score":0.84,"label":"Packaging refresh"}]'::jsonb
  ),
  (
    'f3000000-0000-4000-8000-000000000004',
    NULL,
    'Ellis Grant',
    'ellis@atlas.example.test',
    'Atlas Fieldwork',
    'web_design',
    'Design a clear public site for a research team that works with community organizations.',
    '25k_50k',
    '16 weeks',
    'new',
    7,
    false,
    NULL,
    'not_requested',
    '[]'::jsonb
  ),
  (
    'f3000000-0000-4000-8000-000000000005',
    NULL,
    'Casey Park',
    'casey@daybreak.example.test',
    'Daybreak Goods',
    'web_design',
    'Refresh a direct-to-consumer storefront and product storytelling.',
    '5k_10k',
    '8 weeks',
    'new',
    3,
    false,
    NULL,
    'not_requested',
    '[]'::jsonb
  ),
  (
    'f3000000-0000-4000-8000-000000000006',
    NULL,
    'Robin Wells',
    'robin@commonroom.example.test',
    'Common Room',
    'product_design',
    'Prototype a lightweight scheduling tool for a shared creative workspace.',
    '10k_25k',
    '14 weeks',
    'new',
    5,
    true,
    now() - interval '2 days',
    'pending',
    '[]'::jsonb
  ),
  (
    'f3000000-0000-4000-8000-000000000007',
    NULL,
    'Drew Morgan',
    'drew@wildfern.example.test',
    'Wildfern Botanics',
    'brand_identity',
    'Create an identity and packaging direction for a small-batch botanical line.',
    '10k_25k',
    '9 weeks',
    'new',
    8,
    false,
    NULL,
    'not_requested',
    '[]'::jsonb
  ),
  (
    'f3000000-0000-4000-8000-000000000008',
    'f1100000-0000-4000-8000-000000000001',
    'Sam Rivera',
    'client-one@example.test',
    'Juniper Coffee',
    'web_design',
    'Build a simple website with locations, seasonal menus, and wholesale information.',
    '5k_10k',
    '8 weeks',
    'new',
    4,
    false,
    NULL,
    'not_requested',
    '[]'::jsonb
  ),
  (
    'f3000000-0000-4000-8000-000000000009',
    NULL,
    'Mina Chen',
    'mina@fieldnotes.example.test',
    'Fieldnotes Health',
    'product_design',
    'Clarify the first-run experience for a patient education product.',
    '25k_50k',
    '18 weeks',
    'new',
    10,
    true,
    now() - interval '20 days',
    'ready',
    '[]'::jsonb
  ),
  (
    'f3000000-0000-4000-8000-000000000010',
    'f1100000-0000-4000-8000-000000000002',
    'Alex Chen',
    'client-two@example.test',
    'Fieldnotes Research',
    'brand_identity',
    'Develop a distinct identity for a research initiative connected to Fieldnotes Health.',
    'under_5k',
    '4 weeks',
    'new',
    2,
    false,
    NULL,
    'not_requested',
    '[]'::jsonb
  );

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
VALUES
  (
    'f3000000-0000-4000-8000-000000000001',
    'Feel established while keeping a handmade character.',
    'Thoughtful food, made close to home.',
    'Local families and morning commuters',
    'A memorable identity that works on storefront, packaging, and social media.',
    'https://example.test/cedar-moodboard',
    '12 weeks',
    6
  ),
  (
    'f3000000-0000-4000-8000-000000000002',
    'Help new learners find a relevant first course.',
    'Learning should fit into real life.',
    'Adult learners returning to study',
    'A more understandable onboarding flow.',
    NULL,
    '6 weeks',
    5
  ),
  (
    'f3000000-0000-4000-8000-000000000003',
    'Create a flexible and recognizable pantry identity.',
    'Good ingredients, shared generously.',
    'People who shop seasonally and cook at home',
    'Identity, packaging, and a digital starter kit.',
    'https://example.test/northstar-reference',
    '10 weeks',
    7
  ),
  (
    'f3000000-0000-4000-8000-000000000004',
    'Make a complex research offer easy to understand.',
    'Better decisions start with better questions.',
    'Nonprofit and public-sector research teams',
    'A clear information architecture and accessible site.',
    NULL,
    '16 weeks',
    8
  ),
  (
    'f3000000-0000-4000-8000-000000000005',
    'Show product value quickly.',
    'Useful objects for everyday rituals.',
    'Design-conscious home shoppers',
    'Improved product pages and brand storytelling.',
    NULL,
    '8 weeks',
    4
  ),
  (
    'f3000000-0000-4000-8000-000000000006',
    'Reduce friction when booking shared space.',
    'Make room for good work.',
    'Independent creative professionals',
    'A testable scheduling prototype.',
    NULL,
    '14 weeks',
    6
  ),
  (
    'f3000000-0000-4000-8000-000000000007',
    'Bring the product range under a coherent visual system.',
    'Small batches, considered ingredients.',
    'Wellness and plant-care customers',
    'A reusable identity with packaging guidelines.',
    'https://example.test/wildfern-reference',
    '9 weeks',
    7
  ),
  (
    'f3000000-0000-4000-8000-000000000008',
    'Make practical details easy to find.',
    'Coffee for the everyday neighborhood.',
    'Juniper Coffee regulars and visitors',
    'A small, maintainable public website.',
    NULL,
    '8 weeks',
    4
  ),
  (
    'f3000000-0000-4000-8000-000000000009',
    'Make the first session feel calm and understandable.',
    'Reliable guidance, one step at a time.',
    'People managing a new health routine',
    'A clearer first-use experience for the app.',
    NULL,
    '18 weeks',
    8
  ),
  (
    'f3000000-0000-4000-8000-000000000010',
    'Differentiate a research program from its parent company.',
    'Evidence for more useful services.',
    'Service designers and research partners',
    'A modest identity toolkit.',
    NULL,
    '4 weeks',
    3
  );

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated","app_metadata":{"access_level":"deal_lead"}}',
  false
);
SELECT set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000002', false);

SELECT public.review_engagement(
  'f3000000-0000-4000-8000-000000000002',
  'needs_info',
  'Clarify decision-makers and the course catalog scope.'
);
SELECT public.review_engagement(
  'f3000000-0000-4000-8000-000000000003',
  'suitable',
  'Clear need, defined scope, and a realistic launch window.'
);
SELECT public.claim_engagement('f3000000-0000-4000-8000-000000000003');
SELECT public.review_engagement(
  'f3000000-0000-4000-8000-000000000005',
  'not_suitable',
  'The request is outside the studio service scope.'
);
SELECT public.review_engagement(
  'f3000000-0000-4000-8000-000000000007',
  'suitable',
  'Good fit for the identity and packaging team.'
);
SELECT public.claim_engagement('f3000000-0000-4000-8000-000000000007');
SELECT public.review_engagement(
  'f3000000-0000-4000-8000-000000000009',
  'suitable',
  'Strong fit with adequate budget and time for product discovery.'
);
SELECT public.claim_engagement('f3000000-0000-4000-8000-000000000009');

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated","app_metadata":{"access_level":"deal_lead"}}',
  false
);
SELECT set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000003', false);
SELECT public.review_engagement(
  'f3000000-0000-4000-8000-000000000004',
  'suitable',
  'The research website has a clear audience and defined requirements.'
);
SELECT public.claim_engagement('f3000000-0000-4000-8000-000000000004');
SELECT public.review_engagement(
  'f3000000-0000-4000-8000-000000000006',
  'suitable',
  'The prototype can be scoped as a focused discovery engagement.'
);
SELECT public.claim_engagement('f3000000-0000-4000-8000-000000000006');

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"access_level":"studio_member"}}',
  false
);
SELECT set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', false);
SELECT public.reassign_engagement(
  'f3000000-0000-4000-8000-000000000007',
  'f1000000-0000-4000-8000-000000000003'
);

UPDATE public.inquiries
SET status = 'contacted'
WHERE id = 'f3000000-0000-4000-8000-000000000002';

UPDATE public.inquiries
SET status = 'accepted'
WHERE id IN (
  'f3000000-0000-4000-8000-000000000003',
  'f3000000-0000-4000-8000-000000000004',
  'f3000000-0000-4000-8000-000000000007',
  'f3000000-0000-4000-8000-000000000009'
);

UPDATE public.inquiries
SET status = 'in_progress'
WHERE id = 'f3000000-0000-4000-8000-000000000004';

UPDATE public.inquiries
SET status = 'closed'
WHERE id = 'f3000000-0000-4000-8000-000000000005';
