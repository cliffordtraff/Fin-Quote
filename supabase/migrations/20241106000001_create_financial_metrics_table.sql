-- Create financial_metrics table for key-value metric storage
-- This table stores ~96 financial metrics from FMP API for AAPL

CREATE TABLE IF NOT EXISTS financial_metrics (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  year INTEGER NOT NULL,
  period TEXT, -- 'FY' for annual, 'Q1', 'Q2', 'Q3', 'Q4' for quarterly
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  metric_category TEXT, -- 'Valuation', 'Profitability', 'Growth', etc.
  data_source TEXT DEFAULT 'FMP', -- 'FMP', 'Calculated', 'SEC'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Composite unique constraint: one value per symbol/year/period/metric
  CONSTRAINT unique_metric_per_period UNIQUE (symbol, year, period, metric_name)
);

-- Create indexes for fast queries
CREATE INDEX idx_financial_metrics_symbol_year ON financial_metrics(symbol, year);
CREATE INDEX idx_financial_metrics_metric_name ON financial_metrics(metric_name);
CREATE INDEX idx_financial_metrics_category ON financial_metrics(metric_category);
CREATE INDEX idx_financial_metrics_symbol_year_metric ON financial_metrics(symbol, year, metric_name);

-- Add RLS (Row Level Security)
ALTER TABLE financial_metrics ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read financial metrics (public data)
CREATE POLICY "Allow public read access to financial metrics"
  ON financial_metrics
  FOR SELECT
  USING (true);

-- Add comment
COMMENT ON TABLE financial_metrics IS 'Key-value storage for 96+ financial metrics from FMP API. Supports annual and quarterly data.';
COMMENT ON COLUMN financial_metrics.metric_name IS 'Metric identifier (e.g., "marketCap", "peRatio", "grossMargin")';
COMMENT ON COLUMN financial_metrics.metric_value IS 'Numeric value of the metric';
COMMENT ON COLUMN financial_metrics.metric_category IS 'Category from stock_metrics_master.csv (e.g., "Valuation", "Profitability & Returns")';
COMMENT ON COLUMN financial_metrics.data_source IS 'Data source: FMP API endpoints, calculated from existing data, or SEC filings';
