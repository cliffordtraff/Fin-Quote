-- Give the compact dashboard watchlist one account-scoped source of truth.
-- The old JSON and normalized tab models remain untouched and are consulted
-- once, lazily, so an existing user's list is not lost during rollout.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_canonical_primary_watchlist_symbols(
  p_symbols text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN coalesce(pg_catalog.array_ndims(p_symbols), 1) <> 1 THEN false
    ELSE
      pg_catalog.cardinality(p_symbols) <= 20
      AND pg_catalog.array_position(p_symbols, NULL::text) IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(p_symbols) AS supplied(symbol)
        WHERE supplied.symbol !~ '^[A-Z][A-Z0-9]{0,9}(\.[A-Z0-9]{1,4})?$'
      )
      AND pg_catalog.cardinality(p_symbols) = (
        SELECT pg_catalog.count(DISTINCT supplied.symbol)::integer
        FROM pg_catalog.unnest(p_symbols) AS supplied(symbol)
      )
  END;
$$;

ALTER FUNCTION public.is_canonical_primary_watchlist_symbols(text[])
  OWNER TO postgres;

ALTER TABLE public.watchlists
  ADD COLUMN symbols text[],
  ADD COLUMN revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN sync_initialized_at timestamptz;

ALTER TABLE public.watchlists
  ADD CONSTRAINT watchlists_symbols_canonical_check CHECK (
    symbols IS NULL
    OR public.is_canonical_primary_watchlist_symbols(symbols)
  ),
  ADD CONSTRAINT watchlists_revision_nonnegative_check CHECK (revision >= 0);

COMMENT ON COLUMN public.watchlists.symbols IS
  'Ordered primary dashboard watchlist. NULL selects the product default; an empty array is intentionally empty.';
COMMENT ON COLUMN public.watchlists.revision IS
  'Monotonic compare-and-swap revision for primary watchlist synchronization.';
COMMENT ON COLUMN public.watchlists.sync_initialized_at IS
  'One-way legacy import fence. Once set, later legacy writes are never imported.';

CREATE TABLE public.account_watchlist_sync_receipts (
  receipt_id bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  ),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  request_payload jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(request_payload) = 'object'
    AND pg_catalog.octet_length(request_payload::text) <= 4096
  ),
  request_mode text NOT NULL CHECK (request_mode IN ('replace', 'merge')),
  request_symbols text[],
  expected_revision bigint CHECK (expected_revision IS NULL OR expected_revision >= 0),
  result_disposition text NOT NULL CHECK (
    result_disposition IN ('applied', 'unchanged', 'conflict')
  ),
  result_symbols text[],
  result_revision bigint NOT NULL CHECK (result_revision >= 0),
  result_sync_initialized_at timestamptz NOT NULL,
  result_dropped_symbols text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (user_id, idempotency_key),
  CONSTRAINT account_watchlist_receipt_request_symbols_check CHECK (
    request_symbols IS NULL
    OR public.is_canonical_primary_watchlist_symbols(request_symbols)
  ),
  CONSTRAINT account_watchlist_receipt_result_symbols_check CHECK (
    result_symbols IS NULL
    OR public.is_canonical_primary_watchlist_symbols(result_symbols)
  ),
  CONSTRAINT account_watchlist_receipt_dropped_symbols_check CHECK (
    public.is_canonical_primary_watchlist_symbols(result_dropped_symbols)
  )
);

CREATE INDEX idx_account_watchlist_sync_receipts_recent
  ON public.account_watchlist_sync_receipts (user_id, receipt_id DESC);

ALTER TABLE public.account_watchlist_sync_receipts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.account_watchlist_sync_receipts IS
  'Service-only, per-user command receipts. The sync RPC retains only the newest 64 receipts for bounded exact replay.';

-- This helper is deliberately service-only. Callers must hold the per-user
-- advisory transaction lock. It closes the missing-row race, locks the row,
-- and applies legacy precedence exactly once:
--   1. existing canonical symbols (including an empty array),
--   2. active tab in watchlists.tabs JSON,
--   3. watchlist_settings.active_tab_id when that tab belongs to the user,
--   4. the user's first normalized tab by position.
-- Only stock items participate. At most the first 128 ordered legacy items are
-- inspected and at most 20 valid, first-occurrence symbols are imported.
CREATE OR REPLACE FUNCTION public.account_watchlist_initialize_locked(
  p_owner_id uuid
)
RETURNS public.watchlists
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '1500ms'
AS $$
DECLARE
  current_watchlist public.watchlists%ROWTYPE;
  active_legacy_tab jsonb;
  selected_tab_id uuid;
  imported_symbols text[];
  legacy_source_found boolean := false;
  initialized_at timestamptz;
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid account watchlist owner';
  END IF;

  INSERT INTO public.watchlists (user_id)
  VALUES (p_owner_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT stored.*
  INTO current_watchlist
  FROM public.watchlists AS stored
  WHERE stored.user_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'Account watchlist row could not be initialized';
  END IF;

  IF current_watchlist.sync_initialized_at IS NOT NULL THEN
    RETURN current_watchlist;
  END IF;

  -- A value already written to the new column is authoritative, including [].
  IF current_watchlist.symbols IS NULL
    AND pg_catalog.jsonb_typeof(current_watchlist.tabs) = 'array'
    AND current_watchlist.active_tab_index >= 0
    AND current_watchlist.active_tab_index
      < pg_catalog.jsonb_array_length(current_watchlist.tabs) THEN
    active_legacy_tab := current_watchlist.tabs -> current_watchlist.active_tab_index;

    IF pg_catalog.jsonb_typeof(active_legacy_tab) = 'object'
      AND pg_catalog.jsonb_typeof(active_legacy_tab -> 'items') = 'array' THEN
      legacy_source_found := true;

      WITH bounded_items AS (
        SELECT item.value, item.ordinality
        FROM pg_catalog.jsonb_array_elements(active_legacy_tab -> 'items')
          WITH ORDINALITY AS item(value, ordinality)
        WHERE item.ordinality <= 128
      ),
      normalized AS (
        SELECT
          CASE
            WHEN pg_catalog.octet_length(item.value ->> 'symbol') <= 64 THEN
              pg_catalog.replace(
                pg_catalog.upper(pg_catalog.btrim(item.value ->> 'symbol')),
                '-',
                '.'
              )
            ELSE NULL
          END AS symbol,
          item.ordinality
        FROM bounded_items AS item
        WHERE pg_catalog.jsonb_typeof(item.value) = 'object'
          AND item.value ->> 'type' = 'stock'
          AND pg_catalog.jsonb_typeof(item.value -> 'symbol') = 'string'
      ),
      first_occurrences AS (
        SELECT candidate.symbol, pg_catalog.min(candidate.ordinality) AS first_position
        FROM normalized AS candidate
        WHERE candidate.symbol ~ '^[A-Z][A-Z0-9]{0,9}(\.[A-Z0-9]{1,4})?$'
        GROUP BY candidate.symbol
      ),
      retained AS (
        SELECT candidate.symbol, candidate.first_position
        FROM first_occurrences AS candidate
        ORDER BY candidate.first_position, candidate.symbol
        LIMIT 20
      )
      SELECT coalesce(
        pg_catalog.array_agg(retained.symbol ORDER BY retained.first_position),
        '{}'::text[]
      )
      INTO imported_symbols
      FROM retained;
    END IF;
  END IF;

  IF current_watchlist.symbols IS NULL AND NOT legacy_source_found THEN
    SELECT owned_tab.id
    INTO selected_tab_id
    FROM public.watchlist_settings AS settings
    JOIN public.watchlist_tabs AS owned_tab
      ON owned_tab.id = settings.active_tab_id
      AND owned_tab.user_id = p_owner_id
    WHERE settings.user_id = p_owner_id
    LIMIT 1;

    IF selected_tab_id IS NULL THEN
      SELECT owned_tab.id
      INTO selected_tab_id
      FROM public.watchlist_tabs AS owned_tab
      WHERE owned_tab.user_id = p_owner_id
      ORDER BY owned_tab.position, owned_tab.id
      LIMIT 1;
    END IF;

    IF selected_tab_id IS NOT NULL THEN
      legacy_source_found := true;

      WITH bounded_items AS (
        SELECT item.symbol, item.position, item.type
        FROM public.watchlist_items AS item
        WHERE item.tab_id = selected_tab_id
        ORDER BY item.position, item.id
        LIMIT 128
      ),
      normalized AS (
        SELECT
          CASE
            WHEN pg_catalog.octet_length(item.symbol) <= 64 THEN
              pg_catalog.replace(
                pg_catalog.upper(pg_catalog.btrim(item.symbol)),
                '-',
                '.'
              )
            ELSE NULL
          END AS symbol,
          item.position
        FROM bounded_items AS item
        WHERE item.symbol IS NOT NULL
          AND item.type = 'stock'
      ),
      first_occurrences AS (
        SELECT
          candidate.symbol,
          pg_catalog.min(candidate.position) AS first_position
        FROM normalized AS candidate
        WHERE candidate.symbol ~ '^[A-Z][A-Z0-9]{0,9}(\.[A-Z0-9]{1,4})?$'
        GROUP BY candidate.symbol
      ),
      retained AS (
        SELECT candidate.symbol, candidate.first_position
        FROM first_occurrences AS candidate
        ORDER BY candidate.first_position, candidate.symbol
        LIMIT 20
      )
      SELECT coalesce(
        pg_catalog.array_agg(
          retained.symbol
          ORDER BY retained.first_position, retained.symbol
        ),
        '{}'::text[]
      )
      INTO imported_symbols
      FROM retained;
    END IF;
  END IF;

  initialized_at := pg_catalog.clock_timestamp();
  UPDATE public.watchlists AS stored
  SET
    symbols = CASE
      WHEN current_watchlist.symbols IS NOT NULL THEN current_watchlist.symbols
      WHEN legacy_source_found THEN imported_symbols
      ELSE NULL
    END,
    sync_initialized_at = initialized_at,
    updated_at = initialized_at
  WHERE stored.user_id = p_owner_id
  RETURNING stored.* INTO current_watchlist;

  RETURN current_watchlist;
END;
$$;

ALTER FUNCTION public.account_watchlist_initialize_locked(uuid)
  OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.read_primary_watchlist()
RETURNS TABLE (
  symbols text[],
  revision bigint,
  sync_initialized_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '2s'
AS $$
DECLARE
  owner_id uuid := auth.uid();
  current_watchlist public.watchlists%ROWTYPE;
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Authentication is required to read an account watchlist';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('account-primary-watchlist:' || owner_id::text, 0)
  );

  current_watchlist := public.account_watchlist_initialize_locked(owner_id);

  RETURN QUERY SELECT
    current_watchlist.symbols,
    current_watchlist.revision,
    current_watchlist.sync_initialized_at;
END;
$$;

ALTER FUNCTION public.read_primary_watchlist() OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.sync_primary_watchlist(
  p_mode text,
  p_symbols text[],
  p_expected_revision bigint,
  p_idempotency_key text
)
RETURNS TABLE (
  disposition text,
  symbols text[],
  revision bigint,
  sync_initialized_at timestamptz,
  dropped_symbols text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '2s'
AS $$
DECLARE
  owner_id uuid := auth.uid();
  canonical_symbols text[];
  supplied_count integer;
  unique_count integer;
  all_valid boolean;
  request_payload_value jsonb;
  request_hash_value text;
  replay public.account_watchlist_sync_receipts%ROWTYPE;
  current_watchlist public.watchlists%ROWTYPE;
  target_symbols text[];
  result_disposition_value text;
  result_dropped_symbols text[] := '{}'::text[];
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Authentication is required to sync an account watchlist';
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('replace', 'merge') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid account watchlist sync mode';
  END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid account watchlist expected revision';
  END IF;
  IF p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Invalid account watchlist idempotency key';
  END IF;

  IF p_symbols IS NULL THEN
    canonical_symbols := NULL;
  ELSE
    IF coalesce(pg_catalog.array_ndims(p_symbols), 1) <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Invalid account watchlist symbols';
    END IF;
    IF pg_catalog.cardinality(p_symbols) > 20
      OR pg_catalog.array_position(p_symbols, NULL::text) IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(p_symbols) AS raw_symbol(symbol)
        WHERE pg_catalog.octet_length(raw_symbol.symbol) > 64
      ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Invalid account watchlist symbols';
    END IF;

    SELECT
      pg_catalog.count(*)::integer,
      pg_catalog.count(DISTINCT normalized.symbol)::integer,
      coalesce(
        pg_catalog.bool_and(
          normalized.symbol ~ '^[A-Z][A-Z0-9]{0,9}(\.[A-Z0-9]{1,4})?$'
        ),
        true
      ),
      coalesce(
        pg_catalog.array_agg(normalized.symbol ORDER BY normalized.ordinality),
        '{}'::text[]
      )
    INTO supplied_count, unique_count, all_valid, canonical_symbols
    FROM (
      SELECT
        pg_catalog.replace(
          pg_catalog.upper(pg_catalog.btrim(supplied.symbol)),
          '-',
          '.'
        ) AS symbol,
        supplied.ordinality
      FROM pg_catalog.unnest(p_symbols)
        WITH ORDINALITY AS supplied(symbol, ordinality)
    ) AS normalized;

    IF NOT all_valid OR supplied_count <> unique_count THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Invalid or duplicate account watchlist symbols';
    END IF;
  END IF;

  -- jsonb renders SQL NULL as JSON null, preserving null-vs-empty and a null
  -- expected revision in the durable command identity.
  request_payload_value := pg_catalog.jsonb_build_object(
    'version', 1,
    'mode', p_mode,
    'symbols', canonical_symbols,
    'expectedRevision', p_expected_revision
  );
  request_hash_value :=
    pg_catalog.md5('account-watchlist-sync-v1:' || request_payload_value::text)
    || pg_catalog.md5('account-watchlist-sync-v1b:' || request_payload_value::text);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('account-primary-watchlist:' || owner_id::text, 0)
  );

  -- Replay is resolved before inserting, locking, initializing, or otherwise
  -- reading mutable watchlist state.
  SELECT receipt.*
  INTO replay
  FROM public.account_watchlist_sync_receipts AS receipt
  WHERE receipt.user_id = owner_id
    AND receipt.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF replay.request_hash IS DISTINCT FROM request_hash_value
      OR replay.request_payload IS DISTINCT FROM request_payload_value THEN
      RETURN QUERY SELECT
        'conflict'::text,
        replay.result_symbols,
        replay.result_revision,
        replay.result_sync_initialized_at,
        '{}'::text[];
    ELSE
      RETURN QUERY SELECT
        CASE
          WHEN replay.result_disposition = 'conflict' THEN 'conflict'::text
          ELSE 'replayed'::text
        END,
        replay.result_symbols,
        replay.result_revision,
        replay.result_sync_initialized_at,
        replay.result_dropped_symbols;
    END IF;
    RETURN;
  END IF;

  current_watchlist := public.account_watchlist_initialize_locked(owner_id);

  IF p_expected_revision IS NOT NULL
    AND p_expected_revision <> current_watchlist.revision THEN
    result_disposition_value := 'conflict';
  ELSE
    IF p_mode = 'replace' THEN
      target_symbols := canonical_symbols;
    ELSIF canonical_symbols IS NULL
      OR pg_catalog.cardinality(canonical_symbols) = 0 THEN
      target_symbols := current_watchlist.symbols;
    ELSE
      WITH combined AS (
        SELECT supplied.symbol, supplied.ordinality
        FROM pg_catalog.unnest(
          coalesce(current_watchlist.symbols, '{}'::text[])
          || canonical_symbols
        ) WITH ORDINALITY AS supplied(symbol, ordinality)
      ),
      first_occurrences AS (
        SELECT candidate.symbol, pg_catalog.min(candidate.ordinality) AS first_position
        FROM combined AS candidate
        GROUP BY candidate.symbol
      ),
      ranked AS (
        SELECT
          candidate.symbol,
          candidate.first_position,
          pg_catalog.row_number() OVER (
            ORDER BY candidate.first_position, candidate.symbol
          ) AS symbol_rank
        FROM first_occurrences AS candidate
      )
      SELECT
        coalesce(
          pg_catalog.array_agg(
            ranked.symbol ORDER BY ranked.first_position
          ) FILTER (WHERE ranked.symbol_rank <= 20),
          '{}'::text[]
        ),
        coalesce(
          pg_catalog.array_agg(
            ranked.symbol ORDER BY ranked.first_position
          ) FILTER (WHERE ranked.symbol_rank > 20),
          '{}'::text[]
        )
      INTO target_symbols, result_dropped_symbols
      FROM ranked;
    END IF;

    IF target_symbols IS DISTINCT FROM current_watchlist.symbols THEN
      UPDATE public.watchlists AS stored
      SET
        symbols = target_symbols,
        revision = stored.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
      WHERE stored.user_id = owner_id
      RETURNING stored.* INTO current_watchlist;
      result_disposition_value := 'applied';
    ELSE
      result_disposition_value := 'unchanged';
    END IF;
  END IF;

  INSERT INTO public.account_watchlist_sync_receipts (
    user_id,
    idempotency_key,
    request_hash,
    request_payload,
    request_mode,
    request_symbols,
    expected_revision,
    result_disposition,
    result_symbols,
    result_revision,
    result_sync_initialized_at,
    result_dropped_symbols
  )
  VALUES (
    owner_id,
    p_idempotency_key,
    request_hash_value,
    request_payload_value,
    p_mode,
    canonical_symbols,
    p_expected_revision,
    result_disposition_value,
    current_watchlist.symbols,
    current_watchlist.revision,
    current_watchlist.sync_initialized_at,
    result_dropped_symbols
  );

  -- Starting from an empty table, one serialized insert can create only one
  -- surplus row. Selecting by the identity-backed order also repairs any
  -- unexpected backlog while retaining exactly the newest 64 receipts.
  DELETE FROM public.account_watchlist_sync_receipts AS old_receipt
  WHERE old_receipt.user_id = owner_id
    AND old_receipt.receipt_id IN (
      SELECT surplus.receipt_id
      FROM public.account_watchlist_sync_receipts AS surplus
      WHERE surplus.user_id = owner_id
      ORDER BY surplus.receipt_id DESC
      OFFSET 64
    );

  RETURN QUERY SELECT
    result_disposition_value,
    current_watchlist.symbols,
    current_watchlist.revision,
    current_watchlist.sync_initialized_at,
    result_dropped_symbols;
END;
$$;

ALTER FUNCTION public.sync_primary_watchlist(text, text[], bigint, text)
  OWNER TO postgres;

-- Canonical columns are RPC-owned. Authenticated clients may still read their
-- legacy row through RLS, but cannot insert, update, delete, or truncate it.
DROP POLICY IF EXISTS "Users manage watchlists" ON public.watchlists;
DROP POLICY IF EXISTS "Users can view own primary watchlist" ON public.watchlists;
CREATE POLICY "Users can view own primary watchlist"
  ON public.watchlists
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE public.watchlists
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.watchlists TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.watchlists TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.account_watchlist_sync_receipts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.account_watchlist_sync_receipts TO service_role;

REVOKE ALL PRIVILEGES ON SEQUENCE
  public.account_watchlist_sync_receipts_receipt_id_seq
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE
  public.account_watchlist_sync_receipts_receipt_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.is_canonical_primary_watchlist_symbols(text[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_watchlist_initialize_locked(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_canonical_primary_watchlist_symbols(text[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.account_watchlist_initialize_locked(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.read_primary_watchlist()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_primary_watchlist(text, text[], bigint, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_primary_watchlist()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_primary_watchlist(
  text, text[], bigint, text
) TO authenticated, service_role;

COMMIT;
