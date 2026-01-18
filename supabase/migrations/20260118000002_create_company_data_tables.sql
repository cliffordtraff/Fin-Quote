-- Migration: Create tables for company page data
-- These tables store data that was previously missing or only available via live API calls

-- ============================================================================
-- 1. company_profile - Static company info (update: monthly)
-- ============================================================================
CREATE TABLE IF NOT EXISTS company_profile (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,

  -- Basic Info
  company_name TEXT,
  exchange TEXT,                    -- NYSE, NASDAQ, etc.
  sector TEXT,
  industry TEXT,
  description TEXT,

  -- Company Details
  ceo TEXT,
  employees INTEGER,                -- Full-time employees
  headquarters TEXT,                -- City, State
  country TEXT,
  website TEXT,

  -- Dates
  ipo_date DATE,
  fiscal_year_end TEXT,             -- e.g., "September" for AAPL

  -- Index Membership
  is_sp500 BOOLEAN DEFAULT FALSE,
  is_nasdaq100 BOOLEAN DEFAULT FALSE,
  is_dow30 BOOLEAN DEFAULT FALSE,

  -- Metadata
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_profile_symbol ON company_profile(symbol);
CREATE INDEX IF NOT EXISTS idx_company_profile_sector ON company_profile(sector);
CREATE INDEX IF NOT EXISTS idx_company_profile_is_sp500 ON company_profile(is_sp500) WHERE is_sp500 = TRUE;

-- ============================================================================
-- 2. price_performance - Performance metrics (update: daily)
-- ============================================================================
CREATE TABLE IF NOT EXISTS price_performance (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  as_of_date DATE NOT NULL,         -- Date these metrics were calculated

  -- Short-term Performance (stored as decimals, e.g., 0.05 = 5%)
  perf_1d NUMERIC,                  -- 1 day
  perf_5d NUMERIC,                  -- 1 week (5 trading days)
  perf_1m NUMERIC,                  -- 1 month
  perf_3m NUMERIC,                  -- 3 months (quarter)
  perf_6m NUMERIC,                  -- 6 months (half year)
  perf_ytd NUMERIC,                 -- Year to date
  perf_1y NUMERIC,                  -- 1 year
  perf_3y NUMERIC,                  -- 3 years
  perf_5y NUMERIC,                  -- 5 years
  perf_10y NUMERIC,                 -- 10 years
  perf_max NUMERIC,                 -- Max (all time)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(symbol, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_price_performance_symbol_date ON price_performance(symbol, as_of_date DESC);

-- ============================================================================
-- 3. analyst_estimates - Forward estimates (update: weekly)
-- ============================================================================
CREATE TABLE IF NOT EXISTS analyst_estimates (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  estimate_date DATE NOT NULL,      -- Date estimate was published
  period TEXT NOT NULL,             -- 'annual' or 'quarter'
  period_end DATE,                  -- End of the period being estimated

  -- EPS Estimates
  eps_estimated NUMERIC,            -- Consensus EPS estimate
  eps_estimated_low NUMERIC,
  eps_estimated_high NUMERIC,
  eps_estimated_avg NUMERIC,
  number_analysts_eps INTEGER,

  -- Revenue Estimates
  revenue_estimated NUMERIC,
  revenue_estimated_low NUMERIC,
  revenue_estimated_high NUMERIC,
  revenue_estimated_avg NUMERIC,
  number_analysts_revenue INTEGER,

  -- Growth Estimates (stored as decimals)
  eps_growth_estimated NUMERIC,     -- EPS growth % estimate
  revenue_growth_estimated NUMERIC, -- Revenue growth % estimate

  -- Target Price & Recommendations
  target_price NUMERIC,             -- Consensus target price
  target_price_low NUMERIC,
  target_price_high NUMERIC,
  analyst_rating_buy INTEGER,       -- # of buy ratings
  analyst_rating_hold INTEGER,      -- # of hold ratings
  analyst_rating_sell INTEGER,      -- # of sell ratings
  analyst_rating_strong_buy INTEGER,
  analyst_rating_strong_sell INTEGER,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(symbol, period, period_end)
);

CREATE INDEX IF NOT EXISTS idx_analyst_estimates_symbol ON analyst_estimates(symbol, estimate_date DESC);
CREATE INDEX IF NOT EXISTS idx_analyst_estimates_period_end ON analyst_estimates(symbol, period_end DESC);

-- ============================================================================
-- 4. earnings_history - Historical earnings (update: after each earnings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS earnings_history (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_quarter INTEGER,           -- NULL for annual
  period_end DATE NOT NULL,

  -- Earnings Data
  eps_actual NUMERIC,
  eps_estimated NUMERIC,
  eps_surprise NUMERIC,             -- Actual - Estimated
  eps_surprise_pct NUMERIC,         -- (Actual - Estimated) / |Estimated| * 100

  -- Revenue Data
  revenue_actual NUMERIC,
  revenue_estimated NUMERIC,
  revenue_surprise NUMERIC,
  revenue_surprise_pct NUMERIC,

  -- Dates
  earnings_date DATE,               -- When earnings were announced
  earnings_time TEXT,               -- 'bmo' (before market open) or 'amc' (after market close)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(symbol, fiscal_year, fiscal_quarter)
);

CREATE INDEX IF NOT EXISTS idx_earnings_history_symbol ON earnings_history(symbol, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_history_date ON earnings_history(earnings_date DESC);

-- ============================================================================
-- 5. technical_indicators - Technical data (update: daily, optional)
-- ============================================================================
CREATE TABLE IF NOT EXISTS technical_indicators (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  as_of_date DATE NOT NULL,

  -- Moving Averages
  sma_20 NUMERIC,
  sma_50 NUMERIC,
  sma_200 NUMERIC,
  ema_20 NUMERIC,
  ema_50 NUMERIC,

  -- Oscillators
  rsi_14 NUMERIC,                   -- Relative Strength Index (14-day)

  -- Volatility
  atr_14 NUMERIC,                   -- Average True Range (14-day)
  volatility_week NUMERIC,          -- Weekly volatility
  volatility_month NUMERIC,         -- Monthly volatility

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(symbol, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_technical_indicators_symbol_date ON technical_indicators(symbol, as_of_date DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE company_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyst_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE technical_indicators ENABLE ROW LEVEL SECURITY;

-- Allow public read access (these are public financial data)
CREATE POLICY "Allow public read access to company_profile"
  ON company_profile FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to price_performance"
  ON price_performance FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to analyst_estimates"
  ON analyst_estimates FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to earnings_history"
  ON earnings_history FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access to technical_indicators"
  ON technical_indicators FOR SELECT
  USING (true);

-- Allow service role full access for ingestion scripts
CREATE POLICY "Allow service role full access to company_profile"
  ON company_profile FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to price_performance"
  ON price_performance FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to analyst_estimates"
  ON analyst_estimates FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to earnings_history"
  ON earnings_history FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to technical_indicators"
  ON technical_indicators FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE company_profile IS 'Static company information from FMP profile endpoint. Update monthly.';
COMMENT ON TABLE price_performance IS 'Stock price performance metrics from FMP stock-price-change endpoint. Update daily.';
COMMENT ON TABLE analyst_estimates IS 'Forward-looking analyst estimates from FMP analyst-estimates endpoint. Update weekly.';
COMMENT ON TABLE earnings_history IS 'Historical earnings data and surprises from FMP earnings-surprises endpoint. Update quarterly.';
COMMENT ON TABLE technical_indicators IS 'Technical analysis indicators from FMP technical_indicator endpoint. Update daily (optional).';
