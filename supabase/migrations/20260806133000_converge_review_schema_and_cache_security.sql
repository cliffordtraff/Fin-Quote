-- Forward-only convergence after the historical migration ledger is repaired.
--
-- 1. Ensure the active stock catalyst review table exists.
-- 2. Replace permissive cache policies and grants with public read-only access.
-- 3. Remove two retired WIIM calibration objects restored only as canonical history.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stock_why_moving_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_key text NOT NULL UNIQUE,
  symbol text NOT NULL,
  market_date date NOT NULL,
  session text NOT NULL
    CHECK (session IN ('premarket', 'cash', 'afterhours', 'closed')),
  direction text NOT NULL
    CHECK (direction IN ('gainer', 'loser')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'needs_work', 'dismissed')),
  notes text NOT NULL DEFAULT '',
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_why_moving_reviews_market_status
  ON public.stock_why_moving_reviews (market_date DESC, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_why_moving_reviews_symbol
  ON public.stock_why_moving_reviews (symbol, market_date DESC);

ALTER TABLE public.stock_why_moving_reviews ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS stock_why_moving_reviews_updated_at
  ON public.stock_why_moving_reviews;
CREATE TRIGGER stock_why_moving_reviews_updated_at
  BEFORE UPDATE ON public.stock_why_moving_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.stock_why_moving_reviews IS
  'Admin-only editorial review state for daily stock-move catalysts.';

REVOKE ALL PRIVILEGES ON TABLE public.stock_why_moving_reviews
  FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.stock_why_moving_reviews
  TO service_role;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stock_why_moving_reviews'
      AND policyname = 'service_role_all_stock_why_moving_reviews'
  ) THEN
    CREATE POLICY service_role_all_stock_why_moving_reviews
      ON public.stock_why_moving_reviews
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$migration$;

DO $migration$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'market_trends_cache',
        'calendar_summaries_cache',
        'market_summary_cache'
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

ALTER TABLE public.market_trends_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_summaries_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_summary_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_market_trends_cache
  ON public.market_trends_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);
CREATE POLICY service_role_all_market_trends_cache
  ON public.market_trends_cache
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY public_read_calendar_summaries_cache
  ON public.calendar_summaries_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);
CREATE POLICY service_role_all_calendar_summaries_cache
  ON public.calendar_summaries_cache
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY public_read_market_summary_cache
  ON public.market_summary_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);
CREATE POLICY service_role_all_market_summary_cache
  ON public.market_summary_cache
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE
  public.market_trends_cache,
  public.calendar_summaries_cache,
  public.market_summary_cache
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.market_trends_cache,
  public.calendar_summaries_cache,
  public.market_summary_cache
TO anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.market_trends_cache,
  public.calendar_summaries_cache,
  public.market_summary_cache
TO service_role;

-- These objects belonged to an abandoned calibration path. Restoring their
-- historical migrations makes clean replays honest; removing them here makes
-- the final schema match production and prevents accidental reuse.
DROP TABLE IF EXISTS public.finviz_wism_corpus;
ALTER TABLE IF EXISTS public.ranker_config_versions
  DROP COLUMN IF EXISTS source_type_boosts_json;

COMMIT;
