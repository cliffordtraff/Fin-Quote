BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

CREATE FUNCTION pg_temp.newsletter_chart_receipt(
  owner_id uuid,
  chart_id uuid,
  chart_symbol text DEFAULT 'AAPL'
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', chart_id::text,
    'ownerId', owner_id::text,
    'sessionId', 'stable-session',
    'title', 'Apple chart',
    'symbol', chart_symbol,
    'chartSpec', jsonb_build_object('mode', 'price', 'symbol', chart_symbol),
    'chartImageUrl', 'https://assets.example/chart.png',
    'thumbnailUrl', 'https://assets.example/chart.png',
    'chartExportUrl', 'https://charts.example/chart',
    'capturedAt', '2026-08-09T00:00:00.000Z',
    'rendererContract', 'test-v1',
    'sceneHash', repeat('a', 64),
    'imageSha256', repeat('b', 64),
    'createdAt', '2026-08-09T00:00:00.000Z',
    'updatedAt', '2026-08-09T00:00:00.000Z'
  );
$$;

CREATE FUNCTION pg_temp.consume_newsletter_chart_rate(
  owner_id uuid,
  claim_count integer
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  claim_number integer;
  claim_disposition text;
  claim_token uuid;
  claim_fingerprint text;
  admitted_count integer := 0;
BEGIN
  FOR claim_number IN 1..claim_count LOOP
    claim_fingerprint := md5(claim_number::text)
      || md5('rate-' || claim_number::text);
    SELECT acquired.disposition, acquired.lease_token
    INTO claim_disposition, claim_token
    FROM public.acquire_newsletter_chart_post(
      owner_id,
      'rate-limit-key-' || lpad(claim_number::text, 2, '0'),
      claim_fingerprint,
      90
    ) AS acquired;

    IF claim_disposition <> 'acquired' THEN
      RETURN admitted_count;
    END IF;

    PERFORM 1
    FROM public.fail_newsletter_chart_post(
      owner_id,
      'rate-limit-key-' || lpad(claim_number::text, 2, '0'),
      claim_fingerprint,
      claim_token
    );
    admitted_count := admitted_count + 1;
  END LOOP;
  RETURN admitted_count;
END;
$$;

SELECT ok(
  to_regclass('public.newsletter_chart_post_requests') IS NOT NULL
    AND to_regclass('public.newsletter_chart_post_rate_events') IS NOT NULL
    AND (
      SELECT relation.relrowsecurity
      FROM pg_class AS relation
      WHERE relation.oid = 'public.newsletter_chart_post_requests'::regclass
    )
    AND (
      SELECT relation.relrowsecurity
      FROM pg_class AS relation
      WHERE relation.oid = 'public.newsletter_chart_post_rate_events'::regclass
    ),
  'durable chart admission tables exist behind row-level security'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'newsletter_chart_library'
      AND column_name = 'post_request_key_hash'
  )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'newsletter_chart_library'
        AND column_name = 'post_request_fingerprint'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'newsletter_chart_library'
        AND indexname = 'idx_newsletter_chart_library_owner_post_request'
        AND indexdef LIKE 'CREATE UNIQUE INDEX%'
    ),
  'chart rows retain a unique hashed durable request identity'
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
        'public.newsletter_chart_post_requests',
        'public.newsletter_chart_post_rate_events'
      ]
    ) AS table_name
    WHERE has_table_privilege(role_name, table_name, privilege_name)
  )
    AND has_table_privilege(
      'service_role',
      'public.newsletter_chart_post_requests',
      'SELECT'
    )
    AND NOT has_table_privilege(
      'service_role',
      'public.newsletter_chart_post_requests',
      'INSERT,UPDATE,DELETE,TRUNCATE'
    ),
  'chart admission state cannot be read or mutated through user Data API roles'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.acquire_newsletter_chart_post(uuid,text,text,integer)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.acquire_newsletter_chart_post(uuid,text,text,integer)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.acquire_newsletter_chart_post(uuid,text,text,integer)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon',
      'public.complete_newsletter_chart_post(uuid,text,text,uuid,jsonb)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.fail_newsletter_chart_post(uuid,text,text,uuid)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.complete_newsletter_chart_post(uuid,text,text,uuid,jsonb)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.fail_newsletter_chart_post(uuid,text,text,uuid)',
      'EXECUTE'
    ),
  'only service role can execute the admission, completion, and release RPCs'
);

SELECT ok(
  (
    SELECT procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=""']::text[]
    FROM pg_proc AS procedure
    WHERE procedure.oid =
      'public.acquire_newsletter_chart_post(uuid,text,text,integer)'::regprocedure
  )
    AND position(
      'pg_advisory_xact_lock' IN pg_get_functiondef(
        'public.acquire_newsletter_chart_post(uuid,text,text,integer)'::regprocedure
      )
    ) > 0
    AND position(
      'now_at := pg_catalog.clock_timestamp();' IN substring(
        pg_get_functiondef(
          'public.acquire_newsletter_chart_post(uuid,text,text,integer)'::regprocedure
        ) FROM position(
          'PERFORM pg_catalog.pg_advisory_xact_lock' IN pg_get_functiondef(
            'public.acquire_newsletter_chart_post(uuid,text,text,integer)'::regprocedure
          )
        )
      )
    ) > 0,
  'the admission RPC serializes globally and timestamps only after its lock wait'
);

SELECT ok(
  (
    SELECT bool_and(
      procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=""']::text[]
      AND position(
        'now_at := pg_catalog.clock_timestamp();' IN substring(
          pg_get_functiondef(procedure.oid) FROM position(
            'PERFORM pg_catalog.pg_advisory_xact_lock' IN
              pg_get_functiondef(procedure.oid)
          )
        )
      ) > 0
    )
    FROM pg_proc AS procedure
    WHERE procedure.oid IN (
      'public.complete_newsletter_chart_post(uuid,text,text,uuid,jsonb)'::regprocedure,
      'public.fail_newsletter_chart_post(uuid,text,text,uuid)'::regprocedure
    )
  ),
  'completion and release refresh their fenced decision timestamp after lock wait'
);

INSERT INTO auth.users (id) VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000006'),
  ('10000000-0000-4000-8000-000000000007'),
  ('10000000-0000-4000-8000-000000000008'),
  ('10000000-0000-4000-8000-000000000009');

CREATE TEMP TABLE first_claim AS
SELECT *
FROM public.acquire_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000001',
  'owner-one-key-01',
  repeat('a', 64),
  60
);

SELECT ok(
  (SELECT disposition = 'acquired' FROM first_claim)
    AND (SELECT lease_token IS NOT NULL FROM first_claim)
    AND EXISTS (
      SELECT 1
      FROM public.newsletter_chart_post_requests
      WHERE owner_id = '10000000-0000-4000-8000-000000000001'
        AND idempotency_key = 'owner-one-key-01'
        AND lease_expires_at > clock_timestamp() + interval '170 seconds'
    ),
  'the database refuses a shortened lease and outlives the 120-second route invocation'
);

SELECT is(
  (
    SELECT disposition
    FROM public.acquire_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000001',
      'owner-one-key-01',
      repeat('a', 64),
      90
    )
  ),
  'in_progress',
  'another isolate cannot acquire the same active idempotency request'
);

SELECT is(
  (
    SELECT disposition
    FROM public.acquire_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000001',
      'owner-one-key-01',
      repeat('f', 64),
      90
    )
  ),
  'conflict',
  'a reused key with a different fingerprint deterministically conflicts'
);

SELECT is(
  (
    SELECT disposition
    FROM public.complete_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000001',
      'owner-one-key-01',
      repeat('a', 64),
      '20000000-0000-4000-8000-000000000099',
      pg_temp.newsletter_chart_receipt(
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001'
      )
    )
  ),
  'lost',
  'a fabricated lease token cannot publish a success receipt'
);

CREATE TEMP TABLE first_completion AS
SELECT *
FROM public.complete_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000001',
  'owner-one-key-01',
  repeat('a', 64),
  (SELECT lease_token FROM first_claim),
  pg_temp.newsletter_chart_receipt(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
  )
);

SELECT ok(
  (SELECT disposition = 'completed' FROM first_completion)
    AND (
      SELECT result_receipt ->> 'id' =
        '30000000-0000-4000-8000-000000000001'
      FROM first_completion
    ),
  'the current token persists the complete bounded result receipt'
);

SELECT ok(
  (
    SELECT disposition = 'replay'
      AND result_receipt ->> 'id' =
        '30000000-0000-4000-8000-000000000001'
    FROM public.acquire_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000001',
      'owner-one-key-01',
      repeat('a', 64),
      90
    )
  ),
  'a different isolate replays the exact persisted receipt without capacity cost'
);

CREATE TEMP TABLE long_symbol_claim AS
SELECT *
FROM public.acquire_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000001',
  'owner-one-long-symbol-key',
  repeat('e', 64),
  180
);

SELECT is(
  (
    SELECT disposition
    FROM public.complete_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000001',
      'owner-one-long-symbol-key',
      repeat('e', 64),
      (SELECT lease_token FROM long_symbol_claim),
      pg_temp.newsletter_chart_receipt(
        '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000008',
        'LONG.SYMBOL-CLASS1'
      )
    )
  ),
  'completed',
  'the durable receipt contract accepts the shared 24-character segmented symbol grammar'
);

CREATE TEMP TABLE owner_two_claims AS
SELECT claim_number, claim.*
FROM generate_series(1, 2) AS claim_number
CROSS JOIN LATERAL public.acquire_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000002',
  'owner-two-key-' || lpad(claim_number::text, 2, '0'),
  repeat('b', 63) || claim_number::text,
  90
) AS claim;

SELECT ok(
  (SELECT count(*) = 2 FROM owner_two_claims WHERE disposition = 'acquired')
    AND (
      SELECT disposition = 'owner_capacity'
      FROM public.acquire_newsletter_chart_post(
        '10000000-0000-4000-8000-000000000002',
        'owner-two-key-03',
        repeat('b', 63) || '3',
        90
      )
    ),
  'one owner is bounded to two concurrent physical saves without queueing'
);

CREATE TEMP TABLE owner_three_claims AS
SELECT claim_number, claim.*
FROM generate_series(1, 2) AS claim_number
CROSS JOIN LATERAL public.acquire_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000003',
  'owner-three-key-' || lpad(claim_number::text, 2, '0'),
  repeat('c', 63) || claim_number::text,
  90
) AS claim;

SELECT ok(
  (SELECT count(*) = 2 FROM owner_three_claims WHERE disposition = 'acquired')
    AND (
      SELECT disposition = 'global_capacity'
      FROM public.acquire_newsletter_chart_post(
        '10000000-0000-4000-8000-000000000004',
        'owner-four-key-01',
        repeat('d', 64),
        90
      )
    ),
  'the database enforces a four-job global physical ceiling across owners'
);

SELECT is(
  (
    SELECT disposition
    FROM public.fail_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000002',
      'owner-two-key-01',
      repeat('b', 63) || '1',
      '20000000-0000-4000-8000-000000000099'
    )
  ),
  'lost',
  'a stale or fabricated worker cannot release another worker lease'
);

SELECT is(
  (
    SELECT released.disposition
    FROM owner_two_claims
    CROSS JOIN LATERAL public.fail_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000002',
      'owner-two-key-' || lpad(owner_two_claims.claim_number::text, 2, '0'),
      repeat('b', 63) || owner_two_claims.claim_number::text,
      owner_two_claims.lease_token
    ) AS released
    WHERE owner_two_claims.claim_number = 1
  ),
  'released',
  'the current lease token safely releases a failed request'
);

-- Clear the remaining capacity claims through the fenced function.
SELECT public.fail_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000002',
  'owner-two-key-02',
  repeat('b', 63) || '2',
  (SELECT lease_token FROM owner_two_claims WHERE claim_number = 2)
);
SELECT public.fail_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000003',
  'owner-three-key-01',
  repeat('c', 63) || '1',
  (SELECT lease_token FROM owner_three_claims WHERE claim_number = 1)
);
SELECT public.fail_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000003',
  'owner-three-key-02',
  repeat('c', 63) || '2',
  (SELECT lease_token FROM owner_three_claims WHERE claim_number = 2)
);

SELECT ok(
  pg_temp.consume_newsletter_chart_rate(
    '10000000-0000-4000-8000-000000000005',
    12
  ) = 12
    AND (
      SELECT disposition = 'rate_limited'
      FROM public.acquire_newsletter_chart_post(
        '10000000-0000-4000-8000-000000000005',
        'rate-limit-key-13',
        md5('13') || md5('rate-13'),
        90
      )
    ),
  'twelve new keys in ten minutes are allowed and the thirteenth is rejected'
);

UPDATE public.newsletter_chart_post_rate_events
SET admitted_at = clock_timestamp() - interval '10 minutes 1 second'
WHERE owner_id = '10000000-0000-4000-8000-000000000005';

SELECT is(
  (
    SELECT disposition
    FROM public.acquire_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000005',
      'rate-limit-key-13',
      md5('13') || md5('rate-13'),
      90
    )
  ),
  'acquired',
  'the rolling rate window recovers automatically after ten minutes'
);

CREATE TEMP TABLE stale_claim AS
SELECT *
FROM public.acquire_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000006',
  'stale-lease-key',
  repeat('e', 64),
  90
);

UPDATE public.newsletter_chart_post_requests
SET lease_expires_at = clock_timestamp() - interval '1 second'
WHERE owner_id = '10000000-0000-4000-8000-000000000006'
  AND idempotency_key = 'stale-lease-key';

SELECT is(
  (
    SELECT disposition
    FROM public.complete_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000006',
      'stale-lease-key',
      repeat('e', 64),
      (SELECT lease_token FROM stale_claim),
      pg_temp.newsletter_chart_receipt(
        '10000000-0000-4000-8000-000000000006',
        '30000000-0000-4000-8000-000000000006'
      )
    )
  ),
  'lost',
  'an expired token cannot complete before another worker reclaims it'
);

SELECT is(
  (
    SELECT disposition
    FROM public.fail_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000006',
      'stale-lease-key',
      repeat('e', 64),
      (SELECT lease_token FROM stale_claim)
    )
  ),
  'lost',
  'an expired token cannot delete its durable identity before reclaim'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.newsletter_chart_post_requests
    WHERE owner_id = '10000000-0000-4000-8000-000000000006'
      AND idempotency_key = 'stale-lease-key'
  ),
  'rejecting an expired release leaves the recoverable request row intact'
);

CREATE TEMP TABLE recovered_claim AS
SELECT *
FROM public.acquire_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000006',
  'stale-lease-key',
  repeat('e', 64),
  90
);

SELECT ok(
  (SELECT disposition = 'acquired' FROM recovered_claim)
    AND (
      SELECT stale_claim.lease_token <> recovered_claim.lease_token
      FROM stale_claim, recovered_claim
    )
    AND (
      SELECT count(*) = 1
      FROM public.newsletter_chart_post_rate_events
      WHERE owner_id = '10000000-0000-4000-8000-000000000006'
    ),
  'an expired same-key lease gets a new fence token without a second new-save event'
);

SELECT is(
  (
    SELECT disposition
    FROM public.complete_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000006',
      'stale-lease-key',
      repeat('e', 64),
      (SELECT lease_token FROM stale_claim),
      pg_temp.newsletter_chart_receipt(
        '10000000-0000-4000-8000-000000000006',
        '30000000-0000-4000-8000-000000000006'
      )
    )
  ),
  'lost',
  'late success from the expired token cannot overwrite the recovered worker'
);

SELECT is(
  (
    SELECT disposition
    FROM public.complete_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000006',
      'stale-lease-key',
      repeat('e', 64),
      (SELECT lease_token FROM recovered_claim),
      pg_temp.newsletter_chart_receipt(
        '10000000-0000-4000-8000-000000000006',
        '30000000-0000-4000-8000-000000000006'
      )
    )
  ),
  'completed',
  'the recovered token can persist the success receipt'
);

CREATE TEMP TABLE maximum_lease_claim AS
SELECT *
FROM public.acquire_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000008',
  'maximum-lease-key',
  repeat('8', 64),
  999
);

SELECT is(
  (SELECT retry_after_seconds FROM maximum_lease_claim),
  180,
  'lease requests are capped at the shared 180-second physical fence'
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.complete_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000008',
      'maximum-lease-key',
      repeat('8', 64),
      (SELECT lease_token FROM maximum_lease_claim),
      pg_temp.newsletter_chart_receipt(
        '10000000-0000-4000-8000-000000000008',
        '30000000-0000-4000-8000-000000000008'
      ) - 'title'
    )
  $$,
  '22023',
  'Invalid newsletter chart post completion receipt',
  'completion rejects a receipt missing a required bounded field'
);

SELECT is(
  (
    SELECT disposition
    FROM public.fail_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000008',
      'maximum-lease-key',
      repeat('8', 64),
      (SELECT lease_token FROM maximum_lease_claim)
    )
  ),
  'released',
  'a rejected malformed receipt leaves the current lease releasable'
);

INSERT INTO public.newsletter_chart_post_requests (
  owner_id,
  idempotency_key,
  fingerprint,
  status,
  lease_token,
  lease_expires_at,
  result_receipt,
  created_at,
  updated_at,
  completed_at
) VALUES
  (
    '10000000-0000-4000-8000-000000000008',
    'retention-old-success',
    repeat('1', 64),
    'succeeded',
    NULL,
    NULL,
    pg_temp.newsletter_chart_receipt(
      '10000000-0000-4000-8000-000000000008',
      '30000000-0000-4000-8000-000000000081'
    ),
    clock_timestamp() - interval '25 hours',
    clock_timestamp() - interval '25 hours',
    clock_timestamp() - interval '25 hours'
  ),
  (
    '10000000-0000-4000-8000-000000000008',
    'retention-old-active',
    repeat('2', 64),
    'active',
    '20000000-0000-4000-8000-000000000082',
    clock_timestamp() - interval '25 hours',
    NULL,
    clock_timestamp() - interval '25 hours',
    clock_timestamp() - interval '25 hours',
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000008',
    'retention-recent-success',
    repeat('3', 64),
    'succeeded',
    NULL,
    NULL,
    pg_temp.newsletter_chart_receipt(
      '10000000-0000-4000-8000-000000000008',
      '30000000-0000-4000-8000-000000000083'
    ),
    clock_timestamp(),
    clock_timestamp(),
    clock_timestamp()
  );

INSERT INTO public.newsletter_chart_post_rate_events (owner_id, admitted_at)
VALUES (
  '10000000-0000-4000-8000-000000000008',
  clock_timestamp() - interval '11 minutes'
);

CREATE TEMP TABLE cleanup_trigger_claim AS
SELECT *
FROM public.acquire_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000009',
  'cleanup-trigger-key',
  repeat('9', 64),
  180
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.newsletter_chart_post_requests
    WHERE owner_id = '10000000-0000-4000-8000-000000000008'
      AND idempotency_key IN ('retention-old-success', 'retention-old-active')
  )
    AND EXISTS (
      SELECT 1
      FROM public.newsletter_chart_post_requests
      WHERE owner_id = '10000000-0000-4000-8000-000000000008'
        AND idempotency_key = 'retention-recent-success'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.newsletter_chart_post_rate_events
      WHERE owner_id = '10000000-0000-4000-8000-000000000008'
        AND admitted_at <= clock_timestamp() - interval '10 minutes'
    ),
  'bounded acquisition cleanup removes stale global state and retains recent replay'
);

SELECT public.fail_newsletter_chart_post(
  '10000000-0000-4000-8000-000000000009',
  'cleanup-trigger-key',
  repeat('9', 64),
  (SELECT lease_token FROM cleanup_trigger_claim)
);

SELECT is(
  (
    SELECT disposition
    FROM public.acquire_newsletter_chart_post(
      '10000000-0000-4000-8000-000000000007',
      'cascade-delete-key',
      repeat('f', 64),
      90
    )
  ),
  'acquired',
  'the account-deletion fixture owns durable request and rate state'
);

DELETE FROM auth.users
WHERE id = '10000000-0000-4000-8000-000000000007';

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.newsletter_chart_post_requests
    WHERE owner_id = '10000000-0000-4000-8000-000000000007'
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.newsletter_chart_post_rate_events
      WHERE owner_id = '10000000-0000-4000-8000-000000000007'
    ),
  'account deletion cascades every idempotency receipt, lease, and rate event'
);

SELECT * FROM finish();

ROLLBACK;
