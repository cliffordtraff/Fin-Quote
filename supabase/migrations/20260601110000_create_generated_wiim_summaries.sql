CREATE TABLE IF NOT EXISTS public.stock_summaries (
  symbol TEXT NOT NULL,
  summary_date DATE NOT NULL,
  summary_text TEXT,
  model TEXT,
  config_version TEXT,
  winning_event JSONB,
  runner_up_event JSONB,
  no_summary_reason TEXT,
  activation_path TEXT,
  earnings_context JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_id TEXT,
  feedback TEXT,
  feedback_at TIMESTAMPTZ,
  id BIGINT GENERATED ALWAYS AS IDENTITY
);

CREATE TABLE IF NOT EXISTS public.wiim_summary_runs (
  run_id TEXT PRIMARY KEY,
  run_date DATE NOT NULL,
  ticker_count INTEGER NOT NULL DEFAULT 0,
  tickers TEXT[] NOT NULL DEFAULT '{}',
  model TEXT,
  config_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stock_summaries
  ADD COLUMN IF NOT EXISTS run_id TEXT,
  ADD COLUMN IF NOT EXISTS feedback TEXT,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activation_path TEXT,
  ADD COLUMN IF NOT EXISTS earnings_context JSONB,
  ADD COLUMN IF NOT EXISTS id BIGINT GENERATED ALWAYS AS IDENTITY;

CREATE INDEX IF NOT EXISTS idx_stock_summaries_symbol_date
  ON public.stock_summaries(symbol, summary_date);

CREATE INDEX IF NOT EXISTS idx_stock_summaries_run
  ON public.stock_summaries(run_id);

CREATE INDEX IF NOT EXISTS idx_wiim_summary_runs_date
  ON public.wiim_summary_runs(run_date);

COMMENT ON TABLE public.stock_summaries IS 'Fin Quote-generated per-ticker WIIM summaries; one or more rows per symbol/date/run.';
COMMENT ON TABLE public.wiim_summary_runs IS 'Batch run records for generated per-ticker WIIM summary jobs.';
