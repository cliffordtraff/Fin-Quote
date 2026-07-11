-- Phase 1 WIIM morning brief storage.
-- Keeps analytical run snapshots separate from newsletter_picks/newsletter_drafts.

CREATE TABLE IF NOT EXISTS wiim_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL CHECK (run_type IN ('morning')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  summary_text TEXT,
  top_candidate TEXT,
  best_contrarian_candidate TEXT,
  top_five_json JSONB,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wiim_run_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wiim_run_id UUID NOT NULL REFERENCES wiim_runs(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank >= 1),
  ticker TEXT,
  theme TEXT,
  headline TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  confidence_score NUMERIC(5,2) NOT NULL,
  candidate_type TEXT NOT NULL CHECK (candidate_type IN ('newsletter', 'chart_of_day', 'roundup', 'watch_only')),
  state_label TEXT CHECK (state_label IN ('new', 'persistent', 'fading')),
  signals_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wiim_run_candidates_identity_chk CHECK (
    ticker IS NOT NULL OR theme IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wiim_run_candidates_run_rank
  ON wiim_run_candidates(wiim_run_id, rank);

CREATE INDEX IF NOT EXISTS idx_wiim_runs_run_type_started_at
  ON wiim_runs(run_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_wiim_runs_status_started_at
  ON wiim_runs(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_wiim_run_candidates_ticker_created_at
  ON wiim_run_candidates(ticker, created_at DESC)
  WHERE ticker IS NOT NULL;

ALTER TABLE wiim_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE wiim_run_candidates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow anonymous read for wiim_runs"
  ON wiim_runs FOR SELECT
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Allow anonymous read for wiim_run_candidates"
  ON wiim_run_candidates FOR SELECT
  USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS update_wiim_runs_updated_at ON wiim_runs;
CREATE TRIGGER update_wiim_runs_updated_at
  BEFORE UPDATE ON wiim_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE wiim_runs IS 'One row per WIIM morning brief run.';
COMMENT ON TABLE wiim_run_candidates IS 'Ranked candidates captured for a WIIM run.';
COMMENT ON COLUMN wiim_runs.top_five_json IS 'Top five ranked candidate payload stored for quick retrieval.';
COMMENT ON COLUMN wiim_run_candidates.signals_json IS 'Deterministic ranking signals and score breakdown for debugging/tuning.';
