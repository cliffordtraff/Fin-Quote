-- Add segment tracking columns to us_stocks table
ALTER TABLE us_stocks ADD COLUMN IF NOT EXISTS segment_status TEXT DEFAULT 'pending';
ALTER TABLE us_stocks ADD COLUMN IF NOT EXISTS segment_updated_at TIMESTAMP;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_us_stocks_segment_status ON us_stocks(segment_status);
CREATE INDEX IF NOT EXISTS idx_us_stocks_market_cap ON us_stocks(market_cap);

COMMENT ON COLUMN us_stocks.segment_status IS 'Status of segment data ingestion: pending, complete, no_data, error';
COMMENT ON COLUMN us_stocks.segment_updated_at IS 'When segment data was last updated';
