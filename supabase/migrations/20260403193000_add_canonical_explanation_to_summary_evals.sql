-- Persist the post-ranking canonical explanation on eval rows so WIIM review
-- and analysis tooling can inspect one shared answer record instead of
-- reconstructing it from mixed legacy fields.
ALTER TABLE summary_evals
  ADD COLUMN IF NOT EXISTS canonical_explanation jsonb;
