-- Create company_metrics table for company-specific, dimensioned metrics
-- Examples: revenue by region/product, units shipped by product line

CREATE TABLE IF NOT EXISTS company_metrics (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  year INTEGER NOT NULL,
  period TEXT, -- 'FY' for annual, 'Q1', 'Q2', 'Q3', 'Q4' for quarterly
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  unit TEXT, -- 'currency', 'number', 'percentage', etc.
  dimension_type TEXT, -- 'region', 'product', 'channel', etc.
  dimension_value TEXT, -- 'Americas', 'iPhone', 'Online', etc.
  data_source TEXT DEFAULT 'SEC', -- 'SEC', 'Company Report', 'Calculated'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Composite unique constraint: one value per symbol/year/period/metric/dimension
  CONSTRAINT unique_company_metric_per_period UNIQUE (
    symbol,
    year,
    period,
    metric_name,
    dimension_type,
    dimension_value
  )
);

-- Create indexes for fast queries
CREATE INDEX idx_company_metrics_symbol_year ON company_metrics(symbol, year);
CREATE INDEX idx_company_metrics_metric_name ON company_metrics(metric_name);
CREATE INDEX idx_company_metrics_dimension ON company_metrics(dimension_type, dimension_value);
CREATE INDEX idx_company_metrics_symbol_metric ON company_metrics(symbol, metric_name);

-- Add RLS (Row Level Security)
ALTER TABLE company_metrics ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read company metrics (public data)
CREATE POLICY "Allow public read access to company metrics"
  ON company_metrics
  FOR SELECT
  USING (true);

-- Add comments
COMMENT ON TABLE company_metrics IS 'Key-value storage for company-specific metrics with optional dimensions (region, product, etc.).';
COMMENT ON COLUMN company_metrics.metric_name IS 'Metric identifier (e.g., "segment_revenue", "units_shipped")';
COMMENT ON COLUMN company_metrics.metric_value IS 'Numeric value of the metric';
COMMENT ON COLUMN company_metrics.dimension_type IS 'Dimension type (e.g., region, product)';
COMMENT ON COLUMN company_metrics.dimension_value IS 'Dimension value (e.g., Americas, iPhone)';
