-- Update unique constraint on financial_metrics to use period_type + fiscal_quarter
-- This allows quarterly data to be stored alongside annual data

-- Drop the old unique constraint (if it exists)
-- The constraint may be named differently depending on how the table was created
DO $$
BEGIN
  -- Try to drop the existing constraint
  ALTER TABLE financial_metrics DROP CONSTRAINT IF EXISTS financial_metrics_symbol_year_period_metric_name_key;
  ALTER TABLE financial_metrics DROP CONSTRAINT IF EXISTS financial_metrics_pkey;
EXCEPTION
  WHEN undefined_object THEN
    -- Constraint doesn't exist, that's fine
    NULL;
END $$;

-- Create new unique constraint with period_type and fiscal_quarter
-- This allows the same metric to exist for annual and quarterly periods
CREATE UNIQUE INDEX IF NOT EXISTS financial_metrics_unique_key
ON financial_metrics (symbol, year, period_type, COALESCE(fiscal_quarter, 0), metric_name);

-- Add a comment explaining the constraint
COMMENT ON INDEX financial_metrics_unique_key IS 'Unique constraint on symbol, year, period_type, fiscal_quarter, metric_name. Uses COALESCE for fiscal_quarter since NULL != NULL in unique constraints.';
