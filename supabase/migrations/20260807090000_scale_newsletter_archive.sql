-- Keep newsletter history fast and recoverable as the archive grows.
-- Summary fields avoid transferring the full draft JSON for every archive row,
-- while archived_at supports a reversible bulk action instead of bulk delete.

ALTER TABLE public.newsletter_drafts
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'single_stock',
  ADD COLUMN IF NOT EXISTS featured_tickers text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS ticker_symbols text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS block_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attached_chart_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- These are derived-column backfills, not user edits. Preserve the historical
-- CAS token while they run so every open editor is not made stale at deploy
-- time. Disable only the known timestamp trigger and restore it immediately.
ALTER TABLE public.newsletter_drafts
  DISABLE TRIGGER newsletter_drafts_updated_at_trigger;

UPDATE public.newsletter_drafts AS draft
SET
  format = CASE
    WHEN draft.draft_json ->> 'format' = 'market_roundup'
      THEN 'market_roundup'
    ELSE 'single_stock'
  END,
  featured_tickers = CASE
    WHEN jsonb_typeof(draft.draft_json -> 'featuredTickers') = 'array'
      THEN ARRAY(
        SELECT DISTINCT upper(trim(value))
        FROM jsonb_array_elements_text(draft.draft_json -> 'featuredTickers') AS value
        WHERE trim(value) <> ''
        ORDER BY upper(trim(value))
      )
    ELSE ARRAY[upper(draft.ticker)]
  END,
  ticker_symbols = ARRAY(
    SELECT DISTINCT symbol
    FROM (
      SELECT upper(draft.ticker) AS symbol
      UNION ALL
      SELECT upper(trim(value))
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(draft.draft_json -> 'featuredTickers') = 'array'
            THEN draft.draft_json -> 'featuredTickers'
          ELSE '[]'::jsonb
        END
      ) AS value
      WHERE trim(value) <> ''
    ) AS symbols
    ORDER BY symbol
  ),
  generated_at = CASE
    WHEN pg_catalog.pg_input_is_valid(
      draft.draft_json ->> 'generatedAt',
      'timestamp with time zone'
    )
      THEN (draft.draft_json ->> 'generatedAt')::timestamptz
    ELSE draft.created_at
  END,
  block_count = CASE
    WHEN jsonb_typeof(draft.draft_json -> 'blocks') = 'array'
      THEN jsonb_array_length(draft.draft_json -> 'blocks')
    ELSE 0
  END,
  attached_chart_count = CASE
    WHEN jsonb_typeof(draft.draft_json -> 'source' -> 'attachedChartIds') = 'array'
      THEN jsonb_array_length(draft.draft_json -> 'source' -> 'attachedChartIds')
    WHEN jsonb_typeof(draft.draft_json -> 'blocks') = 'array'
      THEN jsonb_array_length(draft.draft_json -> 'blocks')
    ELSE 0
  END;

UPDATE public.newsletter_drafts
SET generated_at = created_at
WHERE generated_at IS NULL;

ALTER TABLE public.newsletter_drafts
  ENABLE TRIGGER newsletter_drafts_updated_at_trigger;

ALTER TABLE public.newsletter_drafts
  ALTER COLUMN generated_at SET NOT NULL,
  DROP CONSTRAINT IF EXISTS newsletter_drafts_format_check,
  DROP CONSTRAINT IF EXISTS newsletter_drafts_block_count_check,
  DROP CONSTRAINT IF EXISTS newsletter_drafts_attached_chart_count_check;

ALTER TABLE public.newsletter_drafts
  ADD CONSTRAINT newsletter_drafts_format_check
    CHECK (format IN ('single_stock', 'market_roundup')),
  ADD CONSTRAINT newsletter_drafts_block_count_check
    CHECK (block_count >= 0),
  ADD CONSTRAINT newsletter_drafts_attached_chart_count_check
    CHECK (attached_chart_count >= 0);

-- Keep the compact archive projection correct even while an older application
-- instance is still writing only ticker, subject_line, and draft_json. This
-- trigger is deliberately authoritative: callers cannot make the searchable
-- scalar fields disagree with the document they summarize.
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

DROP TRIGGER IF EXISTS newsletter_drafts_archive_summary_trigger
  ON public.newsletter_drafts;
CREATE TRIGGER newsletter_drafts_archive_summary_trigger
  BEFORE INSERT OR UPDATE ON public.newsletter_drafts
  FOR EACH ROW EXECUTE FUNCTION public.sync_newsletter_draft_archive_summary();

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_owner_archive_updated
  ON public.newsletter_drafts(owner_id, archived_at, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_owner_status_archive_updated
  ON public.newsletter_drafts(
    owner_id,
    status,
    archived_at,
    updated_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_owner_archive_generated
  ON public.newsletter_drafts(owner_id, archived_at, generated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_owner_status_archive_generated
  ON public.newsletter_drafts(
    owner_id,
    status,
    archived_at,
    generated_at DESC,
    id DESC
  );

-- Archive visibility can be "all" or "archived" as well as active. Those
-- views cannot preserve generated_at ordering through an index whose second
-- key is a varying archived_at value, so keep general owner and owner+status
-- keyset paths too.
CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_owner_generated
  ON public.newsletter_drafts(owner_id, generated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_owner_status_generated
  ON public.newsletter_drafts(
    owner_id,
    status,
    generated_at DESC,
    id DESC
  );

-- Anonymous drafts are isolated by the durable session cookie rather than an
-- owner UUID. Partial session indexes keep one anonymous archive from scanning
-- every other ownerless session while avoiding duplicate entries for signed-in
-- drafts.
CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_session_archive_generated
  ON public.newsletter_drafts(
    session_id,
    archived_at,
    generated_at DESC,
    id DESC
  )
  WHERE owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_session_status_archive_generated
  ON public.newsletter_drafts(
    session_id,
    status,
    archived_at,
    generated_at DESC,
    id DESC
  )
  WHERE owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_session_generated
  ON public.newsletter_drafts(session_id, generated_at DESC, id DESC)
  WHERE owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_session_status_generated
  ON public.newsletter_drafts(
    session_id,
    status,
    generated_at DESC,
    id DESC
  )
  WHERE owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_ticker_symbols
  ON public.newsletter_drafts USING gin(ticker_symbols);

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_subject_trgm
  ON public.newsletter_drafts USING gin(subject_line gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_newsletter_drafts_ticker_trgm
  ON public.newsletter_drafts USING gin(ticker gin_trgm_ops);

ALTER TABLE public.newsletter_chart_library
  ADD COLUMN IF NOT EXISTS scene_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS scene_hash text,
  ADD COLUMN IF NOT EXISTS image_sha256 text,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS renderer_contract text;

-- Provenance reconstruction likewise must not rewrite chart-library recency.
ALTER TABLE public.newsletter_chart_library
  DISABLE TRIGGER newsletter_chart_library_updated_at_trigger;

UPDATE public.newsletter_chart_library
SET
  scene_hash = coalesce(scene_hash, 'legacy-md5:' || md5(chart_spec::text)),
  image_sha256 = coalesce(
    image_sha256,
    substring(image_path FROM '([0-9a-f]{64})\.png$')
  ),
  captured_at = coalesce(captured_at, created_at),
  renderer_contract = coalesce(renderer_contract, 'legacy-reconstructed-v0');

ALTER TABLE public.newsletter_chart_library
  ENABLE TRIGGER newsletter_chart_library_updated_at_trigger;

ALTER TABLE public.newsletter_chart_library
  ALTER COLUMN scene_hash SET NOT NULL,
  ALTER COLUMN captured_at SET NOT NULL,
  ALTER COLUMN renderer_contract SET NOT NULL,
  DROP CONSTRAINT IF EXISTS newsletter_chart_library_scene_version_check;

ALTER TABLE public.newsletter_chart_library
  ADD CONSTRAINT newsletter_chart_library_scene_version_check
    CHECK (scene_version = 1);

-- An old application instance does not know about capture provenance yet. Let
-- it finish in-flight writes, but label that evidence as legacy so the new
-- application requires a trusted recapture before publication.
CREATE OR REPLACE FUNCTION public.sync_newsletter_chart_library_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.scene_hash IS NULL OR pg_catalog.btrim(NEW.scene_hash) = '' THEN
    NEW.scene_hash := 'legacy-md5:' || pg_catalog.md5(NEW.chart_spec::text);
  END IF;
  IF NEW.captured_at IS NULL THEN
    NEW.captured_at := coalesce(
      NEW.created_at,
      pg_catalog.clock_timestamp()
    );
  END IF;
  IF NEW.renderer_contract IS NULL
    OR pg_catalog.btrim(NEW.renderer_contract) = '' THEN
    NEW.renderer_contract := 'legacy-reconstructed-v0';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.chart_spec IS DISTINCT FROM OLD.chart_spec
    AND NEW.scene_hash IS NOT DISTINCT FROM OLD.scene_hash THEN
    NEW.scene_hash := 'legacy-md5:' || pg_catalog.md5(NEW.chart_spec::text);
    NEW.image_sha256 := NULL;
    NEW.captured_at := pg_catalog.clock_timestamp();
    NEW.renderer_contract := 'legacy-reconstructed-v0';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS newsletter_chart_library_provenance_trigger
  ON public.newsletter_chart_library;
CREATE TRIGGER newsletter_chart_library_provenance_trigger
  BEFORE INSERT OR UPDATE ON public.newsletter_chart_library
  FOR EACH ROW EXECUTE FUNCTION public.sync_newsletter_chart_library_provenance();

REVOKE EXECUTE ON FUNCTION public.sync_newsletter_draft_archive_summary()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_newsletter_chart_library_provenance()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_newsletter_draft_archive_summary()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_newsletter_chart_library_provenance()
  TO service_role;

ALTER TABLE public.newsletter_draft_events
  DROP CONSTRAINT IF EXISTS newsletter_draft_events_event_type_check;

ALTER TABLE public.newsletter_draft_events
  ADD CONSTRAINT newsletter_draft_events_event_type_check
  CHECK (
    event_type IN (
      'created',
      'status_changed',
      'chart_attached',
      'publication_recorded',
      'publication_url_updated',
      'beehiiv_draft_created',
      'beehiiv_draft_synced',
      'beehiiv_scheduled',
      'beehiiv_published',
      'beehiiv_archived',
      'archived',
      'restored'
    )
  );

-- `now()` is fixed at transaction start. Using it directly in the historical
-- trigger meant two saves in one transaction could retain the same CAS token.
-- Always advance updated_at, even when the wall clock ties the prior value.
CREATE OR REPLACE FUNCTION public.set_newsletter_draft_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := GREATEST(
    pg_catalog.clock_timestamp(),
    OLD.updated_at + interval '1 microsecond'
  );
  RETURN NEW;
END;
$$;

-- Drafts, chart evidence, and their event ledger are mutated only through the
-- server/service-role paths. Owner RLS still protects browser reads, while
-- removing browser writes prevents archive-CAS bypasses, hard deletes, forged
-- event receipts, and provenance rewrites.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.newsletter_drafts
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.newsletter_chart_library
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.newsletter_draft_events
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can insert own newsletter drafts"
  ON public.newsletter_drafts;
DROP POLICY IF EXISTS "Users can update own newsletter drafts"
  ON public.newsletter_drafts;
DROP POLICY IF EXISTS "Users can delete own newsletter drafts"
  ON public.newsletter_drafts;
DROP POLICY IF EXISTS "Users can insert own newsletter charts"
  ON public.newsletter_chart_library;
DROP POLICY IF EXISTS "Users can update own newsletter charts"
  ON public.newsletter_chart_library;
DROP POLICY IF EXISTS "Users can delete own newsletter charts"
  ON public.newsletter_chart_library;
DROP POLICY IF EXISTS "Users can insert own newsletter draft events"
  ON public.newsletter_draft_events;

CREATE OR REPLACE FUNCTION public.bulk_set_newsletter_draft_archive_state(
  p_owner_id uuid,
  p_action text,
  p_items jsonb,
  p_idempotency_key text
)
RETURNS TABLE (
  id uuid,
  archived_at timestamptz,
  updated_at timestamptz,
  changed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_count integer;
  parsed_count integer;
  unique_count integer;
  matched_count integer;
  replay_count integer;
  changed_at timestamptz := clock_timestamp();
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'owner_id is required';
  END IF;
  IF p_action NOT IN ('archive', 'restore') THEN
    RAISE EXCEPTION 'invalid archive action';
  END IF;
  IF p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9_-]{8,100}$' THEN
    RAISE EXCEPTION 'invalid idempotency key';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be an array';
  END IF;

  requested_count := jsonb_array_length(p_items);
  IF requested_count < 1 OR requested_count > 100 THEN
    RAISE EXCEPTION 'items must contain between 1 and 100 drafts';
  END IF;

  SELECT count(*), count(DISTINCT item.id)
  INTO parsed_count, unique_count
  FROM jsonb_to_recordset(p_items)
    AS item(id uuid, expected_updated_at timestamptz)
  WHERE item.id IS NOT NULL
    AND item.expected_updated_at IS NOT NULL;

  IF parsed_count <> requested_count THEN
    RAISE EXCEPTION 'items require valid id and expected_updated_at values';
  END IF;
  IF unique_count <> requested_count THEN
    RAISE EXCEPTION 'items must contain unique draft ids';
  END IF;

  -- Serialize retries for one logical operation before inspecting its event
  -- receipts. This makes a concurrent retry observe either zero or all events,
  -- never the first caller's in-flight intermediate state.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat(
        'newsletter-archive:',
        p_owner_id::text,
        ':',
        p_action,
        ':',
        p_idempotency_key
      ),
      0
    )
  );

  SELECT count(*)
  INTO replay_count
  FROM public.newsletter_draft_events AS event
  JOIN jsonb_to_recordset(p_items) AS item(id uuid, expected_updated_at timestamptz)
    ON event.draft_id = item.id
  WHERE event.owner_id = p_owner_id
    AND event.dedupe_key = concat(
      'archive:',
      p_idempotency_key,
      ':',
      p_action,
      ':',
      item.id::text
    );

  IF replay_count = requested_count THEN
    RETURN QUERY
    SELECT draft.id, draft.archived_at, draft.updated_at, false
    FROM public.newsletter_drafts AS draft
    JOIN jsonb_to_recordset(p_items) AS item(id uuid, expected_updated_at timestamptz)
      ON draft.id = item.id
    WHERE draft.owner_id = p_owner_id
    ORDER BY draft.id;
    RETURN;
  ELSIF replay_count <> 0 THEN
    RAISE EXCEPTION 'incomplete idempotency replay';
  END IF;

  -- Lock every matching row in deterministic id order before accepting the
  -- CAS set. If even one row is stale or outside the owner scope, the exception
  -- aborts the whole function before any draft or event mutation can occur.
  SELECT count(*)
  INTO matched_count
  FROM (
    SELECT draft.id
    FROM public.newsletter_drafts AS draft
    JOIN jsonb_to_recordset(p_items)
      AS item(id uuid, expected_updated_at timestamptz)
      ON draft.id = item.id
     AND draft.updated_at = item.expected_updated_at
    WHERE draft.owner_id = p_owner_id
    ORDER BY draft.id
    FOR UPDATE OF draft
  ) AS locked_drafts;

  IF matched_count <> requested_count THEN
    RAISE EXCEPTION 'one or more newsletter drafts changed or are outside this scope';
  END IF;

  RETURN QUERY
  WITH requested AS (
    SELECT item.id, item.expected_updated_at
    FROM jsonb_to_recordset(p_items) AS item(id uuid, expected_updated_at timestamptz)
  ),
  candidates AS (
    SELECT
      draft.id,
      draft.status,
      draft.beehiiv_url,
      draft.session_id,
      CASE
        WHEN p_action = 'archive' THEN draft.archived_at IS NULL
        ELSE draft.archived_at IS NOT NULL
      END AS will_change
    FROM public.newsletter_drafts AS draft
    JOIN requested
      ON requested.id = draft.id
     AND requested.expected_updated_at = draft.updated_at
    WHERE draft.owner_id = p_owner_id
    FOR UPDATE
  ),
  updated AS (
    UPDATE public.newsletter_drafts AS draft
    SET archived_at = CASE
      WHEN p_action = 'archive' THEN changed_at
      ELSE NULL
    END
    FROM candidates
    WHERE draft.id = candidates.id
      AND candidates.will_change
    RETURNING draft.id, draft.archived_at, draft.updated_at
  ),
  events AS (
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
    SELECT
      candidates.id,
      p_owner_id,
      candidates.session_id,
      CASE WHEN p_action = 'archive' THEN 'archived' ELSE 'restored' END,
      candidates.status,
      candidates.status,
      candidates.beehiiv_url,
      concat(
        'archive:',
        p_idempotency_key,
        ':',
        p_action,
        ':',
        candidates.id::text
      ),
      jsonb_build_object(
        'action', p_action,
        'idempotencyKey', p_idempotency_key,
        'changed', candidates.will_change
    )
    FROM candidates
    RETURNING draft_id
  )
  SELECT
    draft.id,
    CASE
      WHEN updated.id IS NOT NULL THEN updated.archived_at
      ELSE draft.archived_at
    END,
    CASE
      WHEN updated.id IS NOT NULL THEN updated.updated_at
      ELSE draft.updated_at
    END,
    candidates.will_change
  FROM public.newsletter_drafts AS draft
  JOIN candidates ON candidates.id = draft.id
  LEFT JOIN updated ON updated.id = draft.id
  ORDER BY draft.id;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_set_newsletter_draft_archive_state(
  uuid,
  text,
  jsonb,
  text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.bulk_set_newsletter_draft_archive_state(
  uuid,
  text,
  jsonb,
  text
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bulk_set_newsletter_draft_archive_state(
  uuid,
  text,
  jsonb,
  text
) TO service_role;

NOTIFY pgrst, 'reload schema';
