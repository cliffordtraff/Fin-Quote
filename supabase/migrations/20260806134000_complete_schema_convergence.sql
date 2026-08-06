-- Resolve the remaining live-vs-replay differences found by the post-repair
-- schema diff. Keep the live data shape that the application already uses,
-- finish the untracked company-metric classification migration, and remove
-- stale browser write privileges from server-owned reference tables.

BEGIN;

ALTER TABLE public.company_metrics
  ADD COLUMN IF NOT EXISTS metric_category text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.company_metrics'::regclass
      AND conname = 'valid_metric_category'
  ) THEN
    ALTER TABLE public.company_metrics
      ADD CONSTRAINT valid_metric_category
      CHECK (
        metric_category IN (
          'segment_reporting',
          'revenue_disaggregation',
          'operating_kpi'
        )
        OR metric_category IS NULL
      );
  END IF;
END
$migration$;

COMMENT ON COLUMN public.company_metrics.metric_category IS
  'Accounting classification: segment_reporting (ASC 280), revenue_disaggregation (ASC 606), operating_kpi (voluntary disclosure).';

UPDATE public.company_metrics
SET metric_category = 'segment_reporting'
WHERE metric_name = 'segment_revenue'
  AND metric_category IS NULL;

-- Production historically used an integer identity for this append-only cache,
-- while the canonical migration replay used UUIDs. The id is not referenced by
-- the application or another table, so preserve all cache rows while converging
-- on the UUID shape already represented in the repository and generated types.
DO $migration$
DECLARE
  current_id_type regtype;
BEGIN
  SELECT attribute.atttypid::regtype
  INTO current_id_type
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.market_summary_cache'::regclass
    AND attribute.attname = 'id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  IF current_id_type IS DISTINCT FROM 'uuid'::regtype THEN
    IF EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid = 'public.market_summary_cache'::regclass
    ) THEN
      RAISE EXCEPTION
        'Cannot converge market_summary_cache.id while foreign keys reference it';
    END IF;

    ALTER TABLE public.market_summary_cache
      ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE public.market_summary_cache
      ALTER COLUMN id TYPE uuid USING gen_random_uuid();
    ALTER TABLE public.market_summary_cache
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
  END IF;
END
$migration$;

ALTER SEQUENCE IF EXISTS public.market_summary_cache_id_seq OWNED BY NONE;
DROP SEQUENCE IF EXISTS public.market_summary_cache_id_seq;

DO $migration$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'stock_summaries',
        'wiim_summary_runs',
        'us_stocks'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.%I',
      policy_record.policyname,
      policy_record.tablename
    );
  END LOOP;
END
$migration$;

ALTER TABLE public.stock_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wiim_summary_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.us_stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_stock_summaries
  ON public.stock_summaries
  FOR SELECT
  TO anon, authenticated
  USING (true);
CREATE POLICY service_role_all_stock_summaries
  ON public.stock_summaries
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY public_read_wiim_summary_runs
  ON public.wiim_summary_runs
  FOR SELECT
  TO anon, authenticated
  USING (true);
CREATE POLICY service_role_all_wiim_summary_runs
  ON public.wiim_summary_runs
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY public_read_us_stocks
  ON public.us_stocks
  FOR SELECT
  TO anon, authenticated
  USING (true);
CREATE POLICY service_role_all_us_stocks
  ON public.us_stocks
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE
  public.stock_summaries,
  public.wiim_summary_runs,
  public.us_stocks
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.stock_summaries,
  public.wiim_summary_runs,
  public.us_stocks
TO anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.stock_summaries,
  public.wiim_summary_runs,
  public.us_stocks
TO service_role;

COMMIT;
