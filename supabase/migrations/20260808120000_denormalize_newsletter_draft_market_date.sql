-- Newsletter Operations reports activity for the business date an issue
-- belongs to, which is not necessarily the wall-clock date it was generated.
-- A retry can legitimately create an August 7 issue on August 8. Keep that
-- distinction in one indexed, trigger-owned scalar instead of reparsing every
-- draft document on each 15-second operations poll.

BEGIN;

ALTER TABLE public.newsletter_drafts
  ADD COLUMN IF NOT EXISTS source_market_date date;

-- This is a derived-column backfill, not an editorial change. Preserve open
-- editor CAS tokens while the historical rows are classified.
ALTER TABLE public.newsletter_drafts
  DISABLE TRIGGER newsletter_drafts_updated_at_trigger;

UPDATE public.newsletter_drafts AS draft
SET source_market_date = CASE
  WHEN coalesce(
    nullif(btrim(draft.draft_json #>> '{source,dailyBatch,marketDate}'), ''),
    nullif(btrim(draft.draft_json #>> '{source,catalyst,marketDate}'), '')
  ) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND pg_catalog.pg_input_is_valid(
    coalesce(
      nullif(btrim(draft.draft_json #>> '{source,dailyBatch,marketDate}'), ''),
      nullif(btrim(draft.draft_json #>> '{source,catalyst,marketDate}'), '')
    ),
    'date'
  )
    THEN coalesce(
      nullif(btrim(draft.draft_json #>> '{source,dailyBatch,marketDate}'), ''),
      nullif(btrim(draft.draft_json #>> '{source,catalyst,marketDate}'), '')
    )::date
  ELSE (draft.generated_at AT TIME ZONE 'America/New_York')::date
END;

ALTER TABLE public.newsletter_drafts
  ENABLE TRIGGER newsletter_drafts_updated_at_trigger;

ALTER TABLE public.newsletter_drafts
  ALTER COLUMN source_market_date SET NOT NULL;

-- Extend the authoritative archive-summary trigger so old and new
-- application instances cannot make the scalar disagree with draft_json.
CREATE OR REPLACE FUNCTION public.sync_newsletter_draft_archive_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  derived_featured_tickers text[];
  derived_ticker_symbols text[];
  fallback_generated_at timestamptz;
  draft_subject_line text;
  source_market_date_text text;
BEGIN
  IF pg_catalog.jsonb_typeof(NEW.draft_json -> 'featuredTickers') = 'array' THEN
    SELECT coalesce(
      pg_catalog.array_agg(featured.symbol ORDER BY featured.symbol),
      ARRAY[]::text[]
    )
    INTO derived_featured_tickers
    FROM (
      SELECT DISTINCT pg_catalog.upper(pg_catalog.btrim(value)) AS symbol
      FROM pg_catalog.jsonb_array_elements_text(
        NEW.draft_json -> 'featuredTickers'
      ) AS value
      WHERE pg_catalog.btrim(value) <> ''
    ) AS featured;
  ELSE
    derived_featured_tickers := ARRAY[pg_catalog.upper(NEW.ticker)];
  END IF;

  SELECT coalesce(
    pg_catalog.array_agg(tickers.symbol ORDER BY tickers.symbol),
    ARRAY[]::text[]
  )
  INTO derived_ticker_symbols
  FROM (
    SELECT DISTINCT symbol
    FROM (
      SELECT pg_catalog.upper(NEW.ticker) AS symbol
      UNION ALL
      SELECT pg_catalog.upper(pg_catalog.btrim(value))
      FROM pg_catalog.jsonb_array_elements_text(
        CASE
          WHEN pg_catalog.jsonb_typeof(
            NEW.draft_json -> 'featuredTickers'
          ) = 'array'
            THEN NEW.draft_json -> 'featuredTickers'
          ELSE '[]'::jsonb
        END
      ) AS value
      WHERE pg_catalog.btrim(value) <> ''
    ) AS combined
    WHERE symbol <> ''
  ) AS tickers;

  fallback_generated_at := CASE
    WHEN TG_OP = 'UPDATE' THEN OLD.generated_at
    ELSE coalesce(NEW.created_at, pg_catalog.clock_timestamp())
  END;

  NEW.format := CASE
    WHEN NEW.draft_json ->> 'format' = 'market_roundup'
      THEN 'market_roundup'
    ELSE 'single_stock'
  END;
  NEW.featured_tickers := derived_featured_tickers;
  NEW.ticker_symbols := derived_ticker_symbols;
  NEW.generated_at := CASE
    WHEN pg_catalog.pg_input_is_valid(
      NEW.draft_json ->> 'generatedAt',
      'timestamp with time zone'
    )
      THEN (NEW.draft_json ->> 'generatedAt')::timestamptz
    ELSE coalesce(fallback_generated_at, pg_catalog.clock_timestamp())
  END;

  source_market_date_text := coalesce(
    nullif(
      pg_catalog.btrim(
        NEW.draft_json #>> '{source,dailyBatch,marketDate}'
      ),
      ''
    ),
    nullif(
      pg_catalog.btrim(
        NEW.draft_json #>> '{source,catalyst,marketDate}'
      ),
      ''
    )
  );
  NEW.source_market_date := CASE
    WHEN source_market_date_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND pg_catalog.pg_input_is_valid(source_market_date_text, 'date')
      THEN source_market_date_text::date
    ELSE (NEW.generated_at AT TIME ZONE 'America/New_York')::date
  END;

  NEW.block_count := CASE
    WHEN pg_catalog.jsonb_typeof(NEW.draft_json -> 'blocks') = 'array'
      THEN pg_catalog.jsonb_array_length(NEW.draft_json -> 'blocks')
    ELSE 0
  END;
  NEW.attached_chart_count := CASE
    WHEN pg_catalog.jsonb_typeof(
      NEW.draft_json -> 'source' -> 'attachedChartIds'
    ) = 'array'
      THEN pg_catalog.jsonb_array_length(
        NEW.draft_json -> 'source' -> 'attachedChartIds'
      )
    WHEN pg_catalog.jsonb_typeof(NEW.draft_json -> 'blocks') = 'array'
      THEN pg_catalog.jsonb_array_length(NEW.draft_json -> 'blocks')
    ELSE 0
  END;

  draft_subject_line := pg_catalog.btrim(
    coalesce(NEW.draft_json ->> 'subjectLine', '')
  );
  IF draft_subject_line <> '' THEN
    NEW.subject_line := draft_subject_line;
  END IF;

  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_owner_source_market_date
  ON public.newsletter_drafts(
    owner_id,
    source_market_date,
    generated_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_session_source_market_date
  ON public.newsletter_drafts(
    session_id,
    source_market_date,
    generated_at DESC,
    id DESC
  )
  WHERE owner_id IS NULL;

COMMENT ON COLUMN public.newsletter_drafts.source_market_date IS
  'Trigger-derived editorial business date. Daily/catalyst source marketDate wins; manual and legacy drafts fall back to generated_at in America/New_York.';

NOTIFY pgrst, 'reload schema';

COMMIT;
