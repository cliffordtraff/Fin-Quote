BEGIN;

SET LOCAL search_path = public, extensions;

SELECT no_plan();

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'newsletter_drafts'
      AND column_name = 'source_market_date'
      AND data_type = 'date'
      AND is_nullable = 'NO'
  ),
  'newsletter drafts carry a required scalar editorial market date'
);

SELECT ok(
  position(
    'NEW.source_market_date' IN pg_get_functiondef(
      'public.sync_newsletter_draft_archive_summary()'::regprocedure
    )
  ) > 0,
  'the authoritative archive trigger owns the scalar market date'
);

SELECT ok(
  to_regclass('public.idx_newsletter_drafts_owner_source_market_date')
    IS NOT NULL
    AND to_regclass(
      'public.idx_newsletter_drafts_session_source_market_date'
    ) IS NOT NULL,
  'owner and anonymous-session operation lookups have bounded market-date indexes'
);

INSERT INTO auth.users (id)
VALUES ('d1000000-0000-0000-0000-000000000001'::uuid)
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
  created_at,
  updated_at
)
VALUES
  (
    'd2000000-0000-0000-0000-000000000001'::uuid,
    'd1000000-0000-0000-0000-000000000001'::uuid,
    'market-date-daily',
    'AAPL',
    'draft',
    'Daily retry',
    jsonb_build_object(
      'ticker', 'AAPL',
      'generatedAt', '2026-08-08T13:00:00.000Z',
      'subjectLine', 'Daily retry',
      'blocks', '[]'::jsonb,
      'source', jsonb_build_object(
        'type', 'daily_batch',
        'dailyBatch', jsonb_build_object('marketDate', '2026-08-07')
      )
    ),
    '<html></html>',
    '2026-08-08T13:00:00.000Z'::timestamptz,
    '2026-08-08T13:01:00.000Z'::timestamptz
  ),
  (
    'd2000000-0000-0000-0000-000000000002'::uuid,
    'd1000000-0000-0000-0000-000000000001'::uuid,
    'market-date-catalyst',
    'MSFT',
    'draft',
    'Catalyst retry',
    jsonb_build_object(
      'ticker', 'MSFT',
      'generatedAt', '2026-08-09T14:00:00.000Z',
      'subjectLine', 'Catalyst retry',
      'blocks', '[]'::jsonb,
      'source', jsonb_build_object(
        'type', 'catalyst',
        'catalyst', jsonb_build_object('marketDate', '2026-08-06')
      )
    ),
    '<html></html>',
    '2026-08-09T14:00:00.000Z'::timestamptz,
    '2026-08-09T14:01:00.000Z'::timestamptz
  ),
  (
    'd2000000-0000-0000-0000-000000000003'::uuid,
    'd1000000-0000-0000-0000-000000000001'::uuid,
    'market-date-manual',
    'NVDA',
    'draft',
    'Late manual issue',
    jsonb_build_object(
      'ticker', 'NVDA',
      'generatedAt', '2026-08-08T02:30:00.000Z',
      'subjectLine', 'Late manual issue',
      'blocks', '[]'::jsonb,
      'source', jsonb_build_object('type', 'manual')
    ),
    '<html></html>',
    '2026-08-08T02:30:00.000Z'::timestamptz,
    '2026-08-08T02:31:00.000Z'::timestamptz
  );

SELECT is(
  (
    SELECT source_market_date::text
    FROM public.newsletter_drafts
    WHERE id = 'd2000000-0000-0000-0000-000000000001'::uuid
  ),
  '2026-08-07',
  'a next-day daily retry remains attached to its source business date'
);

SELECT is(
  (
    SELECT source_market_date::text
    FROM public.newsletter_drafts
    WHERE id = 'd2000000-0000-0000-0000-000000000002'::uuid
  ),
  '2026-08-06',
  'a catalyst draft uses its reviewed market date rather than generation time'
);

SELECT is(
  (
    SELECT source_market_date::text
    FROM public.newsletter_drafts
    WHERE id = 'd2000000-0000-0000-0000-000000000003'::uuid
  ),
  '2026-08-07',
  'manual drafts fall back to the generated instant in America/New_York'
);

UPDATE public.newsletter_drafts
SET source_market_date = '2040-01-01'::date
WHERE id = 'd2000000-0000-0000-0000-000000000001'::uuid;

SELECT is(
  (
    SELECT source_market_date::text
    FROM public.newsletter_drafts
    WHERE id = 'd2000000-0000-0000-0000-000000000001'::uuid
  ),
  '2026-08-07',
  'a direct scalar write cannot forge the trigger-derived business date'
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
  source_draft_updated_at,
  created_at,
  updated_at
)
VALUES (
  'd3000000-0000-0000-0000-000000000003'::uuid,
  'd2000000-0000-0000-0000-000000000003'::uuid,
  'd1000000-0000-0000-0000-000000000001'::uuid,
  'publication-market-date',
  'post-market-date',
  'Late manual issue',
  'https://app.beehiiv.com/posts/post-market-date',
  'market-date-content',
  '2026-08-08T02:31:00.000Z'::timestamptz,
  '2026-08-08T03:00:00.000Z'::timestamptz,
  '2026-08-08T03:00:00.000Z'::timestamptz
);

CREATE FUNCTION pg_temp.replay_newsletter_market_date_backfill()
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
    WHERE migration.version = '20260808120000'
      AND (
        lower(migration_statement.statement) LIKE
          '%disable trigger newsletter_drafts_updated_at_trigger%'
        OR lower(migration_statement.statement) LIKE
          '%update public.newsletter_drafts as draft%set source_market_date%'
        OR lower(migration_statement.statement) LIKE
          '%enable trigger newsletter_drafts_updated_at_trigger%'
      )
    ORDER BY migration_statement.statement_order
  LOOP
    EXECUTE sql_text;
    replayed := replayed + 1;
  END LOOP;

  RETURN replayed;
END;
$$;

CREATE TEMP TABLE market_date_backfill_replay ON COMMIT DROP AS
SELECT pg_temp.replay_newsletter_market_date_backfill() AS statement_count;

SELECT is(
  (SELECT statement_count FROM market_date_backfill_replay),
  3,
  'the recorded backfill brackets its data rewrite with the exact timestamp trigger'
);

SELECT is(
  (
    SELECT updated_at::text
    FROM public.newsletter_drafts
    WHERE id = 'd2000000-0000-0000-0000-000000000003'::uuid
  ),
  '2026-08-08 02:31:00+00',
  'the market-date backfill preserves historical draft CAS timestamps'
);

SELECT is(
  (
    SELECT updated_at::text
    FROM public.newsletter_beehiiv_deliveries
    WHERE id = 'd3000000-0000-0000-0000-000000000003'::uuid
  ),
  '2026-08-08 03:00:00+00',
  'a derived draft backfill does not falsify Beehiiv delivery recency'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.newsletter_drafts'::regclass
      AND tgname = 'newsletter_drafts_updated_at_trigger'
      AND NOT tgisinternal
      AND tgenabled = 'O'
  ),
  'the timestamp trigger is enabled again after the backfill'
);

SELECT * FROM finish();

ROLLBACK;
