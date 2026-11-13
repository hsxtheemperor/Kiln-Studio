-- Local-only accounts for exercising each authorization boundary.
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  is_sso_user,
  is_anonymous,
  created_at,
  updated_at
)
VALUES
  (
    'f1000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'studio-admin@example.test',
    crypt('kiln-local-demo', gen_salt('bf')),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    now(),
    '{"provider":"email","providers":["email"],"access_level":"studio_member"}',
    '{"full_name":"Avery Stone"}',
    false,
    false,
    false,
    now(),
    now()
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'deal-lead-one@example.test',
    crypt('kiln-local-demo', gen_salt('bf')),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    now(),
    '{"provider":"email","providers":["email"],"access_level":"deal_lead"}',
    '{"full_name":"Morgan Lee"}',
    false,
    false,
    false,
    now(),
    now()
  ),
  (
    'f1000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'deal-lead-two@example.test',
    crypt('kiln-local-demo', gen_salt('bf')),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    now(),
    '{"provider":"email","providers":["email"],"access_level":"deal_lead"}',
    '{"full_name":"Taylor Quinn"}',
    false,
    false,
    false,
    now(),
    now()
  ),
  (
    'f1000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'designer-one@example.test',
    crypt('kiln-local-demo', gen_salt('bf')),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    now(),
    '{"provider":"email","providers":["email"],"access_level":"designer"}',
    '{"full_name":"Jordan Kim"}',
    false,
    false,
    false,
    now(),
    now()
  ),
  (
    'f1000000-0000-4000-8000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'designer-two@example.test',
    crypt('kiln-local-demo', gen_salt('bf')),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    now(),
    '{"provider":"email","providers":["email"],"access_level":"designer"}',
    '{"full_name":"Riley Patel"}',
    false,
    false,
    false,
    now(),
    now()
  ),
  (
    'f1000000-0000-4000-8000-000000000006',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'client-one@example.test',
    crypt('kiln-local-demo', gen_salt('bf')),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    now(),
    '{"provider":"email","providers":["email"],"access_level":"client"}',
    '{"full_name":"Sam Rivera"}',
    false,
    false,
    false,
    now(),
    now()
  ),
  (
    'f1000000-0000-4000-8000-000000000007',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'client-two@example.test',
    crypt('kiln-local-demo', gen_salt('bf')),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    now(),
    '{"provider":"email","providers":["email"],"access_level":"client"}',
    '{"full_name":"Alex Chen"}',
    false,
    false,
    false,
    now(),
    now()
  );

INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  users.id::text,
  users.id,
  jsonb_build_object(
    'sub', users.id::text,
    'email', users.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
FROM auth.users AS users
WHERE users.id BETWEEN
    'f1000000-0000-4000-8000-000000000001'::uuid
    AND 'f1000000-0000-4000-8000-000000000007'::uuid;

INSERT INTO public.team_members (
  id, user_id, full_name, email, title, specialty, availability_status
)
VALUES
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'Avery Stone',
    'studio-admin@example.test',
    'Studio Director',
    'Creative direction',
    'available'
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000002',
    'Morgan Lee',
    'deal-lead-one@example.test',
    'Deal Lead',
    'Brand strategy',
    'available'
  ),
  (
    'f2000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000003',
    'Taylor Quinn',
    'deal-lead-two@example.test',
    'Deal Lead',
    'Digital products',
    'busy'
  ),
  (
    'f2000000-0000-4000-8000-000000000004',
    'f1000000-0000-4000-8000-000000000004',
    'Jordan Kim',
    'designer-one@example.test',
    'Brand Designer',
    'Identity systems',
    'available'
  ),
  (
    'f2000000-0000-4000-8000-000000000005',
    'f1000000-0000-4000-8000-000000000005',
    'Riley Patel',
    'designer-two@example.test',
    'Product Designer',
    'Web and product design',
    'away'
  );

INSERT INTO public.client_profiles (id, user_id, full_name, email)
VALUES
  (
    'f1100000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000006',
    'Sam Rivera',
    'client-one@example.test'
  ),
  (
    'f1100000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000007',
    'Alex Chen',
    'client-two@example.test'
  );

INSERT INTO public.client_companies (id, client_id, company_name, is_primary)
VALUES
  (
    'f1200000-0000-4000-8000-000000000001',
    'f1100000-0000-4000-8000-000000000001',
    'Juniper Coffee',
    true
  ),
  (
    'f1200000-0000-4000-8000-000000000002',
    'f1100000-0000-4000-8000-000000000002',
    'Fieldnotes Health',
    true
  ),
  (
    'f1200000-0000-4000-8000-000000000003',
    'f1100000-0000-4000-8000-000000000002',
    'Fieldnotes Research',
    false
  );
