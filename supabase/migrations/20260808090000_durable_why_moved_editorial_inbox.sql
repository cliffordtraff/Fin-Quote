-- Turn the catalyst review screen into a durable editorial inbox.
--
-- The first candidate and catalyst snapshots are intentionally immutable. A
-- later visit must never explain an old queue item with today's symbol-level
-- catalyst. Rediscovery advances last_seen_at without changing the review CAS
-- token or the evidence captured when the item first entered the queue.

BEGIN;

ALTER TABLE public.stock_why_moving_reviews
  ADD COLUMN IF NOT EXISTS candidate_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS catalyst_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_state text,
  ADD COLUMN IF NOT EXISTS discovery_run_id text,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- This is a compatibility backfill, not an editorial change. Preserve the
-- historical review version while making the absence of original evidence
-- explicit instead of manufacturing it from the current symbol cache.
ALTER TABLE public.stock_why_moving_reviews
  DISABLE TRIGGER stock_why_moving_reviews_updated_at;

UPDATE public.stock_why_moving_reviews AS review
SET
  candidate_snapshot = coalesce(
    review.candidate_snapshot,
    jsonb_build_object(
      'reviewKey', review.review_key,
      'symbol', review.symbol,
      'name', NULL,
      'price', NULL,
      'change', NULL,
      'changesPercentage', NULL,
      'direction', review.direction,
      'session', review.session,
      'marketDate', review.market_date::text
    )
  ),
  catalyst_snapshot = coalesce(
    review.catalyst_snapshot,
    jsonb_build_object(
      'symbol', review.symbol,
      'status', 'error',
      'displayText', NULL,
      'headline', NULL,
      'summary', NULL,
      'bulletPoints', '[]'::jsonb,
      'sentiment', NULL,
      'source', 'legacy_review',
      'sourceTimestamp', NULL,
      'isCatalyst', NULL,
      'sourceUrl', '',
      'fetchedAt', coalesce(review.reviewed_at, review.created_at),
      'errorMessage',
        'Discovery-time catalyst evidence was not captured for this legacy review.'
    )
  ),
  snapshot_state = coalesce(review.snapshot_state, 'legacy_missing'),
  discovery_run_id = coalesce(review.discovery_run_id, 'legacy-migration'),
  first_seen_at = coalesce(review.first_seen_at, review.created_at),
  last_seen_at = coalesce(
    review.last_seen_at,
    review.reviewed_at,
    review.updated_at,
    review.created_at
  );

ALTER TABLE public.stock_why_moving_reviews
  ENABLE TRIGGER stock_why_moving_reviews_updated_at;

ALTER TABLE public.stock_why_moving_reviews
  ALTER COLUMN candidate_snapshot SET DEFAULT '{}'::jsonb,
  ALTER COLUMN candidate_snapshot SET NOT NULL,
  ALTER COLUMN catalyst_snapshot SET DEFAULT
    '{"status":"error","bulletPoints":[],"sourceUrl":"","errorMessage":"Discovery-time catalyst evidence is unavailable."}'::jsonb,
  ALTER COLUMN catalyst_snapshot SET NOT NULL,
  ALTER COLUMN snapshot_state SET DEFAULT 'legacy_missing',
  ALTER COLUMN snapshot_state SET NOT NULL,
  ALTER COLUMN discovery_run_id SET DEFAULT 'legacy-direct-write',
  ALTER COLUMN discovery_run_id SET NOT NULL,
  ALTER COLUMN first_seen_at SET DEFAULT clock_timestamp(),
  ALTER COLUMN first_seen_at SET NOT NULL,
  ALTER COLUMN last_seen_at SET DEFAULT clock_timestamp(),
  ALTER COLUMN last_seen_at SET NOT NULL;

ALTER TABLE public.stock_why_moving_reviews
  DROP CONSTRAINT IF EXISTS stock_why_moving_reviews_snapshot_state_check,
  DROP CONSTRAINT IF EXISTS stock_why_moving_reviews_snapshot_object_check,
  DROP CONSTRAINT IF EXISTS stock_why_moving_reviews_seen_order_check;

ALTER TABLE public.stock_why_moving_reviews
  ADD CONSTRAINT stock_why_moving_reviews_snapshot_state_check
    CHECK (snapshot_state IN ('captured', 'legacy_missing')),
  ADD CONSTRAINT stock_why_moving_reviews_snapshot_object_check
    CHECK (
      jsonb_typeof(candidate_snapshot) = 'object'
      AND jsonb_typeof(catalyst_snapshot) = 'object'
    ),
  ADD CONSTRAINT stock_why_moving_reviews_seen_order_check
    CHECK (last_seen_at >= first_seen_at);

CREATE INDEX IF NOT EXISTS idx_stock_why_moving_reviews_editorial_inbox
  ON public.stock_why_moving_reviews (
    status,
    market_date,
    first_seen_at,
    id
  );

CREATE TABLE public.stock_why_moving_review_bulk_operations (
  idempotency_key text PRIMARY KEY,
  target_status text NOT NULL
    CHECK (target_status IN ('pending', 'needs_work', 'dismissed')),
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_hash text NOT NULL,
  item_count integer NOT NULL CHECK (item_count BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.stock_why_moving_review_bulk_receipts (
  operation_key text NOT NULL REFERENCES
    public.stock_why_moving_review_bulk_operations(idempotency_key)
    ON DELETE RESTRICT,
  review_id uuid NOT NULL REFERENCES public.stock_why_moving_reviews(id)
    ON DELETE RESTRICT,
  from_status text NOT NULL,
  to_status text NOT NULL
    CHECK (to_status IN ('pending', 'needs_work', 'dismissed')),
  expected_updated_at timestamptz NOT NULL,
  result_reviewed_at timestamptz,
  result_updated_at timestamptz NOT NULL,
  changed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (operation_key, review_id)
);

ALTER TABLE public.stock_why_moving_review_bulk_receipts
  ADD CONSTRAINT stock_why_moving_review_bulk_receipts_from_status_check
    CHECK (from_status IN ('pending', 'needs_work', 'dismissed'));

ALTER TABLE public.stock_why_moving_review_bulk_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_why_moving_review_bulk_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_stock_why_moving_review_bulk_operations
  ON public.stock_why_moving_review_bulk_operations
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_stock_why_moving_review_bulk_receipts
  ON public.stock_why_moving_review_bulk_receipts
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE
  public.stock_why_moving_review_bulk_operations,
  public.stock_why_moving_review_bulk_receipts
FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.stock_why_moving_review_bulk_operations,
  public.stock_why_moving_review_bulk_receipts
TO service_role;

-- Identity and discovery evidence are immutable after insert. Observing the
-- same key again advances last_seen_at but does not create a false edit conflict.
CREATE OR REPLACE FUNCTION public.guard_stock_why_moving_review_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.last_seen_at < NEW.first_seen_at THEN
      RAISE EXCEPTION 'last_seen_at cannot precede first_seen_at';
    END IF;
    IF NEW.snapshot_state = 'captured' AND (
      NEW.candidate_snapshot ->> 'reviewKey' IS DISTINCT FROM NEW.review_key
      OR upper(NEW.candidate_snapshot ->> 'symbol') IS DISTINCT FROM NEW.symbol
      OR NEW.candidate_snapshot ->> 'marketDate' IS DISTINCT FROM NEW.market_date::text
      OR NEW.candidate_snapshot ->> 'session' IS DISTINCT FROM NEW.session
      OR NEW.candidate_snapshot ->> 'direction' IS DISTINCT FROM NEW.direction
      OR upper(NEW.catalyst_snapshot ->> 'symbol') IS DISTINCT FROM NEW.symbol
    ) THEN
      RAISE EXCEPTION 'captured evidence does not match review identity';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.review_key IS DISTINCT FROM OLD.review_key
    OR NEW.symbol IS DISTINCT FROM OLD.symbol
    OR NEW.market_date IS DISTINCT FROM OLD.market_date
    OR NEW.session IS DISTINCT FROM OLD.session
    OR NEW.direction IS DISTINCT FROM OLD.direction
    OR NEW.candidate_snapshot IS DISTINCT FROM OLD.candidate_snapshot
    OR NEW.catalyst_snapshot IS DISTINCT FROM OLD.catalyst_snapshot
    OR NEW.snapshot_state IS DISTINCT FROM OLD.snapshot_state
    OR NEW.discovery_run_id IS DISTINCT FROM OLD.discovery_run_id
    OR NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at THEN
    RAISE EXCEPTION 'review identity and discovery evidence are immutable';
  END IF;

  IF NEW.last_seen_at < OLD.last_seen_at THEN
    RAISE EXCEPTION 'last_seen_at cannot move backward';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    NEW.updated_at := greatest(
      clock_timestamp(),
      OLD.updated_at + interval '1 microsecond'
    );
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_why_moving_reviews_updated_at
  ON public.stock_why_moving_reviews;
DROP TRIGGER IF EXISTS stock_why_moving_reviews_evidence_guard
  ON public.stock_why_moving_reviews;
CREATE TRIGGER stock_why_moving_reviews_evidence_guard
  BEFORE INSERT OR UPDATE ON public.stock_why_moving_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_stock_why_moving_review_evidence();

CREATE OR REPLACE FUNCTION public.ingest_stock_why_moving_review_candidates(
  p_items jsonb,
  p_seen_at timestamptz,
  p_source_run_id text
)
RETURNS SETOF public.stock_why_moving_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_count integer;
  parsed_count integer;
  unique_count integer;
  valid_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be an array';
  END IF;
  requested_count := jsonb_array_length(p_items);
  IF requested_count < 1 OR requested_count > 100 THEN
    RAISE EXCEPTION 'items must contain between 1 and 100 candidates';
  END IF;
  IF p_seen_at IS NULL THEN
    RAISE EXCEPTION 'seen_at is required';
  END IF;
  IF p_source_run_id IS NULL
    OR p_source_run_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' THEN
    RAISE EXCEPTION 'invalid source run id';
  END IF;

  SELECT
    count(*),
    count(DISTINCT item.review_key),
    count(*) FILTER (WHERE
      item.review_key IS NOT NULL
      AND length(item.review_key) BETWEEN 1 AND 180
      AND item.symbol ~ '^[A-Z0-9][A-Z0-9.-]{0,9}$'
      AND item.session IN ('premarket', 'cash', 'afterhours', 'closed')
      AND item.direction IN ('gainer', 'loser')
      AND item.review_key = concat(
        item.market_date::text,
        ':',
        item.session,
        ':',
        item.direction,
        ':',
        item.symbol
      )
      AND jsonb_typeof(item.candidate_snapshot) = 'object'
      AND jsonb_typeof(item.catalyst_snapshot) = 'object'
      AND item.candidate_snapshot ->> 'reviewKey' = item.review_key
      AND upper(item.candidate_snapshot ->> 'symbol') = item.symbol
      AND item.candidate_snapshot ->> 'marketDate' = item.market_date::text
      AND item.candidate_snapshot ->> 'session' = item.session
      AND item.candidate_snapshot ->> 'direction' = item.direction
      AND upper(item.catalyst_snapshot ->> 'symbol') = item.symbol
      AND item.catalyst_snapshot ->> 'status' IN ('found', 'not_found', 'error')
      AND jsonb_typeof(item.catalyst_snapshot -> 'bulletPoints') = 'array'
      AND pg_catalog.pg_input_is_valid(
        item.catalyst_snapshot ->> 'fetchedAt',
        'timestamp with time zone'
      )
      AND octet_length(item.candidate_snapshot::text) <= 16384
      AND octet_length(item.catalyst_snapshot::text) <= 65536
    )
  INTO parsed_count, unique_count, valid_count
  FROM jsonb_to_recordset(p_items) AS item(
    review_key text,
    symbol text,
    market_date date,
    session text,
    direction text,
    candidate_snapshot jsonb,
    catalyst_snapshot jsonb
  );

  IF parsed_count <> requested_count OR valid_count <> requested_count THEN
    RAISE EXCEPTION 'one or more candidate snapshots are invalid';
  END IF;
  IF unique_count <> requested_count THEN
    RAISE EXCEPTION 'candidate review keys must be unique';
  END IF;

  RETURN QUERY
  WITH parsed AS (
    SELECT item.*
    FROM jsonb_to_recordset(p_items) AS item(
      review_key text,
      symbol text,
      market_date date,
      session text,
      direction text,
      candidate_snapshot jsonb,
      catalyst_snapshot jsonb
    )
  ),
  ingested AS (
    INSERT INTO public.stock_why_moving_reviews AS review (
      review_key,
      symbol,
      market_date,
      session,
      direction,
      status,
      candidate_snapshot,
      catalyst_snapshot,
      snapshot_state,
      discovery_run_id,
      first_seen_at,
      last_seen_at
    )
    SELECT
      parsed.review_key,
      parsed.symbol,
      parsed.market_date,
      parsed.session,
      parsed.direction,
      'pending',
      parsed.candidate_snapshot,
      parsed.catalyst_snapshot,
      'captured',
      p_source_run_id,
      p_seen_at,
      p_seen_at
    FROM parsed
    ON CONFLICT (review_key) DO UPDATE
      SET last_seen_at = greatest(review.last_seen_at, EXCLUDED.last_seen_at)
    RETURNING review.*
  )
  SELECT ingested.*
  FROM ingested
  ORDER BY ingested.review_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_stock_why_moving_editorial_inbox(
  p_current_review_keys text[] DEFAULT ARRAY[]::text[],
  p_status text DEFAULT NULL,
  p_session text DEFAULT NULL,
  p_market_date date DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_cursor_bucket integer DEFAULT NULL,
  p_cursor_market_date date DEFAULT NULL,
  p_cursor_first_seen_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 26
)
RETURNS TABLE (
  sort_bucket integer,
  id uuid,
  review_key text,
  symbol text,
  market_date date,
  session text,
  direction text,
  status text,
  notes text,
  reviewer_id uuid,
  reviewed_at timestamptz,
  candidate_snapshot jsonb,
  catalyst_snapshot jsonb,
  snapshot_state text,
  discovery_run_id text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_key_count integer := coalesce(array_length(p_current_review_keys, 1), 0);
  cursor_value_count integer;
BEGIN
  IF current_key_count > 100 THEN
    RAISE EXCEPTION 'current review keys cannot exceed 100';
  END IF;
  IF current_key_count <> (
    SELECT count(DISTINCT key)
    FROM unnest(coalesce(p_current_review_keys, ARRAY[]::text[])) AS key
  ) THEN
    RAISE EXCEPTION 'current review keys must be unique';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_current_review_keys, ARRAY[]::text[])) AS key
    WHERE key IS NULL OR length(key) < 1 OR length(key) > 180
  ) THEN
    RAISE EXCEPTION 'invalid current review key';
  END IF;
  IF p_limit < 1 OR p_limit > 101 THEN
    RAISE EXCEPTION 'limit must be between 1 and 101';
  END IF;
  IF p_status IS NOT NULL
    AND p_status NOT IN ('pending', 'approved', 'needs_work', 'dismissed', 'all') THEN
    RAISE EXCEPTION 'invalid editorial inbox status filter';
  END IF;
  IF p_session IS NOT NULL
    AND p_session NOT IN ('premarket', 'cash', 'afterhours', 'closed') THEN
    RAISE EXCEPTION 'invalid editorial inbox session filter';
  END IF;
  IF p_market_date IS NOT NULL
    AND (p_date_from IS NOT NULL OR p_date_to IS NOT NULL) THEN
    RAISE EXCEPTION 'market_date cannot be combined with a date range';
  END IF;
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL
    AND p_date_from > p_date_to THEN
    RAISE EXCEPTION 'date_from cannot follow date_to';
  END IF;

  cursor_value_count :=
    (p_cursor_bucket IS NOT NULL)::integer
    + (p_cursor_market_date IS NOT NULL)::integer
    + (p_cursor_first_seen_at IS NOT NULL)::integer
    + (p_cursor_id IS NOT NULL)::integer;
  IF cursor_value_count NOT IN (0, 4)
    OR (p_cursor_bucket IS NOT NULL AND p_cursor_bucket NOT IN (0, 1)) THEN
    RAISE EXCEPTION 'invalid editorial inbox cursor';
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN review.status IN ('pending', 'needs_work') THEN 0
      ELSE 1
    END AS sort_bucket,
    review.id,
    review.review_key,
    review.symbol,
    review.market_date,
    review.session,
    review.direction,
    review.status,
    review.notes,
    review.reviewer_id,
    review.reviewed_at,
    review.candidate_snapshot,
    review.catalyst_snapshot,
    review.snapshot_state,
    review.discovery_run_id,
    review.first_seen_at,
    review.last_seen_at,
    review.created_at,
    review.updated_at
  FROM public.stock_why_moving_reviews AS review
  WHERE (
      p_status IS NOT NULL
      OR
      review.status IN ('pending', 'needs_work')
      OR review.review_key = ANY(
        coalesce(p_current_review_keys, ARRAY[]::text[])
      )
    )
    AND (p_status IS NULL OR p_status = 'all' OR review.status = p_status)
    AND (p_session IS NULL OR review.session = p_session)
    AND (p_market_date IS NULL OR review.market_date = p_market_date)
    AND (p_date_from IS NULL OR review.market_date >= p_date_from)
    AND (p_date_to IS NULL OR review.market_date <= p_date_to)
    AND (
      p_cursor_bucket IS NULL
      OR ROW(
        CASE
          WHEN review.status IN ('pending', 'needs_work') THEN 0
          ELSE 1
        END,
        review.market_date,
        review.first_seen_at,
        review.id
      ) > ROW(
        p_cursor_bucket,
        p_cursor_market_date,
        p_cursor_first_seen_at,
        p_cursor_id
      )
    )
  ORDER BY
    CASE
      WHEN review.status IN ('pending', 'needs_work') THEN 0
      ELSE 1
    END,
    review.market_date,
    review.first_seen_at,
    review.id
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stock_why_moving_editorial_inbox_facets(
  p_current_review_keys text[] DEFAULT ARRAY[]::text[],
  p_status text DEFAULT NULL,
  p_session text DEFAULT NULL,
  p_market_date date DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE (
  total_count bigint,
  pending_count bigint,
  needs_work_count bigint,
  approved_count bigint,
  dismissed_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_key_count integer := coalesce(array_length(p_current_review_keys, 1), 0);
BEGIN
  IF current_key_count > 100 OR current_key_count <> (
    SELECT count(DISTINCT key)
    FROM unnest(coalesce(p_current_review_keys, ARRAY[]::text[])) AS key
  ) THEN
    RAISE EXCEPTION 'current review keys must be unique and cannot exceed 100';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(coalesce(p_current_review_keys, ARRAY[]::text[])) AS key
    WHERE key IS NULL OR length(key) < 1 OR length(key) > 180
  ) THEN
    RAISE EXCEPTION 'invalid current review key';
  END IF;
  IF p_status IS NOT NULL
    AND p_status NOT IN ('pending', 'approved', 'needs_work', 'dismissed', 'all') THEN
    RAISE EXCEPTION 'invalid editorial inbox status filter';
  END IF;
  IF p_session IS NOT NULL
    AND p_session NOT IN ('premarket', 'cash', 'afterhours', 'closed') THEN
    RAISE EXCEPTION 'invalid editorial inbox session filter';
  END IF;
  IF p_market_date IS NOT NULL
    AND (p_date_from IS NOT NULL OR p_date_to IS NOT NULL) THEN
    RAISE EXCEPTION 'market_date cannot be combined with a date range';
  END IF;
  IF p_date_from IS NOT NULL AND p_date_to IS NOT NULL
    AND p_date_from > p_date_to THEN
    RAISE EXCEPTION 'date_from cannot follow date_to';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT review.status
    FROM public.stock_why_moving_reviews AS review
    WHERE (
        p_status IS NOT NULL
        OR review.status IN ('pending', 'needs_work')
        OR review.review_key = ANY(
          coalesce(p_current_review_keys, ARRAY[]::text[])
        )
      )
      AND (p_session IS NULL OR review.session = p_session)
      AND (p_market_date IS NULL OR review.market_date = p_market_date)
      AND (p_date_from IS NULL OR review.market_date >= p_date_from)
      AND (p_date_to IS NULL OR review.market_date <= p_date_to)
  )
  SELECT
    count(*) FILTER (
      WHERE p_status IS NULL OR p_status = 'all' OR scoped.status = p_status
    ),
    count(*) FILTER (WHERE scoped.status = 'pending'),
    count(*) FILTER (WHERE scoped.status = 'needs_work'),
    count(*) FILTER (WHERE scoped.status = 'approved'),
    count(*) FILTER (WHERE scoped.status = 'dismissed')
  FROM scoped;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_transition_stock_why_moving_reviews(
  p_target_status text,
  p_items jsonb,
  p_reviewer_id uuid,
  p_idempotency_key text
)
RETURNS TABLE (
  id uuid,
  status text,
  reviewed_at timestamptz,
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
  receipt_count integer;
  request_hash_value text;
  existing_operation record;
  requested_item record;
  previous_status text;
  result_status text;
  result_reviewed_at timestamptz;
  result_updated_at timestamptz;
  result_changed boolean;
  changed_at timestamptz := clock_timestamp();
BEGIN
  IF p_target_status NOT IN ('pending', 'needs_work', 'dismissed') THEN
    RAISE EXCEPTION 'bulk approval is not allowed';
  END IF;
  IF p_reviewer_id IS NULL THEN
    RAISE EXCEPTION 'reviewer_id is required';
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
    RAISE EXCEPTION 'items must contain between 1 and 100 reviews';
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
    RAISE EXCEPTION 'items must contain unique review ids';
  END IF;

  SELECT md5(
    p_target_status
    || ':'
    || string_agg(
      item.id::text || '@' || item.expected_updated_at::text,
      ','
      ORDER BY item.id
    )
  )
  INTO request_hash_value
  FROM jsonb_to_recordset(p_items)
    AS item(id uuid, expected_updated_at timestamptz);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'why-moved-bulk:' || p_idempotency_key,
      0
    )
  );

  SELECT operation.*
  INTO existing_operation
  FROM public.stock_why_moving_review_bulk_operations AS operation
  WHERE operation.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF existing_operation.target_status <> p_target_status
      OR existing_operation.reviewer_id <> p_reviewer_id
      OR existing_operation.request_hash <> request_hash_value
      OR existing_operation.item_count <> requested_count THEN
      RAISE EXCEPTION 'idempotency key was already used for a different request';
    END IF;

    SELECT count(*)
    INTO receipt_count
    FROM public.stock_why_moving_review_bulk_receipts AS receipt
    WHERE receipt.operation_key = p_idempotency_key;
    IF receipt_count <> requested_count THEN
      RAISE EXCEPTION 'incomplete idempotency replay';
    END IF;

    RETURN QUERY
    SELECT
      receipt.review_id,
      receipt.to_status,
      receipt.result_reviewed_at,
      receipt.result_updated_at,
      false
    FROM public.stock_why_moving_review_bulk_receipts AS receipt
    WHERE receipt.operation_key = p_idempotency_key
    ORDER BY receipt.review_id;
    RETURN;
  END IF;

  -- Lock the complete CAS set before inserting an operation or changing a row.
  -- Approved reviews are deliberately excluded from every bulk path.
  SELECT count(*)
  INTO matched_count
  FROM (
    SELECT review.id
    FROM public.stock_why_moving_reviews AS review
    JOIN jsonb_to_recordset(p_items)
      AS item(id uuid, expected_updated_at timestamptz)
      ON review.id = item.id
     AND review.updated_at = item.expected_updated_at
    WHERE review.status IN ('pending', 'needs_work', 'dismissed')
    ORDER BY review.id
    FOR UPDATE OF review
  ) AS locked_reviews;

  IF matched_count <> requested_count THEN
    RAISE EXCEPTION 'one or more reviews changed, are approved, or do not exist';
  END IF;

  INSERT INTO public.stock_why_moving_review_bulk_operations (
    idempotency_key,
    target_status,
    reviewer_id,
    request_hash,
    item_count,
    created_at
  )
  VALUES (
    p_idempotency_key,
    p_target_status,
    p_reviewer_id,
    request_hash_value,
    requested_count,
    changed_at
  );

  FOR requested_item IN
    SELECT item.id, item.expected_updated_at
    FROM jsonb_to_recordset(p_items)
      AS item(id uuid, expected_updated_at timestamptz)
    ORDER BY item.id
  LOOP
    SELECT review.status
    INTO previous_status
    FROM public.stock_why_moving_reviews AS review
    WHERE review.id = requested_item.id;

    result_changed := previous_status IS DISTINCT FROM p_target_status;
    IF result_changed THEN
      UPDATE public.stock_why_moving_reviews AS review
      SET
        status = p_target_status,
        reviewer_id = p_reviewer_id,
        reviewed_at = CASE
          WHEN p_target_status = 'pending' THEN NULL
          ELSE changed_at
        END
      WHERE review.id = requested_item.id
      RETURNING review.status, review.reviewed_at, review.updated_at
      INTO result_status, result_reviewed_at, result_updated_at;
    ELSE
      SELECT review.status, review.reviewed_at, review.updated_at
      INTO result_status, result_reviewed_at, result_updated_at
      FROM public.stock_why_moving_reviews AS review
      WHERE review.id = requested_item.id;
    END IF;

    INSERT INTO public.stock_why_moving_review_bulk_receipts (
      operation_key,
      review_id,
      from_status,
      to_status,
      expected_updated_at,
      result_reviewed_at,
      result_updated_at,
      changed,
      created_at
    )
    VALUES (
      p_idempotency_key,
      requested_item.id,
      previous_status,
      result_status,
      requested_item.expected_updated_at,
      result_reviewed_at,
      result_updated_at,
      result_changed,
      changed_at
    );

    id := requested_item.id;
    status := result_status;
    reviewed_at := result_reviewed_at;
    updated_at := result_updated_at;
    changed := result_changed;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_stock_why_moving_review_evidence()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ingest_stock_why_moving_review_candidates(
  jsonb,
  timestamptz,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_stock_why_moving_editorial_inbox(
  text[],
  text,
  text,
  date,
  date,
  date,
  integer,
  date,
  timestamptz,
  uuid,
  integer
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_stock_why_moving_editorial_inbox_facets(
  text[],
  text,
  text,
  date,
  date,
  date
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_transition_stock_why_moving_reviews(
  text,
  jsonb,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.guard_stock_why_moving_review_evidence()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_stock_why_moving_review_candidates(
  jsonb,
  timestamptz,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_stock_why_moving_editorial_inbox(
  text[],
  text,
  text,
  date,
  date,
  date,
  integer,
  date,
  timestamptz,
  uuid,
  integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_stock_why_moving_editorial_inbox_facets(
  text[],
  text,
  text,
  date,
  date,
  date
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_transition_stock_why_moving_reviews(
  text,
  jsonb,
  uuid,
  text
) TO service_role;

COMMIT;
