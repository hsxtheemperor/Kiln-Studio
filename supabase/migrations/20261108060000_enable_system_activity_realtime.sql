DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.system_activity_logs;
  END IF;
END;
$$;
