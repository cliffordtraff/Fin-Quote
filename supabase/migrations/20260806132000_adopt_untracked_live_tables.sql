-- Adopt six tables that predate the repository's migration ledger.
--
-- IMPORTANT: these relations already exist in production. Before a production
-- migration repair, verify them against docs/migration-ledger-convergence.md and
-- mark this version applied. Do not execute this file against production.
--
-- The statements are idempotent so clean local resets and ephemeral databases
-- can reproduce the live schema without carrying production data.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bars_daily (
  ticker text NOT NULL,
  ts timestamptz NOT NULL,
  o numeric NOT NULL,
  h numeric NOT NULL,
  l numeric NOT NULL,
  c numeric NOT NULL,
  v bigint,
  n integer,
  CONSTRAINT bars_daily_pkey PRIMARY KEY (ticker, ts)
);

CREATE TABLE IF NOT EXISTS public.bars_minute (
  ticker text NOT NULL,
  ts timestamptz NOT NULL,
  o numeric NOT NULL,
  h numeric NOT NULL,
  l numeric NOT NULL,
  c numeric NOT NULL,
  v bigint,
  n integer,
  CONSTRAINT bars_minute_pkey PRIMARY KEY (ticker, ts)
);

CREATE TABLE IF NOT EXISTS public.finviz_catalyst_snapshots (
  id bigserial NOT NULL,
  run_id uuid NOT NULL,
  run_label text,
  summary_date date NOT NULL,
  symbol text NOT NULL,
  status text NOT NULL,
  catalyst_text text,
  source_timestamp text,
  error_text text,
  run_started_at timestamptz NOT NULL,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finviz_catalyst_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT finviz_catalyst_snapshots_run_symbol_uq UNIQUE (run_id, symbol),
  CONSTRAINT finviz_catalyst_snapshots_status_check
    CHECK (status = ANY (ARRAY['catalyst'::text, 'no_catalyst'::text, 'error'::text]))
);

COMMENT ON TABLE public.finviz_catalyst_snapshots IS
  'Append-only FinViz WIIM snapshots, including no-catalyst and error rows, for intraday comparison.';
COMMENT ON COLUMN public.finviz_catalyst_snapshots.run_id IS
  'Shared identifier for one full scrape batch.';
COMMENT ON COLUMN public.finviz_catalyst_snapshots.run_label IS
  'Human-friendly label like premarket-0640.';
COMMENT ON COLUMN public.finviz_catalyst_snapshots.summary_date IS
  'Market date the scrape is intended to represent.';
COMMENT ON COLUMN public.finviz_catalyst_snapshots.status IS
  'Whether FinViz returned a catalyst, no catalyst, or an error.';
COMMENT ON COLUMN public.finviz_catalyst_snapshots.source_timestamp IS
  'Timestamp string embedded in the FinViz payload when present.';

CREATE INDEX IF NOT EXISTS finviz_catalyst_snapshots_summary_date_idx
  ON public.finviz_catalyst_snapshots (summary_date DESC, run_started_at DESC);
CREATE INDEX IF NOT EXISTS finviz_catalyst_snapshots_symbol_idx
  ON public.finviz_catalyst_snapshots (symbol, summary_date DESC, run_started_at DESC);

CREATE TABLE IF NOT EXISTS public.ingestion_log (
  dataset text NOT NULL,
  file_date date NOT NULL,
  row_count integer NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  file_size bigint,
  duration_ms integer,
  CONSTRAINT ingestion_log_pkey PRIMARY KEY (dataset, file_date)
);

CREATE TABLE IF NOT EXISTS public.newsletter_picks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  name text NOT NULL,
  editorial_hook text,
  subject_line text,
  changes_percentage numeric,
  picked_at timestamptz NOT NULL DEFAULT now(),
  pick_source text,
  CONSTRAINT newsletter_picks_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_picks_picked_at
  ON public.newsletter_picks (picked_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_picks_ticker
  ON public.newsletter_picks (ticker);

CREATE TABLE IF NOT EXISTS public.ticker_brand_colors (
  symbol text NOT NULL,
  primary_color text NOT NULL DEFAULT '',
  secondary_color text NOT NULL DEFAULT '',
  accent_color text NOT NULL DEFAULT '',
  bg_suggestion text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  logo_url_dark text NOT NULL DEFAULT '',
  logo_url_light text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticker_brand_colors_pkey PRIMARY KEY (symbol)
);

ALTER TABLE public.bars_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bars_minute ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finviz_catalyst_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticker_brand_colors ENABLE ROW LEVEL SECURITY;

DO $migration$
DECLARE
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'bars_daily',
    'bars_minute',
    'finviz_catalyst_snapshots',
    'ingestion_log',
    'ticker_brand_colors'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = relation_name
        AND policyname = 'public_read_' || relation_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated, anon USING (true)',
        'public_read_' || relation_name,
        relation_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = relation_name
        AND policyname = 'service_role_all_' || relation_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I TO service_role USING (true) WITH CHECK (true)',
        'service_role_all_' || relation_name,
        relation_name
      );
    END IF;
  END LOOP;
END
$migration$;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'newsletter_picks'
      AND policyname = 'Allow anon insert'
  ) THEN
    CREATE POLICY "Allow anon insert"
      ON public.newsletter_picks
      FOR INSERT
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'newsletter_picks'
      AND policyname = 'Allow anon read'
  ) THEN
    CREATE POLICY "Allow anon read"
      ON public.newsletter_picks
      FOR SELECT
      USING (true);
  END IF;
END
$migration$;

GRANT ALL PRIVILEGES ON TABLE public.bars_daily
  TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.bars_minute
  TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.finviz_catalyst_snapshots
  TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON SEQUENCE public.finviz_catalyst_snapshots_id_seq
  TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.ingestion_log
  TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.newsletter_picks
  TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.ticker_brand_colors
  TO anon, authenticated, service_role;

COMMIT;
