-- Add direct-ranker comparison fields and Pass 1 instrumentation to summary_evals

ALTER TABLE summary_evals
  ADD COLUMN IF NOT EXISTS actionable_titles text[],
  ADD COLUMN IF NOT EXISTS direct_rank_pick text,
  ADD COLUMN IF NOT EXISTS direct_rank_event_type text,
  ADD COLUMN IF NOT EXISTS direct_rank_reason text,
  ADD COLUMN IF NOT EXISTS direct_rank_match boolean;
