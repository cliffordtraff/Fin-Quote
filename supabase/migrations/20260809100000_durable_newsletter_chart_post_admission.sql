-- Make newsletter chart saves idempotent and capacity-bounded across every
-- serverless isolate. The application may coalesce promises in one process,
-- but only these fenced leases are authoritative in production.

BEGIN;

-- Keep the chart row itself linked to the durable command identity. This lets
-- a retry recover an insert whose commit succeeded but whose HTTP response was
-- lost, even if admission receipts are eventually aged out.
ALTER TABLE public.newsletter_chart_library
  ADD COLUMN post_request_key_hash text,
  ADD COLUMN post_request_fingerprint text;

ALTER TABLE public.newsletter_chart_library
  ADD CONSTRAINT newsletter_chart_library_post_request_identity_check CHECK (
    (
      post_request_key_hash IS NULL
      AND post_request_fingerprint IS NULL
    )
    OR (
      owner_id IS NOT NULL
      AND post_request_key_hash ~ '^[0-9a-f]{64}$'
      AND post_request_fingerprint ~ '^[0-9a-f]{64}$'
    )
  );

CREATE UNIQUE INDEX idx_newsletter_chart_library_owner_post_request
  ON public.newsletter_chart_library (owner_id, post_request_key_hash)
  WHERE post_request_key_hash IS NOT NULL;

CREATE TABLE public.newsletter_chart_post_requests (
  owner_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL
    CHECK (
      length(idempotency_key) BETWEEN 8 AND 128
      AND idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    ),
  fingerprint text NOT NULL
    CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL
    CHECK (status IN ('active', 'succeeded')),
  lease_token uuid,
  lease_expires_at timestamptz,
  result_receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (owner_id, idempotency_key),
  CONSTRAINT newsletter_chart_post_request_state_check CHECK (
    (
      status = 'active'
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND result_receipt IS NULL
      AND completed_at IS NULL
    )
    OR (
      status = 'succeeded'
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
      AND result_receipt IS NOT NULL
      AND jsonb_typeof(result_receipt) = 'object'
      AND octet_length(result_receipt::text) BETWEEN 2 AND 524288
      AND completed_at IS NOT NULL
    )
  )
);

CREATE TABLE public.newsletter_chart_post_rate_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  admitted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_newsletter_chart_post_active_leases
  ON public.newsletter_chart_post_requests (lease_expires_at, owner_id)
  WHERE status = 'active';

CREATE INDEX idx_newsletter_chart_post_completed_retention
  ON public.newsletter_chart_post_requests (completed_at)
  WHERE status = 'succeeded';

CREATE INDEX idx_newsletter_chart_post_rate_owner_time
  ON public.newsletter_chart_post_rate_events (owner_id, admitted_at);

CREATE INDEX idx_newsletter_chart_post_rate_retention
  ON public.newsletter_chart_post_rate_events (admitted_at);

ALTER TABLE public.newsletter_chart_post_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_chart_post_rate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_read_newsletter_chart_post_requests
  ON public.newsletter_chart_post_requests
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY service_role_read_newsletter_chart_post_rate_events
  ON public.newsletter_chart_post_rate_events
  FOR SELECT
  TO service_role
  USING (true);

REVOKE ALL PRIVILEGES ON TABLE public.newsletter_chart_post_requests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.newsletter_chart_post_rate_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.newsletter_chart_post_requests TO service_role;
GRANT SELECT ON TABLE public.newsletter_chart_post_rate_events TO service_role;

CREATE OR REPLACE FUNCTION public.acquire_newsletter_chart_post(
  p_owner_id uuid,
  p_idempotency_key text,
  p_fingerprint text,
  p_lease_seconds integer DEFAULT 180
)
RETURNS TABLE (
  disposition text,
  lease_token uuid,
  result_receipt jsonb,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  now_at timestamptz;
  -- The fence must outlive the route's complete 120-second invocation, not
  -- merely its 55-second logical caller deadline. Keep the parameter in the
  -- stable RPC signature, but never allow a caller to shorten this fence.
  lease_duration integer := pg_catalog.greatest(
    180,
    pg_catalog.least(pg_catalog.coalesce(p_lease_seconds, 180), 180)
  );
  claimed_token uuid := pg_catalog.gen_random_uuid();
  request_row public.newsletter_chart_post_requests%ROWTYPE;
  active_for_owner integer;
  active_global integer;
  recent_for_owner integer;
BEGIN
  IF p_owner_id IS NULL
    OR pg_catalog.coalesce(p_idempotency_key, '') !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    OR pg_catalog.coalesce(p_fingerprint, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid newsletter chart post admission identity';
  END IF;

  -- Different idempotency keys must still compete for one global physical
  -- budget. A transaction advisory lock keeps that count deterministic.
  PERFORM pg_catalog.pg_advisory_xact_lock(8675309001001::bigint);
  -- Lock wait time is not part of a lease or rolling-window timestamp.
  now_at := pg_catalog.clock_timestamp();

  -- One acquisition performs only bounded housekeeping. At the enforced
  -- admission rates these batches remove stale state faster than it can be
  -- created, without turning a request into an unbounded maintenance job.
  WITH stale_rate_events AS (
    SELECT event.id
    FROM public.newsletter_chart_post_rate_events AS event
    WHERE event.admitted_at <= now_at - interval '10 minutes'
    ORDER BY event.admitted_at, event.id
    LIMIT 1024
  )
  DELETE FROM public.newsletter_chart_post_rate_events AS event
  USING stale_rate_events AS stale
  WHERE event.id = stale.id;

  WITH stale_requests AS (
    SELECT stored.owner_id, stored.idempotency_key
    FROM public.newsletter_chart_post_requests AS stored
    WHERE (
      stored.status = 'succeeded'
      AND stored.completed_at <= now_at - interval '24 hours'
    ) OR (
      stored.status = 'active'
      AND stored.lease_expires_at <= now_at - interval '24 hours'
    )
    ORDER BY stored.updated_at, stored.owner_id, stored.idempotency_key
    LIMIT 256
  )
  DELETE FROM public.newsletter_chart_post_requests AS stored
  USING stale_requests AS stale
  WHERE stored.owner_id = stale.owner_id
    AND stored.idempotency_key = stale.idempotency_key;

  SELECT stored.*
  INTO request_row
  FROM public.newsletter_chart_post_requests AS stored
  WHERE stored.owner_id = p_owner_id
    AND stored.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF request_row.fingerprint IS DISTINCT FROM p_fingerprint THEN
      RETURN QUERY SELECT
        'conflict'::text,
        NULL::uuid,
        NULL::jsonb,
        0;
      RETURN;
    END IF;

    IF request_row.status = 'succeeded' THEN
      RETURN QUERY SELECT
        'replay'::text,
        NULL::uuid,
        request_row.result_receipt,
        0;
      RETURN;
    END IF;

    IF request_row.lease_expires_at > now_at THEN
      RETURN QUERY SELECT
        'in_progress'::text,
        NULL::uuid,
        NULL::jsonb,
        pg_catalog.greatest(
          1,
          pg_catalog.least(
            10,
            pg_catalog.ceil(
              pg_catalog.date_part(
                'epoch',
                request_row.lease_expires_at - now_at
              )
            )::integer
          )
        );
      RETURN;
    END IF;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO active_for_owner
  FROM public.newsletter_chart_post_requests AS active_request
  WHERE active_request.status = 'active'
    AND active_request.lease_expires_at > now_at
    AND active_request.owner_id = p_owner_id;

  IF active_for_owner >= 2 THEN
    RETURN QUERY SELECT
      'owner_capacity'::text,
      NULL::uuid,
      NULL::jsonb,
      10;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO active_global
  FROM public.newsletter_chart_post_requests AS active_request
  WHERE active_request.status = 'active'
    AND active_request.lease_expires_at > now_at;

  IF active_global >= 4 THEN
    RETURN QUERY SELECT
      'global_capacity'::text,
      NULL::uuid,
      NULL::jsonb,
      10;
    RETURN;
  END IF;

  -- An expired lease is recovery of the same logical save, not a thirteenth
  -- new save. It receives a new fence token but does not consume rate quota.
  IF request_row.owner_id IS NOT NULL THEN
    UPDATE public.newsletter_chart_post_requests AS stored
    SET
      status = 'active',
      lease_token = claimed_token,
      lease_expires_at = now_at + pg_catalog.make_interval(secs => lease_duration),
      result_receipt = NULL,
      completed_at = NULL,
      updated_at = now_at
    WHERE stored.owner_id = p_owner_id
      AND stored.idempotency_key = p_idempotency_key;

    RETURN QUERY SELECT
      'acquired'::text,
      claimed_token,
      NULL::jsonb,
      lease_duration;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO recent_for_owner
  FROM public.newsletter_chart_post_rate_events AS event
  WHERE event.owner_id = p_owner_id
    AND event.admitted_at > now_at - interval '10 minutes';

  IF recent_for_owner >= 12 THEN
    RETURN QUERY SELECT
      'rate_limited'::text,
      NULL::uuid,
      NULL::jsonb,
      10;
    RETURN;
  END IF;

  INSERT INTO public.newsletter_chart_post_requests (
    owner_id,
    idempotency_key,
    fingerprint,
    status,
    lease_token,
    lease_expires_at,
    created_at,
    updated_at
  ) VALUES (
    p_owner_id,
    p_idempotency_key,
    p_fingerprint,
    'active',
    claimed_token,
    now_at + pg_catalog.make_interval(secs => lease_duration),
    now_at,
    now_at
  );

  INSERT INTO public.newsletter_chart_post_rate_events (owner_id, admitted_at)
  VALUES (p_owner_id, now_at);

  RETURN QUERY SELECT
    'acquired'::text,
    claimed_token,
    NULL::jsonb,
    lease_duration;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_newsletter_chart_post(
  p_owner_id uuid,
  p_idempotency_key text,
  p_fingerprint text,
  p_lease_token uuid,
  p_result_receipt jsonb
)
RETURNS TABLE (
  disposition text,
  result_receipt jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  now_at timestamptz;
  request_row public.newsletter_chart_post_requests%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL
    OR pg_catalog.coalesce(p_idempotency_key, '') !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    OR pg_catalog.coalesce(p_fingerprint, '') !~ '^[0-9a-f]{64}$'
    OR p_lease_token IS NULL
    OR p_result_receipt IS NULL
    OR pg_catalog.jsonb_typeof(p_result_receipt) <> 'object'
    OR pg_catalog.octet_length(p_result_receipt::text) NOT BETWEEN 2 AND 524288
    OR pg_catalog.coalesce(p_result_receipt ->> 'id', '') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(p_result_receipt -> 'ownerId')
      IS DISTINCT FROM 'string'
    OR p_result_receipt ->> 'ownerId' IS DISTINCT FROM p_owner_id::text
    OR pg_catalog.jsonb_typeof(p_result_receipt -> 'sessionId')
      IS DISTINCT FROM 'string'
    OR pg_catalog.char_length(p_result_receipt ->> 'sessionId') NOT BETWEEN 1 AND 512
    OR pg_catalog.jsonb_typeof(p_result_receipt -> 'title')
      IS DISTINCT FROM 'string'
    OR pg_catalog.char_length(p_result_receipt ->> 'title') NOT BETWEEN 1 AND 120
    OR pg_catalog.char_length(p_result_receipt ->> 'symbol') NOT BETWEEN 1 AND 24
    OR pg_catalog.coalesce(p_result_receipt ->> 'symbol', '') !~
      '^[A-Z0-9]+([.-][A-Z0-9]+)*$'
    OR pg_catalog.jsonb_typeof(p_result_receipt -> 'chartSpec')
      IS DISTINCT FROM 'object'
    OR p_result_receipt #>> '{chartSpec,mode}' IS DISTINCT FROM 'price'
    OR p_result_receipt #>> '{chartSpec,symbol}'
      IS DISTINCT FROM p_result_receipt ->> 'symbol'
    OR pg_catalog.jsonb_typeof(p_result_receipt -> 'chartImageUrl')
      IS DISTINCT FROM 'string'
    OR pg_catalog.char_length(p_result_receipt ->> 'chartImageUrl') NOT BETWEEN 8 AND 8192
    OR p_result_receipt ->> 'chartImageUrl' !~ '^https?://'
    OR pg_catalog.jsonb_typeof(p_result_receipt -> 'thumbnailUrl')
      IS DISTINCT FROM 'string'
    OR pg_catalog.char_length(p_result_receipt ->> 'thumbnailUrl') NOT BETWEEN 8 AND 8192
    OR p_result_receipt ->> 'thumbnailUrl' !~ '^https?://'
    OR pg_catalog.jsonb_typeof(p_result_receipt -> 'chartExportUrl')
      IS DISTINCT FROM 'string'
    OR pg_catalog.char_length(p_result_receipt ->> 'chartExportUrl') NOT BETWEEN 8 AND 8192
    OR p_result_receipt ->> 'chartExportUrl' !~ '^https?://'
    OR pg_catalog.coalesce(p_result_receipt ->> 'capturedAt', '') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
    OR pg_catalog.jsonb_typeof(p_result_receipt -> 'rendererContract')
      IS DISTINCT FROM 'string'
    OR pg_catalog.char_length(p_result_receipt ->> 'rendererContract') NOT BETWEEN 1 AND 128
    OR pg_catalog.coalesce(p_result_receipt ->> 'sceneHash', '') !~
      '^[0-9a-f]{64}$'
    OR (
      pg_catalog.jsonb_typeof(p_result_receipt -> 'imageSha256')
        IS DISTINCT FROM 'null'
      AND pg_catalog.coalesce(p_result_receipt ->> 'imageSha256', '') !~
        '^[0-9a-f]{64}$'
    )
    OR pg_catalog.coalesce(p_result_receipt ->> 'createdAt', '') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
    OR pg_catalog.coalesce(p_result_receipt ->> 'updatedAt', '') !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid newsletter chart post completion receipt';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(8675309001001::bigint);
  now_at := pg_catalog.clock_timestamp();

  SELECT stored.*
  INTO request_row
  FROM public.newsletter_chart_post_requests AS stored
  WHERE stored.owner_id = p_owner_id
    AND stored.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'lost'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF request_row.fingerprint IS DISTINCT FROM p_fingerprint THEN
    RETURN QUERY SELECT 'conflict'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF request_row.status = 'succeeded' THEN
    RETURN QUERY SELECT 'replay'::text, request_row.result_receipt;
    RETURN;
  END IF;

  IF request_row.lease_token IS DISTINCT FROM p_lease_token
    OR request_row.lease_expires_at <= now_at THEN
    RETURN QUERY SELECT 'lost'::text, NULL::jsonb;
    RETURN;
  END IF;

  UPDATE public.newsletter_chart_post_requests AS stored
  SET
    status = 'succeeded',
    lease_token = NULL,
    lease_expires_at = NULL,
    result_receipt = p_result_receipt,
    completed_at = now_at,
    updated_at = now_at
  WHERE stored.owner_id = p_owner_id
    AND stored.idempotency_key = p_idempotency_key;

  RETURN QUERY SELECT 'completed'::text, p_result_receipt;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_newsletter_chart_post(
  p_owner_id uuid,
  p_idempotency_key text,
  p_fingerprint text,
  p_lease_token uuid
)
RETURNS TABLE (disposition text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  now_at timestamptz;
  request_row public.newsletter_chart_post_requests%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL
    OR pg_catalog.coalesce(p_idempotency_key, '') !~
      '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    OR pg_catalog.coalesce(p_fingerprint, '') !~ '^[0-9a-f]{64}$'
    OR p_lease_token IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid newsletter chart post failure identity';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(8675309001001::bigint);
  now_at := pg_catalog.clock_timestamp();

  SELECT stored.*
  INTO request_row
  FROM public.newsletter_chart_post_requests AS stored
  WHERE stored.owner_id = p_owner_id
    AND stored.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'lost'::text;
    RETURN;
  END IF;

  IF request_row.fingerprint IS DISTINCT FROM p_fingerprint THEN
    RETURN QUERY SELECT 'conflict'::text;
    RETURN;
  END IF;

  IF request_row.status = 'succeeded' THEN
    RETURN QUERY SELECT 'replay'::text;
    RETURN;
  END IF;

  IF request_row.lease_token IS DISTINCT FROM p_lease_token
    OR request_row.lease_expires_at <= now_at THEN
    RETURN QUERY SELECT 'lost'::text;
    RETURN;
  END IF;

  DELETE FROM public.newsletter_chart_post_requests AS stored
  WHERE stored.owner_id = p_owner_id
    AND stored.idempotency_key = p_idempotency_key;

  RETURN QUERY SELECT 'released'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_newsletter_chart_post(
  uuid, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_newsletter_chart_post(
  uuid, text, text, uuid, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fail_newsletter_chart_post(
  uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.acquire_newsletter_chart_post(
  uuid, text, text, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_newsletter_chart_post(
  uuid, text, text, uuid, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_newsletter_chart_post(
  uuid, text, text, uuid
) TO service_role;

COMMENT ON TABLE public.newsletter_chart_post_requests IS
  'Fenced production idempotency receipts and active leases for owner-scoped newsletter chart saves.';
COMMENT ON FUNCTION public.acquire_newsletter_chart_post(uuid, text, text, integer) IS
  'Atomically replays, conflicts, rejects capacity/rate, or grants one fenced newsletter chart save lease across isolates.';
COMMENT ON FUNCTION public.complete_newsletter_chart_post(uuid, text, text, uuid, jsonb) IS
  'Persists a bounded chart result receipt only for the current fenced lease token.';
COMMENT ON FUNCTION public.fail_newsletter_chart_post(uuid, text, text, uuid) IS
  'Releases a failed chart save only for the current fenced lease token while retaining its rolling rate event.';

NOTIFY pgrst, 'reload schema';

COMMIT;
