-- Update query_logs table to track which prompt version was used
-- This enables tracking performance by prompt version

-- Add columns to track which prompt version was used for each query
ALTER TABLE query_logs
  ADD COLUMN IF NOT EXISTS tool_selection_prompt_version INTEGER,
  ADD COLUMN IF NOT EXISTS answer_generation_prompt_version INTEGER;

-- Add indexes for querying by prompt version
CREATE INDEX IF NOT EXISTS idx_query_logs_tool_prompt_version
  ON query_logs(tool_selection_prompt_version);

CREATE INDEX IF NOT EXISTS idx_query_logs_answer_prompt_version
  ON query_logs(answer_generation_prompt_version);
