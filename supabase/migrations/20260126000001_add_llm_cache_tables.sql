-- Add cache tables for LLM-generated content (24 hour TTL)

-- Market trends cache (bullet points)
CREATE TABLE IF NOT EXISTS market_trends_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bullets JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar summaries cache (economic + earnings summaries)
CREATE TABLE IF NOT EXISTS calendar_summaries_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  economic_summary TEXT NOT NULL,
  earnings_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_market_trends_cache_created_at ON market_trends_cache(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_summaries_cache_created_at ON calendar_summaries_cache(created_at DESC);

-- Enable RLS but allow anonymous read/write for caching
ALTER TABLE market_trends_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_summaries_cache ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access for caching
CREATE POLICY "Allow anonymous read for market_trends_cache" ON market_trends_cache FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert for market_trends_cache" ON market_trends_cache FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous read for calendar_summaries_cache" ON calendar_summaries_cache FOR SELECT USING (true);
CREATE POLICY "Allow anonymous insert for calendar_summaries_cache" ON calendar_summaries_cache FOR INSERT WITH CHECK (true);
