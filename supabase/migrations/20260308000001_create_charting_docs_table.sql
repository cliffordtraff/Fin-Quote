-- Create docs table for charting workspace persistence
-- Used by the Charting Code Project (charts.theintraday.com) for cloud sync
-- Uses CREATE ... IF NOT EXISTS for idempotency (table may already exist in live DB)

CREATE TABLE IF NOT EXISTS docs (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type text NOT NULL,          -- 'workspace' | 'chart' | 'indicatorSet' | 'drawingLayer' | 'watchlist' | 'userPrefs' | 'template'
  data jsonb NOT NULL,             -- Full PersistenceDoc as JSON
  version integer NOT NULL DEFAULT 1,  -- Monotonic, incremented on every update
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_docs_owner ON docs(owner_id);
CREATE INDEX IF NOT EXISTS idx_docs_type ON docs(doc_type);
CREATE INDEX IF NOT EXISTS idx_docs_owner_type ON docs(owner_id, doc_type);

-- Enable Row Level Security
ALTER TABLE docs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (use DO block for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'docs' AND policyname = 'Users can read own docs') THEN
    CREATE POLICY "Users can read own docs" ON docs FOR SELECT USING (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'docs' AND policyname = 'Users can insert own docs') THEN
    CREATE POLICY "Users can insert own docs" ON docs FOR INSERT WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'docs' AND policyname = 'Users can update own docs') THEN
    CREATE POLICY "Users can update own docs" ON docs FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'docs' AND policyname = 'Users can delete own docs') THEN
    CREATE POLICY "Users can delete own docs" ON docs FOR DELETE USING (owner_id = auth.uid());
  END IF;
END
$$;

-- Auto-increment version trigger
CREATE OR REPLACE FUNCTION increment_doc_version()
RETURNS trigger AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger for idempotency
DROP TRIGGER IF EXISTS docs_version_trigger ON docs;
CREATE TRIGGER docs_version_trigger
  BEFORE UPDATE ON docs
  FOR EACH ROW EXECUTE FUNCTION increment_doc_version();
