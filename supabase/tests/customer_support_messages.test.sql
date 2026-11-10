BEGIN;

SELECT no_plan();

SELECT ok(
  (SELECT relrowsecurity
   FROM pg_catalog.pg_class
   WHERE oid = 'public.customer_support_messages'::regclass),
  'customer support history has row-level security enabled'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.customer_support_messages', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.customer_support_messages', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.customer_support_messages', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.customer_support_messages', 'INSERT'),
  'public and signed-in users cannot read or write support history directly'
);
SELECT ok(
  has_column_privilege(
    'service_role',
    'public.customer_support_messages',
    'question',
    'INSERT'
  )
  AND has_column_privilege(
    'service_role',
    'public.customer_support_messages',
    'answer',
    'INSERT'
  ),
  'service role can persist question and answer pairs'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.customer_support_messages'::regclass
      AND attnum > 0
      AND NOT attisdropped
      AND attname IN ('user_id', 'client_id', 'email', 'ip_address')
  ),
  'support history stores no account, email, or IP identity'
);

SET LOCAL ROLE service_role;
INSERT INTO public.customer_support_messages (
  request_id, question, answer, model
)
VALUES (
  '50000000-0000-4000-8000-000000000001',
  'What services are available?',
  'Brand identity, web design, and product design.',
  'gemini-3.8-flash'
)
ON CONFLICT (request_id) DO NOTHING;
INSERT INTO public.customer_support_messages (
  request_id, question, answer, model
)
VALUES (
  '50000000-0000-4000-8000-000000000001',
  'What services are available?',
  'Brand identity, web design, and product design.',
  'gemini-3.8-flash'
)
ON CONFLICT (request_id) DO NOTHING;
RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.customer_support_messages
    WHERE request_id = '50000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'workflow retries do not duplicate a support exchange'
);

SELECT * FROM finish();
ROLLBACK;
