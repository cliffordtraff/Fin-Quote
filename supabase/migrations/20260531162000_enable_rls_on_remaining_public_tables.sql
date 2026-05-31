-- Enable RLS on any remaining public tables that were created before
-- policy coverage was complete. Preserve public read access for market data
-- while preventing anonymous/authenticated writes.

DO $$
DECLARE
  table_record record;
  read_policy_name text;
  service_policy_name text;
BEGIN
  FOR table_record IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity = false
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      table_record.schema_name,
      table_record.table_name
    );

    read_policy_name := 'public_read_' || table_record.table_name;
    service_policy_name := 'service_role_all_' || table_record.table_name;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = table_record.schema_name
        AND tablename = table_record.table_name
        AND policyname = read_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR SELECT TO anon, authenticated USING (true)',
        read_policy_name,
        table_record.schema_name,
        table_record.table_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = table_record.schema_name
        AND tablename = table_record.table_name
        AND policyname = service_policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        service_policy_name,
        table_record.schema_name,
        table_record.table_name
      );
    END IF;
  END LOOP;
END $$;
