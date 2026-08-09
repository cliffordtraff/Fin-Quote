BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

CREATE FUNCTION pg_temp.why_moved_item(
  market_day date,
  ticker text,
  move_direction text,
  price numeric,
  headline text,
  fetched_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'review_key', concat(market_day::text, ':cash:', move_direction, ':', ticker),
    'symbol', ticker,
    'market_date', market_day::text,
    'session', 'cash',
    'direction', move_direction,
    'candidate_snapshot', jsonb_build_object(
      'reviewKey', concat(market_day::text, ':cash:', move_direction, ':', ticker),
      'symbol', ticker,
      'name', ticker || ' Inc.',
      'price', price,
      'change', CASE WHEN move_direction = 'gainer' THEN 2 ELSE -2 END,
      'changesPercentage', CASE WHEN move_direction = 'gainer' THEN 8 ELSE -8 END,
      'direction', move_direction,
      'session', 'cash',
      'marketDate', market_day::text
    ),
    'catalyst_snapshot', jsonb_build_object(
      'symbol', ticker,
      'status', 'found',
      'displayText', headline,
      'headline', headline,
      'summary', 'Discovery-time evidence.',
      'bulletPoints', jsonb_build_array('Primary-source evidence.'),
      'sentiment', CASE WHEN move_direction = 'gainer' THEN 'positive' ELSE 'negative' END,
      'source', 'Company release',
      'sourceTimestamp', NULL,
      'isCatalyst', true,
      'sourceUrl', 'https://example.test/' || ticker,
      'fetchedAt', fetched_at,
      'errorMessage', NULL
    )
  );
$$;

CREATE FUNCTION pg_temp.why_moved_ingest_error(
  items jsonb,
  seen_at timestamptz,
  run_id text
)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.ingest_stock_why_moving_review_candidates(
    items,
    seen_at,
    run_id
  );
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$$;

CREATE FUNCTION pg_temp.why_moved_bulk_error(
  target_status text,
  items jsonb,
  reviewer_id uuid,
  idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.bulk_transition_stock_why_moving_reviews(
    target_status,
    items,
    reviewer_id,
    idempotency_key
  );
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$$;

CREATE FUNCTION pg_temp.why_moved_evidence_update_error(target_key text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.stock_why_moving_reviews
  SET catalyst_snapshot = jsonb_set(
    catalyst_snapshot,
    '{headline}',
    '"Rewritten headline"'::jsonb
  )
  WHERE review_key = target_key;
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$$;

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.ingest_stock_why_moving_review_candidates(jsonb,timestamptz,text)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.ingest_stock_why_moving_review_candidates(jsonb,timestamptz,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.ingest_stock_why_moving_review_candidates(jsonb,timestamptz,text)',
      'EXECUTE'
    ),
  'candidate snapshot ingestion is service-role-only'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.bulk_transition_stock_why_moving_reviews(text,jsonb,uuid,text)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.bulk_transition_stock_why_moving_reviews(text,jsonb,uuid,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.bulk_transition_stock_why_moving_reviews(text,jsonb,uuid,text)',
      'EXECUTE'
    ),
  'bounded bulk transitions are service-role-only'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.list_stock_why_moving_editorial_inbox(text[],text,text,date,date,date,integer,date,timestamptz,uuid,integer)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.list_stock_why_moving_editorial_inbox(text[],text,text,date,date,date,integer,date,timestamptz,uuid,integer)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.list_stock_why_moving_editorial_inbox(text[],text,text,date,date,date,integer,date,timestamptz,uuid,integer)',
      'EXECUTE'
    ),
  'editorial inbox reads are confined to the server-side admin boundary'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.get_stock_why_moving_editorial_inbox_facets(text[],text,text,date,date,date)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.get_stock_why_moving_editorial_inbox_facets(text[],text,text,date,date,date)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.get_stock_why_moving_editorial_inbox_facets(text[],text,text,date,date,date)',
      'EXECUTE'
    ),
  'editorial inbox facets are confined to the server-side admin boundary'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
    CROSS JOIN unnest(ARRAY[
      'public.stock_why_moving_review_bulk_operations',
      'public.stock_why_moving_review_bulk_receipts'
    ]) AS table_name
    WHERE has_table_privilege(role_name, table_name, 'SELECT')
       OR has_table_privilege(role_name, table_name, 'INSERT')
       OR has_table_privilege(role_name, table_name, 'UPDATE')
       OR has_table_privilege(role_name, table_name, 'DELETE')
  )
    AND has_table_privilege(
      'service_role',
      'public.stock_why_moving_review_bulk_operations',
      'SELECT,INSERT,UPDATE,DELETE'
    )
    AND has_table_privilege(
      'service_role',
      'public.stock_why_moving_review_bulk_receipts',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
  'bulk operation and receipt tables are service-only'
);

SELECT ok(
  position(
    'pg_advisory_xact_lock' IN pg_get_functiondef(
      'public.bulk_transition_stock_why_moving_reviews(text,jsonb,uuid,text)'::regprocedure
    )
  ) > 0,
  'retry receipts are serialized by an advisory transaction lock'
);

INSERT INTO auth.users (id)
VALUES ('e1000000-0000-4000-8000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.ingest_stock_why_moving_review_candidates(
      jsonb_build_array(
        pg_temp.why_moved_item(
          '2026-08-01'::date,
          'AAA',
          'gainer',
          25,
          'Original AAA catalyst',
          '2026-08-01T13:00:00Z'::timestamptz
        ),
        pg_temp.why_moved_item(
          '2026-08-02'::date,
          'BBB',
          'loser',
          30,
          'Original BBB catalyst',
          '2026-08-02T13:00:00Z'::timestamptz
        ),
        pg_temp.why_moved_item(
          '2026-08-03'::date,
          'CCC',
          'gainer',
          35,
          'Original CCC catalyst',
          '2026-08-03T13:00:00Z'::timestamptz
        ),
        pg_temp.why_moved_item(
          '2026-08-04'::date,
          'DDD',
          'gainer',
          40,
          'Original DDD catalyst',
          '2026-08-04T13:00:00Z'::timestamptz
        )
      ),
      '2026-08-04T13:05:00Z'::timestamptz,
      'automation-run-1'
    )
  ),
  4,
  'the automation call ingests a bounded snapshot set'
);

CREATE TEMP TABLE why_moved_original_aaa ON COMMIT DROP AS
SELECT id, updated_at, first_seen_at, candidate_snapshot, catalyst_snapshot
FROM public.stock_why_moving_reviews
WHERE review_key = '2026-08-01:cash:gainer:AAA';

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.ingest_stock_why_moving_review_candidates(
      jsonb_build_array(
        pg_temp.why_moved_item(
          '2026-08-01'::date,
          'AAA',
          'gainer',
          999,
          'Later unrelated AAA headline',
          '2026-08-05T13:00:00Z'::timestamptz
        )
      ),
      '2026-08-05T13:05:00Z'::timestamptz,
      'automation-run-2'
    )
  ),
  1,
  'rediscovery returns the existing queue item'
);

SELECT ok(
  (
    SELECT review.updated_at = original.updated_at
      AND review.first_seen_at = original.first_seen_at
      AND review.last_seen_at = '2026-08-05T13:05:00Z'::timestamptz
      AND review.candidate_snapshot = original.candidate_snapshot
      AND review.catalyst_snapshot = original.catalyst_snapshot
      AND review.candidate_snapshot ->> 'price' = '25'
      AND review.catalyst_snapshot ->> 'headline' = 'Original AAA catalyst'
    FROM public.stock_why_moving_reviews AS review
    CROSS JOIN why_moved_original_aaa AS original
    WHERE review.review_key = '2026-08-01:cash:gainer:AAA'
  ),
  'rediscovery advances last_seen without rewriting evidence or the review CAS'
);

SELECT ok(
  pg_temp.why_moved_evidence_update_error(
    '2026-08-01:cash:gainer:AAA'
  ) LIKE '%identity and discovery evidence are immutable%',
  'even a privileged direct write cannot rewrite discovery evidence'
);

SELECT ok(
  pg_temp.why_moved_ingest_error(
    jsonb_build_array(
      jsonb_set(
        pg_temp.why_moved_item(
          '2026-08-05'::date,
          'EEE',
          'gainer',
          45,
          'EEE catalyst',
          '2026-08-05T13:00:00Z'::timestamptz
        ),
        '{catalyst_snapshot,symbol}',
        '"ZZZ"'::jsonb
      )
    ),
    '2026-08-05T13:05:00Z'::timestamptz,
    'automation-run-mismatch'
  ) LIKE '%candidate snapshots are invalid%',
  'a candidate cannot be paired with a current symbol-only catalyst mismatch'
);

UPDATE public.stock_why_moving_reviews
SET
  status = 'needs_work',
  reviewer_id = 'e1000000-0000-4000-8000-000000000001'::uuid,
  reviewed_at = '2026-08-05T14:00:00Z'::timestamptz
WHERE review_key = '2026-08-02:cash:loser:BBB';

UPDATE public.stock_why_moving_reviews
SET
  status = 'dismissed',
  reviewer_id = 'e1000000-0000-4000-8000-000000000001'::uuid,
  reviewed_at = '2026-08-05T14:00:00Z'::timestamptz
WHERE review_key = '2026-08-03:cash:gainer:CCC';

UPDATE public.stock_why_moving_reviews
SET
  status = 'approved',
  reviewer_id = 'e1000000-0000-4000-8000-000000000001'::uuid,
  reviewed_at = '2026-08-05T14:00:00Z'::timestamptz
WHERE review_key = '2026-08-04:cash:gainer:DDD';

SELECT is(
  (
    SELECT array_agg(
      inbox.review_key
      ORDER BY inbox.sort_bucket, inbox.market_date, inbox.first_seen_at, inbox.id
    )
    FROM public.list_stock_why_moving_editorial_inbox(
      p_current_review_keys => ARRAY['2026-08-04:cash:gainer:DDD'],
      p_limit => 100
    ) AS inbox
  ),
  ARRAY[
    '2026-08-01:cash:gainer:AAA',
    '2026-08-02:cash:loser:BBB',
    '2026-08-04:cash:gainer:DDD'
  ]::text[],
  'the default inbox contains every unresolved day plus current resolved rows'
);

SELECT ok(
  (
    SELECT total_count = 3
      AND pending_count = 1
      AND needs_work_count = 1
      AND approved_count = 1
      AND dismissed_count = 0
    FROM public.get_stock_why_moving_editorial_inbox_facets(
      p_current_review_keys => ARRAY['2026-08-04:cash:gainer:DDD']
    )
  ),
  'default facets describe the operational inbox scope'
);

SELECT is(
  (
    SELECT array_agg(inbox.review_key ORDER BY inbox.review_key)
    FROM public.list_stock_why_moving_editorial_inbox(
      p_status => 'dismissed',
      p_date_from => '2026-08-01'::date,
      p_date_to => '2026-08-03'::date,
      p_limit => 100
    ) AS inbox
  ),
  ARRAY['2026-08-03:cash:gainer:CCC']::text[],
  'an explicit status and date range browse resolved history server-side'
);

SELECT ok(
  (
    SELECT total_count = 1
      AND pending_count = 1
      AND needs_work_count = 1
      AND approved_count = 0
      AND dismissed_count = 1
    FROM public.get_stock_why_moving_editorial_inbox_facets(
      p_status => 'dismissed',
      p_date_from => '2026-08-01'::date,
      p_date_to => '2026-08-03'::date
    )
  ),
  'status facets remain useful while total_count follows the selected status'
);

CREATE TEMP TABLE why_moved_bulk_request ON COMMIT DROP AS
SELECT jsonb_agg(
  jsonb_build_object('id', review.id, 'expected_updated_at', review.updated_at)
  ORDER BY review.id
) AS items
FROM public.stock_why_moving_reviews AS review
WHERE review.review_key IN (
  '2026-08-01:cash:gainer:AAA',
  '2026-08-02:cash:loser:BBB'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.bulk_transition_stock_why_moving_reviews(
      'dismissed',
      (SELECT items FROM why_moved_bulk_request),
      'e1000000-0000-4000-8000-000000000001'::uuid,
      'bulk_success_001'
    ) AS result
    WHERE result.changed
  ),
  2,
  'a valid bulk request changes every CAS-matched non-approved row'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stock_why_moving_review_bulk_receipts
    WHERE operation_key = 'bulk_success_001'
  ),
  2,
  'the successful operation records one durable receipt per review'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.bulk_transition_stock_why_moving_reviews(
      'dismissed',
      (SELECT items FROM why_moved_bulk_request),
      'e1000000-0000-4000-8000-000000000001'::uuid,
      'bulk_success_001'
    ) AS result
    WHERE NOT result.changed
  ),
  2,
  'an exact retry returns its receipts without reapplying stale CAS values'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stock_why_moving_review_bulk_receipts
    WHERE operation_key = 'bulk_success_001'
  ),
  2,
  'an exact retry does not duplicate receipts'
);

SELECT ok(
  pg_temp.why_moved_bulk_error(
    'needs_work',
    (SELECT items FROM why_moved_bulk_request),
    'e1000000-0000-4000-8000-000000000001'::uuid,
    'bulk_success_001'
  ) LIKE '%already used for a different request%',
  'an idempotency key cannot be reused for a different transition'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.ingest_stock_why_moving_review_candidates(
      jsonb_build_array(
        pg_temp.why_moved_item(
          '2026-08-06'::date,
          'EEE',
          'gainer',
          45,
          'EEE catalyst',
          '2026-08-06T13:00:00Z'::timestamptz
        ),
        pg_temp.why_moved_item(
          '2026-08-06'::date,
          'FFF',
          'loser',
          50,
          'FFF catalyst',
          '2026-08-06T13:00:00Z'::timestamptz
        )
      ),
      '2026-08-06T13:05:00Z'::timestamptz,
      'automation-run-3'
    )
  ),
  2,
  'additional pending rows are available for stale-set testing'
);

CREATE TEMP TABLE why_moved_stale_request ON COMMIT DROP AS
SELECT jsonb_agg(
  jsonb_build_object(
    'id', review.id,
    'expected_updated_at', CASE
      WHEN review.symbol = 'FFF' THEN '2020-01-01T00:00:00Z'::timestamptz
      ELSE review.updated_at
    END
  )
  ORDER BY review.id
) AS items
FROM public.stock_why_moving_reviews AS review
WHERE review.symbol IN ('EEE', 'FFF');

SELECT ok(
  pg_temp.why_moved_bulk_error(
    'needs_work',
    (SELECT items FROM why_moved_stale_request),
    'e1000000-0000-4000-8000-000000000001'::uuid,
    'bulk_stale_001'
  ) LIKE '%changed, are approved, or do not exist%',
  'one stale expected timestamp rejects the complete bulk set'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stock_why_moving_reviews
    WHERE symbol IN ('EEE', 'FFF') AND status = 'pending'
  ),
  2,
  'the stale-set failure leaves every row unchanged'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.stock_why_moving_review_bulk_operations
    WHERE idempotency_key = 'bulk_stale_001'
  ),
  0,
  'the stale-set failure leaves no partial operation receipt'
);

SELECT ok(
  pg_temp.why_moved_bulk_error(
    'dismissed',
    (
      SELECT jsonb_build_array(
        jsonb_build_object('id', review.id, 'expected_updated_at', review.updated_at)
      )
      FROM public.stock_why_moving_reviews AS review
      WHERE review.symbol = 'DDD'
    ),
    'e1000000-0000-4000-8000-000000000001'::uuid,
    'bulk_approved_001'
  ) LIKE '%changed, are approved, or do not exist%',
  'approved reviews cannot enter a bulk transition'
);

SELECT ok(
  pg_temp.why_moved_bulk_error(
    'approved',
    (
      SELECT jsonb_build_array(
        jsonb_build_object('id', review.id, 'expected_updated_at', review.updated_at)
      )
      FROM public.stock_why_moving_reviews AS review
      WHERE review.symbol = 'EEE'
    ),
    'e1000000-0000-4000-8000-000000000001'::uuid,
    'bulk_approval_001'
  ) LIKE '%bulk approval is not allowed%',
  'approval remains an individual editorial action'
);

SELECT ok(
  pg_temp.why_moved_bulk_error(
    'dismissed',
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', gen_random_uuid(),
          'expected_updated_at', '2026-08-01T00:00:00Z'
        )
      )
      FROM generate_series(1, 101)
    ),
    'e1000000-0000-4000-8000-000000000001'::uuid,
    'bulk_oversized_001'
  ) LIKE '%between 1 and 100 reviews%',
  'bulk transitions reject more than 100 reviews before mutation'
);

SELECT * FROM finish();

ROLLBACK;
