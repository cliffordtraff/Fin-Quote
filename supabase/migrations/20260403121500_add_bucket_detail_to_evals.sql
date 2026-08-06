ALTER TABLE summary_evals ADD COLUMN IF NOT EXISTS bucket_detail text;
CREATE INDEX IF NOT EXISTS idx_summary_evals_bucket_detail ON summary_evals(bucket_detail);
