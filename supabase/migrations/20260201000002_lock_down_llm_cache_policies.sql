-- Lock down LLM cache tables: keep public read, remove anonymous writes.

-- market_trends_cache
DROP POLICY IF EXISTS "Allow anonymous insert for market_trends_cache" ON market_trends_cache;

-- calendar_summaries_cache
DROP POLICY IF EXISTS "Allow anonymous insert for calendar_summaries_cache" ON calendar_summaries_cache;

-- NOTE: service role bypasses RLS, so server-side inserts will still work.
