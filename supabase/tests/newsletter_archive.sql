BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

CREATE FUNCTION pg_temp.newsletter_archive_error(
  owner_id uuid,
  archive_action text,
  archive_items jsonb,
  idempotency_key text
)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM 1
  FROM public.bulk_set_newsletter_draft_archive_state(
    owner_id,
    archive_action,
    archive_items,
    idempotency_key
  );
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLERRM;
END;
$$;

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.bulk_set_newsletter_draft_archive_state(uuid,text,jsonb,text)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.bulk_set_newsletter_draft_archive_state(uuid,text,jsonb,text)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.bulk_set_newsletter_draft_archive_state(uuid,text,jsonb,text)',
      'EXECUTE'
    ),
  'bulk archive execution is restricted to the service role'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated']) AS role_name
    CROSS JOIN unnest(ARRAY[
      'public.newsletter_drafts',
      'public.newsletter_chart_library',
      'public.newsletter_draft_events'
    ]) AS table_name
    CROSS JOIN unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) AS privilege_name
    WHERE has_table_privilege(role_name, table_name, privilege_name)
  )
    AND has_table_privilege(
      'service_role',
      'public.newsletter_drafts',
      'SELECT,INSERT,UPDATE,DELETE'
    )
    AND has_table_privilege(
      'service_role',
      'public.newsletter_chart_library',
      'SELECT,INSERT,UPDATE,DELETE'
    )
    AND has_table_privilege(
      'service_role',
      'public.newsletter_draft_events',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
  'drafts, chart evidence, and event receipts are server-write-only'
);

SELECT ok(
  (
    SELECT procedure.prosecdef
    FROM pg_proc AS procedure
    WHERE procedure.oid =
      'public.bulk_set_newsletter_draft_archive_state(uuid,text,jsonb,text)'::regprocedure
  ),
  'bulk archive runs as its definer after service-role authorization'
);

SELECT ok(
  position(
    'pg_advisory_xact_lock' IN pg_get_functiondef(
      'public.bulk_set_newsletter_draft_archive_state(uuid,text,jsonb,text)'::regprocedure
    )
  ) > 0,
  'idempotent retries are serialized with a transaction-scoped advisory lock'
);

INSERT INTO auth.users (id)
VALUES
  ('a1000000-0000-0000-0000-000000000001'::uuid),
  ('a1000000-0000-0000-0000-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Replay the data-backfill statements recorded for this migration against
-- historical fixtures. This exercises the actual DISABLE/UPDATE/ENABLE order
-- rather than a test-only copy of the backfill.
CREATE FUNCTION pg_temp.replay_newsletter_archive_backfills()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  sql_text text;
  replayed integer := 0;
BEGIN
  FOR sql_text IN
    SELECT migration_statement.statement
    FROM supabase_migrations.schema_migrations AS migration
    CROSS JOIN LATERAL unnest(migration.statements) WITH ORDINALITY
      AS migration_statement(statement, statement_order)
    WHERE migration.version = '20260807090000'
      AND lower(migration_statement.statement) NOT LIKE
        '%create or replace function%'
      AND (
        lower(migration_statement.statement) LIKE
          '%disable trigger newsletter_drafts_updated_at_trigger%'
        OR lower(migration_statement.statement) LIKE
          '%update public.newsletter_drafts as draft%'
        OR lower(migration_statement.statement) LIKE
          '%update public.newsletter_drafts%set generated_at = created_at%'
        OR lower(migration_statement.statement) LIKE
          '%enable trigger newsletter_drafts_updated_at_trigger%'
        OR lower(migration_statement.statement) LIKE
          '%disable trigger newsletter_chart_library_updated_at_trigger%'
        OR lower(migration_statement.statement) LIKE
          '%update public.newsletter_chart_library%scene_hash = coalesce%'
        OR lower(migration_statement.statement) LIKE
          '%enable trigger newsletter_chart_library_updated_at_trigger%'
      )
    ORDER BY migration_statement.statement_order
  LOOP
    EXECUTE sql_text;
    replayed := replayed + 1;
  END LOOP;

  RETURN replayed;
END;
$$;

INSERT INTO public.newsletter_drafts (
  id,
  owner_id,
  session_id,
  ticker,
  status,
  subject_line,
  draft_json,
  preview_html,
  created_at,
  updated_at
)
VALUES (
  'd0000000-0000-0000-0000-000000000009'::uuid,
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'historical-backfill-session',
  'AAPL',
  'draft',
  'Historical draft',
  jsonb_build_object(
    'ticker', 'AAPL',
    'format', 'single_stock',
    'featuredTickers', jsonb_build_array('AAPL'),
    'generatedAt', '2020-01-02T12:00:00.000Z',
    'subjectLine', 'Historical draft',
    'blocks', '[]'::jsonb
  ),
  '<html></html>',
  '2020-01-02T12:00:00.000Z'::timestamptz,
  '2020-01-03T12:00:00.000Z'::timestamptz
);

INSERT INTO public.newsletter_chart_library (
  id,
  owner_id,
  session_id,
  title,
  symbol,
  chart_spec,
  image_path,
  image_url,
  chart_export_url,
  created_at,
  updated_at
)
VALUES (
  'c0000000-0000-0000-0000-000000000009'::uuid,
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'historical-backfill-session',
  'Historical chart',
  'AAPL',
  '{"mode":"price","symbol":"AAPL"}'::jsonb,
  'historical/chart.png',
  'https://example.test/historical/chart.png',
  'https://charts.example.test/export/historical',
  '2020-01-04T12:00:00.000Z'::timestamptz,
  '2020-01-05T12:00:00.000Z'::timestamptz
);

CREATE TEMP TABLE newsletter_archive_backfill_replay ON COMMIT DROP AS
SELECT pg_temp.replay_newsletter_archive_backfills() AS statement_count;

SELECT is(
  (SELECT statement_count FROM newsletter_archive_backfill_replay),
  7,
  'archive migration records both timestamp-trigger guards around its backfills'
);

SELECT ok(
  (
    SELECT updated_at = '2020-01-03T12:00:00.000Z'::timestamptz
    FROM public.newsletter_drafts
    WHERE id = 'd0000000-0000-0000-0000-000000000009'::uuid
  ),
  'draft summary backfill preserves the historical CAS timestamp'
);

SELECT ok(
  (
    SELECT updated_at = '2020-01-05T12:00:00.000Z'::timestamptz
    FROM public.newsletter_chart_library
    WHERE id = 'c0000000-0000-0000-0000-000000000009'::uuid
  ),
  'chart provenance backfill preserves historical library recency'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_trigger
    WHERE tgrelid IN (
      'public.newsletter_drafts'::regclass,
      'public.newsletter_chart_library'::regclass
    )
      AND tgname IN (
        'newsletter_drafts_updated_at_trigger',
        'newsletter_chart_library_updated_at_trigger'
      )
      AND tgenabled = 'O'
  ),
  2,
  'both timestamp triggers are enabled again after the backfills'
);

DELETE FROM public.newsletter_drafts
WHERE id = 'd0000000-0000-0000-0000-000000000009'::uuid;

DELETE FROM public.newsletter_chart_library
WHERE id = 'c0000000-0000-0000-0000-000000000009'::uuid;

-- Simulate the pre-migration application shape. It omitted all archive summary
-- columns, so a rolling deployment depends on the database deriving them.
INSERT INTO public.newsletter_drafts (
  id,
  owner_id,
  session_id,
  ticker,
  status,
  subject_line,
  draft_json,
  preview_html,
  created_at,
  updated_at
)
VALUES (
  'd0000000-0000-0000-0000-000000000001'::uuid,
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'legacy-shape-session',
  'nvda',
  'draft',
  'Stale scalar subject',
  jsonb_build_object(
    'ticker', 'NVDA',
    'format', 'market_roundup',
    'featuredTickers', jsonb_build_array(' msft ', 'AAPL', 'msft'),
    'generatedAt', '2026-08-01T12:30:00.000Z',
    'subjectLine', 'Derived from the document',
    'source', jsonb_build_object(
      'attachedChartIds', jsonb_build_array('chart-one')
    ),
    'blocks', jsonb_build_array(
      jsonb_build_object('id', 'one'),
      jsonb_build_object('id', 'two')
    )
  ),
  '<html></html>',
  '2026-08-01T12:00:00.000Z'::timestamptz,
  '2026-08-01T12:00:00.000Z'::timestamptz
);

SELECT ok(
  (
    SELECT format = 'market_roundup'
      AND featured_tickers = ARRAY['AAPL', 'MSFT']::text[]
      AND ticker_symbols = ARRAY['AAPL', 'MSFT', 'NVDA']::text[]
      AND generated_at = '2026-08-01T12:30:00.000Z'::timestamptz
      AND block_count = 2
      AND attached_chart_count = 1
      AND subject_line = 'Derived from the document'
    FROM public.newsletter_drafts
    WHERE id = 'd0000000-0000-0000-0000-000000000001'::uuid
  ),
  'an old-shape draft insert receives a complete authoritative archive summary'
);

UPDATE public.newsletter_drafts
SET
  ticker = 'amd',
  draft_json = jsonb_build_object(
    'ticker', 'AMD',
    'format', 'single_stock',
    'generatedAt', 'not-a-date',
    'subjectLine', 'Updated document subject',
    'blocks', jsonb_build_array(jsonb_build_object('id', 'only'))
  ),
  format = 'market_roundup',
  featured_tickers = ARRAY['WRONG'],
  ticker_symbols = ARRAY['WRONG'],
  generated_at = '2040-01-01T00:00:00.000Z'::timestamptz,
  block_count = 99,
  attached_chart_count = 99
WHERE id = 'd0000000-0000-0000-0000-000000000001'::uuid;

SELECT ok(
  (
    SELECT format = 'single_stock'
      AND featured_tickers = ARRAY['AMD']::text[]
      AND ticker_symbols = ARRAY['AMD']::text[]
      AND generated_at = '2026-08-01T12:30:00.000Z'::timestamptz
      AND block_count = 1
      AND attached_chart_count = 1
      AND subject_line = 'Updated document subject'
    FROM public.newsletter_drafts
    WHERE id = 'd0000000-0000-0000-0000-000000000001'::uuid
  ),
  'draft updates cannot make searchable summary columns disagree with draft_json'
);

DELETE FROM public.newsletter_drafts
WHERE id = 'd0000000-0000-0000-0000-000000000001'::uuid;

INSERT INTO public.newsletter_chart_library (
  id,
  owner_id,
  session_id,
  title,
  symbol,
  chart_spec,
  image_path,
  image_url,
  chart_export_url,
  created_at,
  updated_at
)
VALUES (
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'legacy-chart-session',
  'Legacy chart',
  'NVDA',
  '{"mode":"price","symbol":"NVDA"}'::jsonb,
  'legacy/chart.png',
  'https://example.test/legacy/chart.png',
  'https://charts.example.test/export/legacy',
  '2026-08-01T13:00:00.000Z'::timestamptz,
  '2026-08-01T13:00:00.000Z'::timestamptz
);

SELECT ok(
  (
    SELECT scene_hash LIKE 'legacy-md5:%'
      AND captured_at = '2026-08-01T13:00:00.000Z'::timestamptz
      AND renderer_contract = 'legacy-reconstructed-v0'
      AND image_sha256 IS NULL
    FROM public.newsletter_chart_library
    WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid
  ),
  'an old-shape chart insert remains valid but is explicitly untrusted legacy evidence'
);

DELETE FROM public.newsletter_chart_library
WHERE id = 'c0000000-0000-0000-0000-000000000001'::uuid;

INSERT INTO public.newsletter_drafts (
  id,
  owner_id,
  session_id,
  ticker,
  status,
  subject_line,
  draft_json,
  preview_html,
  generated_at,
  created_at,
  updated_at
)
SELECT
  (
    'd1000000-0000-0000-0000-'
    || lpad(draft_number::text, 12, '0')
  )::uuid,
  CASE
    WHEN draft_number = 5
      THEN 'a1000000-0000-0000-0000-000000000002'::uuid
    ELSE 'a1000000-0000-0000-0000-000000000001'::uuid
  END,
  format('archive-session-%s', draft_number),
  'TEST',
  'draft',
  format('Archive test %s', draft_number),
  jsonb_build_object(
    'ticker', 'TEST',
    'format', 'single_stock',
    'featuredTickers', jsonb_build_array('TEST'),
    'generatedAt', '2026-08-07T12:00:00.000Z',
    'subjectLine', format('Archive test %s', draft_number),
    'introText', '',
    'autoPickedStock', false,
    'blocks', '[]'::jsonb
  ),
  '<html></html>',
  '2026-08-07T12:00:00.000Z'::timestamptz,
  '2026-08-07T12:00:00.000Z'::timestamptz,
  '2099-01-01T00:00:00.000Z'::timestamptz
FROM generate_series(1, 6) AS draft_number;

SELECT is(
  (
    SELECT array_agg(ordered.id)
    FROM (
      SELECT draft.id
      FROM public.newsletter_drafts AS draft
      WHERE draft.owner_id =
        'a1000000-0000-0000-0000-000000000001'::uuid
      ORDER BY draft.updated_at DESC, draft.id DESC
    ) AS ordered
  ),
  ARRAY[
    'd1000000-0000-0000-0000-000000000006'::uuid,
    'd1000000-0000-0000-0000-000000000004'::uuid,
    'd1000000-0000-0000-0000-000000000003'::uuid,
    'd1000000-0000-0000-0000-000000000002'::uuid,
    'd1000000-0000-0000-0000-000000000001'::uuid
  ],
  'id is a stable descending tiebreaker when archive timestamps are equal'
);

CREATE TEMP TABLE first_archive_result ON COMMIT DROP AS
SELECT *
FROM public.bulk_set_newsletter_draft_archive_state(
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'archive',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'd1000000-0000-0000-0000-000000000001',
      'expected_updated_at', '2099-01-01T00:00:00.000Z'
    ),
    jsonb_build_object(
      'id', 'd1000000-0000-0000-0000-000000000002',
      'expected_updated_at', '2099-01-01T00:00:00.000Z'
    )
  ),
  'archive-key-0001'
);

SELECT is(
  (SELECT count(*) FROM first_archive_result),
  2::bigint,
  'bulk archive returns every requested draft'
);

SELECT is(
  (SELECT count(*) FROM first_archive_result WHERE changed AND archived_at IS NOT NULL),
  2::bigint,
  'bulk archive marks every active draft changed'
);

SELECT is(
  (
    SELECT count(*)
    FROM first_archive_result
    WHERE updated_at > '2099-01-01T00:00:00.000Z'::timestamptz
  ),
  2::bigint,
  'each changed draft receives a strictly newer CAS timestamp even past transaction time'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_draft_events
    WHERE dedupe_key LIKE 'archive:archive-key-0001:archive:%'
  ),
  2::bigint,
  'one durable event receipt is written for each archived draft'
);

CREATE TEMP TABLE replay_archive_result ON COMMIT DROP AS
SELECT *
FROM public.bulk_set_newsletter_draft_archive_state(
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'archive',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'd1000000-0000-0000-0000-000000000001',
      'expected_updated_at', '2099-01-01T00:00:00.000Z'
    ),
    jsonb_build_object(
      'id', 'd1000000-0000-0000-0000-000000000002',
      'expected_updated_at', '2099-01-01T00:00:00.000Z'
    )
  ),
  'archive-key-0001'
);

SELECT is(
  (SELECT count(*) FROM replay_archive_result WHERE NOT changed),
  2::bigint,
  'an exact idempotency replay returns every draft without mutating it again'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_draft_events
    WHERE dedupe_key LIKE 'archive:archive-key-0001:archive:%'
  ),
  2::bigint,
  'an idempotency replay does not duplicate event receipts'
);

CREATE TEMP TABLE restore_archive_result ON COMMIT DROP AS
SELECT *
FROM public.bulk_set_newsletter_draft_archive_state(
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'restore',
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', result.id,
        'expected_updated_at', result.updated_at
      )
      ORDER BY result.id
    )
    FROM first_archive_result AS result
  ),
  'restore-key-0001'
);

SELECT is(
  (
    SELECT count(*)
    FROM restore_archive_result
    WHERE changed AND archived_at IS NULL
  ),
  2::bigint,
  'restore returns the post-update null archive state for every changed draft'
);

SELECT is(
  (
    SELECT count(*)
    FROM restore_archive_result AS restored
    JOIN first_archive_result AS archived USING (id)
    WHERE restored.updated_at > archived.updated_at
  ),
  2::bigint,
  'restore advances each draft CAS token again'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_draft_events
    WHERE dedupe_key LIKE 'archive:restore-key-0001:restore:%'
  ),
  2::bigint,
  'restore records one durable receipt per draft'
);

SELECT is(
  pg_temp.newsletter_archive_error(
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'archive',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'd1000000-0000-0000-0000-000000000003',
        'expected_updated_at', '2099-01-01T00:00:00.000Z'
      ),
      jsonb_build_object(
        'id', 'd1000000-0000-0000-0000-000000000004',
        'expected_updated_at', '2099-01-02T00:00:00.000Z'
      )
    ),
    'stale-cas-key-0001'
  ),
  'one or more newsletter drafts changed or are outside this scope',
  'one stale CAS token rejects the whole batch'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_drafts
    WHERE id IN (
      'd1000000-0000-0000-0000-000000000003'::uuid,
      'd1000000-0000-0000-0000-000000000004'::uuid
    )
      AND archived_at IS NOT NULL
  ),
  0::bigint,
  'a rejected CAS batch leaves every selected draft unchanged'
);

SELECT is(
  pg_temp.newsletter_archive_error(
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'archive',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'd1000000-0000-0000-0000-000000000003',
        'expected_updated_at', '2099-01-01T00:00:00.000Z'
      ),
      jsonb_build_object(
        'id', 'd1000000-0000-0000-0000-000000000005',
        'expected_updated_at', '2099-01-01T00:00:00.000Z'
      )
    ),
    'owner-scope-key-0001'
  ),
  'one or more newsletter drafts changed or are outside this scope',
  'a draft owned by another account rejects the whole batch'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_drafts
    WHERE id IN (
      'd1000000-0000-0000-0000-000000000003'::uuid,
      'd1000000-0000-0000-0000-000000000005'::uuid
    )
      AND archived_at IS NOT NULL
  ),
  0::bigint,
  'owner-scope rejection changes neither account''s draft'
);

SELECT is(
  pg_temp.newsletter_archive_error(
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'archive',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'd1000000-0000-0000-0000-000000000003',
        'expected_updated_at', '2099-01-01T00:00:00.000Z'
      ),
      jsonb_build_object(
        'id', 'd1000000-0000-0000-0000-000000000003',
        'expected_updated_at', '2099-01-01T00:00:00.000Z'
      )
    ),
    'duplicate-key-0001'
  ),
  'items must contain unique draft ids',
  'duplicate draft ids are rejected before locking or mutation'
);

INSERT INTO public.newsletter_draft_events (
  draft_id,
  owner_id,
  session_id,
  event_type,
  from_status,
  to_status,
  dedupe_key,
  metadata
)
VALUES (
  'd1000000-0000-0000-0000-000000000003'::uuid,
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'archive-session-3',
  'archived',
  'draft',
  'draft',
  'archive:partial-key-0001:archive:d1000000-0000-0000-0000-000000000003',
  '{"action":"archive","idempotencyKey":"partial-key-0001"}'::jsonb
);

SELECT is(
  pg_temp.newsletter_archive_error(
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'archive',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'd1000000-0000-0000-0000-000000000003',
        'expected_updated_at', '2099-01-01T00:00:00.000Z'
      ),
      jsonb_build_object(
        'id', 'd1000000-0000-0000-0000-000000000004',
        'expected_updated_at', '2099-01-01T00:00:00.000Z'
      )
    ),
    'partial-key-0001'
  ),
  'incomplete idempotency replay',
  'a partial idempotency receipt fails closed'
);

INSERT INTO public.newsletter_draft_events (
  draft_id,
  owner_id,
  session_id,
  event_type,
  from_status,
  to_status,
  dedupe_key,
  metadata
)
VALUES (
  'd1000000-0000-0000-0000-000000000006'::uuid,
  'a1000000-0000-0000-0000-000000000002'::uuid,
  'archive-session-6',
  'archived',
  'draft',
  'draft',
  'archive:conflict-key-0001:archive:d1000000-0000-0000-0000-000000000006',
  '{"action":"archive","idempotencyKey":"conflict-key-0001"}'::jsonb
);

SELECT ok(
  pg_temp.newsletter_archive_error(
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'archive',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'd1000000-0000-0000-0000-000000000006',
        'expected_updated_at', '2099-01-01T00:00:00.000Z'
      )
    ),
    'conflict-key-0001'
  ) LIKE '%duplicate key value violates unique constraint%',
  'an unexpected receipt collision aborts instead of being ignored'
);

SELECT ok(
  (
    SELECT archived_at IS NULL
      AND updated_at = '2099-01-01T00:00:00.000Z'::timestamptz
    FROM public.newsletter_drafts
    WHERE id = 'd1000000-0000-0000-0000-000000000006'::uuid
  ),
  'event failure rolls back the draft mutation in the same transaction'
);

CREATE FUNCTION pg_temp.newsletter_archive_explain(statement text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  plan_line text;
  rendered_plan text := '';
BEGIN
  FOR plan_line IN EXECUTE 'EXPLAIN (COSTS OFF) ' || statement
  LOOP
    rendered_plan := rendered_plan || E'\n' || plan_line;
  END LOOP;
  RETURN rendered_plan;
END;
$$;

-- Make these assertions about available access paths rather than the tiny test
-- fixture's sequential-scan cost. Disabling sort proves the selected index can
-- emit the keyset order directly.
SET LOCAL enable_seqscan = off;
SET LOCAL enable_bitmapscan = off;
SET LOCAL enable_sort = off;

SELECT ok(
  pg_temp.newsletter_archive_explain($query$
    SELECT id
    FROM public.newsletter_drafts
    WHERE owner_id = 'a1000000-0000-0000-0000-000000000001'::uuid
    ORDER BY generated_at DESC, id DESC
    LIMIT 25
  $query$) LIKE '%idx_newsletter_drafts_owner_generated%',
  'all-visibility keyset paging has an owner/generated_at/id index path'
);

SELECT ok(
  (
    WITH plan AS (
      SELECT pg_temp.newsletter_archive_explain($query$
        SELECT id
        FROM public.newsletter_drafts
        WHERE owner_id = 'a1000000-0000-0000-0000-000000000001'::uuid
          AND archived_at IS NULL
        ORDER BY generated_at DESC, id DESC
        LIMIT 25
      $query$) AS text
    )
    SELECT text LIKE '%idx_newsletter_drafts_owner_archive_generated%'
      OR text LIKE '%idx_newsletter_drafts_owner_generated%'
    FROM plan
  ),
  'active keyset paging has an ordered index path without a sort'
);

SELECT ok(
  pg_temp.newsletter_archive_explain($query$
    SELECT id
    FROM public.newsletter_drafts
    WHERE owner_id = 'a1000000-0000-0000-0000-000000000001'::uuid
      AND archived_at IS NOT NULL
    ORDER BY generated_at DESC, id DESC
    LIMIT 25
  $query$) LIKE '%idx_newsletter_drafts_owner_generated%',
  'archived keyset paging keeps order through the general owner index'
);

SELECT ok(
  pg_temp.newsletter_archive_explain($query$
    SELECT id
    FROM public.newsletter_drafts
    WHERE owner_id = 'a1000000-0000-0000-0000-000000000001'::uuid
      AND status = 'draft'
    ORDER BY generated_at DESC, id DESC
    LIMIT 25
  $query$) LIKE '%idx_newsletter_drafts_owner_status_generated%',
  'status-filtered keyset paging has a matching ordered index path'
);

SELECT ok(
  pg_temp.newsletter_archive_explain($query$
    SELECT id
    FROM public.newsletter_drafts
    WHERE owner_id IS NULL
      AND session_id = 'anonymous-archive-session'
    ORDER BY generated_at DESC, id DESC
    LIMIT 25
  $query$) LIKE '%idx_newsletter_drafts_session_generated%',
  'anonymous keyset paging is isolated by its session index path'
);

SET LOCAL enable_bitmapscan = on;
SET LOCAL enable_sort = on;
SET LOCAL enable_indexscan = off;
SET LOCAL enable_indexonlyscan = off;

SELECT ok(
  (
    WITH plan AS (
      SELECT pg_temp.newsletter_archive_explain($query$
        SELECT count(*)
        FROM public.newsletter_drafts
        WHERE subject_line ILIKE '%archive%'
          OR ticker ILIKE '%archive%'
      $query$) AS text
    )
    SELECT text LIKE '%idx_newsletter_drafts_subject_trgm%'
      AND text LIKE '%idx_newsletter_drafts_ticker_trgm%'
    FROM plan
  ),
  'subject-or-ticker substring search can use both trigram index arms'
);

SELECT * FROM finish();

ROLLBACK;
