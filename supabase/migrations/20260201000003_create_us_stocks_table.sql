-- Create us_stocks table for all US-listed stocks
-- This extends coverage beyond S&P 500 to ~8,000 US stocks

-- Enable trigram extension for fuzzy search (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS us_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core identifiers
  symbol TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  exchange TEXT NOT NULL,              -- NYSE, NASDAQ, AMEX
  exchange_short TEXT,                 -- Short name from FMP
  type TEXT DEFAULT 'stock',           -- stock (we exclude ETFs)

  -- Company info (optional, populated later)
  sector TEXT,
  industry TEXT,
  market_cap BIGINT,                   -- For priority sorting during ingestion

  -- Status tracking
  is_active BOOLEAN DEFAULT true,

  -- Financial data ingestion tracking
  financials_status TEXT DEFAULT 'pending'
    CHECK (financials_status IN ('pending', 'in_progress', 'complete', 'failed', 'no_data')),
  financials_updated_at TIMESTAMPTZ,
  financials_annual_count INTEGER DEFAULT 0,
  financials_quarterly_count INTEGER DEFAULT 0,
  financials_error TEXT,               -- Error message if failed

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast search
CREATE INDEX IF NOT EXISTS idx_us_stocks_symbol ON us_stocks(symbol);
CREATE INDEX IF NOT EXISTS idx_us_stocks_name_trgm ON us_stocks USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_us_stocks_exchange ON us_stocks(exchange);
CREATE INDEX IF NOT EXISTS idx_us_stocks_is_active ON us_stocks(is_active);
CREATE INDEX IF NOT EXISTS idx_us_stocks_financials_status ON us_stocks(financials_status);
CREATE INDEX IF NOT EXISTS idx_us_stocks_market_cap ON us_stocks(market_cap DESC NULLS LAST);

-- Composite index for batch ingestion queries
CREATE INDEX IF NOT EXISTS idx_us_stocks_pending_by_cap
  ON us_stocks(financials_status, market_cap DESC NULLS LAST)
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE us_stocks ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on us_stocks"
  ON us_stocks FOR SELECT
  USING (true);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_us_stocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_us_stocks_updated_at
  BEFORE UPDATE ON us_stocks
  FOR EACH ROW
  EXECUTE FUNCTION update_us_stocks_updated_at();

-- Comment on table
COMMENT ON TABLE us_stocks IS 'Registry of all US-listed stocks on major exchanges (NYSE, NASDAQ, AMEX). Used for stock search and validation.';
COMMENT ON COLUMN us_stocks.financials_status IS 'Status of financial data ingestion: pending (not started), in_progress, complete, failed, no_data';
COMMENT ON COLUMN us_stocks.market_cap IS 'Market capitalization in USD, used for prioritizing ingestion order';
