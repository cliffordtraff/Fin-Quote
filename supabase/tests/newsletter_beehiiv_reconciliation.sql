BEGIN;

SET LOCAL search_path = public, extensions;

SELECT plan(3);

INSERT INTO auth.users (id)
VALUES
  ('be100000-0000-0000-0000-000000000001'::uuid),
  ('be100000-0000-0000-0000-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.newsletter_drafts (
  id,
  owner_id,
  session_id,
  ticker,
  status,
  subject_line,
  draft_json,
  preview_html,
  generated_at
)
VALUES
  (
    'be200000-0000-0000-0000-000000000001'::uuid,
    'be100000-0000-0000-0000-000000000001'::uuid,
    'disconnected-beehiiv-reconciliation-test',
    'AAPL',
    'ready',
    'Disconnected owner',
    jsonb_build_object(
      'ticker', 'AAPL',
      'format', 'single_stock',
      'subjectLine', 'Disconnected owner',
      'generatedAt', '2026-08-09T13:00:00.000Z',
      'blocks', '[]'::jsonb
    ),
    '<p>Disconnected owner</p>',
    '2026-08-09T13:00:00.000Z'::timestamptz
  ),
  (
    'be200000-0000-0000-0000-000000000002'::uuid,
    'be100000-0000-0000-0000-000000000002'::uuid,
    'connected-beehiiv-reconciliation-test',
    'MSFT',
    'ready',
    'Connected owner',
    jsonb_build_object(
      'ticker', 'MSFT',
      'format', 'single_stock',
      'subjectLine', 'Connected owner',
      'generatedAt', '2026-08-09T13:00:00.000Z',
      'blocks', '[]'::jsonb
    ),
    '<p>Connected owner</p>',
    '2026-08-09T13:00:00.000Z'::timestamptz
  );

INSERT INTO public.newsletter_beehiiv_deliveries (
  id,
  draft_id,
  owner_id,
  publication_id,
  beehiiv_post_id,
  title,
  editor_url,
  content_hash,
  lifecycle_status,
  lifecycle_applied_status,
  last_reconcile_error
)
VALUES
  (
    'be300000-0000-0000-0000-000000000001'::uuid,
    'be200000-0000-0000-0000-000000000001'::uuid,
    'be100000-0000-0000-0000-000000000001'::uuid,
    'publication-disconnected',
    'post-disconnected',
    'Disconnected owner',
    'https://app.beehiiv.com/posts/post-disconnected',
    'content-disconnected',
    'draft',
    'draft',
    'Beehiiv needs to be reconnected before this draft can be synced.'
  ),
  (
    'be300000-0000-0000-0000-000000000002'::uuid,
    'be200000-0000-0000-0000-000000000002'::uuid,
    'be100000-0000-0000-0000-000000000002'::uuid,
    'publication-connected',
    'post-connected',
    'Connected owner',
    'https://app.beehiiv.com/posts/post-connected',
    'content-connected',
    'draft',
    'draft',
    'Retry this connected delivery.'
  );

INSERT INTO public.newsletter_integrations (
  owner_id,
  provider,
  credentials_ciphertext,
  publication_id,
  publication_name
)
VALUES (
  'be100000-0000-0000-0000-000000000002'::uuid,
  'beehiiv',
  'encrypted-test-credentials',
  'publication-connected',
  'Connected publication'
);

CREATE TEMP TABLE first_claimed_beehiiv_deliveries ON COMMIT DROP AS
SELECT id, owner_id
FROM public.claim_newsletter_beehiiv_reconciliation(
  'be400000-0000-0000-0000-000000000001'::uuid,
  10,
  90
);

SELECT is(
  (
    SELECT count(*)
    FROM first_claimed_beehiiv_deliveries
    WHERE owner_id = 'be100000-0000-0000-0000-000000000001'::uuid
  ),
  0::bigint,
  'a disconnected owner cannot make the reconciliation cron fail'
);

SELECT is(
  (
    SELECT count(*)
    FROM first_claimed_beehiiv_deliveries
    WHERE owner_id = 'be100000-0000-0000-0000-000000000002'::uuid
  ),
  1::bigint,
  'a connected owner remains claimable for reconciliation'
);

INSERT INTO public.newsletter_integrations (
  owner_id,
  provider,
  credentials_ciphertext,
  publication_id,
  publication_name
)
VALUES (
  'be100000-0000-0000-0000-000000000001'::uuid,
  'beehiiv',
  'encrypted-test-credentials',
  'publication-disconnected',
  'Reconnected publication'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.claim_newsletter_beehiiv_reconciliation(
      'be400000-0000-0000-0000-000000000002'::uuid,
      10,
      90
    ) AS delivery
    WHERE delivery.owner_id = 'be100000-0000-0000-0000-000000000001'::uuid
  ),
  1::bigint,
  'reconnecting makes the preserved delivery claimable again'
);

SELECT * FROM finish();

ROLLBACK;
