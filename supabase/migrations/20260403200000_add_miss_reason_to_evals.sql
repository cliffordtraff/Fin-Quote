-- Store structured miss reason diagnosis for Bucket B misses.
-- Categories: flashy_headline_bias, analyst_over_action, macro_vs_company_confusion,
-- wrong_event_same_company, stale_news_picked, direction_mismatch, ticker_collision, other.
ALTER TABLE summary_evals
  ADD COLUMN IF NOT EXISTS miss_reason text;
