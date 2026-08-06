-- Store full candidate pool and FinViz-matched title for few-shot example construction
ALTER TABLE summary_evals
  ADD COLUMN IF NOT EXISTS candidate_pool jsonb,
  ADD COLUMN IF NOT EXISTS finviz_matched_title text;
