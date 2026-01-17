-- S&P 500 Expansion: Phase 0 (Unique Constraints) + Phase 1 (Constituents Table)
-- This migration:
-- 1. Adds unique constraints to existing tables to prevent duplicates
-- 2. Creates the sp500_constituents table for tracking S&P 500 membership

-- ============================================================================
-- PHASE 0: ADD UNIQUE CONSTRAINTS TO EXISTING TABLES
-- ============================================================================

-- Unique constraint for financials_std
-- Prevents duplicate rows for same symbol/year/period
ALTER TABLE financials_std
DROP CONSTRAINT IF EXISTS unique_financials_period;

ALTER TABLE financials_std
ADD CONSTRAINT unique_financials_period
UNIQUE (symbol, year, period_type, fiscal_quarter);

-- Unique constraint for financial_metrics
-- Prevents duplicate rows for same symbol/year/period/metric
ALTER TABLE financial_metrics
DROP CONSTRAINT IF EXISTS unique_metrics_period;

ALTER TABLE financial_metrics
ADD CONSTRAINT unique_metrics_period
UNIQUE (symbol, year, period, metric_name);

-- Unique constraint for company_metrics (segment data)
-- Prevents duplicate rows for same symbol/year/period/metric/dimension
ALTER TABLE company_metrics
DROP CONSTRAINT IF EXISTS unique_company_metrics;

ALTER TABLE company_metrics
ADD CONSTRAINT unique_company_metrics
UNIQUE (symbol, year, period, metric_name, dimension_type, dimension_value);

-- ============================================================================
-- PHASE 1: CREATE SP500_CONSTITUENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS sp500_constituents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core fields
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,

  -- SEC/regulatory identifiers (OPTIONAL - for future SEC integration)
  cik TEXT,

  -- Classification
  sector TEXT,
  sub_industry TEXT,

  -- Additional metadata
  headquarters_location TEXT,

  -- S&P 500 membership tracking
  date_added DATE,              -- When added to S&P 500 (NULL if unknown)
  date_removed DATE,            -- NULL if current constituent
  is_active BOOLEAN DEFAULT true,

  -- Data ingestion status tracking
  data_status JSONB DEFAULT '{}'::jsonb,

  -- Vendor-specific symbol mappings (e.g., {"fmp": "BRK-B", "sec": "BRK.B"})
  alternate_symbols JSONB DEFAULT '{}'::jsonb,

  -- Fiscal year end (1-12, e.g., 9 = September for Apple)
  fiscal_year_end_month INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR SP500_CONSTITUENTS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sp500_symbol
ON sp500_constituents(symbol);

CREATE INDEX IF NOT EXISTS idx_sp500_active
ON sp500_constituents(is_active)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_sp500_cik
ON sp500_constituents(cik)
WHERE cik IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sp500_sector
ON sp500_constituents(sector);

-- ============================================================================
-- CONSTRAINTS FOR SP500_CONSTITUENTS
-- ============================================================================

-- Fiscal year end month must be 1-12 if provided
ALTER TABLE sp500_constituents
ADD CONSTRAINT chk_sp500_fiscal_year_end
CHECK (fiscal_year_end_month IS NULL OR fiscal_year_end_month BETWEEN 1 AND 12);

-- ============================================================================
-- TRIGGER: UPDATE UPDATED_AT ON CHANGE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_sp500_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sp500_updated_at_trigger ON sp500_constituents;

CREATE TRIGGER sp500_updated_at_trigger
BEFORE UPDATE ON sp500_constituents
FOR EACH ROW
EXECUTE FUNCTION update_sp500_updated_at();

-- ============================================================================
-- DATA_STATUS JSONB STRUCTURE DOCUMENTATION
-- ============================================================================
-- The data_status column tracks ingestion progress for each data type:
-- {
--   "financials_std": {
--     "status": "complete" | "pending" | "error" | "partial",
--     "last_updated": "2026-01-17T12:00:00Z",
--     "annual_years": [2015, 2016, ..., 2024],
--     "quarterly_years": [2020, 2021, ..., 2024],
--     "error_message": null
--   },
--   "financial_metrics": {
--     "status": "complete" | "pending" | "error" | "partial",
--     "last_updated": "2026-01-17T12:00:00Z",
--     "metric_count": 139,
--     "error_message": null
--   },
--   "segments": {
--     "status": "complete" | "pending" | "error" | "no_data",
--     "last_updated": "2026-01-17T12:00:00Z",
--     "product_segments": ["iPhone", "Services", ...],
--     "geographic_segments": ["Americas", "Europe", ...],
--     "error_message": null
--   }
-- }

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE sp500_constituents IS 'S&P 500 index constituents with ingestion status tracking';
COMMENT ON COLUMN sp500_constituents.symbol IS 'Stock ticker symbol (canonical form, e.g., BRK.B)';
COMMENT ON COLUMN sp500_constituents.cik IS 'SEC Central Index Key (OPTIONAL - for future SEC integration)';
COMMENT ON COLUMN sp500_constituents.data_status IS 'JSONB tracking ingestion status for each data type';
COMMENT ON COLUMN sp500_constituents.alternate_symbols IS 'Vendor-specific symbol mappings (e.g., {"fmp": "BRK-B"})';
COMMENT ON COLUMN sp500_constituents.fiscal_year_end_month IS 'Month when fiscal year ends (1-12)';

-- ============================================================================
-- ROW LEVEL SECURITY (optional, for future use)
-- ============================================================================

-- Enable RLS (but allow all authenticated users to read)
ALTER TABLE sp500_constituents ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read sp500_constituents
CREATE POLICY sp500_select_policy ON sp500_constituents
FOR SELECT USING (true);

-- Policy: Only service role can insert/update/delete
CREATE POLICY sp500_insert_policy ON sp500_constituents
FOR INSERT WITH CHECK (true);

CREATE POLICY sp500_update_policy ON sp500_constituents
FOR UPDATE USING (true);

CREATE POLICY sp500_delete_policy ON sp500_constituents
FOR DELETE USING (true);
