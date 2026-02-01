-- Create cache table for market summary text (24 hour TTL handled in app)

CREATE TABLE IF NOT EXISTS market_summary_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_summary_cache_created_at
  ON market_summary_cache(created_at DESC);

ALTER TABLE market_summary_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow anonymous read for market_summary_cache"
  ON market_summary_cache FOR SELECT
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- NOTE: No anonymous INSERT policy.
-- Writes should be done from server-side code using the Supabase service role key.
