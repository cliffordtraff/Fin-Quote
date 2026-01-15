-- Add quarterly data support to financials_std and financial_metrics tables
-- Phase 1: Database schema changes for quarterly financial data

-- ============================================================================
-- FINANCIALS_STD TABLE CHANGES
-- ============================================================================

-- Add period_type column (annual or quarterly)
ALTER TABLE financials_std
ADD COLUMN IF NOT EXISTS period_type TEXT NOT NULL DEFAULT 'annual';

-- Add fiscal_quarter column (1-4 for quarterly, null for annual)
ALTER TABLE financials_std
ADD COLUMN IF NOT EXISTS fiscal_quarter INTEGER;

-- Add fiscal_label column for easy chart display (e.g., "2024-Q2")
ALTER TABLE financials_std
ADD COLUMN IF NOT EXISTS fiscal_label TEXT;

-- Add period_end_date for precise date tracking
ALTER TABLE financials_std
ADD COLUMN IF NOT EXISTS period_end_date DATE;

-- Add CHECK constraint for period_type
ALTER TABLE financials_std
ADD CONSTRAINT chk_financials_std_period_type
CHECK (period_type IN ('annual', 'quarterly'));

-- Add CHECK constraint for fiscal_quarter
ALTER TABLE financials_std
ADD CONSTRAINT chk_financials_std_fiscal_quarter
CHECK (fiscal_quarter IS NULL OR fiscal_quarter BETWEEN 1 AND 4);

-- Add constraint: quarterly must have fiscal_quarter, annual must not
ALTER TABLE financials_std
ADD CONSTRAINT chk_financials_std_quarter_consistency
CHECK (
  (period_type = 'annual' AND fiscal_quarter IS NULL) OR
  (period_type = 'quarterly' AND fiscal_quarter IS NOT NULL)
);

-- Create index for period-based queries
CREATE INDEX IF NOT EXISTS idx_financials_std_period
ON financials_std (symbol, period_type, year, fiscal_quarter);

-- Create index for fiscal_label lookups (useful for chart x-axis)
CREATE INDEX IF NOT EXISTS idx_financials_std_fiscal_label
ON financials_std (symbol, fiscal_label);

-- ============================================================================
-- FINANCIAL_METRICS TABLE CHANGES
-- ============================================================================

-- Add period_type column (the existing 'period' column has 'FY', 'Q1', etc.)
-- We'll add a normalized period_type alongside it
ALTER TABLE financial_metrics
ADD COLUMN IF NOT EXISTS period_type TEXT NOT NULL DEFAULT 'annual';

-- Add fiscal_quarter column (extracted from existing 'period' column)
ALTER TABLE financial_metrics
ADD COLUMN IF NOT EXISTS fiscal_quarter INTEGER;

-- Add fiscal_label column for easy chart display
ALTER TABLE financial_metrics
ADD COLUMN IF NOT EXISTS fiscal_label TEXT;

-- Add period_end_date for precise date tracking
ALTER TABLE financial_metrics
ADD COLUMN IF NOT EXISTS period_end_date DATE;

-- Add CHECK constraint for period_type
ALTER TABLE financial_metrics
ADD CONSTRAINT chk_financial_metrics_period_type
CHECK (period_type IN ('annual', 'quarterly'));

-- Add CHECK constraint for fiscal_quarter
ALTER TABLE financial_metrics
ADD CONSTRAINT chk_financial_metrics_fiscal_quarter
CHECK (fiscal_quarter IS NULL OR fiscal_quarter BETWEEN 1 AND 4);

-- Add constraint: quarterly must have fiscal_quarter, annual must not
ALTER TABLE financial_metrics
ADD CONSTRAINT chk_financial_metrics_quarter_consistency
CHECK (
  (period_type = 'annual' AND fiscal_quarter IS NULL) OR
  (period_type = 'quarterly' AND fiscal_quarter IS NOT NULL)
);

-- Create index for period-based queries
CREATE INDEX IF NOT EXISTS idx_financial_metrics_period
ON financial_metrics (symbol, period_type, year, fiscal_quarter);

-- Create index for fiscal_label lookups
CREATE INDEX IF NOT EXISTS idx_financial_metrics_fiscal_label
ON financial_metrics (symbol, fiscal_label);

-- ============================================================================
-- MIGRATE EXISTING DATA
-- ============================================================================

-- Update existing financials_std rows to have period_type = 'annual'
-- (They already have this as default, but be explicit)
UPDATE financials_std
SET period_type = 'annual', fiscal_quarter = NULL, fiscal_label = NULL
WHERE period_type = 'annual';

-- Migrate existing financial_metrics data based on the 'period' column
-- Set period_type and fiscal_quarter based on existing 'period' values
UPDATE financial_metrics
SET
  period_type = CASE
    WHEN period = 'FY' OR period IS NULL THEN 'annual'
    WHEN period IN ('Q1', 'Q2', 'Q3', 'Q4') THEN 'quarterly'
    ELSE 'annual'
  END,
  fiscal_quarter = CASE
    WHEN period = 'Q1' THEN 1
    WHEN period = 'Q2' THEN 2
    WHEN period = 'Q3' THEN 3
    WHEN period = 'Q4' THEN 4
    ELSE NULL
  END,
  fiscal_label = CASE
    WHEN period IN ('Q1', 'Q2', 'Q3', 'Q4') THEN year || '-' || period
    ELSE NULL
  END;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN financials_std.period_type IS 'Period type: annual or quarterly';
COMMENT ON COLUMN financials_std.fiscal_quarter IS 'Fiscal quarter (1-4) for quarterly data, NULL for annual';
COMMENT ON COLUMN financials_std.fiscal_label IS 'Display label for charts (e.g., "2024-Q2"), NULL for annual';
COMMENT ON COLUMN financials_std.period_end_date IS 'Actual date the fiscal period ended';

COMMENT ON COLUMN financial_metrics.period_type IS 'Period type: annual or quarterly';
COMMENT ON COLUMN financial_metrics.fiscal_quarter IS 'Fiscal quarter (1-4) for quarterly data, NULL for annual';
COMMENT ON COLUMN financial_metrics.fiscal_label IS 'Display label for charts (e.g., "2024-Q2"), NULL for annual';
COMMENT ON COLUMN financial_metrics.period_end_date IS 'Actual date the fiscal period ended';
