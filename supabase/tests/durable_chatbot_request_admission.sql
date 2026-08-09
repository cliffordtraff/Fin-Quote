BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

CREATE FUNCTION pg_temp.chatbot_key(label text, issued_offset interval DEFAULT interval '0')
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $function$
DECLARE
  digest text := md5(label);
  issued_milliseconds bigint := pg_catalog.floor(
    pg_catalog.date_part(
      'epoch',
      pg_catalog.transaction_timestamp() + issued_offset
    ) * 1000
  )::bigint;
BEGIN
  RETURN pg_catalog.format(
    'c1.%s.%s-%s-4%s-a%s-%s',
    issued_milliseconds,
    pg_catalog.substring(digest, 1, 8),
    pg_catalog.substring(digest, 9, 4),
    pg_catalog.substring(digest, 13, 3),
    pg_catalog.substring(digest, 16, 3),
    pg_catalog.substring(digest, 19, 12)
  );
END;
$function$;

SELECT ok(
  to_regclass('public.chatbot_request_admissions') IS NOT NULL
    AND to_regclass('public.chatbot_request_rate_events') IS NOT NULL
    AND (
      SELECT relation.relrowsecurity
      FROM pg_class AS relation
      WHERE relation.oid = 'public.chatbot_request_admissions'::regclass
    )
    AND (
      SELECT relation.relrowsecurity
      FROM pg_class AS relation
      WHERE relation.oid = 'public.chatbot_request_rate_events'::regclass
    ),
  'durable chatbot admission tables exist behind row-level security'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
    CROSS JOIN unnest(
      ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
    ) AS privilege_name
    CROSS JOIN unnest(
      ARRAY[
        'public.chatbot_request_admissions',
        'public.chatbot_request_rate_events'
      ]
    ) AS table_name
    WHERE has_table_privilege(role_name, table_name, privilege_name)
  )
    AND has_table_privilege(
      'service_role',
      'public.chatbot_request_admissions',
      'SELECT'
    )
    AND NOT has_table_privilege(
      'service_role',
      'public.chatbot_request_admissions',
      'INSERT,UPDATE,DELETE,TRUNCATE'
    ),
  'admission state is unreadable by browsers and writable only inside fenced RPCs'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.acquire_chatbot_request_admission(uuid,text,text)',
    'EXECUTE'
  )
    AND has_function_privilege(
      'service_role',
      'public.acquire_chatbot_request_admission(uuid,text,text)',
      'EXECUTE'
    )
    AND to_regprocedure(
      'public.complete_chatbot_request_admission(uuid,text,text,uuid)'
    ) IS NULL
    AND NOT has_function_privilege(
      'authenticated',
      'public.fail_chatbot_request_admission(uuid,text,text,uuid)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.fail_chatbot_request_admission(uuid,text,text,uuid)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.resolve_chatbot_request_admission(uuid,text,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.resolve_chatbot_request_admission(uuid,text,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'authenticated',
      'public.resolve_owned_chatbot_request_admission(text,text)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'service_role',
      'public.resolve_owned_chatbot_request_admission(text,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'authenticated',
      'public.preflight_chatbot_conversation_turn(uuid,bigint)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'service_role',
      'public.preflight_chatbot_conversation_turn(uuid,bigint)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'authenticated',
      'public.commit_chatbot_turn_and_complete_request(uuid,bigint,text,text,text,text,jsonb,text[],jsonb,text,uuid)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'service_role',
      'public.commit_chatbot_turn_and_complete_request(uuid,bigint,text,text,text,text,jsonb,text[],jsonb,text,uuid)',
      'EXECUTE'
    ),
  'service role controls admission failure while only the auth-bound combo can complete'
);

SELECT ok(
  (
    SELECT pg_catalog.bool_and(
      procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=""']::text[]
      AND procedure.proconfig @> ARRAY[
        CASE
          WHEN procedure.proname IN (
            'preflight_chatbot_conversation_turn',
            'resolve_owned_chatbot_request_admission'
          )
            THEN 'statement_timeout=5s'
          ELSE 'statement_timeout=8s'
        END
      ]::text[]
    )
    FROM pg_proc AS procedure
    WHERE procedure.oid IN (
      'public.acquire_chatbot_request_admission(uuid,text,text)'::regprocedure,
      'public.resolve_chatbot_request_admission(uuid,text,text)'::regprocedure,
      'public.resolve_owned_chatbot_request_admission(text,text)'::regprocedure,
      'public.fail_chatbot_request_admission(uuid,text,text,uuid)'::regprocedure,
      'public.preflight_chatbot_conversation_turn(uuid,bigint)'::regprocedure,
      'public.commit_chatbot_turn_and_complete_request(uuid,bigint,text,text,text,text,jsonb,text[],jsonb,text,uuid)'::regprocedure
    )
  ),
  'all admission RPCs are short security definers with empty search paths'
);

SELECT ok(
  pg_catalog.pg_get_functiondef(
    'public.preflight_chatbot_conversation_turn(uuid,bigint)'::regprocedure
  ) LIKE '%LIMIT 180001%'
    AND pg_catalog.pg_get_functiondef(
      'public.preflight_chatbot_conversation_turn(uuid,bigint)'::regprocedure
    ) LIKE '%retained_receipt_count >= 180000%',
  'preflight enforces the same policy-derived finite receipt capacity as commit'
);

INSERT INTO auth.users (id)
SELECT ('d1' || lpad(number::text, 6, '0') || '-0000-4000-8000-000000000000')::uuid
FROM generate_series(1, 12) AS number;

CREATE TEMP TABLE first_acquire AS
SELECT *
FROM public.acquire_chatbot_request_admission(
  'd1000001-0000-4000-8000-000000000000',
  pg_temp.chatbot_key('first-admission'),
  repeat('a', 64)
);
GRANT SELECT ON first_acquire TO authenticated;

SELECT ok(
  (SELECT disposition = 'acquired' AND lease_token IS NOT NULL FROM first_acquire)
    AND EXISTS (
      SELECT 1
      FROM public.chatbot_request_admissions AS request
      WHERE request.owner_id = 'd1000001-0000-4000-8000-000000000000'
        AND request.idempotency_key = pg_temp.chatbot_key('first-admission')
        AND request.lease_expires_at = request.updated_at + interval '180 seconds'
    ),
  'the authority issues a fixed lease beyond the function physical ceiling'
);

SELECT is(
  (
    SELECT disposition
    FROM public.acquire_chatbot_request_admission(
      'd1000001-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('first-admission'),
      repeat('a', 64)
    )
  ),
  'in_progress',
  'the same active key cannot run in another isolate'
);

SELECT is(
  (
    SELECT disposition
    FROM public.resolve_chatbot_request_admission(
      'd1000001-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('first-admission'),
      repeat('a', 64)
    )
  ),
  'in_progress',
  'read-only resolution observes an active exact identity without reacquiring it'
);

SELECT is(
  (
    SELECT disposition
    FROM public.acquire_chatbot_request_admission(
      'd1000001-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('first-admission'),
      repeat('b', 64)
    )
  ),
  'key_conflict',
  'a reused key with a different fingerprint conflicts before accounting'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'd1000001-0000-4000-8000-000000000000',
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $statement$SELECT * FROM public.commit_chatbot_turn_and_complete_request(
    NULL, 0, pg_temp.chatbot_key('first-admission'), repeat('1', 64),
    'Question', 'Answer', NULL, NULL, NULL, repeat('a', 64),
    'd2000000-0000-4000-8000-000000000099'
  )$statement$,
  '40001',
  'Chatbot request completion fence was lost',
  'a fabricated combo token cannot write a turn or completion pointer'
);

CREATE TEMP TABLE first_completion AS
SELECT *
FROM public.commit_chatbot_turn_and_complete_request(
  NULL,
  0,
  pg_temp.chatbot_key('first-admission'),
  repeat('1', 64),
  'Question',
  'Answer',
  NULL,
  NULL,
  NULL,
  repeat('a', 64),
  (SELECT lease_token FROM first_acquire)
);

RESET ROLE;

SELECT ok(
  (SELECT disposition = 'applied' FROM first_completion)
    AND EXISTS (
      SELECT 1
      FROM public.chatbot_request_admissions AS request
      WHERE request.owner_id = 'd1000001-0000-4000-8000-000000000000'
        AND request.idempotency_key = pg_temp.chatbot_key('first-admission')
        AND request.status = 'completed'
        AND request.result_conversation_id = (
          SELECT conversation_id FROM first_completion
        )
        AND request.result_revision = (SELECT revision FROM first_completion)
    ),
  'one transaction commits the turn and its content-free completed pointer'
);

SELECT ok(
  (
    SELECT disposition = 'completed'
      AND result_conversation_id = (SELECT conversation_id FROM first_completion)
      AND result_revision = (SELECT revision FROM first_completion)
    FROM public.acquire_chatbot_request_admission(
      'd1000001-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('first-admission'),
      repeat('a', 64)
    )
  )
    AND (
      SELECT count(*) = 1
      FROM public.chatbot_request_rate_events
      WHERE owner_id = 'd1000001-0000-4000-8000-000000000000'
    ),
  'a completed exact key never consumes a second rate event'
);

SELECT ok(
  (
    SELECT disposition = 'completed'
      AND result_conversation_id = (SELECT conversation_id FROM first_completion)
      AND result_revision = (SELECT revision FROM first_completion)
    FROM public.resolve_chatbot_request_admission(
      'd1000001-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('first-admission'),
      repeat('a', 64)
    )
  ),
  'ambiguity resolution recovers the exact content-free completed pointer'
);

SET LOCAL ROLE authenticated;
SELECT ok(
  (
    SELECT disposition = 'completed'
      AND result_conversation_id = (SELECT conversation_id FROM first_completion)
      AND result_revision = (SELECT revision FROM first_completion)
    FROM public.resolve_owned_chatbot_request_admission(
      pg_temp.chatbot_key('first-admission'),
      repeat('a', 64)
    )
  ),
  'the authenticated owner can resolve a content-free completed pointer'
);
RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  'd1000002-0000-4000-8000-000000000000',
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT disposition
    FROM public.resolve_owned_chatbot_request_admission(
      pg_temp.chatbot_key('first-admission'),
      repeat('a', 64)
    )
  ),
  'missing',
  'the owner resolver cannot reveal another account request identity'
);
RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'd1000001-0000-4000-8000-000000000000',
  true
);

CREATE TEMP TABLE stale_acquire AS
SELECT * FROM public.acquire_chatbot_request_admission(
  'd1000001-0000-4000-8000-000000000000',
  pg_temp.chatbot_key('stale-combo'),
  repeat('4', 64)
);
GRANT SELECT ON stale_acquire TO authenticated;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE stale_combo AS
SELECT * FROM public.commit_chatbot_turn_and_complete_request(
  (SELECT conversation_id FROM first_completion), 0,
  pg_temp.chatbot_key('stale-combo'), repeat('4', 64),
  'Stale question', 'Stale answer', NULL, NULL, NULL, repeat('4', 64),
  (SELECT lease_token FROM stale_acquire)
);
RESET ROLE;

SELECT ok(
  (SELECT disposition = 'revision_conflict' FROM stale_combo)
    AND (
      SELECT status = 'failed'
      FROM public.chatbot_request_admissions
      WHERE owner_id = 'd1000001-0000-4000-8000-000000000000'
        AND idempotency_key = pg_temp.chatbot_key('stale-combo')
    )
    AND (
      SELECT count(*) = 2
      FROM public.messages
      WHERE conversation_id = (SELECT conversation_id FROM first_completion)
    ),
  'stale combo CAS fails atomically without a half-turn'
);

INSERT INTO public.conversations (id, user_id, title, revision)
VALUES (
  'd2000000-0000-4000-8000-000000000020',
  'd1000002-0000-4000-8000-000000000000',
  'Other owner',
  0
);
CREATE TEMP TABLE foreign_acquire AS
SELECT * FROM public.acquire_chatbot_request_admission(
  'd1000001-0000-4000-8000-000000000000',
  pg_temp.chatbot_key('foreign-combo'),
  repeat('5', 64)
);
GRANT SELECT ON foreign_acquire TO authenticated;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE foreign_combo AS
SELECT * FROM public.commit_chatbot_turn_and_complete_request(
  'd2000000-0000-4000-8000-000000000020', 0,
  pg_temp.chatbot_key('foreign-combo'), repeat('5', 64),
  'Private target', 'No write', NULL, NULL, NULL, repeat('5', 64),
  (SELECT lease_token FROM foreign_acquire)
);
RESET ROLE;

CREATE TEMP TABLE absent_acquire AS
SELECT * FROM public.acquire_chatbot_request_admission(
  'd1000001-0000-4000-8000-000000000000',
  pg_temp.chatbot_key('absent-combo'),
  repeat('6', 64)
);
GRANT SELECT ON absent_acquire TO authenticated;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE absent_combo AS
SELECT * FROM public.commit_chatbot_turn_and_complete_request(
  'd2000000-0000-4000-8000-000000000021', 0,
  pg_temp.chatbot_key('absent-combo'), repeat('6', 64),
  'Missing target', 'No write', NULL, NULL, NULL, repeat('6', 64),
  (SELECT lease_token FROM absent_acquire)
);
RESET ROLE;

SELECT ok(
  (SELECT disposition = 'gone' FROM foreign_combo)
    AND (SELECT disposition = 'gone' FROM absent_combo)
    AND NOT EXISTS (
      SELECT 1 FROM public.messages
      WHERE conversation_id IN (
        'd2000000-0000-4000-8000-000000000020',
        'd2000000-0000-4000-8000-000000000021'
      )
    )
    AND (
      SELECT pg_catalog.bool_and(status = 'failed')
      FROM public.chatbot_request_admissions
      WHERE owner_id = 'd1000001-0000-4000-8000-000000000000'
        AND idempotency_key IN (
          pg_temp.chatbot_key('foreign-combo'),
          pg_temp.chatbot_key('absent-combo')
        )
    ),
  'foreign and absent targets share one gone shape and atomically fail'
);

INSERT INTO public.conversations (id, user_id, title, revision)
VALUES (
  'd2000000-0000-4000-8000-000000000030',
  'd1000001-0000-4000-8000-000000000000',
  'Full conversation',
  0
);
INSERT INTO public.messages (conversation_id, role, content)
SELECT
  'd2000000-0000-4000-8000-000000000030',
  CASE WHEN number % 2 = 0 THEN 'assistant' ELSE 'user' END,
  'quota fixture'
FROM generate_series(1, 199) AS number;
CREATE TEMP TABLE quota_acquire AS
SELECT * FROM public.acquire_chatbot_request_admission(
  'd1000001-0000-4000-8000-000000000000',
  pg_temp.chatbot_key('quota-combo'),
  repeat('7', 64)
);
GRANT SELECT ON quota_acquire TO authenticated;
SET LOCAL ROLE authenticated;
SELECT is(
  public.preflight_chatbot_conversation_turn(
    'd2000000-0000-4000-8000-000000000030', 0
  ),
  'message_quota',
  'auth-bound preflight rejects a deterministic full target before spend'
);
CREATE TEMP TABLE quota_combo AS
SELECT * FROM public.commit_chatbot_turn_and_complete_request(
  'd2000000-0000-4000-8000-000000000030', 0,
  pg_temp.chatbot_key('quota-combo'), repeat('7', 64),
  'Quota question', 'Quota answer', NULL, NULL, NULL, repeat('7', 64),
  (SELECT lease_token FROM quota_acquire)
);
RESET ROLE;

SELECT ok(
  (SELECT disposition = 'message_quota' FROM quota_combo)
    AND (
      SELECT status = 'failed'
      FROM public.chatbot_request_admissions
      WHERE owner_id = 'd1000001-0000-4000-8000-000000000000'
        AND idempotency_key = pg_temp.chatbot_key('quota-combo')
    )
    AND (
      SELECT count(*) = 199 FROM public.messages
      WHERE conversation_id = 'd2000000-0000-4000-8000-000000000030'
    ),
  'quota combo marks the admission failed without inserting either message'
);

CREATE TEMP TABLE failed_acquire AS
SELECT *
FROM public.acquire_chatbot_request_admission(
  'd1000002-0000-4000-8000-000000000000',
  pg_temp.chatbot_key('failed-admission'),
  repeat('c', 64)
);

SELECT is(
  public.fail_chatbot_request_admission(
    'd1000002-0000-4000-8000-000000000000',
    pg_temp.chatbot_key('failed-admission'),
    repeat('c', 64),
    (SELECT lease_token FROM failed_acquire)
  ),
  'failed',
  'physical failure settles the matching fenced lease'
);

SELECT ok(
  (
    SELECT disposition = 'failed'
    FROM public.acquire_chatbot_request_admission(
      'd1000002-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('failed-admission'),
      repeat('c', 64)
    )
  )
    AND (
      SELECT count(*) = 1
      FROM public.chatbot_request_rate_events
      WHERE owner_id = 'd1000002-0000-4000-8000-000000000000'
    ),
  'a failed exact key is also permanently non-spending inside its retry window'
);

SELECT is(
  (
    SELECT disposition
    FROM public.resolve_chatbot_request_admission(
      'd1000002-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('failed-admission'),
      repeat('c', 64)
    )
  ),
  'failed',
  'ambiguity resolution reports a definitively failed exact identity'
);

-- Even if row timestamps look cleanup-eligible, exact resolution occurs first.
UPDATE public.chatbot_request_admissions
SET settled_at = pg_catalog.clock_timestamp() - interval '31 days',
    updated_at = pg_catalog.clock_timestamp() - interval '31 days'
WHERE owner_id = 'd1000001-0000-4000-8000-000000000000'
  AND idempotency_key = pg_temp.chatbot_key('first-admission');

SELECT ok(
  (
    SELECT disposition = 'completed'
    FROM public.acquire_chatbot_request_admission(
      'd1000001-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('first-admission'),
      repeat('a', 64)
    )
  )
    AND EXISTS (
      SELECT 1
      FROM public.chatbot_request_admissions
      WHERE owner_id = 'd1000001-0000-4000-8000-000000000000'
        AND idempotency_key = pg_temp.chatbot_key('first-admission')
    ),
  'a still-current exact completion is resolved before bounded cleanup'
);

CREATE TEMP TABLE rejected_key_rate_baseline AS
SELECT count(*)::bigint AS event_count
FROM public.chatbot_request_rate_events
WHERE owner_id = 'd1000001-0000-4000-8000-000000000000';

SELECT throws_ok(
  format(
    $statement$SELECT * FROM public.acquire_chatbot_request_admission(
      'd1000001-0000-4000-8000-000000000000', %L, '%s'
    )$statement$,
    pg_temp.chatbot_key(
      'near-expiry-admission',
      interval '-30 days' + interval '45 seconds'
    ),
    repeat('e', 64)
  ),
  '22023',
  'Chatbot request key expires before the admission lease',
  'a new key must remain valid through the full fixed lease before spend'
);

SELECT throws_ok(
  format(
    $statement$SELECT * FROM public.acquire_chatbot_request_admission(
      'd1000001-0000-4000-8000-000000000000', %L, '%s'
    )$statement$,
    pg_temp.chatbot_key('expired-admission', interval '-31 days'),
    repeat('d', 64)
  ),
  '22023',
  'Chatbot request key is outside the 30-day retry window',
  'an evicted key is intrinsically inadmissible and can never spend again'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.chatbot_request_rate_events
    WHERE owner_id = 'd1000001-0000-4000-8000-000000000000'
  ),
  (SELECT event_count FROM rejected_key_rate_baseline),
  'rejecting an expired key cannot append a rate event'
);

-- One owner cannot run two distinct physical requests.
CREATE TEMP TABLE owner_active AS
SELECT *
FROM public.acquire_chatbot_request_admission(
  'd1000003-0000-4000-8000-000000000000',
  pg_temp.chatbot_key('owner-active'),
  repeat('e', 64)
);

SELECT is(
  (
    SELECT disposition
    FROM public.acquire_chatbot_request_admission(
      'd1000003-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('owner-second'),
      repeat('f', 64)
    )
  ),
  'owner_capacity',
  'one active lease per owner is authoritative across isolates'
);

SELECT is(
  public.fail_chatbot_request_admission(
    'd1000003-0000-4000-8000-000000000000',
    pg_temp.chatbot_key('owner-active'),
    repeat('e', 64),
    (SELECT lease_token FROM owner_active)
  ),
  'failed',
  'owner-capacity fixture releases its fenced lease'
);

-- Four owners fill global capacity; a fifth is rejected without a rate event.
CREATE TEMP TABLE global_active AS
SELECT owner_number, acquired.*
FROM generate_series(4, 7) AS owner_number
CROSS JOIN LATERAL public.acquire_chatbot_request_admission(
  ('d1' || lpad(owner_number::text, 6, '0') || '-0000-4000-8000-000000000000')::uuid,
  pg_temp.chatbot_key('global-' || owner_number),
  md5('global-' || owner_number) || md5('global-fp-' || owner_number)
) AS acquired;

SELECT is(
  (
    SELECT disposition
    FROM public.acquire_chatbot_request_admission(
      'd1000008-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('global-overflow'),
      repeat('1', 64)
    )
  ),
  'global_capacity',
  'the fifth concurrent physical request is rejected globally'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.chatbot_request_rate_events
    WHERE owner_id = 'd1000008-0000-4000-8000-000000000000'
  ),
  0::bigint,
  'capacity rejection does not charge the rolling rate ledger'
);

SELECT is(
  (
    SELECT count(*)
    FROM (
      SELECT public.fail_chatbot_request_admission(
        ('d1' || lpad(owner_number::text, 6, '0') || '-0000-4000-8000-000000000000')::uuid,
        pg_temp.chatbot_key('global-' || owner_number),
        md5('global-' || owner_number) || md5('global-fp-' || owner_number),
        lease_token
      ) AS disposition
      FROM global_active
    ) AS released
    WHERE released.disposition = 'failed'
  ),
  4::bigint,
  'all four global-capacity fixtures release their fences'
);

CREATE FUNCTION pg_temp.consume_chatbot_rate(owner_uuid uuid, claim_count integer)
RETURNS integer
LANGUAGE plpgsql
AS $function$
DECLARE
  claim_number integer;
  claim_disposition text;
  claim_token uuid;
  admitted_count integer := 0;
BEGIN
  FOR claim_number IN 1..claim_count LOOP
    SELECT acquired.disposition, acquired.lease_token
    INTO claim_disposition, claim_token
    FROM public.acquire_chatbot_request_admission(
      owner_uuid,
      pg_temp.chatbot_key('rate-' || owner_uuid || '-' || claim_number),
      md5('rate-' || claim_number) || md5('rate-fp-' || claim_number)
    ) AS acquired;

    IF claim_disposition <> 'acquired' THEN RETURN admitted_count; END IF;
    PERFORM public.fail_chatbot_request_admission(
      owner_uuid,
      pg_temp.chatbot_key('rate-' || owner_uuid || '-' || claim_number),
      md5('rate-' || claim_number) || md5('rate-fp-' || claim_number),
      claim_token
    );
    admitted_count := admitted_count + 1;
  END LOOP;
  RETURN admitted_count;
END;
$function$;

SELECT is(
  pg_temp.consume_chatbot_rate(
    'd1000008-0000-4000-8000-000000000000',
    21
  ),
  20,
  'only twenty new request identities are admitted per owner per ten minutes'
);

SELECT is(
  (
    SELECT disposition
    FROM public.acquire_chatbot_request_admission(
      'd1000008-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('rate-overflow'),
      repeat('2', 64)
    )
  ),
  'rate_limited',
  'the rolling ledger rejects a twenty-first new key'
);

-- Expired same-key recovery receives a new fence and consumes a physical-work
-- rate event, while exact polls remain free.
CREATE TEMP TABLE expiring_acquire AS
SELECT *
FROM public.acquire_chatbot_request_admission(
  'd1000009-0000-4000-8000-000000000000',
  pg_temp.chatbot_key('expiring-key'),
  repeat('3', 64)
);
GRANT SELECT ON expiring_acquire TO authenticated;

UPDATE public.chatbot_request_admissions
SET lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
WHERE owner_id = 'd1000009-0000-4000-8000-000000000000'
  AND idempotency_key = pg_temp.chatbot_key('expiring-key');

SELECT set_config(
  'request.jwt.claim.sub',
  'd1000009-0000-4000-8000-000000000000',
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    $statement$SELECT * FROM public.commit_chatbot_turn_and_complete_request(
      NULL, 0, %L, '%s', 'Expired fence', 'Must not write',
      NULL, NULL, NULL, '%s', %L::uuid
    )$statement$,
    pg_temp.chatbot_key('expiring-key'),
    repeat('3', 64),
    repeat('3', 64),
    (SELECT lease_token::text FROM expiring_acquire)
  ),
  '40001',
  'Chatbot request completion fence was lost',
  'an expired unreclaimed lease token cannot commit a durable turn'
);
RESET ROLE;

CREATE TEMP TABLE reacquired AS
SELECT *
FROM public.acquire_chatbot_request_admission(
  'd1000009-0000-4000-8000-000000000000',
  pg_temp.chatbot_key('expiring-key'),
  repeat('3', 64)
);
GRANT SELECT ON reacquired TO authenticated;

SELECT ok(
  (SELECT disposition = 'acquired' FROM reacquired)
    AND (SELECT lease_token FROM reacquired) <>
      (SELECT lease_token FROM expiring_acquire)
    AND (
      SELECT count(*) = 2
      FROM public.chatbot_request_rate_events
      WHERE owner_id = 'd1000009-0000-4000-8000-000000000000'
    ),
  'expired same-key recovery is refenced and charged as new physical work'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'd1000009-0000-4000-8000-000000000000',
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    $statement$SELECT * FROM public.commit_chatbot_turn_and_complete_request(
      NULL, 0, %L, '%s', 'Old fence', 'Must not write',
      NULL, NULL, NULL, '%s', %L::uuid
    )$statement$,
    pg_temp.chatbot_key('expiring-key'),
    repeat('3', 64),
    repeat('3', 64),
    (SELECT lease_token::text FROM expiring_acquire)
  ),
  '40001',
  'Chatbot request completion fence was lost',
  'an expired lease token cannot commit after the same key is refenced'
);
RESET ROLE;

SELECT ok(
  public.fail_chatbot_request_admission(
    'd1000009-0000-4000-8000-000000000000',
    pg_temp.chatbot_key('expiring-key'),
    repeat('3', 64),
    (SELECT lease_token FROM expiring_acquire)
  ) = 'fence_lost'
    AND public.fail_chatbot_request_admission(
      'd1000010-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('expiring-key'),
      repeat('3', 64),
      (SELECT lease_token FROM reacquired)
    ) = 'fence_lost'
    AND public.fail_chatbot_request_admission(
      'd1000009-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('expiring-key'),
      repeat('3', 64),
      (SELECT lease_token FROM reacquired)
    ) = 'failed',
  'old-token and cross-owner failure settlement both lose to the current fence'
);

-- A single timestamped identity can start at most six physical attempts. The
-- would-be seventh acquisition terminally fails the identity and clears the
-- sixth token so no stale worker can complete after exhaustion.
CREATE TEMP TABLE attempt_fuse_results (
  attempt_number integer NOT NULL,
  disposition text NOT NULL,
  lease_token uuid
);

INSERT INTO attempt_fuse_results
SELECT 1, acquired.disposition, acquired.lease_token
FROM public.acquire_chatbot_request_admission(
  'd1000011-0000-4000-8000-000000000000',
  pg_temp.chatbot_key('attempt-fuse'),
  repeat('8', 64)
) AS acquired;

DO $function$
DECLARE
  recovery_number integer;
BEGIN
  FOR recovery_number IN 2..7 LOOP
    UPDATE public.chatbot_request_admissions AS request
    SET lease_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
    WHERE request.owner_id = 'd1000011-0000-4000-8000-000000000000'
      AND request.idempotency_key = pg_temp.chatbot_key('attempt-fuse');

    INSERT INTO attempt_fuse_results
    SELECT recovery_number, acquired.disposition, acquired.lease_token
    FROM public.acquire_chatbot_request_admission(
      'd1000011-0000-4000-8000-000000000000',
      pg_temp.chatbot_key('attempt-fuse'),
      repeat('8', 64)
    ) AS acquired;
  END LOOP;
END;
$function$;
GRANT SELECT ON attempt_fuse_results TO authenticated;

SELECT ok(
  (
    SELECT count(*) = 6
    FROM attempt_fuse_results
    WHERE disposition = 'acquired'
      AND attempt_number BETWEEN 1 AND 6
      AND lease_token IS NOT NULL
  )
    AND (
      SELECT disposition = 'attempts_exhausted' AND lease_token IS NULL
      FROM attempt_fuse_results
      WHERE attempt_number = 7
    )
    AND (
      SELECT status = 'failed'
        AND lease_token IS NULL
        AND lease_expires_at IS NULL
        AND attempt_count = 6
      FROM public.chatbot_request_admissions AS request
      WHERE request.owner_id = 'd1000011-0000-4000-8000-000000000000'
        AND request.idempotency_key = pg_temp.chatbot_key('attempt-fuse')
    )
    AND (
      SELECT count(*) = 6
      FROM public.chatbot_request_rate_events AS event
      WHERE event.owner_id = 'd1000011-0000-4000-8000-000000000000'
    ),
  'six physical attempts are charged and the seventh terminally clears the fence'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'd1000011-0000-4000-8000-000000000000',
  true
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format(
    $statement$SELECT * FROM public.commit_chatbot_turn_and_complete_request(
      NULL, 0, %L, '%s', 'Exhausted fence', 'Must not write',
      NULL, NULL, NULL, '%s', %L::uuid
    )$statement$,
    pg_temp.chatbot_key('attempt-fuse'),
    repeat('8', 64),
    repeat('8', 64),
    (
      SELECT lease_token::text
      FROM attempt_fuse_results
      WHERE attempt_number = 6
    )
  ),
  '40001',
  'Chatbot request completion fence was lost',
  'the final stale token cannot commit after physical attempts are exhausted'
);
RESET ROLE;

DELETE FROM public.conversations
WHERE id = (SELECT conversation_id FROM first_completion);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = (SELECT conversation_id FROM first_completion)
  )
    AND EXISTS (
      SELECT 1
      FROM public.chatbot_request_admissions
      WHERE owner_id = 'd1000001-0000-4000-8000-000000000000'
        AND idempotency_key = pg_temp.chatbot_key('first-admission')
        AND status = 'completed'
        AND result_conversation_id = (SELECT conversation_id FROM first_completion)
    ),
  'conversation deletion erases content without invalidating the completed pointer'
);

SELECT * FROM finish();

ROLLBACK;
