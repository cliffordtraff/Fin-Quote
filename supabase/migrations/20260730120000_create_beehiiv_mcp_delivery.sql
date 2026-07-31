-- Store Beehiiv OAuth credentials server-side and link Fin Quote drafts to
-- their corresponding Beehiiv drafts.

CREATE TABLE IF NOT EXISTS newsletter_integrations (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('beehiiv')),
  credentials_ciphertext text NOT NULL,
  publication_id text,
  publication_name text,
  publication_url text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, provider)
);

CREATE TABLE IF NOT EXISTS newsletter_beehiiv_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL UNIQUE
    REFERENCES newsletter_drafts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publication_id text NOT NULL,
  beehiiv_post_id text NOT NULL,
  title text NOT NULL,
  preview_url text,
  editor_url text NOT NULL,
  content_hash text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_beehiiv_deliveries_post
  ON newsletter_beehiiv_deliveries(owner_id, beehiiv_post_id);

CREATE INDEX IF NOT EXISTS idx_newsletter_beehiiv_deliveries_owner_synced
  ON newsletter_beehiiv_deliveries(owner_id, synced_at DESC);

ALTER TABLE newsletter_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_beehiiv_deliveries ENABLE ROW LEVEL SECURITY;

-- These tables intentionally have no browser-facing RLS policies. All reads
-- and writes go through authenticated server routes using the service role.

DROP TRIGGER IF EXISTS newsletter_integrations_updated_at_trigger
  ON newsletter_integrations;
CREATE TRIGGER newsletter_integrations_updated_at_trigger
  BEFORE UPDATE ON newsletter_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS newsletter_beehiiv_deliveries_updated_at_trigger
  ON newsletter_beehiiv_deliveries;
CREATE TRIGGER newsletter_beehiiv_deliveries_updated_at_trigger
  BEFORE UPDATE ON newsletter_beehiiv_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE newsletter_draft_events
  DROP CONSTRAINT IF EXISTS newsletter_draft_events_event_type_check;

ALTER TABLE newsletter_draft_events
  ADD CONSTRAINT newsletter_draft_events_event_type_check
  CHECK (
    event_type IN (
      'created',
      'status_changed',
      'chart_attached',
      'publication_recorded',
      'publication_url_updated',
      'beehiiv_draft_created',
      'beehiiv_draft_synced'
    )
  );

NOTIFY pgrst, 'reload schema';
