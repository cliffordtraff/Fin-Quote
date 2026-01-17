-- Add RLS policies to financial_metrics table to allow inserts/updates
-- Similar to the sp500_constituents policies

-- First check if RLS is enabled, if not enable it
ALTER TABLE financial_metrics ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS financial_metrics_select_policy ON financial_metrics;
DROP POLICY IF EXISTS financial_metrics_insert_policy ON financial_metrics;
DROP POLICY IF EXISTS financial_metrics_update_policy ON financial_metrics;
DROP POLICY IF EXISTS financial_metrics_delete_policy ON financial_metrics;

-- Policy: Anyone can read financial_metrics
CREATE POLICY financial_metrics_select_policy ON financial_metrics
FOR SELECT USING (true);

-- Policy: Allow inserts (for ingestion scripts)
CREATE POLICY financial_metrics_insert_policy ON financial_metrics
FOR INSERT WITH CHECK (true);

-- Policy: Allow updates (for ingestion scripts)
CREATE POLICY financial_metrics_update_policy ON financial_metrics
FOR UPDATE USING (true);

-- Policy: Allow deletes (for maintenance)
CREATE POLICY financial_metrics_delete_policy ON financial_metrics
FOR DELETE USING (true);

-- Also add same policies to company_metrics for Phase 4
ALTER TABLE company_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_metrics_select_policy ON company_metrics;
DROP POLICY IF EXISTS company_metrics_insert_policy ON company_metrics;
DROP POLICY IF EXISTS company_metrics_update_policy ON company_metrics;
DROP POLICY IF EXISTS company_metrics_delete_policy ON company_metrics;

CREATE POLICY company_metrics_select_policy ON company_metrics
FOR SELECT USING (true);

CREATE POLICY company_metrics_insert_policy ON company_metrics
FOR INSERT WITH CHECK (true);

CREATE POLICY company_metrics_update_policy ON company_metrics
FOR UPDATE USING (true);

CREATE POLICY company_metrics_delete_policy ON company_metrics
FOR DELETE USING (true);
