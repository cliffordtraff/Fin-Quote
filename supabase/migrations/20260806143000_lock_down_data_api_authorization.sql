-- Close historical Data API authorization gaps.
--
-- Earlier migrations granted every current and future public table, sequence,
-- and function to anon/authenticated and relied entirely on RLS. Several old
-- policies were permissive or were labelled "service role" without actually
-- targeting service_role, which made those writes public. This migration
-- establishes an explicit role matrix and makes future objects private by
-- default.

BEGIN;

-- New application objects are service-only until their creating migration
-- grants a narrower browser role deliberately.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- Reset the broad table and sequence grants applied in 20260531170000, then
-- rebuild only the access the application actually uses.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM anon, authenticated;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Public, read-only product data. Mutation remains server/service-role only.
GRANT SELECT ON TABLE
  public.analyst_estimates,
  public.bars_daily,
  public.bars_minute,
  public.calendar_summaries_cache,
  public.company,
  public.company_metrics,
  public.company_profile,
  public.company_profiles,
  public.earnings_history,
  public.filings,
  public.financial_metrics,
  public.financials_std,
  public.finviz_catalyst_snapshots,
  public.finviz_catalysts,
  public.insider_transactions,
  public.insiders,
  public.market_movers_cache,
  public.market_summary_cache,
  public.market_trends_cache,
  public.monthly_ratio_snapshots,
  public.price_performance,
  public.sp500_constituents,
  public.stock_summaries,
  public.stock_why_moving_cache,
  public.technical_indicators,
  public.ticker_brand_colors,
  public.us_stocks,
  public.watchlist_dividends,
  public.watchlist_earnings,
  public.watchlist_extended_hours,
  public.watchlist_metrics,
  public.watchlist_news_archive,
  public.watchlist_quotes,
  public.watchlist_symbol_mapping
TO anon, authenticated;

-- Authenticated, owner-scoped application data. RLS remains the row boundary.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.conversations,
  public.docs,
  public.newsletter_chart_library,
  public.newsletter_daily_run_items,
  public.newsletter_daily_runs,
  public.newsletter_daily_settings,
  public.newsletter_drafts,
  public.watchlist_items,
  public.watchlist_settings,
  public.watchlist_tabs,
  public.watchlists
TO authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.messages TO authenticated;
GRANT SELECT, INSERT ON TABLE public.newsletter_draft_events TO authenticated;
GRANT SELECT ON TABLE public.newsletter_notifications TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.newsletter_notifications TO authenticated;
GRANT SELECT, DELETE ON TABLE public.query_logs TO authenticated;
GRANT UPDATE (user_feedback, user_feedback_comment)
  ON TABLE public.query_logs TO authenticated;

-- Make policy role targeting match the grant matrix. Historical owner policies
-- were created without TO, which means PostgreSQL records them as PUBLIC even
-- though auth.uid() happened to reject anonymous callers.
DO $migration$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY (ARRAY[
        'conversations',
        'docs',
        'messages',
        'newsletter_chart_library',
        'newsletter_daily_run_items',
        'newsletter_daily_runs',
        'newsletter_daily_settings',
        'newsletter_draft_events',
        'newsletter_drafts',
        'newsletter_notifications',
        'query_logs',
        'watchlist_items',
        'watchlist_settings',
        'watchlist_tabs',
        'watchlists'
      ]::text[])
      AND roles = ARRAY['public']::name[]
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I TO authenticated',
      policy_record.policyname,
      policy_record.tablename
    );
  END LOOP;
END
$migration$;

-- The same omission affected service-write policies on older reference tables.
DO $migration$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'ALL'
      AND roles = ARRAY['public']::name[]
      AND COALESCE(qual, '') ILIKE '%service_role%'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I TO service_role',
      policy_record.policyname,
      policy_record.tablename
    );
  END LOOP;
END
$migration$;

-- Remove policies whose names implied service-only access but whose omitted TO
-- clause made them apply to PUBLIC.
DROP POLICY IF EXISTS company_metrics_insert_policy
  ON public.company_metrics;
DROP POLICY IF EXISTS company_metrics_update_policy
  ON public.company_metrics;
DROP POLICY IF EXISTS company_metrics_delete_policy
  ON public.company_metrics;

DROP POLICY IF EXISTS financial_metrics_insert_policy
  ON public.financial_metrics;
DROP POLICY IF EXISTS financial_metrics_update_policy
  ON public.financial_metrics;
DROP POLICY IF EXISTS financial_metrics_delete_policy
  ON public.financial_metrics;

DROP POLICY IF EXISTS sp500_insert_policy
  ON public.sp500_constituents;
DROP POLICY IF EXISTS sp500_update_policy
  ON public.sp500_constituents;
DROP POLICY IF EXISTS sp500_delete_policy
  ON public.sp500_constituents;

DROP POLICY IF EXISTS "Allow service role write access"
  ON public.market_movers_cache;
DROP POLICY IF EXISTS "Allow service role update access"
  ON public.market_movers_cache;
DROP POLICY IF EXISTS "Allow service role delete access"
  ON public.market_movers_cache;

DROP POLICY IF EXISTS "Service role insert" ON public.ingestion_logs;
DROP POLICY IF EXISTS "Service role update" ON public.ingestion_logs;
DROP POLICY IF EXISTS "Service role insert" ON public.insider_transactions;
DROP POLICY IF EXISTS "Service role update" ON public.insider_transactions;
DROP POLICY IF EXISTS "Service role insert" ON public.insiders;
DROP POLICY IF EXISTS "Service role update" ON public.insiders;

-- Operational and evaluation data is not a public product surface.
DROP POLICY IF EXISTS "Public read access" ON public.ingestion_logs;
DROP POLICY IF EXISTS public_read_ingestion_log ON public.ingestion_log;
DROP POLICY IF EXISTS public_read_manual_eval_reviews
  ON public.manual_eval_reviews;
DROP POLICY IF EXISTS public_read_ranker_config_versions
  ON public.ranker_config_versions;
DROP POLICY IF EXISTS public_read_summary_evals ON public.summary_evals;
DROP POLICY IF EXISTS public_read_wiim_cost_runs ON public.wiim_cost_runs;

DROP POLICY IF EXISTS "Allow all operations for authenticated users"
  ON public.evaluation_annotations;
DROP POLICY IF EXISTS "Allow all operations on prompt_versions"
  ON public.prompt_versions;
DROP POLICY IF EXISTS "Allow anon insert" ON public.newsletter_picks;
DROP POLICY IF EXISTS "Allow anon read" ON public.newsletter_picks;
DROP POLICY IF EXISTS "Allow anonymous read for wiim_run_candidates"
  ON public.wiim_run_candidates;
DROP POLICY IF EXISTS "Allow anonymous read for wiim_runs"
  ON public.wiim_runs;
DROP POLICY IF EXISTS public_read_wiim_summary_runs
  ON public.wiim_summary_runs;
DROP POLICY IF EXISTS public_read_filing_chunks ON public.filing_chunks;

-- Query history is authenticated and owner-scoped. Log creation and telemetry
-- fields are service-owned; a signed-in user may only update the two feedback
-- columns on their own rows. The former anonymous
-- condition (`user_id IS NULL AND session_id IS NOT NULL`) matched every
-- anonymous row because the database could not bind session_id to the caller.
DROP POLICY IF EXISTS "Allow all operations on query_logs"
  ON public.query_logs;
DROP POLICY IF EXISTS "Users can view own queries" ON public.query_logs;
DROP POLICY IF EXISTS "Users can insert own queries" ON public.query_logs;
DROP POLICY IF EXISTS "Users can update own queries" ON public.query_logs;
DROP POLICY IF EXISTS "Users can delete own queries" ON public.query_logs;

CREATE POLICY "Users can view own queries"
  ON public.query_logs
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own queries"
  ON public.query_logs
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own queries"
  ON public.query_logs
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Public product reads are public by design, but name the two browser roles
-- rather than relying on PostgreSQL's implicit PUBLIC default.
DO $migration$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd = 'SELECT'
      AND roles = ARRAY['public']::name[]
      AND COALESCE(qual, '') = 'true'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I TO anon, authenticated',
      policy_record.policyname,
      policy_record.tablename
    );
  END LOOP;
END
$migration$;

-- Remove direct and inherited PUBLIC grants from application functions.
-- Extension-owned vector/trigram functions keep their standard permissions.
DO $migration$
DECLARE
  function_record record;
BEGIN
  FOR function_record IN
    SELECT
      format(
        '%I.%I(%s)',
        namespace.nspname,
        procedure.proname,
        pg_get_function_identity_arguments(procedure.oid)
      ) AS signature
    FROM pg_proc AS procedure
    JOIN pg_namespace AS namespace
      ON namespace.oid = procedure.pronamespace
    JOIN pg_roles AS owner_role
      ON owner_role.oid = procedure.proowner
    WHERE namespace.nspname = 'public'
      AND procedure.prokind = 'f'
      AND owner_role.rolname = 'postgres'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      function_record.signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      function_record.signature
    );
  END LOOP;
END
$migration$;

-- Title generation now executes with the caller's RLS context and independently
-- checks conversation ownership before reading a message.
CREATE OR REPLACE FUNCTION public.generate_conversation_title(
  conversation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  first_message text;
BEGIN
  SELECT message.content
  INTO first_message
  FROM public.messages AS message
  JOIN public.conversations AS conversation
    ON conversation.id = message.conversation_id
  WHERE message.conversation_id = generate_conversation_title.conversation_id
    AND conversation.user_id = (SELECT auth.uid())
    AND message.role = 'user'
  ORDER BY message.created_at
  LIMIT 1;

  IF first_message IS NULL THEN
    RETURN 'New Conversation';
  END IF;

  IF length(first_message) > 60 THEN
    RETURN substring(first_message FROM 1 FOR 60) || '...';
  END IF;

  RETURN first_message;
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.generate_conversation_title(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_conversation_title(uuid)
  TO authenticated, service_role;

-- Mutating ingestion RPCs are server-only.
REVOKE ALL PRIVILEGES ON FUNCTION public.bulk_update_cash(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_cash(text, jsonb)
  TO service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.get_or_create_insider(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_insider(text, text)
  TO service_role;

-- Remove the stale two-argument overload and bound the supported filing search
-- so an authenticated request cannot ask Postgres to return an unbounded set.
DROP FUNCTION IF EXISTS public.search_filing_chunks(text, integer);

CREATE OR REPLACE FUNCTION public.search_filing_chunks(
  query_embedding text,
  match_count integer DEFAULT 5,
  filing_type_filter text DEFAULT NULL,
  ticker_filter text DEFAULT NULL
)
RETURNS TABLE (
  chunk_text text,
  section_name text,
  filing_type text,
  filing_date date,
  fiscal_year integer,
  fiscal_quarter integer,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    chunk.chunk_text,
    chunk.section_name,
    filing.filing_type,
    filing.filing_date,
    filing.fiscal_year,
    filing.fiscal_quarter,
    1 - (chunk.embedding <=> query_embedding::vector) AS similarity
  FROM public.filing_chunks AS chunk
  JOIN public.filings AS filing
    ON chunk.filing_id = filing.id
  WHERE chunk.embedding IS NOT NULL
    AND (
      filing_type_filter IS NULL
      OR filing.filing_type = filing_type_filter
    )
    AND (ticker_filter IS NULL OR filing.ticker = ticker_filter)
  ORDER BY chunk.embedding <=> query_embedding::vector
  LIMIT LEAST(GREATEST(COALESCE(match_count, 5), 1), 25);
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.search_filing_chunks(text, integer, text, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.search_filing_chunks(text, integer, text, text)
TO service_role;

-- Storage uploads are performed by service-role server code. Public buckets
-- may still be read, but browser roles cannot create, overwrite, or delete
-- filing or newsletter assets.
DO $migration$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND (
        COALESCE(qual, '') ILIKE '%filings%'
        OR COALESCE(with_check, '') ILIKE '%filings%'
        OR COALESCE(qual, '') ILIKE '%newsletter-charts%'
        OR COALESCE(with_check, '') ILIKE '%newsletter-charts%'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON storage.objects',
      policy_record.policyname
    );
  END LOOP;
END
$migration$;

-- storage.objects ACLs are owned and managed by Supabase's reserved
-- supabase_storage_admin role. Application migrations cannot assume that role,
-- so Storage authorization is intentionally enforced through the explicit RLS
-- policy set above. Regression tests exercise the resulting DML denial.

ALTER POLICY "Allow reads from filings bucket"
  ON storage.objects
  TO anon, authenticated;

-- Fail the migration rather than silently shipping another public write path.
DO $assertions$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN (
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      )
  ) THEN
    RAISE EXCEPTION
      'Browser roles retain an administrative public-table privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee = 'anon'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'Anonymous public-table mutation privilege remains';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'public' = ANY (roles)
  ) THEN
    RAISE EXCEPTION 'A public-schema policy still targets PUBLIC implicitly';
  END IF;
END
$assertions$;

COMMIT;
