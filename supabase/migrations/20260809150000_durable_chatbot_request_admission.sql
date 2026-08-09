-- Make chatbot model/tool admission authoritative across serverless isolates.
-- Process-local maps remain a fast fuse, but these fenced leases are the only
-- production authority allowed to precede paid model or provider work.

BEGIN;

CREATE TABLE public.chatbot_request_admissions (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (
    idempotency_key ~
      '^c1\.[0-9]{13}\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  request_fingerprint text NOT NULL CHECK (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  status text NOT NULL CHECK (status IN ('active', 'completed', 'failed')),
  lease_token uuid,
  lease_expires_at timestamptz,
  admitted_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  settled_at timestamptz,
  result_conversation_id uuid,
  result_revision bigint CHECK (result_revision IS NULL OR result_revision >= 0),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 6),
  PRIMARY KEY (owner_id, idempotency_key),
  CONSTRAINT chatbot_request_admission_state_check CHECK (
    (
      status = 'active'
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND settled_at IS NULL
      AND result_conversation_id IS NULL
      AND result_revision IS NULL
    )
    OR (
      status = 'completed'
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
      AND settled_at IS NOT NULL
      AND result_conversation_id IS NOT NULL
      AND result_revision IS NOT NULL
    )
    OR (
      status = 'failed'
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
      AND settled_at IS NOT NULL
      AND result_conversation_id IS NULL
      AND result_revision IS NULL
    )
  )
);

CREATE TABLE public.chatbot_request_rate_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admitted_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX idx_chatbot_request_active_leases
  ON public.chatbot_request_admissions (lease_expires_at, owner_id)
  WHERE status = 'active';
CREATE INDEX idx_chatbot_request_settled_retention
  ON public.chatbot_request_admissions (settled_at)
  WHERE status IN ('completed', 'failed');
CREATE INDEX idx_chatbot_request_rate_owner_time
  ON public.chatbot_request_rate_events (owner_id, admitted_at);
CREATE INDEX idx_chatbot_request_rate_retention
  ON public.chatbot_request_rate_events (admitted_at, event_id);

ALTER TABLE public.chatbot_request_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_request_rate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_read_chatbot_request_admissions
  ON public.chatbot_request_admissions
  FOR SELECT
  TO service_role
  USING (true);
CREATE POLICY service_role_read_chatbot_request_rate_events
  ON public.chatbot_request_rate_events
  FOR SELECT
  TO service_role
  USING (true);

REVOKE ALL PRIVILEGES ON TABLE public.chatbot_request_admissions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.chatbot_request_rate_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.chatbot_request_admissions TO service_role;
GRANT SELECT ON TABLE public.chatbot_request_rate_events TO service_role;

CREATE OR REPLACE FUNCTION public.acquire_chatbot_request_admission(
  p_owner_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text
)
RETURNS TABLE (
  disposition text,
  lease_token uuid,
  retry_after_seconds integer,
  result_conversation_id uuid,
  result_revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '8s'
AS $function$
DECLARE
  now_at timestamptz;
  fixed_lease_seconds constant integer := 180;
  claimed_token uuid := pg_catalog.gen_random_uuid();
  request_row public.chatbot_request_admissions%ROWTYPE;
  active_for_owner integer;
  active_global integer;
  recent_for_owner integer;
  retained_identity_count integer;
BEGIN
  IF p_owner_id IS NULL
    OR coalesce(p_idempotency_key, '') !~
      '^c1\.[0-9]{13}\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR coalesce(p_request_fingerprint, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Invalid chatbot request admission identity';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(8675309001300::bigint);
  now_at := pg_catalog.clock_timestamp();

  IF public.chatbot_idempotency_key_is_current(
    p_idempotency_key,
    now_at
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Chatbot request key is outside the 30-day retry window';
  END IF;

  -- Resolve a still-current exact identity before cleanup or accounting. Once
  -- a key ages out, the timestamped key itself is inadmissible, so compaction
  -- can never turn a delayed retry into a new paid request.
  SELECT request.*
  INTO request_row
  FROM public.chatbot_request_admissions AS request
  WHERE request.owner_id = p_owner_id
    AND request.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF request_row.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
      RETURN QUERY SELECT
        'key_conflict'::text, NULL::uuid, 0, NULL::uuid, NULL::bigint;
      RETURN;
    END IF;
    IF request_row.status = 'completed' THEN
      RETURN QUERY SELECT
        'completed'::text,
        NULL::uuid,
        0,
        request_row.result_conversation_id,
        request_row.result_revision;
      RETURN;
    END IF;
    IF request_row.status = 'failed' THEN
      RETURN QUERY SELECT
        'failed'::text, NULL::uuid, 0, NULL::uuid, NULL::bigint;
      RETURN;
    END IF;
    IF request_row.lease_expires_at > now_at THEN
      RETURN QUERY SELECT
        'in_progress'::text,
        NULL::uuid,
        greatest(
          1,
          least(
            fixed_lease_seconds,
            pg_catalog.ceil(
              pg_catalog.date_part(
                'epoch', request_row.lease_expires_at - now_at
              )
            )::integer
          )
        ),
        NULL::uuid,
        NULL::bigint;
      RETURN;
    END IF;
    IF request_row.attempt_count >= 6 THEN
      UPDATE public.chatbot_request_admissions AS request
      SET
        status = 'failed',
        lease_token = NULL,
        lease_expires_at = NULL,
        settled_at = now_at,
        updated_at = now_at,
        result_conversation_id = NULL,
        result_revision = NULL
      WHERE request.owner_id = p_owner_id
        AND request.idempotency_key = p_idempotency_key;
      RETURN QUERY SELECT
        'attempts_exhausted'::text, NULL::uuid, 0, NULL::uuid, NULL::bigint;
      RETURN;
    END IF;
  END IF;

  -- A new or reclaimed lease must keep the timestamped key valid throughout
  -- the full fixed lease; the nested turn commit revalidates the key before
  -- writing. Exact completed/failed/in-progress replay above still receives
  -- the full documented 30-day window.
  IF public.chatbot_idempotency_key_is_current(
    p_idempotency_key,
    now_at + interval '180 seconds'
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Chatbot request key expires before the admission lease';
  END IF;

  WITH stale_requests AS (
    SELECT request.owner_id, request.idempotency_key
    FROM public.chatbot_request_admissions AS request
    WHERE (
      (
        request.status IN ('completed', 'failed')
        AND request.settled_at < now_at - interval '30 days'
      ) OR (
        request.status = 'active'
        AND request.lease_expires_at < now_at - interval '30 days'
      )
    )
      AND pg_catalog.split_part(request.idempotency_key, '.', 2)::numeric <
        (pg_catalog.date_part('epoch', now_at) * 1000)::numeric - 2592000000
    ORDER BY request.updated_at, request.owner_id, request.idempotency_key
    LIMIT 1024
  )
  DELETE FROM public.chatbot_request_admissions AS request
  USING stale_requests AS stale
  WHERE request.owner_id = stale.owner_id
    AND request.idempotency_key = stale.idempotency_key;

  WITH stale_events AS (
    SELECT event.event_id
    FROM public.chatbot_request_rate_events AS event
    WHERE event.admitted_at <= now_at - interval '10 minutes'
    ORDER BY event.admitted_at, event.event_id
    LIMIT 1024
  )
  DELETE FROM public.chatbot_request_rate_events AS event
  USING stale_events AS stale
  WHERE event.event_id = stale.event_id;

  SELECT pg_catalog.count(*)::integer
  INTO active_for_owner
  FROM public.chatbot_request_admissions AS request
  WHERE request.owner_id = p_owner_id
    AND request.status = 'active'
    AND request.lease_expires_at > now_at;

  IF active_for_owner >= 1 THEN
    RETURN QUERY SELECT
      'owner_capacity'::text, NULL::uuid, 2, NULL::uuid, NULL::bigint;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO active_global
  FROM public.chatbot_request_admissions AS request
  WHERE request.status = 'active'
    AND request.lease_expires_at > now_at;

  IF active_global >= 4 THEN
    RETURN QUERY SELECT
      'global_capacity'::text, NULL::uuid, 2, NULL::uuid, NULL::bigint;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO recent_for_owner
  FROM public.chatbot_request_rate_events AS event
  WHERE event.owner_id = p_owner_id
    AND event.admitted_at > now_at - interval '10 minutes';

  IF recent_for_owner >= 20 THEN
    RETURN QUERY SELECT
      'rate_limited'::text, NULL::uuid, 30, NULL::uuid, NULL::bigint;
    RETURN;
  END IF;

  IF request_row.owner_id IS NOT NULL THEN
    UPDATE public.chatbot_request_admissions AS request
    SET
      status = 'active',
      lease_token = claimed_token,
      lease_expires_at = now_at + interval '180 seconds',
      updated_at = now_at,
      settled_at = NULL,
      result_conversation_id = NULL,
      result_revision = NULL,
      attempt_count = request.attempt_count + 1
    WHERE request.owner_id = p_owner_id
      AND request.idempotency_key = p_idempotency_key;

    INSERT INTO public.chatbot_request_rate_events (owner_id, admitted_at)
    VALUES (p_owner_id, now_at);

    RETURN QUERY SELECT
      'acquired'::text,
      claimed_token,
      fixed_lease_seconds,
      NULL::uuid,
      NULL::bigint;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO retained_identity_count
  FROM (
    SELECT 1
    FROM public.chatbot_request_admissions AS request
    WHERE request.owner_id = p_owner_id
    LIMIT 90001
  ) AS bounded_identities;

  IF retained_identity_count >= 90000 THEN
    RETURN QUERY SELECT
      'identity_capacity'::text, NULL::uuid, 0, NULL::uuid, NULL::bigint;
    RETURN;
  END IF;

  INSERT INTO public.chatbot_request_admissions (
    owner_id,
    idempotency_key,
    request_fingerprint,
    status,
    lease_token,
    lease_expires_at,
    admitted_at,
    updated_at
  ) VALUES (
    p_owner_id,
    p_idempotency_key,
    p_request_fingerprint,
    'active',
    claimed_token,
    now_at + interval '180 seconds',
    now_at,
    now_at
  );

  INSERT INTO public.chatbot_request_rate_events (owner_id, admitted_at)
  VALUES (p_owner_id, now_at);

  RETURN QUERY SELECT
    'acquired'::text,
    claimed_token,
    fixed_lease_seconds,
    NULL::uuid,
    NULL::bigint;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_chatbot_request_admission(
  p_owner_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text
)
RETURNS TABLE (
  disposition text,
  result_conversation_id uuid,
  result_revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '8s'
AS $function$
DECLARE
  request_row public.chatbot_request_admissions%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL
    OR public.chatbot_idempotency_key_is_current(
      p_idempotency_key,
      pg_catalog.clock_timestamp()
    ) IS DISTINCT FROM true
    OR coalesce(p_request_fingerprint, '') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Invalid chatbot request resolution identity';
  END IF;

  SELECT request.*
  INTO request_row
  FROM public.chatbot_request_admissions AS request
  WHERE request.owner_id = p_owner_id
    AND request.idempotency_key = p_idempotency_key;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'missing'::text, NULL::uuid, NULL::bigint;
  ELSIF request_row.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
    RETURN QUERY SELECT 'key_conflict'::text, NULL::uuid, NULL::bigint;
  ELSIF request_row.status = 'completed' THEN
    RETURN QUERY SELECT
      'completed'::text,
      request_row.result_conversation_id,
      request_row.result_revision;
  ELSIF request_row.status = 'failed' THEN
    RETURN QUERY SELECT 'failed'::text, NULL::uuid, NULL::bigint;
  ELSIF request_row.lease_expires_at <= pg_catalog.clock_timestamp() THEN
    RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::bigint;
  ELSE
    RETURN QUERY SELECT 'in_progress'::text, NULL::uuid, NULL::bigint;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_owned_chatbot_request_admission(
  p_idempotency_key text,
  p_request_fingerprint text
)
RETURNS TABLE (
  disposition text,
  result_conversation_id uuid,
  result_revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  current_owner_id uuid := auth.uid();
BEGIN
  IF current_owner_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Authentication is required for chatbot request resolution';
  END IF;

  RETURN QUERY
  SELECT resolved.disposition, resolved.result_conversation_id,
    resolved.result_revision
  FROM public.resolve_chatbot_request_admission(
    current_owner_id,
    p_idempotency_key,
    p_request_fingerprint
  ) AS resolved;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_chatbot_request_admission(
  p_owner_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_lease_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '8s'
AS $function$
DECLARE
  changed integer;
BEGIN
  IF p_owner_id IS NULL
    OR public.chatbot_idempotency_key_is_current(
      p_idempotency_key,
      pg_catalog.clock_timestamp()
    ) IS DISTINCT FROM true
    OR coalesce(p_request_fingerprint, '') !~ '^[0-9a-f]{64}$'
    OR p_lease_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Invalid chatbot request failure fence';
  END IF;

  UPDATE public.chatbot_request_admissions AS request
  SET
    status = 'failed',
    lease_token = NULL,
    lease_expires_at = NULL,
    settled_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp(),
    result_conversation_id = NULL,
    result_revision = NULL
  WHERE request.owner_id = p_owner_id
    AND request.idempotency_key = p_idempotency_key
    AND request.request_fingerprint = p_request_fingerprint
    AND request.status = 'active'
    AND request.lease_token = p_lease_token;
  GET DIAGNOSTICS changed = ROW_COUNT;

  RETURN CASE WHEN changed = 1 THEN 'failed' ELSE 'fence_lost' END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.preflight_chatbot_conversation_turn(
  p_conversation_id uuid,
  p_expected_revision bigint
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '5s'
AS $function$
DECLARE
  current_owner_id uuid := auth.uid();
  current_revision bigint;
  retained_receipt_count integer;
  owned_conversation_count integer;
  existing_message_count integer;
BEGIN
  IF current_owner_id IS NULL
    OR p_expected_revision IS NULL
    OR p_expected_revision < 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Invalid chatbot conversation preflight';
  END IF;

  -- Match the command primitive's owner lock and bounded retention cleanup so
  -- every deterministic quota rejection is known before paid model work.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'chatbot-conversations:' || current_owner_id::text,
      0
    )
  );

  WITH expired_receipts AS (
    SELECT receipt.receipt_id
    FROM public.chatbot_conversation_command_receipts AS receipt
    WHERE receipt.owner_id = current_owner_id
      AND receipt.created_at < pg_catalog.clock_timestamp() - interval '30 days'
      AND pg_catalog.split_part(receipt.idempotency_key, '.', 2)::numeric <
        (pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) * 1000)::numeric
          - 2592000000
    ORDER BY receipt.receipt_id
    LIMIT 256
  )
  DELETE FROM public.chatbot_conversation_command_receipts AS receipt
  USING expired_receipts AS expired
  WHERE receipt.receipt_id = expired.receipt_id;

  SELECT pg_catalog.count(*)::integer
  INTO retained_receipt_count
  FROM (
    SELECT 1
    FROM public.chatbot_conversation_command_receipts AS receipt
    WHERE receipt.owner_id = current_owner_id
    LIMIT 180001
  ) AS bounded_receipts;

  IF retained_receipt_count >= 180000 THEN
    RETURN 'command_quota';
  END IF;

  IF p_conversation_id IS NULL THEN
    IF p_expected_revision <> 0 THEN
      RETURN 'revision_conflict';
    END IF;

    SELECT pg_catalog.count(*)::integer
    INTO owned_conversation_count
    FROM (
      SELECT 1
      FROM public.conversations AS conversation
      WHERE conversation.user_id = current_owner_id
      LIMIT 101
    ) AS bounded_conversations;

    IF owned_conversation_count >= 100 THEN
      RETURN 'conversation_quota';
    END IF;

    RETURN 'ready';
  END IF;

  SELECT conversation.revision
  INTO current_revision
  FROM public.conversations AS conversation
  WHERE conversation.id = p_conversation_id
    AND conversation.user_id = current_owner_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF current_revision IS DISTINCT FROM p_expected_revision THEN
    RETURN 'revision_conflict';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO existing_message_count
  FROM (
    SELECT 1
    FROM public.messages AS message
    WHERE message.conversation_id = p_conversation_id
    LIMIT 201
  ) AS bounded_messages;

  IF existing_message_count > 198 THEN
    RETURN 'message_quota';
  END IF;

  RETURN 'ready';
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_chatbot_turn_and_complete_request(
  p_conversation_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_turn_request_fingerprint text,
  p_user_content text,
  p_assistant_content text,
  p_chart_config jsonb,
  p_follow_up_questions text[],
  p_data_used jsonb,
  p_admission_request_fingerprint text,
  p_lease_token uuid
)
RETURNS TABLE (
  disposition text,
  conversation_id uuid,
  revision bigint,
  title text,
  updated_at timestamptz,
  user_message_id uuid,
  assistant_message_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '8s'
AS $function$
DECLARE
  current_owner_id uuid := auth.uid();
  turn_result record;
  changed integer;
BEGIN
  IF current_owner_id IS NULL
    OR coalesce(p_admission_request_fingerprint, '') !~ '^[0-9a-f]{64}$'
    OR p_lease_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Invalid chatbot turn completion fence';
  END IF;

  -- Match acquire's global lock order so an expired lease cannot be reclaimed
  -- between the turn commit and the completed pointer write.
  PERFORM pg_catalog.pg_advisory_xact_lock(8675309001300::bigint);

  PERFORM 1
  FROM public.chatbot_request_admissions AS request
  WHERE request.owner_id = current_owner_id
    AND request.idempotency_key = p_idempotency_key
    AND request.request_fingerprint = p_admission_request_fingerprint
    AND request.status = 'active'
    AND request.lease_token = p_lease_token
    AND request.lease_expires_at > pg_catalog.clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Chatbot request completion fence was lost';
  END IF;

  SELECT turn.*
  INTO turn_result
  FROM public.commit_chatbot_conversation_turn(
    p_conversation_id,
    p_expected_revision,
    p_idempotency_key,
    p_turn_request_fingerprint,
    p_user_content,
    p_assistant_content,
    p_chart_config,
    p_follow_up_questions,
    p_data_used
  ) AS turn;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Chatbot turn commit returned no result';
  END IF;

  IF turn_result.disposition NOT IN ('applied', 'replayed') THEN
    UPDATE public.chatbot_request_admissions AS request
    SET
      status = 'failed',
      lease_token = NULL,
      lease_expires_at = NULL,
      settled_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp(),
      result_conversation_id = NULL,
      result_revision = NULL
    WHERE request.owner_id = current_owner_id
      AND request.idempotency_key = p_idempotency_key
      AND request.request_fingerprint = p_admission_request_fingerprint
      AND request.status = 'active'
      AND request.lease_token = p_lease_token;
    GET DIAGNOSTICS changed = ROW_COUNT;

    IF changed <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '40001',
        MESSAGE = 'Chatbot request failure fence was lost';
    END IF;

    RETURN QUERY SELECT
      turn_result.disposition::text,
      turn_result.conversation_id::uuid,
      turn_result.revision::bigint,
      turn_result.title::text,
      turn_result.updated_at::timestamptz,
      turn_result.user_message_id::uuid,
      turn_result.assistant_message_id::uuid;
    RETURN;
  END IF;

  IF turn_result.conversation_id IS NULL OR turn_result.revision IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'Chatbot turn commit returned an invalid success receipt';
  END IF;

  UPDATE public.chatbot_request_admissions AS request
  SET
    status = 'completed',
    lease_token = NULL,
    lease_expires_at = NULL,
    settled_at = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.clock_timestamp(),
    result_conversation_id = turn_result.conversation_id,
    result_revision = turn_result.revision
  WHERE request.owner_id = current_owner_id
    AND request.idempotency_key = p_idempotency_key
    AND request.request_fingerprint = p_admission_request_fingerprint
    AND request.status = 'active'
    AND request.lease_token = p_lease_token;
  GET DIAGNOSTICS changed = ROW_COUNT;

  IF changed <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'Chatbot request completion fence was lost';
  END IF;

  RETURN QUERY SELECT
    turn_result.disposition::text,
    turn_result.conversation_id::uuid,
    turn_result.revision::bigint,
    turn_result.title::text,
    turn_result.updated_at::timestamptz,
    turn_result.user_message_id::uuid,
    turn_result.assistant_message_id::uuid;
END;
$function$;

ALTER FUNCTION public.acquire_chatbot_request_admission(uuid, text, text)
  OWNER TO postgres;
ALTER FUNCTION public.fail_chatbot_request_admission(uuid, text, text, uuid)
  OWNER TO postgres;
ALTER FUNCTION public.resolve_chatbot_request_admission(uuid, text, text)
  OWNER TO postgres;
ALTER FUNCTION public.resolve_owned_chatbot_request_admission(text, text)
  OWNER TO postgres;
ALTER FUNCTION public.preflight_chatbot_conversation_turn(uuid, bigint)
  OWNER TO postgres;
ALTER FUNCTION public.commit_chatbot_turn_and_complete_request(
  uuid, bigint, text, text, text, text, jsonb, text[], jsonb, text, uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.acquire_chatbot_request_admission(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fail_chatbot_request_admission(
  uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_chatbot_request_admission(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_owned_chatbot_request_admission(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.preflight_chatbot_conversation_turn(uuid, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commit_chatbot_turn_and_complete_request(
  uuid, bigint, text, text, text, text, jsonb, text[], jsonb, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acquire_chatbot_request_admission(
  uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_chatbot_request_admission(
  uuid, text, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_chatbot_request_admission(
  uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_owned_chatbot_request_admission(
  text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preflight_chatbot_conversation_turn(uuid, bigint)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_chatbot_turn_and_complete_request(
  uuid, bigint, text, text, text, text, jsonb, text[], jsonb, text, uuid
) TO authenticated;

-- The raw turn primitive is now internal to the lease-fenced combo. Keeping it
-- callable from the Data API would let a browser bypass durable admission.
REVOKE EXECUTE ON FUNCTION public.commit_chatbot_conversation_turn(
  uuid, bigint, text, text, text, text, jsonb, text[], jsonb
) FROM authenticated, service_role;

COMMENT ON TABLE public.chatbot_request_admissions IS
  'Service-only cross-isolate identities retained for the timestamped-key 30-day retry window, with fixed 180-second fenced leases that outlive the 120-second function ceiling and a 90000-row per-owner fail-closed fuse.';
COMMENT ON TABLE public.chatbot_request_rate_events IS
  'Service-only rolling admission ledger capped at 20 acquired or reclaimed physical chatbot leases per owner per ten minutes; exact polls and settled replays are free.';
COMMENT ON FUNCTION public.acquire_chatbot_request_admission(uuid, text, text)
  IS 'Serially resolves same-key replay, one-active-owner, four-global, rolling-rate admission, and a six-physical-attempt same-key fuse before paid chatbot work.';
COMMENT ON FUNCTION public.resolve_chatbot_request_admission(uuid, text, text)
  IS 'Read-only exact-identity resolution after an ambiguous atomic completion response; it never acquires or reclaims a lease.';
COMMENT ON FUNCTION public.resolve_owned_chatbot_request_admission(text, text)
  IS 'Auth.uid-derived read-only resolution for a browser content-free recovery marker; it never acquires or reclaims a lease.';
COMMENT ON FUNCTION public.preflight_chatbot_conversation_turn(uuid, bigint)
  IS 'Auth-bound advisory preflight for deterministic ownership, revision, message, conversation, and command-receipt quota failures before paid chatbot work.';
COMMENT ON FUNCTION public.commit_chatbot_turn_and_complete_request(
  uuid, bigint, text, text, text, text, jsonb, text[], jsonb, text, uuid
) IS 'Atomically commits one bounded owner turn and records a content-free completed admission pointer under the active lease fence.';

NOTIFY pgrst, 'reload schema';

COMMIT;
