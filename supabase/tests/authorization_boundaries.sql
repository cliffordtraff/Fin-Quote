BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

-- Keep the authorization contract in one executable matrix. Public market data
-- may be readable through the Data API, but only the service role may mutate it.
CREATE TEMP TABLE authorization_service_managed_tables (
  table_name text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO authorization_service_managed_tables (table_name)
VALUES
  ('analyst_estimates'),
  ('bars_daily'),
  ('bars_minute'),
  ('calendar_summaries_cache'),
  ('company'),
  ('company_metrics'),
  ('company_profile'),
  ('company_profiles'),
  ('dashboard_chart_of_day_settings'),
  ('earnings_history'),
  ('evaluation_annotations'),
  ('filing_chunks'),
  ('filings'),
  ('financial_metrics'),
  ('financials_std'),
  ('finviz_catalyst_snapshots'),
  ('finviz_catalysts'),
  ('ingestion_log'),
  ('ingestion_logs'),
  ('insider_transactions'),
  ('insiders'),
  ('manual_eval_reviews'),
  ('market_movers_cache'),
  ('market_summary_cache'),
  ('market_trends_cache'),
  ('monthly_ratio_snapshots'),
  ('newsletter_beehiiv_deliveries'),
  ('newsletter_beehiiv_sync_operations'),
  ('newsletter_chart_library'),
  ('newsletter_cron_runs'),
  ('newsletter_daily_automation_runs'),
  ('newsletter_integrations'),
  ('newsletter_mid_morning_runs'),
  ('newsletter_picks'),
  ('newsletter_draft_events'),
  ('newsletter_draft_fork_requests'),
  ('newsletter_drafts'),
  ('newsletter_webhook_outbox'),
  ('price_performance'),
  ('prompt_versions'),
  ('ranker_config_versions'),
  ('sp500_constituents'),
  ('stock_summaries'),
  ('stock_why_moving_cache'),
  ('stock_why_moving_reviews'),
  ('summary_evals'),
  ('technical_indicators'),
  ('ticker_brand_colors'),
  ('us_stocks'),
  ('watchlist_dividends'),
  ('watchlist_earnings'),
  ('watchlist_extended_hours'),
  ('watchlist_metrics'),
  ('watchlist_news_archive'),
  ('watchlist_quotes'),
  ('watchlist_symbol_mapping'),
  ('wiim_cost_runs'),
  ('wiim_run_candidates'),
  ('wiim_runs'),
  ('wiim_summary_runs');

CREATE TEMP TABLE authorization_service_only_tables (
  table_name text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO authorization_service_only_tables (table_name)
VALUES
  ('dashboard_chart_of_day_settings'),
  ('evaluation_annotations'),
  ('filing_chunks'),
  ('ingestion_log'),
  ('ingestion_logs'),
  ('manual_eval_reviews'),
  ('newsletter_beehiiv_deliveries'),
  ('newsletter_beehiiv_sync_operations'),
  ('newsletter_cron_runs'),
  ('newsletter_daily_automation_runs'),
  ('newsletter_integrations'),
  ('newsletter_mid_morning_runs'),
  ('newsletter_picks'),
  ('newsletter_draft_fork_requests'),
  ('newsletter_webhook_outbox'),
  ('prompt_versions'),
  ('ranker_config_versions'),
  ('stock_why_moving_reviews'),
  ('summary_evals'),
  ('wiim_cost_runs'),
  ('wiim_run_candidates'),
  ('wiim_runs'),
  ('wiim_summary_runs');

CREATE TEMP TABLE authorization_owner_tables (
  table_name text PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO authorization_owner_tables (table_name)
VALUES
  ('conversations'),
  ('docs'),
  ('messages'),
  ('newsletter_chart_library'),
  ('newsletter_daily_run_items'),
  ('newsletter_daily_runs'),
  ('newsletter_daily_settings'),
  ('newsletter_draft_events'),
  ('newsletter_drafts'),
  ('newsletter_notifications'),
  ('query_logs'),
  ('watchlist_items'),
  ('watchlist_settings'),
  ('watchlist_tabs'),
  ('watchlists');

SELECT is(
  (
    SELECT count(*)
    FROM authorization_service_managed_tables
    WHERE to_regclass(format('public.%I', table_name)) IS NULL
  ),
  0::bigint,
  'every service-managed table in the authorization contract exists'
);

SELECT is(
  (
    SELECT count(*)
    FROM authorization_owner_tables AS owned
    JOIN pg_class AS relation
      ON relation.oid = to_regclass(format('public.%I', owned.table_name))
    WHERE NOT relation.relrowsecurity
  ),
  0::bigint,
  'every authenticated owner table has row-level security enabled'
);

SELECT is(
  (
    SELECT count(*)
    FROM authorization_service_managed_tables
    WHERE has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', table_name), 'DELETE')
       OR has_table_privilege('anon', format('public.%I', table_name), 'TRUNCATE')
       OR has_any_column_privilege('anon', format('public.%I', table_name), 'INSERT')
       OR has_any_column_privilege('anon', format('public.%I', table_name), 'UPDATE')
  ),
  0::bigint,
  'anon has no direct or column-level write privilege on service-managed tables'
);

SELECT is(
  (
    SELECT count(*)
    FROM authorization_service_managed_tables
    WHERE has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE')
       OR has_table_privilege('authenticated', format('public.%I', table_name), 'TRUNCATE')
       OR has_any_column_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       OR has_any_column_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
  ),
  0::bigint,
  'authenticated has no direct or column-level write privilege on service-managed tables'
);

SELECT is(
  (
    SELECT count(*)
    FROM authorization_service_managed_tables
    WHERE NOT has_table_privilege(
      'service_role',
      format('public.%I', table_name),
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'
    )
  ),
  0::bigint,
  'service role retains full table access to service-managed data'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_policies AS policy
    JOIN authorization_service_managed_tables AS managed
      ON managed.table_name = policy.tablename
    WHERE policy.schemaname = 'public'
      AND policy.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND policy.roles && ARRAY['public', 'anon', 'authenticated']::name[]
  ),
  0::bigint,
  'service-managed tables have no write policy applicable to public API roles'
);

SELECT is(
  (
    SELECT count(*)
    FROM authorization_service_only_tables
    WHERE has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       OR has_any_column_privilege('anon', format('public.%I', table_name), 'SELECT')
  ),
  0::bigint,
  'anon cannot read service-only operational and review tables'
);

SELECT is(
  (
    SELECT count(*)
    FROM authorization_service_only_tables
    WHERE has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       OR has_any_column_privilege('authenticated', format('public.%I', table_name), 'SELECT')
  ),
  0::bigint,
  'authenticated cannot read service-only operational and review tables'
);

SELECT is(
  (
    SELECT count(*)
    FROM authorization_owner_tables
    WHERE has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
       OR has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
       OR has_table_privilege('anon', format('public.%I', table_name), 'DELETE')
       OR has_table_privilege('anon', format('public.%I', table_name), 'TRUNCATE')
       OR has_any_column_privilege('anon', format('public.%I', table_name), 'SELECT')
       OR has_any_column_privilege('anon', format('public.%I', table_name), 'INSERT')
       OR has_any_column_privilege('anon', format('public.%I', table_name), 'UPDATE')
  ),
  0::bigint,
  'anon has no access to authenticated owner-scoped tables'
);

SELECT is(
  (
    SELECT count(*)
    FROM authorization_owner_tables
    WHERE has_table_privilege('authenticated', format('public.%I', table_name), 'TRUNCATE')
  ),
  0::bigint,
  'authenticated cannot bypass owner isolation with TRUNCATE'
);

CREATE TEMP TABLE authorization_expected_owner_privileges (
  table_name text NOT NULL,
  privilege_name text NOT NULL,
  PRIMARY KEY (table_name, privilege_name)
) ON COMMIT DROP;

INSERT INTO authorization_expected_owner_privileges (table_name, privilege_name)
SELECT table_name, privilege_name
FROM unnest(ARRAY[
  'conversations',
  'docs',
  'newsletter_daily_settings',
  'watchlist_items',
  'watchlist_settings',
  'watchlist_tabs',
  'watchlists'
]) AS managed(table_name)
CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS wanted(privilege_name)
UNION ALL
SELECT table_name, privilege_name
FROM unnest(ARRAY['messages']) AS managed(table_name)
CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'DELETE']) AS wanted(privilege_name)
UNION ALL
SELECT table_name, privilege_name
FROM unnest(ARRAY[
  'newsletter_chart_library',
  'newsletter_daily_run_items',
  'newsletter_daily_runs',
  'newsletter_draft_events',
  'newsletter_drafts'
]) AS managed(table_name)
CROSS JOIN unnest(ARRAY['SELECT']) AS wanted(privilege_name);

SELECT is(
  (
    SELECT count(*)
    FROM authorization_expected_owner_privileges
    WHERE NOT has_table_privilege(
      'authenticated',
      format('public.%I', table_name),
      privilege_name
    )
  ),
  0::bigint,
  'authenticated receives the intended owner-scoped table privileges'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'public.newsletter_daily_runs',
    'INSERT'
  )
    AND NOT has_table_privilege('authenticated', 'public.newsletter_daily_runs', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_daily_runs', 'DELETE')
    AND NOT has_table_privilege(
      'authenticated',
      'public.newsletter_daily_run_items',
      'INSERT'
    )
    AND NOT has_table_privilege('authenticated', 'public.newsletter_daily_run_items', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_daily_run_items', 'DELETE'),
  'authenticated daily production records are read-only through the Data API'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.newsletter_notifications', 'SELECT')
    AND has_column_privilege(
      'authenticated',
      'public.newsletter_notifications',
      'read_at',
      'UPDATE'
    ),
  'authenticated can read own notifications and update read_at'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'newsletter_notifications'
      AND column_name <> 'read_at'
      AND has_column_privilege(
        'authenticated',
        'public.newsletter_notifications',
        column_name,
        'UPDATE'
      )
  ),
  0::bigint,
  'authenticated cannot update server-owned notification columns'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.query_logs', 'SELECT')
    AND has_table_privilege('authenticated', 'public.query_logs', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.query_logs', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.query_logs', 'UPDATE')
    AND has_column_privilege(
      'authenticated',
      'public.query_logs',
      'user_feedback',
      'UPDATE'
    )
    AND has_column_privilege(
      'authenticated',
      'public.query_logs',
      'user_feedback_comment',
      'UPDATE'
    ),
  'authenticated query-log access is read/delete plus feedback-only updates'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'query_logs'
      AND column_name NOT IN ('user_feedback', 'user_feedback_comment')
      AND has_column_privilege(
        'authenticated',
        'public.query_logs',
        column_name,
        'UPDATE'
      )
  ),
  0::bigint,
  'authenticated cannot rewrite server-owned query telemetry columns'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.messages', 'UPDATE')
    AND NOT has_any_column_privilege('authenticated', 'public.messages', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_chart_library', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_chart_library', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_chart_library', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_draft_events', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_draft_events', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_draft_events', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_drafts', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_drafts', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_drafts', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_notifications', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.newsletter_notifications', 'DELETE'),
  'authenticated lacks mutations not used by owner-facing workflows'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_policies AS policy
    JOIN authorization_owner_tables AS owned
      ON owned.table_name = policy.tablename
    WHERE policy.schemaname = 'public'
      AND policy.roles && ARRAY['public', 'anon']::name[]
  ),
  0::bigint,
  'owner policies explicitly target authenticated users rather than PUBLIC or anon'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_policies AS policy
    JOIN authorization_owner_tables AS owned
      ON owned.table_name = policy.tablename
    WHERE policy.schemaname = 'public'
      AND policy.roles && ARRAY['public', 'anon', 'authenticated']::name[]
      AND (
        btrim(coalesce(policy.qual, ''), '() ') = 'true'
        OR btrim(coalesce(policy.with_check, ''), '() ') = 'true'
      )
  ),
  0::bigint,
  'owner tables have no unrestricted browser-role policy'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'query_logs'
      AND (
        coalesce(qual, '') ILIKE '%session_id%'
        OR coalesce(with_check, '') ILIKE '%session_id%'
      )
  ),
  0::bigint,
  'query log policies contain no caller-controlled anonymous session loophole'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS sequence
    JOIN pg_namespace AS namespace ON namespace.oid = sequence.relnamespace
    WHERE namespace.nspname = 'public'
      AND sequence.relkind = 'S'
      AND sequence.relpersistence = 'p'
      AND (
        has_sequence_privilege('anon', sequence.oid, 'USAGE')
        OR has_sequence_privilege('anon', sequence.oid, 'SELECT')
        OR has_sequence_privilege('anon', sequence.oid, 'UPDATE')
      )
  ),
  0::bigint,
  'anon has no privilege on public sequences'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS sequence
    JOIN pg_namespace AS namespace ON namespace.oid = sequence.relnamespace
    WHERE namespace.nspname = 'public'
      AND sequence.relkind = 'S'
      AND sequence.relpersistence = 'p'
      AND (
        has_sequence_privilege('authenticated', sequence.oid, 'USAGE')
        OR has_sequence_privilege('authenticated', sequence.oid, 'SELECT')
        OR has_sequence_privilege('authenticated', sequence.oid, 'UPDATE')
      )
  ),
  0::bigint,
  'authenticated has no privilege on service-managed public sequences'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS sequence
    JOIN pg_namespace AS namespace ON namespace.oid = sequence.relnamespace
    WHERE namespace.nspname = 'public'
      AND sequence.relkind = 'S'
      AND sequence.relpersistence = 'p'
      AND (
        NOT has_sequence_privilege('service_role', sequence.oid, 'USAGE')
        OR NOT has_sequence_privilege('service_role', sequence.oid, 'SELECT')
        OR NOT has_sequence_privilege('service_role', sequence.oid, 'UPDATE')
      )
  ),
  0::bigint,
  'service role retains full privilege on public sequences'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles AS owner_role ON owner_role.oid = procedure.proowner
    WHERE namespace.nspname = 'public'
      AND procedure.prokind = 'f'
      AND owner_role.rolname = 'postgres'
      AND has_function_privilege('anon', procedure.oid, 'EXECUTE')
  ),
  0::bigint,
  'anon cannot execute any public function'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles AS owner_role ON owner_role.oid = procedure.proowner
    WHERE namespace.nspname = 'public'
      AND procedure.prokind = 'f'
      AND owner_role.rolname = 'postgres'
      AND procedure.proname <> 'generate_conversation_title'
      AND has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
  ),
  0::bigint,
  'authenticated can execute no public function except the owner-safe title helper'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.generate_conversation_title(uuid)',
    'EXECUTE'
  )
    AND has_function_privilege(
      'authenticated',
      'public.generate_conversation_title(uuid)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.generate_conversation_title(uuid)',
      'EXECUTE'
    ),
  'conversation title execution is limited to authenticated and service roles'
);

SELECT ok(
  NOT (
    SELECT procedure.prosecdef
    FROM pg_proc AS procedure
    WHERE procedure.oid = 'public.generate_conversation_title(uuid)'::regprocedure
  ),
  'conversation title helper is SECURITY INVOKER so message RLS still applies'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.bulk_update_cash(text,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege(
      'authenticated',
      'public.bulk_update_cash(text,jsonb)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.bulk_update_cash(text,jsonb)',
      'EXECUTE'
    ),
  'bulk cash updates are service-role-only'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.get_or_create_insider(text,text)', 'EXECUTE')
    AND NOT has_function_privilege(
      'authenticated',
      'public.get_or_create_insider(text,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.get_or_create_insider(text,text)',
      'EXECUTE'
    ),
  'insider upserts are service-role-only'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles AS owner_role ON owner_role.oid = procedure.proowner
    WHERE namespace.nspname = 'public'
      AND procedure.prokind = 'f'
      AND owner_role.rolname = 'postgres'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_trigger AS trigger
        WHERE trigger.tgfoid = procedure.oid
      )
      AND NOT has_function_privilege('service_role', procedure.oid, 'EXECUTE')
  ),
  0::bigint,
  'service role retains execution privilege on callable public functions'
);

SELECT ok(
  (
    SELECT object_table.relrowsecurity
    FROM pg_class AS object_table
    WHERE object_table.oid = 'storage.objects'::regclass
  ),
  'storage objects keep row-level security enabled'
);

SELECT ok(
  NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'anon')
    AND NOT (
      SELECT rolbypassrls FROM pg_roles WHERE rolname = 'authenticated'
    ),
  'browser roles cannot bypass storage object RLS'
);

SELECT ok(
  has_table_privilege(
    'service_role',
    'storage.objects',
    'SELECT,INSERT,UPDATE,DELETE'
  ),
  'service role retains storage object mutation privilege'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
      AND (
        coalesce(qual, '') ILIKE '%filings%'
        OR coalesce(with_check, '') ILIKE '%filings%'
        OR coalesce(qual, '') ILIKE '%newsletter-charts%'
        OR coalesce(with_check, '') ILIKE '%newsletter-charts%'
      )
  ),
  0::bigint,
  'filings and newsletter chart buckets have no public mutation policy'
);

-- Execute DML through SECURITY INVOKER helpers and roll successful mutations
-- back inside the helper's exception subtransaction. This verifies effective
-- behavior without letting a deliberately failing test corrupt later fixtures.
CREATE FUNCTION pg_temp.authorization_mutation_succeeded(statement text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  affected_rows bigint;
BEGIN
  EXECUTE statement;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows > 0 THEN
    RAISE SQLSTATE 'P0001' USING MESSAGE = 'authorization test mutation succeeded';
  END IF;

  RETURN false;
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    RETURN true;
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

CREATE FUNCTION pg_temp.authorization_text_result(statement text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  result text;
BEGIN
  EXECUTE statement INTO result;
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN '__authorization_denied__';
END;
$$;

INSERT INTO auth.users (id)
VALUES
  ('91000000-0000-0000-0000-000000000001'::uuid),
  ('91000000-0000-0000-0000-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.conversations (id, user_id, title)
VALUES
  (
    '92000000-0000-0000-0000-000000000001'::uuid,
    '91000000-0000-0000-0000-000000000001'::uuid,
    'owner A conversation'
  ),
  (
    '92000000-0000-0000-0000-000000000002'::uuid,
    '91000000-0000-0000-0000-000000000002'::uuid,
    'owner B conversation'
  );

INSERT INTO public.messages (id, conversation_id, role, content)
VALUES
  (
    '93000000-0000-0000-0000-000000000001'::uuid,
    '92000000-0000-0000-0000-000000000001'::uuid,
    'user',
    'owner A first message'
  ),
  (
    '93000000-0000-0000-0000-000000000002'::uuid,
    '92000000-0000-0000-0000-000000000002'::uuid,
    'user',
    'owner B private message'
  );

INSERT INTO public.query_logs (
  id,
  user_id,
  session_id,
  user_question,
  tool_selected,
  tool_args,
  answer_generated
)
VALUES
  (
    '94000000-0000-0000-0000-000000000001'::uuid,
    '91000000-0000-0000-0000-000000000001'::uuid,
    'authorization-owner-a',
    'owner A private question',
    'test',
    '{}'::jsonb,
    'owner A private answer'
  ),
  (
    '94000000-0000-0000-0000-000000000002'::uuid,
    '91000000-0000-0000-0000-000000000002'::uuid,
    'authorization-owner-b',
    'owner B private question',
    'test',
    '{}'::jsonb,
    'owner B private answer'
  );

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('filings', 'filings', true),
  ('newsletter-charts', 'newsletter-charts', true)
ON CONFLICT (id) DO NOTHING;

SELECT ok(
  (SELECT public FROM storage.buckets WHERE id = 'newsletter-charts'),
  'newsletter chart assets remain publicly deliverable through the public bucket'
);

INSERT INTO storage.objects (id, bucket_id, name, metadata)
VALUES
  (
    '95000000-0000-0000-0000-000000000001'::uuid,
    'filings',
    'authorization-tests/filing.txt',
    '{"mimetype":"text/plain"}'::jsonb
  ),
  (
    '95000000-0000-0000-0000-000000000002'::uuid,
    'newsletter-charts',
    'authorization-tests/chart.png',
    '{"mimetype":"image/png"}'::jsonb
  );

SELECT set_config(
  'request.jwt.claim.sub',
  '91000000-0000-0000-0000-000000000001',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)
    FROM public.conversations
    WHERE id IN (
      '92000000-0000-0000-0000-000000000001'::uuid,
      '92000000-0000-0000-0000-000000000002'::uuid
    )
  ),
  1::bigint,
  'authenticated user sees only their conversation'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.messages
    WHERE id IN (
      '93000000-0000-0000-0000-000000000001'::uuid,
      '93000000-0000-0000-0000-000000000002'::uuid
    )
  ),
  1::bigint,
  'authenticated user sees only messages in their conversation'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.query_logs
    WHERE id IN (
      '94000000-0000-0000-0000-000000000001'::uuid,
      '94000000-0000-0000-0000-000000000002'::uuid
    )
  ),
  1::bigint,
  'authenticated user sees only their query log'
);

SELECT is(
  pg_temp.authorization_text_result(
    $$SELECT public.generate_conversation_title(
      '92000000-0000-0000-0000-000000000001'::uuid
    )$$
  ),
  'owner A first message',
  'authenticated user can generate a title from their own first message'
);

SELECT isnt(
  pg_temp.authorization_text_result(
    $$SELECT public.generate_conversation_title(
      '92000000-0000-0000-0000-000000000002'::uuid
    )$$
  ),
  'owner B private message',
  'conversation title helper never reveals another user message'
);

SELECT ok(
  pg_temp.authorization_mutation_succeeded(
    $$UPDATE public.conversations
      SET title = 'owner A updated title'
      WHERE id = '92000000-0000-0000-0000-000000000001'::uuid$$
  ),
  'authenticated user can update their conversation'
);

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    $$UPDATE public.conversations
      SET title = 'cross-owner overwrite'
      WHERE id = '92000000-0000-0000-0000-000000000002'::uuid$$
  ),
  'authenticated user cannot update another conversation'
);

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    $$INSERT INTO public.query_logs (
        id, user_id, session_id, user_question, tool_selected, tool_args,
        answer_generated
      ) VALUES (
        '94000000-0000-0000-0000-000000000003'::uuid,
        '91000000-0000-0000-0000-000000000001'::uuid,
        'authorization-owner-a-new',
        'owner A new question',
        'test',
        '{}'::jsonb,
        'owner A new answer'
      )$$
  ),
  'authenticated users cannot fabricate query telemetry'
);

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    $$INSERT INTO public.query_logs (
        id, user_id, session_id, user_question, tool_selected, tool_args,
        answer_generated
      ) VALUES (
        '94000000-0000-0000-0000-000000000004'::uuid,
        '91000000-0000-0000-0000-000000000002'::uuid,
        'authorization-forged-owner',
        'forged question',
        'test',
        '{}'::jsonb,
        'forged answer'
      )$$
  ),
  'authenticated user cannot forge another query log owner'
);

SELECT ok(
  pg_temp.authorization_mutation_succeeded(
    $$UPDATE public.query_logs
      SET user_feedback = 'thumbs_up'
      WHERE id = '94000000-0000-0000-0000-000000000001'::uuid$$
  ),
  'authenticated user can update feedback on their query log'
);

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    $$UPDATE public.query_logs
      SET total_cost_usd = 999999
      WHERE id = '94000000-0000-0000-0000-000000000001'::uuid$$
  ),
  'authenticated user cannot overwrite server-owned query telemetry'
);

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    $$UPDATE public.query_logs
      SET user_feedback = 'thumbs_down'
      WHERE id = '94000000-0000-0000-0000-000000000002'::uuid$$
  ),
  'authenticated user cannot update another query log'
);

SELECT is(
  (
    SELECT count(*)
    FROM storage.objects
    WHERE id = '95000000-0000-0000-0000-000000000001'::uuid
  ),
  1::bigint,
  'authenticated can read public filing objects'
);

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    format(
      'INSERT INTO storage.objects (bucket_id, name) VALUES (%L, %L)',
      bucket_id,
      'authorization-tests/forged-authenticated-object'
    )
  ),
  format('authenticated cannot upload to the %s bucket', bucket_id)
)
FROM (VALUES ('filings'), ('newsletter-charts')) AS buckets(bucket_id);

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    format(
      'UPDATE storage.objects SET metadata = %L::jsonb WHERE bucket_id = %L AND name LIKE %L',
      '{"forged":true}',
      bucket_id,
      'authorization-tests/%'
    )
  ),
  format('authenticated cannot update the %s bucket', bucket_id)
)
FROM (VALUES ('filings'), ('newsletter-charts')) AS buckets(bucket_id);

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    format(
      'DELETE FROM storage.objects WHERE bucket_id = %L AND name LIKE %L',
      bucket_id,
      'authorization-tests/%'
    )
  ),
  format('authenticated cannot delete from the %s bucket', bucket_id)
)
FROM (VALUES ('filings'), ('newsletter-charts')) AS buckets(bucket_id);

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SET LOCAL ROLE anon;

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    $$SELECT 1 FROM public.query_logs LIMIT 1$$
  ),
  'anon cannot read query logs'
);

SELECT is(
  (
    SELECT count(*)
    FROM storage.objects
    WHERE id = '95000000-0000-0000-0000-000000000001'::uuid
  ),
  1::bigint,
  'anon can read public filing objects'
);

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    format(
      'INSERT INTO storage.objects (bucket_id, name) VALUES (%L, %L)',
      bucket_id,
      'authorization-tests/forged-anon-object'
    )
  ),
  format('anon cannot upload to the %s bucket', bucket_id)
)
FROM (VALUES ('filings'), ('newsletter-charts')) AS buckets(bucket_id);

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    format(
      'UPDATE storage.objects SET metadata = %L::jsonb WHERE bucket_id = %L AND name LIKE %L',
      '{"forged":true}',
      bucket_id,
      'authorization-tests/%'
    )
  ),
  format('anon cannot update the %s bucket', bucket_id)
)
FROM (VALUES ('filings'), ('newsletter-charts')) AS buckets(bucket_id);

SELECT ok(
  NOT pg_temp.authorization_mutation_succeeded(
    format(
      'DELETE FROM storage.objects WHERE bucket_id = %L AND name LIKE %L',
      bucket_id,
      'authorization-tests/%'
    )
  ),
  format('anon cannot delete from the %s bucket', bucket_id)
)
FROM (VALUES ('filings'), ('newsletter-charts')) AS buckets(bucket_id);

RESET ROLE;

SET LOCAL ROLE service_role;

SELECT ok(
  pg_temp.authorization_mutation_succeeded(
    $$INSERT INTO public.query_logs (
        id, user_id, session_id, user_question, tool_selected, tool_args,
        answer_generated
      ) VALUES (
        '94000000-0000-0000-0000-000000000005'::uuid,
        '91000000-0000-0000-0000-000000000001'::uuid,
        'authorization-service-log',
        'trusted server question',
        'test',
        '{}'::jsonb,
        'trusted server answer'
      )$$
  ),
  'service role can create trusted query telemetry'
);

SELECT ok(
  pg_temp.authorization_mutation_succeeded(
    $$UPDATE storage.objects
      SET metadata = '{"service_role":true}'::jsonb
      WHERE id = '95000000-0000-0000-0000-000000000001'::uuid$$
  ),
  'service role can update filing storage objects'
);

SELECT ok(
  pg_temp.authorization_mutation_succeeded(
    $$UPDATE storage.objects
      SET metadata = '{"service_role":true}'::jsonb
      WHERE id = '95000000-0000-0000-0000-000000000002'::uuid$$
  ),
  'service role can update newsletter chart storage objects'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
