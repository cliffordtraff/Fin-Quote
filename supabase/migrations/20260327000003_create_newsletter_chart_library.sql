-- Persist reusable newsletter charts. The rendered image lives in Supabase
-- Storage, while the editable chart scene/spec lives in this table.

CREATE TABLE IF NOT EXISTS newsletter_chart_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  title text NOT NULL,
  symbol text NOT NULL,
  chart_spec jsonb NOT NULL,
  image_path text NOT NULL,
  image_url text NOT NULL,
  thumbnail_path text,
  thumbnail_url text,
  chart_export_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_chart_library_owner_updated
  ON newsletter_chart_library(owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_chart_library_session_updated
  ON newsletter_chart_library(session_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_chart_library_symbol
  ON newsletter_chart_library(symbol);

ALTER TABLE newsletter_chart_library ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'newsletter_chart_library'
      AND policyname = 'Users can read own newsletter charts'
  ) THEN
    CREATE POLICY "Users can read own newsletter charts"
      ON newsletter_chart_library
      FOR SELECT
      USING (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'newsletter_chart_library'
      AND policyname = 'Users can insert own newsletter charts'
  ) THEN
    CREATE POLICY "Users can insert own newsletter charts"
      ON newsletter_chart_library
      FOR INSERT
      WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'newsletter_chart_library'
      AND policyname = 'Users can update own newsletter charts'
  ) THEN
    CREATE POLICY "Users can update own newsletter charts"
      ON newsletter_chart_library
      FOR UPDATE
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'newsletter_chart_library'
      AND policyname = 'Users can delete own newsletter charts'
  ) THEN
    CREATE POLICY "Users can delete own newsletter charts"
      ON newsletter_chart_library
      FOR DELETE
      USING (owner_id = auth.uid());
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION set_newsletter_chart_library_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS newsletter_chart_library_updated_at_trigger ON newsletter_chart_library;
CREATE TRIGGER newsletter_chart_library_updated_at_trigger
  BEFORE UPDATE ON newsletter_chart_library
  FOR EACH ROW EXECUTE FUNCTION set_newsletter_chart_library_updated_at();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'newsletter-charts',
  'newsletter-charts',
  true,
  10485760,
  ARRAY['image/png', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
