BEGIN;

SELECT no_plan();

SELECT ok(
  NOT has_table_privilege('anon', 'public.inquiry_reference_files', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'public.inquiry_reference_files', 'SELECT,INSERT,UPDATE,DELETE'),
  'anonymous and authenticated roles cannot access reference-file metadata directly'
);
SELECT ok(
  has_table_privilege('service_role', 'public.inquiry_reference_files', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role can manage reference metadata'
);
SELECT ok(
  (SELECT relrowsecurity
   FROM pg_catalog.pg_class
   WHERE oid = 'storage.objects'::regclass),
  'storage object access is guarded by row-level security'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND roles && ARRAY['anon'::name, 'public'::name]
  ),
  'no anonymous or public policy can read stored objects'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'inquiry-references'
      AND public = false
      AND file_size_limit = 8388608
      AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  'reference bucket is private and restricts image types and file size'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.create_public_inquiry_with_references(jsonb,jsonb,uuid[])',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon',
    'public.create_public_inquiry_with_references(jsonb,jsonb,uuid[])',
    'EXECUTE'
  ),
  'only service role can atomically attach reference images to an inquiry'
);

INSERT INTO public.inquiry_reference_files (
  id,
  object_path,
  file_name,
  content_type,
  byte_size
)
VALUES (
  '40000000-0000-0000-0000-000000000001',
  'pending/40000000-0000-0000-0000-000000000001',
  'homepage-moodboard.png',
  'image/png',
  2048
);

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$ SELECT public.create_public_inquiry_with_references(
       '{"name":"Reference Inquiry","email":"reference@example.test","project_brief":"Visual direction","priority_score":3}',
       '{"design_goal":"A visual refresh"}',
       ARRAY['40000000-0000-0000-0000-000000000001']::uuid[]
     ) $$,
  'service role atomically persists an inquiry and associates its uploaded references'
);
RESET ROLE;

SELECT is(
  (SELECT status FROM public.inquiry_reference_files
   WHERE id = '40000000-0000-0000-0000-000000000001'),
  'queued',
  'associated images enter the background verification queue'
);
SELECT is(
  (SELECT inquiry_id FROM public.inquiry_reference_files
   WHERE id = '40000000-0000-0000-0000-000000000001'),
  (SELECT id FROM public.inquiries WHERE email = 'reference@example.test'),
  'reference image remains linked to its inquiry'
);
SELECT throws_ok(
  $$ SELECT public.create_public_inquiry_with_references(
       '{"name":"Duplicate Reference","email":"duplicate-reference@example.test","project_brief":"Should fail"}',
       '{}',
       ARRAY['40000000-0000-0000-0000-000000000001']::uuid[]
     ) $$,
  'P0001',
  NULL,
  'an upload cannot be attached to a second inquiry'
);

INSERT INTO public.inquiry_reference_files (
  id,
  object_path,
  file_name,
  content_type,
  byte_size
)
VALUES
  ('40000000-0000-0000-0000-000000000002', 'pending/40000000-0000-0000-0000-000000000002', 'one.png', 'image/png', 8388608),
  ('40000000-0000-0000-0000-000000000003', 'pending/40000000-0000-0000-0000-000000000003', 'two.png', 'image/png', 8388608),
  ('40000000-0000-0000-0000-000000000004', 'pending/40000000-0000-0000-0000-000000000004', 'three.png', 'image/png', 8388608),
  ('40000000-0000-0000-0000-000000000005', 'pending/40000000-0000-0000-0000-000000000005', 'four.png', 'image/png', 8388608);

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$ SELECT public.create_public_inquiry_with_references(
       '{"name":"Oversize Reference Set","email":"oversize-reference@example.test","project_brief":"Should fail"}',
       '{}',
       ARRAY[
         '40000000-0000-0000-0000-000000000002',
         '40000000-0000-0000-0000-000000000003',
         '40000000-0000-0000-0000-000000000004',
         '40000000-0000-0000-0000-000000000005'
       ]::uuid[]
     ) $$,
  'P0001',
  NULL,
  'the database rejects reference selections over the total-size limit'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
