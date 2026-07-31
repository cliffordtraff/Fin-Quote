-- Durable, resumable daily newsletter production batches.

ALTER TABLE wiim_run_candidates
  ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE newsletter_drafts
  DROP CONSTRAINT IF EXISTS newsletter_drafts_source_type_check;

ALTER TABLE newsletter_drafts
  ADD CONSTRAINT newsletter_drafts_source_type_check
  CHECK (source_type IN ('manual', 'generated', 'catalyst', 'daily_batch'));

CREATE TABLE IF NOT EXISTS newsletter_daily_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL UNIQUE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  target_count integer NOT NULL DEFAULT 40 CHECK (target_count BETWEEN 30 AND 50),
  timezone text NOT NULL DEFAULT 'America/New_York',
  generation_hour smallint NOT NULL DEFAULT 9 CHECK (generation_hour BETWEEN 0 AND 23),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS newsletter_daily_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  market_date date NOT NULL,
  edition text NOT NULL DEFAULT 'morning' CHECK (edition IN ('morning')),
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'generating', 'completed', 'partial', 'failed')
  ),
  target_count integer NOT NULL CHECK (target_count BETWEEN 30 AND 50),
  source_wiim_run_id uuid REFERENCES wiim_runs(id) ON DELETE SET NULL,
  source_generated_at timestamptz,
  selected_count integer NOT NULL DEFAULT 0,
  generated_count integer NOT NULL DEFAULT 0,
  ready_count integer NOT NULL DEFAULT 0,
  attention_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_message text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_key, market_date, edition)
);

CREATE TABLE IF NOT EXISTS newsletter_daily_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES newsletter_daily_runs(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank >= 1),
  ticker text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN (
      'queued',
      'generating',
      'generated',
      'ready',
      'needs_attention',
      'failed',
      'published'
    )
  ),
  quality_band text NOT NULL CHECK (quality_band IN ('strong', 'review')),
  relevance_score numeric(7,2) NOT NULL,
  confidence_score numeric(5,2) NOT NULL,
  candidate_type text NOT NULL,
  state_label text,
  move_percent numeric(9,4),
  reason_type text,
  headline text NOT NULL,
  summary_text text NOT NULL,
  key_fact text,
  source_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_id uuid,
  draft_status text CHECK (
    draft_status IS NULL
    OR draft_status IN ('draft', 'review', 'ready', 'published')
  ),
  subject_line text,
  chart_id uuid,
  chart_image_url text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, ticker),
  UNIQUE (run_id, rank)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_daily_runs_scope_date
  ON newsletter_daily_runs(scope_key, market_date DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_daily_run_items_run_status_rank
  ON newsletter_daily_run_items(run_id, status, rank);

CREATE INDEX IF NOT EXISTS idx_newsletter_daily_run_items_draft
  ON newsletter_daily_run_items(draft_id)
  WHERE draft_id IS NOT NULL;

ALTER TABLE newsletter_daily_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_daily_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_daily_run_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'newsletter_daily_settings'
      AND policyname = 'Users can manage own newsletter daily settings'
  ) THEN
    CREATE POLICY "Users can manage own newsletter daily settings"
      ON newsletter_daily_settings
      FOR ALL
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'newsletter_daily_runs'
      AND policyname = 'Users can manage own newsletter daily runs'
  ) THEN
    CREATE POLICY "Users can manage own newsletter daily runs"
      ON newsletter_daily_runs
      FOR ALL
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'newsletter_daily_run_items'
      AND policyname = 'Users can manage own newsletter daily run items'
  ) THEN
    CREATE POLICY "Users can manage own newsletter daily run items"
      ON newsletter_daily_run_items
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM newsletter_daily_runs
          WHERE newsletter_daily_runs.id = newsletter_daily_run_items.run_id
            AND newsletter_daily_runs.owner_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM newsletter_daily_runs
          WHERE newsletter_daily_runs.id = newsletter_daily_run_items.run_id
            AND newsletter_daily_runs.owner_id = auth.uid()
        )
      );
  END IF;
END
$$;

DROP TRIGGER IF EXISTS newsletter_daily_settings_updated_at_trigger
  ON newsletter_daily_settings;
CREATE TRIGGER newsletter_daily_settings_updated_at_trigger
  BEFORE UPDATE ON newsletter_daily_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS newsletter_daily_runs_updated_at_trigger
  ON newsletter_daily_runs;
CREATE TRIGGER newsletter_daily_runs_updated_at_trigger
  BEFORE UPDATE ON newsletter_daily_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS newsletter_daily_run_items_updated_at_trigger
  ON newsletter_daily_run_items;
CREATE TRIGGER newsletter_daily_run_items_updated_at_trigger
  BEFORE UPDATE ON newsletter_daily_run_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

NOTIFY pgrst, 'reload schema';
