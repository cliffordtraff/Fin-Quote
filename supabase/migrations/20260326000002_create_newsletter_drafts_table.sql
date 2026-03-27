-- Persist editable newsletter drafts for the browser editor.
-- Draft content is stored as structured JSON plus a rendered HTML preview.

CREATE TABLE IF NOT EXISTS newsletter_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  subject_line text NOT NULL,
  draft_json jsonb NOT NULL,
  preview_html text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_owner_updated
  ON newsletter_drafts(owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_owner_ticker
  ON newsletter_drafts(owner_id, ticker);

ALTER TABLE newsletter_drafts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'newsletter_drafts'
      AND policyname = 'Users can read own newsletter drafts'
  ) THEN
    CREATE POLICY "Users can read own newsletter drafts"
      ON newsletter_drafts
      FOR SELECT
      USING (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'newsletter_drafts'
      AND policyname = 'Users can insert own newsletter drafts'
  ) THEN
    CREATE POLICY "Users can insert own newsletter drafts"
      ON newsletter_drafts
      FOR INSERT
      WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'newsletter_drafts'
      AND policyname = 'Users can update own newsletter drafts'
  ) THEN
    CREATE POLICY "Users can update own newsletter drafts"
      ON newsletter_drafts
      FOR UPDATE
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'newsletter_drafts'
      AND policyname = 'Users can delete own newsletter drafts'
  ) THEN
    CREATE POLICY "Users can delete own newsletter drafts"
      ON newsletter_drafts
      FOR DELETE
      USING (owner_id = auth.uid());
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION set_newsletter_draft_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS newsletter_drafts_updated_at_trigger ON newsletter_drafts;
CREATE TRIGGER newsletter_drafts_updated_at_trigger
  BEFORE UPDATE ON newsletter_drafts
  FOR EACH ROW EXECUTE FUNCTION set_newsletter_draft_updated_at();
