-- Query Logs Table
-- Stores every user question and AI response for accuracy measurement and improvement

create table query_logs (
  -- Primary key
  id uuid primary key default uuid_generate_v4(),

  -- Session tracking
  session_id text not null,  -- Links related questions in a conversation

  -- User input
  user_question text not null,  -- The question user asked

  -- LLM reasoning (Step 1: Tool selection)
  tool_selected text not null,  -- e.g., "getAaplFinancialsByMetric"
  tool_args jsonb not null,  -- e.g., {"metric": "revenue", "limit": 5}
  tool_selection_latency_ms integer,  -- How long tool selection took

  -- Tool execution (Step 2: Data fetch)
  data_returned jsonb,  -- Actual data from tool (or just metadata like row count)
  data_row_count integer,  -- How many rows returned
  tool_execution_latency_ms integer,  -- How long data fetch took
  tool_error text,  -- If tool call failed, store error message

  -- LLM response (Step 3: Answer generation)
  answer_generated text not null,  -- The final answer shown to user
  answer_latency_ms integer,  -- How long answer generation took

  -- Metadata
  created_at timestamp default now(),

  -- Optional: User feedback (add later in Phase 2)
  user_feedback text,  -- "thumbs_up", "thumbs_down", or null
  user_feedback_comment text  -- Optional text feedback
);

-- Indexes for fast queries
create index idx_query_logs_session on query_logs(session_id);
create index idx_query_logs_created_at on query_logs(created_at desc);
create index idx_query_logs_tool on query_logs(tool_selected);

-- Row Level Security (RLS)
-- For MVP: Allow all operations (adjust based on your auth setup)
alter table query_logs enable row level security;

-- Policy: Allow all operations for now (tighten in production)
create policy "Allow all operations on query_logs"
  on query_logs
  for all
  using (true)
  with check (true);
