-- Add shares_outstanding column to financials_std table
ALTER TABLE financials_std
ADD COLUMN IF NOT EXISTS shares_outstanding BIGINT;

-- Add comment for documentation
COMMENT ON COLUMN financials_std.shares_outstanding IS 'Weighted average shares outstanding (basic) from income statement';
