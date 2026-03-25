-- Cache Finviz "Why is it moving?" data per stock symbol.
-- The app handles TTL/staleness. This table stores the latest known payload,
-- including negative-cache rows for symbols that currently have no Finviz entry.

CREATE TABLE IF NOT EXISTS stock_why_moving_cache (
  symbol TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'not_found' CHECK (status IN ('found', 'not_found', 'error')),
  display_text TEXT,
  headline TEXT,
  summary TEXT,
  bullet_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  sentiment TEXT,
  source TEXT,
  source_timestamp TEXT,
  is_catalyst BOOLEAN,
  raw_payload JSONB,
  source_url TEXT NOT NULL,
  error_message TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_why_moving_cache_fetched_at
  ON stock_why_moving_cache(fetched_at DESC);

ALTER TABLE stock_why_moving_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow anonymous read for stock_why_moving_cache"
  ON stock_why_moving_cache FOR SELECT
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS update_stock_why_moving_cache_updated_at ON stock_why_moving_cache;
CREATE TRIGGER update_stock_why_moving_cache_updated_at
  BEFORE UPDATE ON stock_why_moving_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE stock_why_moving_cache IS 'Latest Finviz "Why is it moving?" payload per stock symbol.';
COMMENT ON COLUMN stock_why_moving_cache.status IS 'found = Finviz entry present, not_found = normal quote page with no why-moving entry, error = fetch/parse failure.';
