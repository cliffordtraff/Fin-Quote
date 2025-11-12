-- Add token usage and cost tracking to query_logs
-- This allows us to monitor and optimize OpenAI API costs

ALTER TABLE query_logs
  -- Tool selection (Step 1)
  ADD COLUMN tool_selection_prompt_tokens INTEGER,
  ADD COLUMN tool_selection_completion_tokens INTEGER,
  ADD COLUMN tool_selection_total_tokens INTEGER,

  -- Answer generation (Step 3)
  ADD COLUMN answer_prompt_tokens INTEGER,
  ADD COLUMN answer_completion_tokens INTEGER,
  ADD COLUMN answer_total_tokens INTEGER,

  -- Regeneration (optional, Phase 3)
  ADD COLUMN regeneration_prompt_tokens INTEGER,
  ADD COLUMN regeneration_completion_tokens INTEGER,
  ADD COLUMN regeneration_total_tokens INTEGER,

  -- Embedding usage (for search queries)
  ADD COLUMN embedding_tokens INTEGER,

  -- Calculated costs (in USD cents for precision)
  ADD COLUMN total_cost_usd NUMERIC(10, 6);

-- Create index for cost queries
CREATE INDEX idx_query_logs_cost ON query_logs(total_cost_usd) WHERE total_cost_usd IS NOT NULL;
CREATE INDEX idx_query_logs_created_date ON query_logs(DATE(created_at));

COMMENT ON COLUMN query_logs.total_cost_usd IS 'Total cost in USD for this query (LLM + embeddings)';
COMMENT ON COLUMN query_logs.embedding_tokens IS 'Tokens used for embeddings (search queries only)';
