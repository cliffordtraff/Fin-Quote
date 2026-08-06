-- Add LLM-classified catalyst type column to summary_evals
ALTER TABLE summary_evals ADD COLUMN IF NOT EXISTS finviz_catalyst_type text;
-- Index for querying by catalyst type
CREATE INDEX IF NOT EXISTS idx_summary_evals_catalyst_type ON summary_evals(finviz_catalyst_type);
