-- Add three-bucket classification column to summary_evals
-- A = match, B = had article but picked wrong, C = data gap (never had article)
ALTER TABLE summary_evals ADD COLUMN IF NOT EXISTS bucket text;
CREATE INDEX IF NOT EXISTS idx_summary_evals_bucket ON summary_evals(bucket);
