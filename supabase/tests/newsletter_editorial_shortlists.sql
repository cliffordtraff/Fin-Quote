BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

-- The shortlist is an operational write model: browsers cannot read or
-- mutate it directly, and even the service role can only write through the
-- validating RPC. RLS remains enabled as a second boundary.
SELECT is(
  (
    SELECT count(*)
    FROM unnest(ARRAY[
      'newsletter_editorial_shortlist_revisions',
      'newsletter_editorial_shortlist_entries',
      'newsletter_editorial_shortlist_heads'
    ]) AS expected(table_name)
    WHERE to_regclass(format('public.%I', table_name)) IS NOT NULL
  ),
  3::bigint,
  'all three editorial shortlist relations exist'
);

SELECT is(
  (
    SELECT count(*)
    FROM unnest(ARRAY[
      'newsletter_editorial_shortlist_revisions',
      'newsletter_editorial_shortlist_entries',
      'newsletter_editorial_shortlist_heads'
    ]) AS expected(table_name)
    JOIN pg_class AS relation
      ON relation.oid = to_regclass(format('public.%I', table_name))
    WHERE relation.relrowsecurity
  ),
  3::bigint,
  'every editorial shortlist relation has RLS enabled'
);

SELECT is(
  (
    SELECT count(*)
    FROM unnest(ARRAY[
      'newsletter_editorial_shortlist_revisions',
      'newsletter_editorial_shortlist_entries',
      'newsletter_editorial_shortlist_heads'
    ]) AS expected(table_name)
    CROSS JOIN unnest(ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'
    ]) AS wanted(privilege_name)
    WHERE has_table_privilege(
      'anon',
      format('public.%I', table_name),
      privilege_name
    )
      OR CASE
        WHEN privilege_name IN ('SELECT', 'INSERT', 'UPDATE') THEN
          has_any_column_privilege(
            'anon',
            format('public.%I', table_name),
            privilege_name
          )
        ELSE false
      END
  ),
  0::bigint,
  'anonymous browsers have no shortlist table or column privileges'
);

SELECT is(
  (
    SELECT count(*)
    FROM unnest(ARRAY[
      'newsletter_editorial_shortlist_revisions',
      'newsletter_editorial_shortlist_entries',
      'newsletter_editorial_shortlist_heads'
    ]) AS expected(table_name)
    CROSS JOIN unnest(ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'
    ]) AS wanted(privilege_name)
    WHERE has_table_privilege(
      'authenticated',
      format('public.%I', table_name),
      privilege_name
    )
      OR CASE
        WHEN privilege_name IN ('SELECT', 'INSERT', 'UPDATE') THEN
          has_any_column_privilege(
            'authenticated',
            format('public.%I', table_name),
            privilege_name
          )
        ELSE false
      END
  ),
  0::bigint,
  'authenticated browsers have no shortlist table or column privileges'
);

SELECT is(
  (
    SELECT count(*)
    FROM unnest(ARRAY[
      'newsletter_editorial_shortlist_revisions',
      'newsletter_editorial_shortlist_entries',
      'newsletter_editorial_shortlist_heads'
    ]) AS expected(table_name)
    WHERE has_table_privilege(
      'service_role',
      format('public.%I', table_name),
      'SELECT'
    )
  ),
  3::bigint,
  'the service role can read the complete editorial decision ledger'
);

SELECT is(
  (
    SELECT count(*)
    FROM unnest(ARRAY[
      'newsletter_editorial_shortlist_revisions',
      'newsletter_editorial_shortlist_entries',
      'newsletter_editorial_shortlist_heads'
    ]) AS expected(table_name)
    CROSS JOIN unnest(ARRAY[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'
    ]) AS wanted(privilege_name)
    WHERE has_table_privilege(
      'service_role',
      format('public.%I', table_name),
      privilege_name
    )
      OR CASE
        WHEN privilege_name IN ('INSERT', 'UPDATE') THEN
          has_any_column_privilege(
            'service_role',
            format('public.%I', table_name),
            privilege_name
          )
        ELSE false
      END
  ),
  0::bigint,
  'the service role cannot bypass the shortlist RPC with direct writes'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'newsletter_editorial_shortlist_revisions',
        'newsletter_editorial_shortlist_entries',
        'newsletter_editorial_shortlist_heads'
      )
      AND roles && ARRAY['service_role']::name[]
      AND cmd = 'ALL'
  ),
  3::bigint,
  'each shortlist relation has an explicit service-role RLS policy'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'newsletter_editorial_shortlist_revisions',
        'newsletter_editorial_shortlist_entries',
        'newsletter_editorial_shortlist_heads'
      )
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  ),
  0::bigint,
  'no shortlist RLS policy applies to a browser role'
);

SELECT ok(
  has_table_privilege(
    'authenticated',
    'public.newsletter_daily_runs',
    'SELECT'
  )
    AND has_table_privilege(
      'authenticated',
      'public.newsletter_daily_run_items',
      'SELECT'
    )
    AND NOT has_table_privilege(
      'authenticated',
      'public.newsletter_daily_runs',
      'INSERT'
    )
    AND NOT has_table_privilege(
      'authenticated',
      'public.newsletter_daily_runs',
      'UPDATE'
    )
    AND NOT has_table_privilege(
      'authenticated',
      'public.newsletter_daily_runs',
      'DELETE'
    )
    AND NOT has_table_privilege(
      'authenticated',
      'public.newsletter_daily_run_items',
      'INSERT'
    )
    AND NOT has_table_privilege(
      'authenticated',
      'public.newsletter_daily_run_items',
      'UPDATE'
    )
    AND NOT has_table_privilege(
      'authenticated',
      'public.newsletter_daily_run_items',
      'DELETE'
    ),
  'authenticated users retain reads but cannot rewrite run selector evidence'
);

SELECT ok(
  has_table_privilege(
    'service_role',
    'public.newsletter_daily_runs',
    'SELECT,INSERT,UPDATE,DELETE'
  )
    AND has_table_privilege(
      'service_role',
      'public.newsletter_daily_run_items',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
  'the server-side automation role retains daily run and item mutation access'
);

SELECT ok(
  (
    SELECT procedure.prosecdef
    FROM pg_proc AS procedure
    WHERE procedure.oid =
      'public.save_newsletter_editorial_shortlist(uuid,integer,text,text,text,text,uuid,text,jsonb,jsonb)'::regprocedure
  ),
  'shortlist saves execute as a security definer'
);

SELECT is(
  (
    SELECT owner_role.rolname
    FROM pg_proc AS procedure
    JOIN pg_roles AS owner_role ON owner_role.oid = procedure.proowner
    WHERE procedure.oid =
      'public.save_newsletter_editorial_shortlist(uuid,integer,text,text,text,text,uuid,text,jsonb,jsonb)'::regprocedure
  ),
  'postgres',
  'the shortlist security definer is owned by postgres'
);

SELECT ok(
  (
    SELECT 'search_path=""' = ANY(coalesce(procedure.proconfig, '{}'::text[]))
    FROM pg_proc AS procedure
    WHERE procedure.oid =
      'public.save_newsletter_editorial_shortlist(uuid,integer,text,text,text,text,uuid,text,jsonb,jsonb)'::regprocedure
  ),
  'the shortlist security definer pins an empty search path'
);

SELECT ok(
  (
    SELECT pg_get_functiondef(procedure.oid)
      ~ 'FROM public.newsletter_drafts(.|\n)*FOR UPDATE'
      AND pg_get_functiondef(procedure.oid)
        ~ 'FROM public.newsletter_beehiiv_deliveries(.|\n)*FOR SHARE'
    FROM pg_proc AS procedure
    WHERE procedure.oid =
      'public.save_newsletter_editorial_shortlist(uuid,integer,text,text,text,text,uuid,text,jsonb,jsonb)'::regprocedure
  ),
  'the RPC fences draft updates and delivery lifecycle changes while saving'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.save_newsletter_editorial_shortlist(uuid,integer,text,text,text,text,uuid,text,jsonb,jsonb)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.save_newsletter_editorial_shortlist(uuid,integer,text,text,text,text,uuid,text,jsonb,jsonb)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.save_newsletter_editorial_shortlist(uuid,integer,text,text,text,text,uuid,text,jsonb,jsonb)',
      'EXECUTE'
    ),
  'only the service role can execute the shortlist save RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.guard_newsletter_editorial_shortlist_history()',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.guard_newsletter_editorial_shortlist_history()',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'service_role',
      'public.guard_newsletter_editorial_shortlist_history()',
      'EXECUTE'
    ),
  'the append-only trigger helper is not directly executable by API roles'
);

INSERT INTO auth.users (id)
VALUES
  ('e1000000-0000-0000-0000-000000000001'::uuid),
  ('e1000000-0000-0000-0000-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Owner-scoped revisions must prove that the exact draft the editor saw still
-- exists at the same version. Mix draft, ready, and published records so the
-- fixture also exercises the effective-status projection used by selection.
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
SELECT
  fixture.id,
  fixture.owner_id,
  fixture.session_id,
  fixture.ticker,
  fixture.status,
  fixture.subject_line,
  jsonb_build_object(
    'ticker', fixture.ticker,
    'format', 'single_stock',
    'subjectLine', fixture.subject_line,
    'generatedAt', '2099-11-01T13:00:00.000Z',
    'blocks', '[]'::jsonb,
    'source', jsonb_build_object('type', 'generated')
  ),
  format('<p>%s</p>', fixture.subject_line),
  '2099-11-01T13:00:00.000Z'::timestamptz,
  '2099-11-01T13:00:00.000Z'::timestamptz
FROM (
  VALUES
    (
      'e4000000-0000-0000-0000-000000000001'::uuid,
      'e1000000-0000-0000-0000-000000000001'::uuid,
      'owner-browser-session', 'AAPL', 'ready', 'Apple issue'
    ),
    (
      'e4000000-0000-0000-0000-000000000002'::uuid,
      'e1000000-0000-0000-0000-000000000001'::uuid,
      'owner-browser-session', 'MSFT', 'draft', 'Microsoft issue'
    ),
    (
      'e4000000-0000-0000-0000-000000000003'::uuid,
      'e1000000-0000-0000-0000-000000000001'::uuid,
      'owner-browser-session', 'NVDA', 'ready', 'Nvidia issue'
    ),
    (
      'e4000000-0000-0000-0000-000000000004'::uuid,
      'e1000000-0000-0000-0000-000000000001'::uuid,
      'owner-browser-session', 'AMZN', 'published', 'Amazon issue'
    ),
    (
      'e4000000-0000-0000-0000-000000000005'::uuid,
      'e1000000-0000-0000-0000-000000000001'::uuid,
      'owner-browser-session', 'META', 'draft', 'Meta issue'
    ),
    (
      'e4000000-0000-0000-0000-000000000006'::uuid,
      'e1000000-0000-0000-0000-000000000001'::uuid,
      'owner-browser-session', 'TSLA', 'draft', 'Tesla issue'
    ),
    (
      'e4000000-0000-0000-0000-000000000021'::uuid,
      'e1000000-0000-0000-0000-000000000001'::uuid,
      'deletion-browser-session', 'ORCL', 'ready', 'Oracle issue'
    ),
    (
      'e4000000-0000-0000-0000-000000000031'::uuid,
      'e1000000-0000-0000-0000-000000000002'::uuid,
      'foreign-browser-session', 'GOOG', 'ready', 'Google issue'
    )
) AS fixture(
  id,
  owner_id,
  session_id,
  ticker,
  status,
  subject_line
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
  created_at,
  updated_at
)
VALUES (
  'e5000000-0000-0000-0000-000000000005'::uuid,
  'e4000000-0000-0000-0000-000000000005'::uuid,
  'e1000000-0000-0000-0000-000000000001'::uuid,
  'editorial-shortlist-publication',
  'editorial-shortlist-post',
  'Meta issue',
  'https://example.test/editor/meta',
  repeat('5', 64),
  'published',
  '2099-11-01T13:00:00.000Z'::timestamptz,
  '2099-11-01T13:00:00.000Z'::timestamptz
);

INSERT INTO public.newsletter_daily_runs (
  id,
  scope_key,
  owner_id,
  session_id,
  market_date,
  status,
  target_count
)
VALUES
  (
    'e2000000-0000-0000-0000-000000000001'::uuid,
    'editorial-shortlist-owner',
    'e1000000-0000-0000-0000-000000000001'::uuid,
    'owner-browser-session',
    DATE '2099-11-01',
    'completed',
    30
  ),
  (
    'e2000000-0000-0000-0000-000000000002'::uuid,
    'editorial-shortlist-anonymous',
    NULL,
    'anonymous-browser-session',
    DATE '2099-11-02',
    'completed',
    30
  ),
  (
    'e2000000-0000-0000-0000-000000000003'::uuid,
    'editorial-shortlist-deletion',
    'e1000000-0000-0000-0000-000000000001'::uuid,
    'deletion-browser-session',
    DATE '2099-11-03',
    'completed',
    30
  ),
  (
    'e2000000-0000-0000-0000-000000000004'::uuid,
    'editorial-shortlist-foreign',
    'e1000000-0000-0000-0000-000000000002'::uuid,
    'foreign-browser-session',
    DATE '2099-11-04',
    'completed',
    30
  );

INSERT INTO public.newsletter_daily_run_items (
  id,
  run_id,
  rank,
  ticker,
  status,
  quality_band,
  relevance_score,
  confidence_score,
  candidate_type,
  reason_type,
  headline,
  summary_text,
  draft_id
)
VALUES
  (
    'e3000000-0000-0000-0000-000000000001'::uuid,
    'e2000000-0000-0000-0000-000000000001'::uuid,
    1, 'AAPL', 'ready', 'strong', 99.00, 95.00,
    'earnings', 'earnings', 'Apple raises guidance', 'Apple summary',
    'e4000000-0000-0000-0000-000000000001'::uuid
  ),
  (
    'e3000000-0000-0000-0000-000000000002'::uuid,
    'e2000000-0000-0000-0000-000000000001'::uuid,
    2, 'MSFT', 'ready', 'strong', 96.00, 92.00,
    'earnings', 'earnings', 'Microsoft cloud growth', 'Microsoft summary',
    'e4000000-0000-0000-0000-000000000002'::uuid
  ),
  (
    'e3000000-0000-0000-0000-000000000003'::uuid,
    'e2000000-0000-0000-0000-000000000001'::uuid,
    3, 'NVDA', 'generated', 'strong', 92.00, 89.00,
    'market_move', 'guidance', 'Nvidia unveils new chips', 'Nvidia summary',
    'e4000000-0000-0000-0000-000000000003'::uuid
  ),
  (
    'e3000000-0000-0000-0000-000000000004'::uuid,
    'e2000000-0000-0000-0000-000000000001'::uuid,
    4, 'AMZN', 'ready', 'strong', 88.00, 85.00,
    'market_move', 'news', 'Amazon expands margins', 'Amazon summary',
    'e4000000-0000-0000-0000-000000000004'::uuid
  ),
  (
    'e3000000-0000-0000-0000-000000000005'::uuid,
    'e2000000-0000-0000-0000-000000000001'::uuid,
    5, 'META', 'ready', 'strong', 84.00, 81.00,
    'market_move', 'news', 'Meta ad demand holds', 'Meta summary',
    'e4000000-0000-0000-0000-000000000005'::uuid
  ),
  (
    'e3000000-0000-0000-0000-000000000006'::uuid,
    'e2000000-0000-0000-0000-000000000001'::uuid,
    6, 'TSLA', 'needs_attention', 'review', 70.00, 60.00,
    'market_move', 'news', 'Tesla deliveries surprise', 'Tesla summary',
    'e4000000-0000-0000-0000-000000000006'::uuid
  ),
  (
    'e3000000-0000-0000-0000-000000000011'::uuid,
    'e2000000-0000-0000-0000-000000000002'::uuid,
    1, 'AMD', 'ready', 'strong', 93.00, 90.00,
    'earnings', 'earnings', 'AMD data-center demand', 'AMD summary',
    'e4000000-0000-0000-0000-000000000011'::uuid
  ),
  (
    'e3000000-0000-0000-0000-000000000012'::uuid,
    'e2000000-0000-0000-0000-000000000002'::uuid,
    2, 'AVGO', 'ready', 'strong', 89.00, 86.00,
    'market_move', 'news', 'Broadcom AI sales rise', 'Broadcom summary',
    'e4000000-0000-0000-0000-000000000012'::uuid
  ),
  (
    'e3000000-0000-0000-0000-000000000021'::uuid,
    'e2000000-0000-0000-0000-000000000003'::uuid,
    1, 'ORCL', 'ready', 'strong', 91.00, 88.00,
    'earnings', 'earnings', 'Oracle bookings accelerate', 'Oracle summary',
    'e4000000-0000-0000-0000-000000000021'::uuid
  ),
  (
    'e3000000-0000-0000-0000-000000000031'::uuid,
    'e2000000-0000-0000-0000-000000000004'::uuid,
    1, 'GOOG', 'ready', 'strong', 90.00, 87.00,
    'earnings', 'earnings', 'Google search demand', 'Google summary',
    'e4000000-0000-0000-0000-000000000031'::uuid
  );

CREATE FUNCTION pg_temp.editorial_shortlist_catalog(p_run_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_id', item.id,
        'status', CASE
          WHEN draft.status = 'published'
            OR delivery.lifecycle_status = 'published' THEN 'published'
          WHEN draft.status = 'ready' THEN 'ready'
          ELSE item.status
        END,
        'quality_band', item.quality_band,
        'draft_id', item.draft_id,
        'rank', item.rank,
        'relevance_score', item.relevance_score,
        'confidence_score', item.confidence_score,
        'evidence_fingerprint', repeat('a', 64)
      )
      ORDER BY item.rank
    ),
    '[]'::jsonb
  )
  FROM public.newsletter_daily_run_items AS item
  LEFT JOIN public.newsletter_drafts AS draft ON draft.id = item.draft_id
  LEFT JOIN public.newsletter_beehiiv_deliveries AS delivery
    ON delivery.draft_id = draft.id
  WHERE item.run_id = p_run_id;
$function$;

CREATE FUNCTION pg_temp.editorial_shortlist_evidence(p_item_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'itemId', item.id,
    'runId', item.run_id,
    'ticker', item.ticker,
    'rank', item.rank,
    'qualityBand', item.quality_band,
    'relevanceScore', item.relevance_score,
    'confidenceScore', item.confidence_score,
    'candidateType', item.candidate_type,
    'reasonType', item.reason_type,
    'headline', item.headline,
    'status', CASE
      WHEN draft.status = 'published'
        OR delivery.lifecycle_status = 'published' THEN 'published'
      WHEN draft.status = 'ready' THEN 'ready'
      ELSE item.status
    END,
    'draftId', item.draft_id,
    'subjectLine', draft.subject_line,
    'draftStatus', draft.status
  )
  FROM public.newsletter_daily_run_items AS item
  LEFT JOIN public.newsletter_drafts AS draft ON draft.id = item.draft_id
  LEFT JOIN public.newsletter_beehiiv_deliveries AS delivery
    ON delivery.draft_id = draft.id
  WHERE item.id = p_item_id;
$function$;

CREATE FUNCTION pg_temp.editorial_shortlist_accepted_entries(p_run_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_id', item.id,
        'baseline_position', item.rank,
        'selected_position', item.rank,
        'decision', 'retained',
        'reason_code', NULL,
        'note', NULL,
        'item_updated_at', item.updated_at,
        'draft_updated_at', draft.updated_at,
        'evidence_snapshot',
          pg_temp.editorial_shortlist_evidence(item.id)
      )
      ORDER BY item.rank
    ),
    '[]'::jsonb
  )
  FROM public.newsletter_daily_run_items AS item
  LEFT JOIN public.newsletter_drafts AS draft ON draft.id = item.draft_id
  WHERE item.run_id = p_run_id
    AND item.rank <= 5;
$function$;

CREATE FUNCTION pg_temp.editorial_shortlist_override_entries(p_run_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT jsonb_agg(
    jsonb_build_object(
      'item_id', item.id,
      'baseline_position', CASE WHEN item.rank <= 5 THEN item.rank END,
      'selected_position', CASE item.rank
        WHEN 1 THEN 2
        WHEN 2 THEN 1
        WHEN 3 THEN 3
        WHEN 4 THEN 4
        WHEN 6 THEN 5
      END,
      'decision', CASE item.rank
        WHEN 1 THEN 'demoted'
        WHEN 2 THEN 'promoted'
        WHEN 3 THEN 'retained'
        WHEN 4 THEN 'retained'
        WHEN 5 THEN 'removed'
        WHEN 6 THEN 'added'
      END,
      'reason_code', CASE item.rank
        WHEN 1 THEN 'audience_fit'
        WHEN 2 THEN 'stronger_catalyst'
        WHEN 5 THEN 'stale_story'
        WHEN 6 THEN 'fresh_earnings'
      END,
      'note', CASE WHEN item.rank = 6 THEN 'Late but material update' END,
      'item_updated_at', item.updated_at,
      'draft_updated_at', draft.updated_at,
      'evidence_snapshot', pg_temp.editorial_shortlist_evidence(item.id)
    )
    ORDER BY item.rank
  )
  FROM public.newsletter_daily_run_items AS item
  LEFT JOIN public.newsletter_drafts AS draft ON draft.id = item.draft_id
  WHERE item.run_id = p_run_id;
$function$;

CREATE TEMP TABLE editorial_shortlist_test_payloads (
  name text PRIMARY KEY,
  run_id uuid NOT NULL,
  algorithm_version text NOT NULL,
  baseline_fingerprint text NOT NULL,
  catalog_tokens jsonb NOT NULL,
  entries jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO editorial_shortlist_test_payloads (
  name,
  run_id,
  algorithm_version,
  baseline_fingerprint,
  catalog_tokens,
  entries
)
VALUES
  (
    'owner-accepted',
    'e2000000-0000-0000-0000-000000000001'::uuid,
    'morning-shortlist-v1',
    repeat('b', 64),
    pg_temp.editorial_shortlist_catalog(
      'e2000000-0000-0000-0000-000000000001'::uuid
    ),
    pg_temp.editorial_shortlist_accepted_entries(
      'e2000000-0000-0000-0000-000000000001'::uuid
    )
  ),
  (
    'owner-override',
    'e2000000-0000-0000-0000-000000000001'::uuid,
    'morning-shortlist-v1',
    repeat('c', 64),
    pg_temp.editorial_shortlist_catalog(
      'e2000000-0000-0000-0000-000000000001'::uuid
    ),
    pg_temp.editorial_shortlist_override_entries(
      'e2000000-0000-0000-0000-000000000001'::uuid
    )
  ),
  (
    'anonymous-accepted',
    'e2000000-0000-0000-0000-000000000002'::uuid,
    'morning-shortlist-v1',
    repeat('d', 64),
    pg_temp.editorial_shortlist_catalog(
      'e2000000-0000-0000-0000-000000000002'::uuid
    ),
    pg_temp.editorial_shortlist_accepted_entries(
      'e2000000-0000-0000-0000-000000000002'::uuid
    )
  ),
  (
    'deletion-accepted',
    'e2000000-0000-0000-0000-000000000003'::uuid,
    'morning-shortlist-v1',
    repeat('e', 64),
    pg_temp.editorial_shortlist_catalog(
      'e2000000-0000-0000-0000-000000000003'::uuid
    ),
    pg_temp.editorial_shortlist_accepted_entries(
      'e2000000-0000-0000-0000-000000000003'::uuid
    )
  );

-- Preserve malformed requests as named fixtures so every failure assertion is
-- deterministic and easy to audit.
INSERT INTO editorial_shortlist_test_payloads
SELECT
  'owner-invalid-reason',
  run_id,
  algorithm_version,
  baseline_fingerprint,
  catalog_tokens,
  jsonb_set(entries, '{0,reason_code}', 'null'::jsonb)
FROM editorial_shortlist_test_payloads
WHERE name = 'owner-override';

INSERT INTO editorial_shortlist_test_payloads
SELECT
  'owner-duplicate-position',
  run_id,
  algorithm_version,
  baseline_fingerprint,
  catalog_tokens,
  jsonb_set(entries, '{1,selected_position}', '2'::jsonb)
FROM editorial_shortlist_test_payloads
WHERE name = 'owner-override';

INSERT INTO editorial_shortlist_test_payloads
SELECT
  'owner-tampered-evidence',
  run_id,
  algorithm_version,
  baseline_fingerprint,
  catalog_tokens,
  jsonb_set(
    entries,
    '{0,evidence_snapshot,headline}',
    '"Tampered headline"'::jsonb
  )
FROM editorial_shortlist_test_payloads
WHERE name = 'owner-accepted';

INSERT INTO editorial_shortlist_test_payloads
SELECT
  'owner-foreign-item',
  run_id,
  algorithm_version,
  baseline_fingerprint,
  catalog_tokens,
  jsonb_set(
    entries,
    '{0,item_id}',
    to_jsonb('e3000000-0000-0000-0000-000000000031'::text)
  )
FROM editorial_shortlist_test_payloads
WHERE name = 'owner-accepted';

INSERT INTO editorial_shortlist_test_payloads
SELECT
  'owner-duplicate-catalog',
  run_id,
  algorithm_version,
  baseline_fingerprint,
  jsonb_set(
    catalog_tokens,
    '{1,item_id}',
    catalog_tokens #> '{0,item_id}'
  ),
  entries
FROM editorial_shortlist_test_payloads
WHERE name = 'owner-accepted';

CREATE FUNCTION pg_temp.save_editorial_shortlist_fixture(
  p_payload_name text,
  p_expected_revision integer,
  p_idempotency_key text,
  p_command_hash text,
  p_actor_id uuid,
  p_session_id text
)
RETURNS TABLE (
  revision_id uuid,
  revision integer,
  changed boolean,
  created_at timestamptz
)
LANGUAGE sql
SET search_path = ''
AS $function$
  SELECT saved.*
  FROM pg_temp.editorial_shortlist_test_payloads AS payload
  CROSS JOIN LATERAL public.save_newsletter_editorial_shortlist(
    payload.run_id,
    p_expected_revision,
    p_idempotency_key,
    payload.algorithm_version,
    payload.baseline_fingerprint,
    p_command_hash,
    p_actor_id,
    p_session_id,
    payload.catalog_tokens,
    payload.entries
  ) AS saved
  WHERE payload.name = p_payload_name;
$function$;

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-accepted', 0, 'owner.wrong-actor',
      repeat('1', 64),
      'e1000000-0000-0000-0000-000000000002'::uuid,
      NULL
    )
  $query$,
  '%does not own the newsletter daily run%',
  'an authenticated actor cannot save another owner''s run'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-accepted', 0, 'owner.mixed-scope',
      repeat('2', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      'owner-browser-session'
    )
  $query$,
  '%authenticated shortlist requests cannot carry a session scope%',
  'an authenticated save cannot smuggle an anonymous session scope'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_editorial_shortlist_revisions
    WHERE run_id = 'e2000000-0000-0000-0000-000000000001'::uuid
  ),
  0::bigint,
  'rejected owner-scope requests leave no receipt'
);

CREATE TEMP TABLE owner_first_receipt ON COMMIT DROP AS
SELECT *
FROM pg_temp.save_editorial_shortlist_fixture(
  'owner-accepted',
  0,
  'owner.accept.v1',
  repeat('3', 64),
  'e1000000-0000-0000-0000-000000000001'::uuid,
  NULL
);

SELECT ok(
  (
    SELECT revision = 1 AND changed
    FROM owner_first_receipt
  ),
  'the owner creates revision one with a changed receipt'
);

SELECT ok(
  (
    SELECT revision.actor_id =
        'e1000000-0000-0000-0000-000000000001'::uuid
      AND revision.session_id IS NULL
      AND revision.baseline_count = 5
      AND revision.selected_count = 5
      AND revision.algorithm_version = 'morning-shortlist-v1'
    FROM public.newsletter_editorial_shortlist_revisions AS revision
    WHERE revision.id = (SELECT revision_id FROM owner_first_receipt)
  ),
  'the signed-in receipt freezes owner scope, counts, and algorithm version'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_editorial_shortlist_entries
    WHERE revision_id = (SELECT revision_id FROM owner_first_receipt)
      AND decision = 'retained'
      AND reason_code IS NULL
  ),
  5::bigint,
  'accepting the recommendation records five retained entries'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.newsletter_editorial_shortlist_entries
    WHERE revision_id = (SELECT revision_id FROM owner_first_receipt)
      AND item_id = 'e3000000-0000-0000-0000-000000000003'::uuid
      AND evidence_snapshot ->> 'status' = 'ready'
      AND evidence_snapshot ->> 'draftStatus' = 'ready'
  )
    AND EXISTS (
      SELECT 1
      FROM public.newsletter_editorial_shortlist_entries
      WHERE revision_id = (SELECT revision_id FROM owner_first_receipt)
        AND item_id = 'e3000000-0000-0000-0000-000000000004'::uuid
        AND evidence_snapshot ->> 'status' = 'published'
        AND evidence_snapshot ->> 'draftStatus' = 'published'
    )
    AND EXISTS (
      SELECT 1
      FROM public.newsletter_editorial_shortlist_entries
      WHERE revision_id = (SELECT revision_id FROM owner_first_receipt)
        AND item_id = 'e3000000-0000-0000-0000-000000000005'::uuid
        AND evidence_snapshot ->> 'status' = 'published'
        AND evidence_snapshot ->> 'draftStatus' = 'draft'
    ),
  'ready drafts, published drafts, and published deliveries project effective statuses'
);

CREATE TEMP TABLE owner_exact_replay ON COMMIT DROP AS
SELECT *
FROM pg_temp.save_editorial_shortlist_fixture(
  'owner-accepted',
  0,
  'owner.accept.v1',
  repeat('3', 64),
  'e1000000-0000-0000-0000-000000000001'::uuid,
  NULL
);

SELECT ok(
  (
    SELECT replay.revision_id = original.revision_id
      AND replay.revision = 1
      AND NOT replay.changed
      AND replay.created_at = original.created_at
    FROM owner_exact_replay AS replay
    CROSS JOIN owner_first_receipt AS original
  ),
  'a signed-in exact replay returns the original immutable receipt'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_editorial_shortlist_revisions
    WHERE run_id = 'e2000000-0000-0000-0000-000000000001'::uuid
  ),
  1::bigint,
  'an exact replay does not create a duplicate revision'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-override', 1, 'owner.accept.v1',
      repeat('4', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      NULL
    )
  $query$,
  '%idempotency key was reused with a different request%',
  'the same owner key cannot represent a different command'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-accepted', 0, 'owner.accept.v1',
      repeat('3', 64),
      'e1000000-0000-0000-0000-000000000002'::uuid,
      NULL
    )
  $query$,
  '%shortlist replay scope does not match%',
  'an exact signed-in receipt cannot be replayed in another actor scope'
);

-- Exact replay intentionally precedes mutable selector validation. Simulate a
-- newer automation observation, then prove the committed receipt is still
-- recoverable while a new stale command is rejected.
UPDATE public.newsletter_daily_run_items
SET confidence_score = 61.00
WHERE id = 'e3000000-0000-0000-0000-000000000006'::uuid;

CREATE TEMP TABLE owner_drift_replay ON COMMIT DROP AS
SELECT *
FROM pg_temp.save_editorial_shortlist_fixture(
  'owner-accepted',
  0,
  'owner.accept.v1',
  repeat('3', 64),
  'e1000000-0000-0000-0000-000000000001'::uuid,
  NULL
);

SELECT ok(
  (
    SELECT revision = 1 AND NOT changed
    FROM owner_drift_replay
  ),
  'the old receipt remains replayable after live run-item drift'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-override', 1, 'owner.stale-catalog',
      repeat('5', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      NULL
    )
  $query$,
  '%newsletter run changed after it was presented%',
  'a new command cannot use selector tokens captured before item drift'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.newsletter_editorial_shortlist_revisions
    WHERE run_id = 'e2000000-0000-0000-0000-000000000001'::uuid
      AND idempotency_key = 'owner.stale-catalog'
  ),
  'selector mismatch rejection writes neither a receipt nor a head advance'
);

UPDATE public.newsletter_daily_run_items
SET confidence_score = 60.00
WHERE id = 'e3000000-0000-0000-0000-000000000006'::uuid;

-- now() is transaction-stable, so explicitly advance row versions while the
-- normal timestamp trigger is disabled. This models updates committed by a
-- later request without introducing sleeps into pgTAP.
UPDATE editorial_shortlist_test_payloads
SET
  catalog_tokens = pg_temp.editorial_shortlist_catalog(run_id),
  entries = pg_temp.editorial_shortlist_override_entries(run_id)
WHERE name = 'owner-override';

ALTER TABLE public.newsletter_daily_run_items DISABLE TRIGGER USER;
UPDATE public.newsletter_daily_run_items
SET
  headline = 'Apple raises guidance — revised',
  updated_at = updated_at + interval '1 second'
WHERE id = 'e3000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.newsletter_daily_run_items ENABLE TRIGGER USER;

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-override', 1, 'owner.stale-item-version',
      repeat('b', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      NULL
    )
  $query$,
  '%shortlist presentation conflict: one or more items changed after presentation%',
  'a stale item snapshot and item timestamp are rejected'
);

ALTER TABLE public.newsletter_daily_run_items DISABLE TRIGGER USER;
UPDATE public.newsletter_daily_run_items
SET headline = 'Apple raises guidance'
WHERE id = 'e3000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.newsletter_daily_run_items ENABLE TRIGGER USER;

UPDATE editorial_shortlist_test_payloads
SET
  catalog_tokens = pg_temp.editorial_shortlist_catalog(run_id),
  entries = pg_temp.editorial_shortlist_override_entries(run_id)
WHERE name = 'owner-override';

ALTER TABLE public.newsletter_drafts DISABLE TRIGGER USER;
UPDATE public.newsletter_drafts
SET updated_at = updated_at + interval '1 second'
WHERE id = 'e4000000-0000-0000-0000-000000000001'::uuid;
ALTER TABLE public.newsletter_drafts ENABLE TRIGGER USER;

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-override', 1, 'owner.stale-draft-version',
      repeat('c', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      NULL
    )
  $query$,
  '%shortlist presentation conflict: one or more items changed after presentation%',
  'a stale draft timestamp is rejected even when selector fields are unchanged'
);

-- Rebase every not-yet-sent malformed fixture onto the latest legitimate
-- source versions so the following failures isolate entry validation rather
-- than being pre-empted by the timestamp fence.
UPDATE editorial_shortlist_test_payloads
SET
  catalog_tokens = pg_temp.editorial_shortlist_catalog(run_id),
  entries = pg_temp.editorial_shortlist_override_entries(run_id)
WHERE name = 'owner-override';

UPDATE editorial_shortlist_test_payloads
SET
  catalog_tokens = pg_temp.editorial_shortlist_catalog(run_id),
  entries = jsonb_set(
    pg_temp.editorial_shortlist_override_entries(run_id),
    '{0,reason_code}',
    'null'::jsonb
  )
WHERE name = 'owner-invalid-reason';

UPDATE editorial_shortlist_test_payloads
SET
  catalog_tokens = pg_temp.editorial_shortlist_catalog(run_id),
  entries = jsonb_set(
    pg_temp.editorial_shortlist_override_entries(run_id),
    '{1,selected_position}',
    '2'::jsonb
  )
WHERE name = 'owner-duplicate-position';

UPDATE editorial_shortlist_test_payloads
SET
  catalog_tokens = pg_temp.editorial_shortlist_catalog(run_id),
  entries = jsonb_set(
    pg_temp.editorial_shortlist_accepted_entries(run_id),
    '{0,evidence_snapshot,headline}',
    '"Tampered headline"'::jsonb
  )
WHERE name = 'owner-tampered-evidence';

UPDATE editorial_shortlist_test_payloads
SET
  catalog_tokens = pg_temp.editorial_shortlist_catalog(run_id),
  entries = jsonb_set(
    pg_temp.editorial_shortlist_accepted_entries(run_id),
    '{0,item_id}',
    to_jsonb('e3000000-0000-0000-0000-000000000031'::text)
  )
WHERE name = 'owner-foreign-item';

UPDATE editorial_shortlist_test_payloads
SET
  catalog_tokens = jsonb_set(
    pg_temp.editorial_shortlist_catalog(run_id),
    '{1,item_id}',
    pg_temp.editorial_shortlist_catalog(run_id) #> '{0,item_id}'
  ),
  entries = pg_temp.editorial_shortlist_accepted_entries(run_id)
WHERE name = 'owner-duplicate-catalog';

INSERT INTO editorial_shortlist_test_payloads (
  name,
  run_id,
  algorithm_version,
  baseline_fingerprint,
  catalog_tokens,
  entries
)
SELECT
  'owner-gapped-position',
  run_id,
  algorithm_version,
  baseline_fingerprint,
  pg_temp.editorial_shortlist_catalog(run_id),
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            pg_temp.editorial_shortlist_accepted_entries(run_id),
            '{3,selected_position}',
            '5'::jsonb
          ),
          '{3,decision}',
          '"demoted"'::jsonb
        ),
        '{3,reason_code}',
        '"audience_fit"'::jsonb
      ),
      '{4,selected_position}',
      'null'::jsonb
    ),
    '{4,decision}',
    '"removed"'::jsonb
  )
FROM editorial_shortlist_test_payloads
WHERE name = 'owner-accepted';

UPDATE editorial_shortlist_test_payloads
SET entries = jsonb_set(entries, '{4,reason_code}', '"stale_story"'::jsonb)
WHERE name = 'owner-gapped-position';

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-duplicate-catalog', 1, 'owner.bad-catalog',
      repeat('6', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      NULL
    )
  $query$,
  '%catalog tokens are invalid%',
  'duplicate selector catalog items are rejected'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-override', 0, 'owner.stale-cas',
      repeat('7', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      NULL
    )
  $query$,
  '%revision conflict: expected 0, current 1%',
  'a stale shortlist compare-and-swap is rejected'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.newsletter_editorial_shortlist_revisions
    WHERE run_id = 'e2000000-0000-0000-0000-000000000001'::uuid
      AND idempotency_key = 'owner.stale-cas'
  )
    AND (
      SELECT revision = 1
      FROM public.newsletter_editorial_shortlist_heads
      WHERE run_id = 'e2000000-0000-0000-0000-000000000001'::uuid
    ),
  'a stale CAS is all-or-none and leaves the current head untouched'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-invalid-reason', 1, 'owner.invalid-reason',
      repeat('8', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      NULL
    )
  $query$,
  '%one or more shortlist entries are invalid%',
  'an override without its structured reason is rejected'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-duplicate-position', 1, 'owner.duplicate-position',
      repeat('9', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      NULL
    )
  $query$,
  '%shortlist positions must be unique%',
  'duplicate selected positions are rejected before insertion'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-gapped-position', 1, 'owner.gapped-position',
      repeat('d', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      NULL
    )
  $query$,
  '%shortlist positions must be contiguous from one%',
  'a unique but gapped selected position sequence is rejected'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-tampered-evidence', 1, 'owner.tampered-evidence',
      repeat('0', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      NULL
    )
  $query$,
  '%shortlist presentation conflict: one or more items changed after presentation%',
  'an entry whose frozen evidence disagrees with the source row is rejected'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'owner-foreign-item', 1, 'owner.foreign-item',
      repeat('f', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      NULL
    )
  $query$,
  '%one or more shortlist entries are invalid%',
  'an entry from another run is rejected'
);

SELECT ok(
  (
    SELECT count(*) = 1
    FROM public.newsletter_editorial_shortlist_revisions
    WHERE run_id = 'e2000000-0000-0000-0000-000000000001'::uuid
  )
    AND (
      SELECT count(*) = 5
      FROM public.newsletter_editorial_shortlist_entries
      WHERE revision_id = (SELECT revision_id FROM owner_first_receipt)
    ),
  'all invalid entry batches leave the revision and entry sets unchanged'
);

CREATE TEMP TABLE owner_second_receipt ON COMMIT DROP AS
SELECT *
FROM pg_temp.save_editorial_shortlist_fixture(
  'owner-override',
  1,
  'owner.override.v2',
  repeat('a', 64),
  'e1000000-0000-0000-0000-000000000001'::uuid,
  NULL
);

SELECT ok(
  (
    SELECT revision = 2 AND changed
    FROM owner_second_receipt
  ),
  'the current owner CAS creates revision two'
);

SELECT ok(
  (
    SELECT head.revision = 2
      AND head.revision_id = receipt.revision_id
      AND head.updated_at = receipt.created_at
    FROM public.newsletter_editorial_shortlist_heads AS head
    CROSS JOIN owner_second_receipt AS receipt
    WHERE head.run_id = 'e2000000-0000-0000-0000-000000000001'::uuid
  ),
  'the run head atomically points at the exact second revision receipt'
);

SELECT ok(
  (
    SELECT count(*) = 2
    FROM public.newsletter_editorial_shortlist_revisions
    WHERE run_id = 'e2000000-0000-0000-0000-000000000001'::uuid
  )
    AND (
      SELECT count(*) = 5
      FROM public.newsletter_editorial_shortlist_entries
      WHERE revision_id = (SELECT revision_id FROM owner_first_receipt)
    )
    AND (
      SELECT count(*) = 6
      FROM public.newsletter_editorial_shortlist_entries
      WHERE revision_id = (SELECT revision_id FROM owner_second_receipt)
    ),
  'revision two advances the head without replacing revision-one history'
);

SELECT ok(
  (
    SELECT count(*) FILTER (WHERE decision = 'promoted') = 1
      AND count(*) FILTER (WHERE decision = 'demoted') = 1
      AND count(*) FILTER (WHERE decision = 'removed') = 1
      AND count(*) FILTER (WHERE decision = 'added') = 1
      AND count(*) FILTER (WHERE decision = 'retained') = 2
    FROM public.newsletter_editorial_shortlist_entries
    WHERE revision_id = (SELECT revision_id FROM owner_second_receipt)
  ),
  'the override revision preserves its full editorial decision taxonomy'
);

CREATE TEMP TABLE owner_old_receipt_after_head_advance ON COMMIT DROP AS
SELECT *
FROM pg_temp.save_editorial_shortlist_fixture(
  'owner-accepted',
  0,
  'owner.accept.v1',
  repeat('3', 64),
  'e1000000-0000-0000-0000-000000000001'::uuid,
  NULL
);

SELECT ok(
  (
    SELECT old_receipt.revision = 1
      AND old_receipt.revision_id = original.revision_id
      AND NOT old_receipt.changed
    FROM owner_old_receipt_after_head_advance AS old_receipt
    CROSS JOIN owner_first_receipt AS original
  )
    AND (
      SELECT head.revision = 2
        AND head.revision_id = current_receipt.revision_id
      FROM public.newsletter_editorial_shortlist_heads AS head
      CROSS JOIN owner_second_receipt AS current_receipt
      WHERE head.run_id = 'e2000000-0000-0000-0000-000000000001'::uuid
    ),
  'an old receipt remains addressable without rewinding the current head'
);

SELECT throws_like(
  $query$
    UPDATE public.newsletter_editorial_shortlist_revisions
    SET algorithm_version = 'tampered'
    WHERE id = (SELECT revision_id FROM owner_first_receipt)
  $query$,
  '%history is append-only%',
  'revision rows reject in-place updates even from the table owner'
);

SELECT throws_like(
  $query$
    UPDATE public.newsletter_editorial_shortlist_entries
    SET note = 'tampered'
    WHERE revision_id = (SELECT revision_id FROM owner_second_receipt)
      AND decision = 'added'
  $query$,
  '%history is append-only%',
  'entry rows reject in-place updates even from the table owner'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'anonymous-accepted', 0, 'anonymous.wrong-session',
      repeat('1', 64),
      NULL,
      'another-browser-session'
    )
  $query$,
  '%shortlist session does not own the newsletter daily run%',
  'an anonymous browser cannot save another session''s run'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'anonymous-accepted', 0, 'anonymous.actor-smuggle',
      repeat('2', 64),
      'e1000000-0000-0000-0000-000000000001'::uuid,
      'anonymous-browser-session'
    )
  $query$,
  '%shortlist session does not own the newsletter daily run%',
  'an ownerless run rejects an injected authenticated actor'
);

CREATE TEMP TABLE anonymous_first_receipt ON COMMIT DROP AS
SELECT *
FROM pg_temp.save_editorial_shortlist_fixture(
  'anonymous-accepted',
  0,
  'anonymous.accept.v1',
  repeat('3', 64),
  NULL,
  'anonymous-browser-session'
);

SELECT ok(
  (
    SELECT revision = 1 AND changed
    FROM anonymous_first_receipt
  )
    AND (
      SELECT actor_id IS NULL
        AND session_id = 'anonymous-browser-session'
      FROM public.newsletter_editorial_shortlist_revisions
      WHERE id = (SELECT revision_id FROM anonymous_first_receipt)
    ),
  'the correct anonymous session creates a session-scoped revision'
);

CREATE TEMP TABLE anonymous_exact_replay ON COMMIT DROP AS
SELECT *
FROM pg_temp.save_editorial_shortlist_fixture(
  'anonymous-accepted',
  0,
  'anonymous.accept.v1',
  repeat('3', 64),
  NULL,
  'anonymous-browser-session'
);

SELECT ok(
  (
    SELECT replay.revision_id = original.revision_id
      AND replay.revision = 1
      AND NOT replay.changed
    FROM anonymous_exact_replay AS replay
    CROSS JOIN anonymous_first_receipt AS original
  ),
  'an anonymous exact replay returns its original session-scoped receipt'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'anonymous-accepted', 0, 'anonymous.accept.v1',
      repeat('3', 64),
      NULL,
      'another-browser-session'
    )
  $query$,
  '%shortlist replay scope does not match%',
  'an anonymous receipt cannot be replayed by another session'
);

SELECT throws_like(
  $query$
    SELECT *
    FROM pg_temp.save_editorial_shortlist_fixture(
      'anonymous-accepted', 1, 'anonymous.accept.v1',
      repeat('4', 64),
      NULL,
      'anonymous-browser-session'
    )
  $query$,
  '%idempotency key was reused with a different request%',
  'an anonymous idempotency key cannot represent a different command'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.newsletter_editorial_shortlist_revisions
    WHERE run_id = 'e2000000-0000-0000-0000-000000000002'::uuid
  ),
  1::bigint,
  'anonymous retries and rejected scope changes create no duplicates'
);

CREATE TEMP TABLE deletion_receipt ON COMMIT DROP AS
SELECT *
FROM pg_temp.save_editorial_shortlist_fixture(
  'deletion-accepted',
  0,
  'deletion.accept.v1',
  repeat('5', 64),
  'e1000000-0000-0000-0000-000000000001'::uuid,
  NULL
);

DELETE FROM public.newsletter_daily_run_items
WHERE id = 'e3000000-0000-0000-0000-000000000021'::uuid;

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.newsletter_daily_run_items
    WHERE id = 'e3000000-0000-0000-0000-000000000021'::uuid
  )
    AND EXISTS (
      SELECT 1
      FROM public.newsletter_editorial_shortlist_entries
      WHERE revision_id = (SELECT revision_id FROM deletion_receipt)
        AND item_id = 'e3000000-0000-0000-0000-000000000021'::uuid
        AND evidence_snapshot ->> 'headline' = 'Oracle bookings accelerate'
    )
    AND EXISTS (
      SELECT 1
      FROM public.newsletter_editorial_shortlist_heads
      WHERE run_id = 'e2000000-0000-0000-0000-000000000003'::uuid
    ),
  'deleting one queue item preserves its frozen evidence, revision, and head'
);

CREATE TEMP TABLE deletion_replay_after_item_delete ON COMMIT DROP AS
SELECT *
FROM pg_temp.save_editorial_shortlist_fixture(
  'deletion-accepted',
  0,
  'deletion.accept.v1',
  repeat('5', 64),
  'e1000000-0000-0000-0000-000000000001'::uuid,
  NULL
);

SELECT ok(
  (
    SELECT replay.revision_id = original.revision_id
      AND replay.revision = 1
      AND NOT replay.changed
    FROM deletion_replay_after_item_delete AS replay
    CROSS JOIN deletion_receipt AS original
  ),
  'a committed receipt remains replayable after its source item is deleted'
);

DELETE FROM public.newsletter_daily_runs
WHERE id = 'e2000000-0000-0000-0000-000000000003'::uuid;

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.newsletter_editorial_shortlist_revisions
    WHERE run_id = 'e2000000-0000-0000-0000-000000000003'::uuid
  )
    AND NOT EXISTS (
      SELECT 1
      FROM public.newsletter_editorial_shortlist_entries
      WHERE revision_id = (SELECT revision_id FROM deletion_receipt)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.newsletter_editorial_shortlist_heads
      WHERE run_id = 'e2000000-0000-0000-0000-000000000003'::uuid
    ),
  'deleting the parent run cascades the complete editorial ledger'
);

SELECT * FROM finish();

ROLLBACK;
