-- Persist an editable fork and its creation receipt as one idempotent command.
-- The HTTP route uses the service role; browser roles retain no direct write or
-- function-execution path around the existing owner/session checks.

BEGIN;

CREATE TABLE public.newsletter_draft_fork_requests (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  -- Keep both UUIDs as durable receipt evidence rather than foreign keys.
  -- Deleting either draft must not make the same command executable again.
  source_draft_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  created_draft_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, idempotency_key)
);

ALTER TABLE public.newsletter_draft_fork_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.newsletter_draft_fork_requests IS
  'Service-only receipts that make newsletter draft fork POSTs exactly replayable.';

CREATE OR REPLACE FUNCTION public.create_newsletter_draft_fork(
  p_owner_id uuid,
  p_source_draft_id uuid,
  p_source_updated_at timestamptz,
  p_session_id text,
  p_idempotency_key text,
  p_request_hash text,
  p_draft_json jsonb,
  p_preview_html text
)
RETURNS SETOF public.newsletter_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  replay public.newsletter_draft_fork_requests%ROWTYPE;
  source_updated_at timestamptz;
  created_draft public.newsletter_drafts%ROWTYPE;
  draft_ticker text;
  draft_subject text;
BEGIN
  IF p_owner_id IS NULL OR p_source_draft_id IS NULL THEN
    RAISE EXCEPTION 'invalid fork owner or source';
  END IF;
  IF p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' THEN
    RAISE EXCEPTION 'invalid fork idempotency key';
  END IF;
  IF p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid fork request hash';
  END IF;

  -- Resolve committed commands solely from their durable logical identity.
  -- Normalized draft/preview arguments may legitimately change across an app
  -- deployment and must not reinterpret an exact replay.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'newsletter-draft-fork:' || p_owner_id::text || ':' || p_idempotency_key,
      0
    )
  );

  SELECT *
  INTO replay
  FROM public.newsletter_draft_fork_requests AS request
  WHERE request.owner_id = p_owner_id
    AND request.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF replay.source_draft_id IS DISTINCT FROM p_source_draft_id
      OR replay.request_hash IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION 'fork idempotency key was reused with a different request';
    END IF;
    SELECT draft.*
    INTO created_draft
    FROM public.newsletter_drafts AS draft
    WHERE draft.id = replay.created_draft_id
      AND draft.owner_id = p_owner_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'newsletter draft fork replay target no longer exists';
    END IF;
    RETURN NEXT created_draft;
    RETURN;
  END IF;

  IF p_source_updated_at IS NULL THEN
    RAISE EXCEPTION 'invalid fork source version';
  END IF;
  IF p_session_id IS NULL
    OR length(btrim(p_session_id)) < 1
    OR length(p_session_id) > 200 THEN
    RAISE EXCEPTION 'invalid fork session';
  END IF;
  IF p_draft_json IS NULL
    OR jsonb_typeof(p_draft_json) <> 'object'
    OR octet_length(p_draft_json::text) > 1048576 THEN
    RAISE EXCEPTION 'invalid fork draft document';
  END IF;
  IF p_preview_html IS NULL OR octet_length(p_preview_html) > 1048576 THEN
    RAISE EXCEPTION 'invalid fork preview';
  END IF;
  IF jsonb_typeof(p_draft_json -> 'blocks') <> 'array'
    OR jsonb_array_length(p_draft_json -> 'blocks') > 50
    OR coalesce((p_draft_json ->> 'manualDraft')::boolean, false) IS NOT TRUE
    OR p_draft_json ? 'source'
    OR p_draft_json ? 'publication' THEN
    RAISE EXCEPTION 'invalid fork draft document';
  END IF;

  draft_ticker := btrim(coalesce(p_draft_json ->> 'ticker', ''));
  draft_subject := btrim(coalesce(p_draft_json ->> 'subjectLine', ''));
  IF draft_ticker = '' OR length(draft_ticker) > 32
    OR draft_subject = '' OR length(draft_subject) > 1000
    OR NOT pg_catalog.pg_input_is_valid(
      p_draft_json ->> 'generatedAt',
      'timestamp with time zone'
    ) THEN
    RAISE EXCEPTION 'invalid fork draft document';
  END IF;

  SELECT draft.updated_at
  INTO source_updated_at
  FROM public.newsletter_drafts AS draft
  WHERE draft.id = p_source_draft_id
    AND draft.owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'newsletter draft fork source not found or does not own source';
  END IF;
  IF source_updated_at IS DISTINCT FROM p_source_updated_at THEN
    RAISE EXCEPTION 'newsletter draft fork source changed';
  END IF;

  INSERT INTO public.newsletter_drafts (
    owner_id,
    session_id,
    ticker,
    status,
    source_type,
    source_review_key,
    beehiiv_url,
    published_at,
    subject_line,
    draft_json,
    preview_html
  )
  VALUES (
    p_owner_id,
    btrim(p_session_id),
    upper(draft_ticker),
    'draft',
    'manual',
    NULL,
    NULL,
    NULL,
    draft_subject,
    p_draft_json,
    p_preview_html
  )
  RETURNING * INTO created_draft;

  INSERT INTO public.newsletter_draft_events (
    draft_id,
    owner_id,
    session_id,
    event_type,
    from_status,
    to_status,
    beehiiv_url,
    dedupe_key,
    metadata
  )
  VALUES (
    created_draft.id,
    p_owner_id,
    btrim(p_session_id),
    'created',
    NULL,
    'draft',
    NULL,
    'fork:' || p_idempotency_key,
    jsonb_build_object(
      'sourceType', 'manual',
      'sourceReviewKey', NULL,
      'forkedFromDraftId', p_source_draft_id,
      'forkedFromUpdatedAt', source_updated_at,
      'forkIdempotencyKey', p_idempotency_key,
      'forkRequestHash', p_request_hash
    )
  );

  INSERT INTO public.newsletter_draft_fork_requests (
    owner_id,
    idempotency_key,
    source_draft_id,
    request_hash,
    created_draft_id
  )
  VALUES (
    p_owner_id,
    p_idempotency_key,
    p_source_draft_id,
    p_request_hash,
    created_draft.id
  );

  RETURN NEXT created_draft;
END;
$$;

REVOKE ALL ON TABLE public.newsletter_draft_fork_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.newsletter_draft_fork_requests
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.newsletter_draft_fork_requests TO service_role;

REVOKE ALL ON FUNCTION public.create_newsletter_draft_fork(
  uuid, uuid, timestamptz, text, text, text, jsonb, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_newsletter_draft_fork(
  uuid, uuid, timestamptz, text, text, text, jsonb, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_newsletter_draft_fork(
  uuid, uuid, timestamptz, text, text, text, jsonb, text
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
