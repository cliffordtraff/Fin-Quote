BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

CREATE FUNCTION pg_temp.newsletter_draft_fork_error(
  owner_id uuid,
  source_draft_id uuid,
  source_updated_at timestamptz,
  session_id text,
  idempotency_key text,
  request_hash text,
  draft_json jsonb,
  preview_html text
)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM public.create_newsletter_draft_fork(
    owner_id,
    source_draft_id,
    source_updated_at,
    session_id,
    idempotency_key,
    request_hash,
    draft_json,
    preview_html
  );
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$$;

SELECT ok(
  to_regclass('public.newsletter_draft_fork_requests') IS NOT NULL
    AND (
      SELECT relation.relrowsecurity
      FROM pg_class AS relation
      WHERE relation.oid =
        'public.newsletter_draft_fork_requests'::regclass
    ),
  'fork idempotency receipts exist behind row-level security'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
    CROSS JOIN unnest(
      ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
    ) AS privilege_name
    WHERE has_table_privilege(
      role_name,
      'public.newsletter_draft_fork_requests',
      privilege_name
    )
  )
    AND has_table_privilege(
      'service_role',
      'public.newsletter_draft_fork_requests',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
  'fork receipts are directly accessible only to the service role'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_newsletter_draft_fork(uuid,uuid,timestamptz,text,text,text,jsonb,text)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.create_newsletter_draft_fork(uuid,uuid,timestamptz,text,text,text,jsonb,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.create_newsletter_draft_fork(uuid,uuid,timestamptz,text,text,text,jsonb,text)',
      'EXECUTE'
    ),
  'fork command execution is restricted to the service role'
);

SELECT ok(
  (
    SELECT procedure.prosecdef
    FROM pg_proc AS procedure
    WHERE procedure.oid =
      'public.create_newsletter_draft_fork(uuid,uuid,timestamptz,text,text,text,jsonb,text)'::regprocedure
  ),
  'fork creation runs as its definer after service-role authorization'
);

SELECT ok(
  position(
    'pg_advisory_xact_lock' IN pg_get_functiondef(
      'public.create_newsletter_draft_fork(uuid,uuid,timestamptz,text,text,text,jsonb,text)'::regprocedure
    )
  ) > 0
    AND position(
      'p_owner_id' IN pg_get_functiondef(
        'public.create_newsletter_draft_fork(uuid,uuid,timestamptz,text,text,text,jsonb,text)'::regprocedure
      )
    ) > 0
    AND position(
      'p_idempotency_key' IN pg_get_functiondef(
        'public.create_newsletter_draft_fork(uuid,uuid,timestamptz,text,text,text,jsonb,text)'::regprocedure
      )
    ) > 0,
  'same-owner idempotency retries are serialized by a transaction advisory lock'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_index AS index
    WHERE index.indrelid =
      'public.newsletter_draft_fork_requests'::regclass
      AND index.indisprimary
      AND pg_get_indexdef(index.indexrelid) LIKE
        '%(owner_id, idempotency_key)%'
  ),
  'the receipt primary key closes duplicate insertion races after serialization'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    WHERE con.conrelid =
        'public.newsletter_draft_fork_requests'::regclass
      AND con.contype = 'f'
      AND con.confrelid = 'public.newsletter_drafts'::regclass
  ),
  'draft deletion cannot cascade away durable exactly-once receipts'
);

INSERT INTO auth.users (id)
VALUES
  ('f1000000-0000-4000-8000-000000000001'::uuid),
  ('f1000000-0000-4000-8000-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.newsletter_drafts (
  id,
  owner_id,
  session_id,
  ticker,
  status,
  source_type,
  subject_line,
  draft_json,
  preview_html,
  created_at,
  updated_at
)
VALUES (
  'f2000000-0000-4000-8000-000000000001'::uuid,
  'f1000000-0000-4000-8000-000000000001'::uuid,
  'fork-source-session',
  'AAPL',
  'published',
  'manual',
  'Published source',
  jsonb_build_object(
    'ticker', 'AAPL',
    'format', 'single_stock',
    'featuredTickers', jsonb_build_array('AAPL'),
    'manualDraft', true,
    'generatedAt', '2026-08-09T10:00:00.000Z',
    'subjectLine', 'Published source',
    'introText', '',
    'autoPickedStock', false,
    'blocks', '[]'::jsonb
  ),
  '<html>source</html>',
  '2026-08-09T10:00:00.000Z'::timestamptz,
  '2026-08-09T10:00:00.000Z'::timestamptz
);

CREATE TEMP TABLE first_fork ON COMMIT DROP AS
SELECT *
FROM public.create_newsletter_draft_fork(
  'f1000000-0000-4000-8000-000000000001'::uuid,
  'f2000000-0000-4000-8000-000000000001'::uuid,
  '2026-08-09T10:00:00.000Z'::timestamptz,
  'fork-command-session',
  'fork-command-0001',
  repeat('a', 64),
  jsonb_build_object(
    'ticker', 'AAPL',
    'format', 'single_stock',
    'featuredTickers', jsonb_build_array('AAPL'),
    'manualDraft', true,
    'generatedAt', '2026-08-09T11:00:00.000Z',
    'subjectLine', 'Copy of Published source',
    'introText', 'Retained local correction.',
    'autoPickedStock', false,
    'blocks', '[]'::jsonb
  ),
  '<html>fork</html>'
);

SELECT is(
  (SELECT count(*) FROM first_fork),
  1::bigint,
  'the first fork command returns exactly one created draft'
);

SELECT ok(
  (
    SELECT owner_id = 'f1000000-0000-4000-8000-000000000001'::uuid
      AND session_id = 'fork-command-session'
      AND status = 'draft'
      AND source_type = 'manual'
      AND source_review_key IS NULL
      AND beehiiv_url IS NULL
      AND published_at IS NULL
      AND subject_line = 'Copy of Published source'
      AND draft_json ->> 'manualDraft' = 'true'
      AND NOT (draft_json ? 'source')
      AND NOT (draft_json ? 'publication')
    FROM first_fork
  ),
  'the atomic command creates an independent owner-scoped manual draft'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_draft_events AS event
    JOIN first_fork AS fork ON fork.id = event.draft_id
    WHERE event.event_type = 'created'
      AND event.to_status = 'draft'
      AND event.dedupe_key = 'fork:fork-command-0001'
      AND event.metadata ->> 'forkedFromDraftId' =
        'f2000000-0000-4000-8000-000000000001'
      AND event.metadata ->> 'forkIdempotencyKey' = 'fork-command-0001'
      AND event.metadata ->> 'forkRequestHash' = repeat('a', 64)
  ),
  1::bigint,
  'the created audit event is committed with the exact fork receipt metadata'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_draft_fork_requests AS request
    JOIN first_fork AS fork ON fork.id = request.created_draft_id
    WHERE request.owner_id =
        'f1000000-0000-4000-8000-000000000001'::uuid
      AND request.idempotency_key = 'fork-command-0001'
      AND request.source_draft_id =
        'f2000000-0000-4000-8000-000000000001'::uuid
      AND request.request_hash = repeat('a', 64)
  ),
  1::bigint,
  'the draft and event share one durable idempotency receipt'
);

CREATE TEMP TABLE identity_only_replay ON COMMIT DROP AS
SELECT *
FROM public.create_newsletter_draft_fork(
  'f1000000-0000-4000-8000-000000000001'::uuid,
  'f2000000-0000-4000-8000-000000000001'::uuid,
  NULL,
  '',
  'fork-command-0001',
  repeat('a', 64),
  '{"deploymentShape":"changed"}'::jsonb,
  NULL
);

SELECT is(
  (SELECT id FROM identity_only_replay),
  (SELECT id FROM first_fork),
  'an exact logical replay ignores invalid or changed derived application arguments'
);

SELECT is(
  pg_temp.newsletter_draft_fork_error(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    'f2000000-0000-4000-8000-000000000001'::uuid,
    NULL,
    '',
    'fork-new-invalid-0001',
    repeat('f', 64),
    '{"deploymentShape":"changed"}'::jsonb,
    NULL
  ),
  'invalid fork source version',
  'a new idempotency key still validates all required derived arguments'
);

-- Change the source after the first commit. An exact retry must return the
-- original receipt before reinterpreting mutable source state.
UPDATE public.newsletter_drafts
SET preview_html = '<html>source changed later</html>'
WHERE id = 'f2000000-0000-4000-8000-000000000001'::uuid;

CREATE TEMP TABLE replayed_fork ON COMMIT DROP AS
SELECT *
FROM public.create_newsletter_draft_fork(
  'f1000000-0000-4000-8000-000000000001'::uuid,
  'f2000000-0000-4000-8000-000000000001'::uuid,
  '2026-08-09T10:00:00.000Z'::timestamptz,
  'fork-command-session',
  'fork-command-0001',
  repeat('a', 64),
  jsonb_build_object(
    'ticker', 'AAPL',
    'format', 'single_stock',
    'featuredTickers', jsonb_build_array('AAPL'),
    'manualDraft', true,
    'generatedAt', '2026-08-09T11:00:00.000Z',
    'subjectLine', 'Copy of Published source',
    'introText', 'Retained local correction.',
    'autoPickedStock', false,
    'blocks', '[]'::jsonb
  ),
  '<html>fork</html>'
);

SELECT is(
  (SELECT id FROM replayed_fork),
  (SELECT id FROM first_fork),
  'an exact retry returns the originally committed draft after source changes'
);

SELECT ok(
  (
    SELECT count(*) = 1
    FROM public.newsletter_draft_fork_requests
    WHERE owner_id = 'f1000000-0000-4000-8000-000000000001'::uuid
      AND idempotency_key = 'fork-command-0001'
  )
    AND (
      SELECT count(*) = 1
      FROM public.newsletter_draft_events AS event
      JOIN first_fork AS fork ON fork.id = event.draft_id
      WHERE event.event_type = 'created'
    ),
  'an exact replay creates neither a second draft nor a second event receipt'
);

SELECT is(
  pg_temp.newsletter_draft_fork_error(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    'f2000000-0000-4000-8000-000000000001'::uuid,
    '2026-08-09T10:00:00.000Z'::timestamptz,
    'fork-command-session',
    'fork-command-0001',
    repeat('b', 64),
    jsonb_build_object(
      'ticker', 'AAPL',
      'manualDraft', true,
      'generatedAt', '2026-08-09T11:00:00.000Z',
      'subjectLine', 'Different command',
      'blocks', '[]'::jsonb
    ),
    '<html>different</html>'
  ),
  'fork idempotency key was reused with a different request',
  'an idempotency key cannot represent a different logical command'
);

SELECT is(
  pg_temp.newsletter_draft_fork_error(
    'f1000000-0000-4000-8000-000000000002'::uuid,
    'f2000000-0000-4000-8000-000000000001'::uuid,
    (SELECT updated_at FROM public.newsletter_drafts
      WHERE id = 'f2000000-0000-4000-8000-000000000001'::uuid),
    'other-owner-session',
    'fork-other-owner-0001',
    repeat('c', 64),
    jsonb_build_object(
      'ticker', 'AAPL',
      'manualDraft', true,
      'generatedAt', '2026-08-09T12:00:00.000Z',
      'subjectLine', 'Unauthorized copy',
      'blocks', '[]'::jsonb
    ),
    '<html>unauthorized</html>'
  ),
  'newsletter draft fork source not found or does not own source',
  'an owner cannot fork another owner''s source draft'
);

SELECT is(
  pg_temp.newsletter_draft_fork_error(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    'f2000000-0000-4000-8000-000000000001'::uuid,
    '2026-08-09T10:00:00.000Z'::timestamptz,
    'fork-command-session',
    'fork-stale-source-0001',
    repeat('d', 64),
    jsonb_build_object(
      'ticker', 'AAPL',
      'manualDraft', true,
      'generatedAt', '2026-08-09T12:00:00.000Z',
      'subjectLine', 'Stale source copy',
      'blocks', '[]'::jsonb
    ),
    '<html>stale</html>'
  ),
  'newsletter draft fork source changed',
  'a new command cannot fork a source version that changed mid-request'
);

CREATE FUNCTION pg_temp.reject_selected_fork_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.metadata ->> 'forkIdempotencyKey' = 'fork-rollback-0001' THEN
    RAISE EXCEPTION 'forced fork event failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reject_selected_fork_event
  BEFORE INSERT ON public.newsletter_draft_events
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_selected_fork_event();

SELECT is(
  pg_temp.newsletter_draft_fork_error(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    'f2000000-0000-4000-8000-000000000001'::uuid,
    (SELECT updated_at FROM public.newsletter_drafts
      WHERE id = 'f2000000-0000-4000-8000-000000000001'::uuid),
    'fork-command-session',
    'fork-rollback-0001',
    repeat('e', 64),
    jsonb_build_object(
      'ticker', 'AAPL',
      'format', 'single_stock',
      'featuredTickers', jsonb_build_array('AAPL'),
      'manualDraft', true,
      'generatedAt', '2026-08-09T13:00:00.000Z',
      'subjectLine', 'Atomic rollback copy',
      'introText', '',
      'autoPickedStock', false,
      'blocks', '[]'::jsonb
    ),
    '<html>rollback</html>'
  ),
  'forced fork event failure',
  'a downstream event failure aborts the fork command'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.newsletter_drafts
    WHERE owner_id = 'f1000000-0000-4000-8000-000000000001'::uuid
      AND subject_line = 'Atomic rollback copy'
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.newsletter_draft_fork_requests
      WHERE owner_id = 'f1000000-0000-4000-8000-000000000001'::uuid
        AND idempotency_key = 'fork-rollback-0001'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.newsletter_draft_events
      WHERE metadata ->> 'forkIdempotencyKey' = 'fork-rollback-0001'
    ),
  'event failure rolls back the draft, event, and idempotency receipt together'
);

DROP TRIGGER reject_selected_fork_event
  ON public.newsletter_draft_events;

DELETE FROM public.newsletter_drafts
WHERE id = 'f2000000-0000-4000-8000-000000000001'::uuid;

CREATE TEMP TABLE replay_after_source_deletion ON COMMIT DROP AS
SELECT *
FROM public.create_newsletter_draft_fork(
  'f1000000-0000-4000-8000-000000000001'::uuid,
  'f2000000-0000-4000-8000-000000000001'::uuid,
  '2026-08-09T10:00:00.000Z'::timestamptz,
  'fork-command-session',
  'fork-command-0001',
  repeat('a', 64),
  jsonb_build_object(
    'ticker', 'AAPL',
    'format', 'single_stock',
    'featuredTickers', jsonb_build_array('AAPL'),
    'manualDraft', true,
    'generatedAt', '2026-08-09T11:00:00.000Z',
    'subjectLine', 'Copy of Published source',
    'introText', 'Retained local correction.',
    'autoPickedStock', false,
    'blocks', '[]'::jsonb
  ),
  '<html>fork</html>'
);

SELECT is(
  (SELECT id FROM replay_after_source_deletion),
  (SELECT id FROM first_fork),
  'deleting the source preserves the receipt and exact replay result'
);

DELETE FROM public.newsletter_drafts
WHERE id = (SELECT id FROM first_fork);

SELECT is(
  pg_temp.newsletter_draft_fork_error(
    'f1000000-0000-4000-8000-000000000001'::uuid,
    'f2000000-0000-4000-8000-000000000001'::uuid,
    '2026-08-09T10:00:00.000Z'::timestamptz,
    'fork-command-session',
    'fork-command-0001',
    repeat('a', 64),
    jsonb_build_object(
      'ticker', 'AAPL',
      'format', 'single_stock',
      'featuredTickers', jsonb_build_array('AAPL'),
      'manualDraft', true,
      'generatedAt', '2026-08-09T11:00:00.000Z',
      'subjectLine', 'Copy of Published source',
      'introText', 'Retained local correction.',
      'autoPickedStock', false,
      'blocks', '[]'::jsonb
    ),
    '<html>fork</html>'
  ),
  'newsletter draft fork replay target no longer exists',
  'deleting the created fork fails an exact retry closed instead of recreating it'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_draft_fork_requests
    WHERE owner_id = 'f1000000-0000-4000-8000-000000000001'::uuid
      AND idempotency_key = 'fork-command-0001'
  ),
  1::bigint,
  'the tombstone receipt survives deletion of both draft rows'
);

SELECT * FROM finish();

ROLLBACK;
