-- Split WIIM eval storage into benchmark-match vs explanation-quality fields.

ALTER TABLE summary_evals
  ADD COLUMN IF NOT EXISTS benchmark_match boolean,
  ADD COLUMN IF NOT EXISTS explanation_quality_score numeric;
CREATE INDEX IF NOT EXISTS idx_summary_evals_benchmark_match
  ON summary_evals(benchmark_match);
