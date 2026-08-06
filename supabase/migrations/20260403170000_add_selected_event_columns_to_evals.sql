-- Persist event-native selection metadata directly on eval rows so review/analysis
-- tooling does not need to reconstruct it indirectly from stock_summaries.
ALTER TABLE summary_evals
  ADD COLUMN IF NOT EXISTS ranker_variant text,
  ADD COLUMN IF NOT EXISTS selected_winning_event jsonb,
  ADD COLUMN IF NOT EXISTS selected_runner_up_event jsonb;
CREATE INDEX IF NOT EXISTS idx_summary_evals_ranker_variant
  ON summary_evals(ranker_variant);
