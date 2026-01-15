-- Migration: Add metric_category column to company_metrics table
-- Purpose: Classify metrics by accounting standard (ASC 280, ASC 606, or voluntary KPI)
-- Run in: Supabase SQL Editor

-- Step 1: Add the column
ALTER TABLE company_metrics
ADD COLUMN IF NOT EXISTS metric_category TEXT;

-- Step 2: Add check constraint for valid categories
-- Note: Using DO block to handle case where constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_metric_category'
  ) THEN
    ALTER TABLE company_metrics
    ADD CONSTRAINT valid_metric_category
    CHECK (metric_category IN ('segment_reporting', 'revenue_disaggregation', 'operating_kpi') OR metric_category IS NULL);
  END IF;
END $$;

-- Step 3: Add comment explaining the taxonomy
COMMENT ON COLUMN company_metrics.metric_category IS
'Accounting classification: segment_reporting (ASC 280), revenue_disaggregation (ASC 606), operating_kpi (voluntary disclosure)';

-- Step 4: Update existing segment_revenue data to segment_reporting
UPDATE company_metrics
SET metric_category = 'segment_reporting'
WHERE metric_name = 'segment_revenue'
  AND metric_category IS NULL;

-- Verify the update
SELECT
  metric_category,
  COUNT(*) as count
FROM company_metrics
GROUP BY metric_category;
