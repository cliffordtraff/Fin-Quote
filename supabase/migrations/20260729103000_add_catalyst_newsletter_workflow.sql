-- Connect approved catalyst reviews to newsletter drafts and persist the
-- publication audit trail.

ALTER TABLE newsletter_drafts
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS source_review_key text,
  ADD COLUMN IF NOT EXISTS beehiiv_url text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE newsletter_drafts
SET source_type = CASE
  WHEN draft_json -> 'source' ->> 'type' = 'catalyst' THEN 'catalyst'
  WHEN COALESCE((draft_json ->> 'manualDraft')::boolean, false) THEN 'manual'
  ELSE 'generated'
END;

UPDATE newsletter_drafts
SET
  source_review_key = NULLIF(
    draft_json -> 'source' -> 'catalyst' ->> 'reviewKey',
    ''
  ),
  beehiiv_url = NULLIF(
    draft_json -> 'publication' ->> 'beehiivUrl',
    ''
  ),
  published_at = CASE
    WHEN NULLIF(draft_json -> 'publication' ->> 'publishedAt', '') IS NULL
      THEN published_at
    ELSE (draft_json -> 'publication' ->> 'publishedAt')::timestamptz
  END
WHERE
  draft_json ? 'source'
  OR draft_json ? 'publication';

ALTER TABLE newsletter_drafts
  DROP CONSTRAINT IF EXISTS newsletter_drafts_source_type_check;

ALTER TABLE newsletter_drafts
  ADD CONSTRAINT newsletter_drafts_source_type_check
  CHECK (source_type IN ('manual', 'generated', 'catalyst'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_drafts_source_review_key
  ON newsletter_drafts(source_review_key)
  WHERE source_review_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_publication
  ON newsletter_drafts(status, published_at DESC)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS newsletter_draft_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES newsletter_drafts(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'created',
      'status_changed',
      'chart_attached',
      'publication_recorded',
      'publication_url_updated'
    )
  ),
  from_status text CHECK (
    from_status IS NULL
    OR from_status IN ('draft', 'review', 'ready', 'published')
  ),
  to_status text CHECK (
    to_status IS NULL
    OR to_status IN ('draft', 'review', 'ready', 'published')
  ),
  beehiiv_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_draft_events_draft_created
  ON newsletter_draft_events(draft_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_newsletter_draft_events_owner_created
  ON newsletter_draft_events(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_draft_events_session_created
  ON newsletter_draft_events(session_id, created_at DESC);

ALTER TABLE newsletter_draft_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'newsletter_draft_events'
      AND policyname = 'Users can read own newsletter draft events'
  ) THEN
    CREATE POLICY "Users can read own newsletter draft events"
      ON newsletter_draft_events
      FOR SELECT
      USING (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'newsletter_draft_events'
      AND policyname = 'Users can insert own newsletter draft events'
  ) THEN
    CREATE POLICY "Users can insert own newsletter draft events"
      ON newsletter_draft_events
      FOR INSERT
      WITH CHECK (owner_id = auth.uid());
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
