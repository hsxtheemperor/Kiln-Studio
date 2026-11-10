CREATE TABLE public.customer_support_messages (
  request_id uuid PRIMARY KEY,
  question text NOT NULL
    CHECK (char_length(btrim(question)) BETWEEN 1 AND 1000),
  answer text NOT NULL
    CHECK (char_length(btrim(answer)) BETWEEN 1 AND 2000),
  model text NOT NULL
    CHECK (char_length(btrim(model)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_support_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customer_support_messages
  FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT (request_id, question, answer, model)
  ON TABLE public.customer_support_messages TO service_role;
