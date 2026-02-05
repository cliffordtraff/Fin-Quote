-- Create market movers cache table
-- Stores pre-market, cash session, and after-hours gainers/losers
CREATE TABLE IF NOT EXISTS market_movers_cache (
  id SERIAL PRIMARY KEY,
  session_type TEXT NOT NULL CHECK (session_type IN ('premarket', 'cash', 'afterhours')),
  direction TEXT NOT NULL CHECK (direction IN ('gainers', 'losers')),
  data JSONB NOT NULL DEFAULT '[]',
  market_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_type, direction, market_date)
);

-- Index for fast lookups by session/direction/date
CREATE INDEX IF NOT EXISTS idx_market_movers_lookup
  ON market_movers_cache(session_type, direction, market_date DESC);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_market_movers_fetched
  ON market_movers_cache(fetched_at);

-- Enable Row Level Security
ALTER TABLE market_movers_cache ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for client queries)
CREATE POLICY "Allow public read access"
  ON market_movers_cache FOR SELECT
  USING (true);

-- Allow service role full access (for cron writes)
CREATE POLICY "Allow service role write access"
  ON market_movers_cache FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow service role update access"
  ON market_movers_cache FOR UPDATE
  USING (true);

CREATE POLICY "Allow service role delete access"
  ON market_movers_cache FOR DELETE
  USING (true);
