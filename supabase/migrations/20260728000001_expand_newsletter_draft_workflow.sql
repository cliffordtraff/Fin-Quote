-- Expand newsletter drafts into an explicit editorial publishing workflow.

ALTER TABLE newsletter_drafts
  DROP CONSTRAINT IF EXISTS newsletter_drafts_status_check;

ALTER TABLE newsletter_drafts
  ADD CONSTRAINT newsletter_drafts_status_check
  CHECK (status IN ('draft', 'review', 'ready', 'published'));

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_status_updated
  ON newsletter_drafts(status, updated_at DESC);
