-- Preserve the editor's Morning Report decisions as durable, versioned evidence.
--
-- Automation may continue updating newsletter_daily_runs while an editor is
-- working, so shortlist concurrency deliberately uses its own monotonic
-- revision instead of the run's updated_at timestamp. Revisions and their
-- evidence are append-only; a tiny head row points at the current revision.

BEGIN;

CREATE TABLE public.newsletter_editorial_shortlist_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Individual queue-item cleanup must not punch holes in history, but
  -- deliberate whole-run/account erasure must remove the complete ledger.
  run_id uuid NOT NULL REFERENCES public.newsletter_daily_runs(id)
    ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision >= 1),
  algorithm_version text NOT NULL CHECK (
    algorithm_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'
  ),
  baseline_fingerprint text NOT NULL CHECK (
    baseline_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  actor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,
  command_hash text NOT NULL CHECK (command_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  ),
  request_payload jsonb NOT NULL CHECK (
    jsonb_typeof(request_payload) = 'object'
    AND octet_length(request_payload::text) <= 131072
  ),
  baseline_count smallint NOT NULL CHECK (baseline_count BETWEEN 0 AND 5),
  selected_count smallint NOT NULL CHECK (selected_count BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((actor_id IS NULL) <> (session_id IS NULL)),
  UNIQUE (run_id, revision),
  UNIQUE (run_id, idempotency_key),
  UNIQUE (run_id, id, revision)
);

CREATE TABLE public.newsletter_editorial_shortlist_entries (
  revision_id uuid NOT NULL REFERENCES
    public.newsletter_editorial_shortlist_revisions(id) ON DELETE CASCADE,
  -- Deliberately not a live FK. The save RPC proves membership at decision
  -- time, while the immutable snapshot must survive later queue-item cleanup.
  item_id uuid NOT NULL,
  baseline_position smallint CHECK (baseline_position BETWEEN 1 AND 5),
  selected_position smallint CHECK (selected_position BETWEEN 1 AND 5),
  decision text NOT NULL CHECK (
    decision IN ('retained', 'promoted', 'demoted', 'removed', 'added')
  ),
  reason_code text CHECK (
    reason_code IS NULL OR reason_code IN (
      'stronger_catalyst',
      'better_source_depth',
      'fresh_earnings',
      'audience_fit',
      'chart_quality',
      'duplicate_coverage',
      'weak_evidence',
      'stale_story',
      'other'
    )
  ),
  note text CHECK (note IS NULL OR length(note) <= 500),
  evidence_snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(evidence_snapshot) = 'object'
    AND octet_length(evidence_snapshot::text) <= 32768
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (revision_id, item_id),
  CHECK (baseline_position IS NOT NULL OR selected_position IS NOT NULL),
  CHECK (
    (decision = 'retained'
      AND baseline_position IS NOT NULL
      AND selected_position IS NOT NULL
      AND reason_code IS NULL)
    OR (decision = 'promoted'
      AND baseline_position IS NOT NULL
      AND selected_position IS NOT NULL
      AND reason_code IS NOT NULL)
    OR (decision = 'demoted'
      AND baseline_position IS NOT NULL
      AND selected_position IS NOT NULL
      AND reason_code IS NOT NULL)
    OR (decision = 'removed'
      AND baseline_position IS NOT NULL
      AND selected_position IS NULL
      AND reason_code IS NOT NULL)
    OR (decision = 'added'
      AND baseline_position IS NULL
      AND selected_position IS NOT NULL
      AND reason_code IS NOT NULL)
  ),
  CHECK (
    reason_code IS DISTINCT FROM 'other'
    OR nullif(btrim(note), '') IS NOT NULL
  )
);

CREATE UNIQUE INDEX newsletter_editorial_shortlist_entries_baseline_position
  ON public.newsletter_editorial_shortlist_entries(
    revision_id,
    baseline_position
  )
  WHERE baseline_position IS NOT NULL;

CREATE UNIQUE INDEX newsletter_editorial_shortlist_entries_selected_position
  ON public.newsletter_editorial_shortlist_entries(
    revision_id,
    selected_position
  )
  WHERE selected_position IS NOT NULL;

CREATE INDEX newsletter_editorial_shortlist_entries_item
  ON public.newsletter_editorial_shortlist_entries(item_id);

CREATE TABLE public.newsletter_editorial_shortlist_heads (
  run_id uuid PRIMARY KEY REFERENCES public.newsletter_daily_runs(id)
    ON DELETE CASCADE,
  revision_id uuid NOT NULL UNIQUE,
  revision integer NOT NULL CHECK (revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (run_id, revision_id, revision) REFERENCES
    public.newsletter_editorial_shortlist_revisions(run_id, id, revision)
    ON DELETE CASCADE
);

CREATE INDEX newsletter_editorial_shortlist_heads_recent
  ON public.newsletter_editorial_shortlist_heads(updated_at DESC, run_id DESC);

ALTER TABLE public.newsletter_editorial_shortlist_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_editorial_shortlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_editorial_shortlist_heads ENABLE ROW LEVEL SECURITY;

-- Daily production is already performed through service-role server routes.
-- Removing direct browser mutation keeps an owner from deleting or rewriting
-- the queue underneath an append-only editorial decision. SELECT remains
-- available under the existing owner RLS policies, and auth-user deletion
-- still cascades the whole run and its ledger as an intentional erasure.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.newsletter_daily_runs,
  public.newsletter_daily_run_items
FROM authenticated;

CREATE POLICY service_role_all_newsletter_editorial_shortlist_revisions
  ON public.newsletter_editorial_shortlist_revisions
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_newsletter_editorial_shortlist_entries
  ON public.newsletter_editorial_shortlist_entries
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_newsletter_editorial_shortlist_heads
  ON public.newsletter_editorial_shortlist_heads
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE
  public.newsletter_editorial_shortlist_revisions,
  public.newsletter_editorial_shortlist_entries,
  public.newsletter_editorial_shortlist_heads
FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE
  public.newsletter_editorial_shortlist_revisions,
  public.newsletter_editorial_shortlist_entries,
  public.newsletter_editorial_shortlist_heads
FROM service_role;

-- Application reads use the service role. Writes are intentionally available
-- only through the SECURITY DEFINER RPC below, which owns validation, CAS, and
-- idempotency.
GRANT SELECT ON TABLE
  public.newsletter_editorial_shortlist_revisions,
  public.newsletter_editorial_shortlist_entries,
  public.newsletter_editorial_shortlist_heads
TO service_role;

CREATE OR REPLACE FUNCTION public.guard_newsletter_editorial_shortlist_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'newsletter editorial shortlist history is append-only';
END;
$$;

CREATE TRIGGER newsletter_editorial_shortlist_revisions_immutable
  BEFORE UPDATE ON public.newsletter_editorial_shortlist_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_newsletter_editorial_shortlist_history();

CREATE TRIGGER newsletter_editorial_shortlist_entries_immutable
  BEFORE UPDATE ON public.newsletter_editorial_shortlist_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_newsletter_editorial_shortlist_history();

REVOKE ALL ON FUNCTION
  public.guard_newsletter_editorial_shortlist_history()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_newsletter_editorial_shortlist(
  p_run_id uuid,
  p_expected_revision integer,
  p_idempotency_key text,
  p_algorithm_version text,
  p_baseline_fingerprint text,
  p_command_hash text,
  p_actor_id uuid,
  p_session_id text,
  p_catalog_tokens jsonb,
  p_entries jsonb
)
RETURNS TABLE (
  revision_id uuid,
  revision integer,
  changed boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  run_owner_id uuid;
  run_session_id text;
  current_revision integer := 0;
  next_revision integer;
  requested_count integer;
  parsed_count integer;
  unique_item_count integer;
  baseline_count integer;
  selected_count integer;
  valid_count integer;
  matching_item_count integer;
  catalog_count integer;
  matching_catalog_count integer;
  replay public.newsletter_editorial_shortlist_revisions%ROWTYPE;
  inserted public.newsletter_editorial_shortlist_revisions%ROWTYPE;
  canonical_request jsonb;
BEGIN
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'run id is required';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'expected revision must be zero or greater';
  END IF;
  IF p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' THEN
    RAISE EXCEPTION 'invalid shortlist idempotency key';
  END IF;
  IF p_algorithm_version IS NULL
    OR p_algorithm_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$' THEN
    RAISE EXCEPTION 'invalid shortlist algorithm version';
  END IF;
  IF p_baseline_fingerprint IS NULL
    OR p_baseline_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid shortlist baseline fingerprint';
  END IF;
  IF p_command_hash IS NULL OR p_command_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid shortlist command hash';
  END IF;
  IF p_catalog_tokens IS NULL
    OR jsonb_typeof(p_catalog_tokens) <> 'array'
    OR jsonb_array_length(p_catalog_tokens) > 50 THEN
    RAISE EXCEPTION 'invalid shortlist catalog tokens';
  END IF;
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'shortlist entries must be an array';
  END IF;

  requested_count := jsonb_array_length(p_entries);
  IF requested_count > 10 THEN
    RAISE EXCEPTION 'a shortlist revision cannot contain more than 10 union entries';
  END IF;

  -- Serialize every writer for one run without touching the automation run's
  -- own CAS timestamp. The same lock also closes the empty-head insert race.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'newsletter-editorial-shortlist:' || p_run_id::text,
      0
    )
  );

  -- Exact replays are resolved before consulting mutable run state. A client
  -- may lose the response to a committed save and retry after automation has
  -- advanced the run; that retry must return the original receipt rather than
  -- reinterpret or reject the already-recorded command.
  SELECT *
  INTO replay
  FROM public.newsletter_editorial_shortlist_revisions
  WHERE run_id = p_run_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF replay.command_hash IS DISTINCT FROM p_command_hash THEN
      RAISE EXCEPTION 'shortlist idempotency key was reused with a different request';
    END IF;
    IF replay.actor_id IS DISTINCT FROM p_actor_id
      OR replay.session_id IS DISTINCT FROM (
        CASE WHEN p_actor_id IS NULL THEN p_session_id ELSE NULL END
      ) THEN
      RAISE EXCEPTION 'shortlist replay scope does not match';
    END IF;
    RETURN QUERY SELECT replay.id, replay.revision, false, replay.created_at;
    RETURN;
  END IF;

  SELECT owner_id, session_id
  INTO run_owner_id, run_session_id
  FROM public.newsletter_daily_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'newsletter daily run not found';
  END IF;
  IF run_owner_id IS NOT NULL AND run_owner_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'shortlist actor does not own the newsletter daily run';
  END IF;
  IF run_owner_id IS NOT NULL AND p_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated shortlist requests cannot carry a session scope';
  END IF;
  IF run_owner_id IS NULL AND (
    p_actor_id IS NOT NULL
    OR p_session_id IS NULL
    OR p_session_id IS DISTINCT FROM run_session_id
  ) THEN
    RAISE EXCEPTION 'shortlist session does not own the newsletter daily run';
  END IF;

  canonical_request := jsonb_build_object(
    'expected_revision', p_expected_revision,
    'algorithm_version', p_algorithm_version,
    'baseline_fingerprint', p_baseline_fingerprint,
    'command_hash', p_command_hash,
    'actor_id', p_actor_id,
    'session_id', CASE WHEN run_owner_id IS NULL THEN p_session_id ELSE NULL END,
    'catalog_tokens', p_catalog_tokens,
    'entries', p_entries
  );

  -- Hold the mutable evidence stable through validation and insertion. The
  -- parent row's UPDATE lock also conflicts with the FK key-share lock needed
  -- by a concurrent item insertion, closing the cardinality phantom.
  PERFORM 1
  FROM public.newsletter_daily_run_items
  WHERE run_id = p_run_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.newsletter_drafts
  WHERE id IN (
    SELECT item.draft_id
    FROM public.newsletter_daily_run_items AS item
    WHERE item.run_id = p_run_id
      AND item.draft_id IS NOT NULL
  )
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.newsletter_beehiiv_deliveries
  WHERE draft_id IN (
    SELECT item.draft_id
    FROM public.newsletter_daily_run_items AS item
    WHERE item.run_id = p_run_id
      AND item.draft_id IS NOT NULL
  )
  ORDER BY id
  FOR SHARE;

  SELECT head.revision
  INTO current_revision
  FROM public.newsletter_editorial_shortlist_heads AS head
  WHERE head.run_id = p_run_id
  FOR UPDATE;
  current_revision := coalesce(current_revision, 0);

  IF current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'shortlist revision conflict: expected %, current %',
      p_expected_revision,
      current_revision;
  END IF;

  -- The presentation contains every selector input the editor saw, not just
  -- the final five. Headline-only work on an unrelated row does not cause a
  -- false conflict, while any eligibility/order change or insertion does.
  SELECT count(*), count(DISTINCT token.item_id)
  INTO catalog_count, unique_item_count
  FROM jsonb_to_recordset(p_catalog_tokens) AS token(
    item_id uuid,
    status text,
    quality_band text,
    draft_id uuid,
    rank integer,
    relevance_score numeric,
    confidence_score numeric,
    evidence_fingerprint text
  )
  WHERE token.item_id IS NOT NULL
    AND token.status IN (
      'queued', 'generating', 'generated', 'ready',
      'needs_attention', 'failed', 'published'
    )
    AND token.quality_band IN ('strong', 'review')
    AND token.rank >= 1
    AND token.relevance_score IS NOT NULL
    AND token.confidence_score IS NOT NULL
    AND token.evidence_fingerprint ~ '^[0-9a-f]{64}$';

  IF catalog_count <> jsonb_array_length(p_catalog_tokens)
    OR unique_item_count <> catalog_count THEN
    RAISE EXCEPTION 'shortlist catalog tokens are invalid';
  END IF;

  SELECT count(*)
  INTO matching_catalog_count
  FROM jsonb_to_recordset(p_catalog_tokens) AS token(
    item_id uuid,
    status text,
    quality_band text,
    draft_id uuid,
    rank integer,
    relevance_score numeric,
    confidence_score numeric,
    evidence_fingerprint text
  )
  JOIN public.newsletter_daily_run_items AS item
    ON item.id = token.item_id
    AND item.run_id = p_run_id
  LEFT JOIN public.newsletter_drafts AS draft
    ON draft.id = item.draft_id
  LEFT JOIN public.newsletter_beehiiv_deliveries AS delivery
    ON delivery.draft_id = draft.id
  WHERE token.status = CASE
      WHEN draft.status = 'published'
        OR delivery.lifecycle_status = 'published' THEN 'published'
      WHEN draft.status = 'ready' THEN 'ready'
      ELSE item.status
    END
    AND token.quality_band = item.quality_band
    AND token.draft_id IS NOT DISTINCT FROM item.draft_id
    AND token.rank = item.rank
    AND token.relevance_score = item.relevance_score
    AND token.confidence_score = item.confidence_score;

  IF matching_catalog_count <> catalog_count
    OR catalog_count <> (
      SELECT count(*)
      FROM public.newsletter_daily_run_items
      WHERE run_id = p_run_id
    ) THEN
    RAISE EXCEPTION 'shortlist presentation conflict: the newsletter run changed after it was presented';
  END IF;

  SELECT
    count(*),
    count(DISTINCT entry.item_id),
    count(*) FILTER (WHERE entry.baseline_position IS NOT NULL),
    count(*) FILTER (WHERE entry.selected_position IS NOT NULL),
    count(*) FILTER (WHERE
      entry.item_id IS NOT NULL
      AND (entry.baseline_position IS NOT NULL
        OR entry.selected_position IS NOT NULL)
      AND (entry.baseline_position IS NULL
        OR entry.baseline_position BETWEEN 1 AND 5)
      AND (entry.selected_position IS NULL
        OR entry.selected_position BETWEEN 1 AND 5)
      AND jsonb_typeof(entry.evidence_snapshot) = 'object'
      AND octet_length(entry.evidence_snapshot::text) <= 32768
      AND entry.item_updated_at IS NOT NULL
      AND (
        run_owner_id IS NULL
        OR entry.evidence_snapshot ->> 'draftId' IS NULL
        OR entry.draft_updated_at IS NOT NULL
      )
      AND entry.evidence_snapshot ->> 'itemId' = entry.item_id::text
      AND entry.evidence_snapshot ->> 'runId' = p_run_id::text
      AND (
        (entry.decision = 'retained'
          AND entry.baseline_position IS NOT NULL
          AND entry.selected_position IS NOT NULL
          AND entry.reason_code IS NULL)
        OR (entry.decision = 'promoted'
          AND entry.baseline_position IS NOT NULL
          AND entry.selected_position IS NOT NULL
          AND entry.reason_code IS NOT NULL)
        OR (entry.decision = 'demoted'
          AND entry.baseline_position IS NOT NULL
          AND entry.selected_position IS NOT NULL
          AND entry.reason_code IS NOT NULL)
        OR (entry.decision = 'removed'
          AND entry.baseline_position IS NOT NULL
          AND entry.selected_position IS NULL
          AND entry.reason_code IS NOT NULL)
        OR (entry.decision = 'added'
          AND entry.baseline_position IS NULL
          AND entry.selected_position IS NOT NULL
          AND entry.reason_code IS NOT NULL)
      )
      AND (entry.reason_code IS NULL OR entry.reason_code IN (
        'stronger_catalyst',
        'better_source_depth',
        'fresh_earnings',
        'audience_fit',
        'chart_quality',
        'duplicate_coverage',
        'weak_evidence',
        'stale_story',
        'other'
      ))
      AND (entry.note IS NULL OR length(entry.note) <= 500)
      AND (entry.reason_code IS DISTINCT FROM 'other'
        OR nullif(btrim(entry.note), '') IS NOT NULL)
    )
  INTO
    parsed_count,
    unique_item_count,
    baseline_count,
    selected_count,
    valid_count
  FROM jsonb_to_recordset(p_entries) AS entry(
    item_id uuid,
    baseline_position smallint,
    selected_position smallint,
    decision text,
    reason_code text,
    note text,
    item_updated_at timestamptz,
    draft_updated_at timestamptz,
    evidence_snapshot jsonb
  );

  IF parsed_count <> requested_count
    OR unique_item_count <> requested_count
    OR valid_count <> requested_count THEN
    RAISE EXCEPTION 'one or more shortlist entries are invalid';
  END IF;
  IF baseline_count > 5 OR selected_count > 5 THEN
    RAISE EXCEPTION 'a shortlist can contain at most five baseline and five selected items';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_entries) AS entry(
      item_id uuid,
      baseline_position smallint,
      selected_position smallint
    )
    WHERE entry.baseline_position IS NOT NULL
    GROUP BY entry.baseline_position
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_entries) AS entry(
      item_id uuid,
      baseline_position smallint,
      selected_position smallint
    )
    WHERE entry.selected_position IS NOT NULL
    GROUP BY entry.selected_position
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'shortlist positions must be unique';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.generate_series(1, baseline_count) AS expected(position)
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_entries) AS entry(
        item_id uuid,
        baseline_position smallint
      )
      WHERE entry.baseline_position = expected.position
    )
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.generate_series(1, selected_count) AS expected(position)
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_entries) AS entry(
        item_id uuid,
        selected_position smallint
      )
      WHERE entry.selected_position = expected.position
    )
  ) THEN
    RAISE EXCEPTION 'shortlist positions must be contiguous from one';
  END IF;

  SELECT count(*)
  INTO matching_item_count
  FROM jsonb_to_recordset(p_entries) AS entry(
    item_id uuid,
    baseline_position smallint,
    selected_position smallint,
    item_updated_at timestamptz,
    draft_updated_at timestamptz,
    evidence_snapshot jsonb
  )
  JOIN public.newsletter_daily_run_items AS item
    ON item.id = entry.item_id
    AND item.run_id = p_run_id
  LEFT JOIN public.newsletter_drafts AS draft
    ON draft.id = item.draft_id
  LEFT JOIN public.newsletter_beehiiv_deliveries AS delivery
    ON delivery.draft_id = draft.id
  WHERE entry.evidence_snapshot ->> 'itemId' = item.id::text
    AND entry.evidence_snapshot ->> 'runId' = item.run_id::text
    AND upper(entry.evidence_snapshot ->> 'ticker') = item.ticker
    AND CASE
      WHEN pg_catalog.pg_input_is_valid(
        entry.evidence_snapshot ->> 'rank',
        'integer'
      ) THEN (entry.evidence_snapshot ->> 'rank')::integer = item.rank
      ELSE false
    END
    AND entry.evidence_snapshot ->> 'qualityBand' = item.quality_band
    AND CASE
      WHEN pg_catalog.pg_input_is_valid(
        entry.evidence_snapshot ->> 'relevanceScore',
        'numeric'
      ) THEN (entry.evidence_snapshot ->> 'relevanceScore')::numeric
        = item.relevance_score
      ELSE false
    END
    AND CASE
      WHEN pg_catalog.pg_input_is_valid(
        entry.evidence_snapshot ->> 'confidenceScore',
        'numeric'
      ) THEN (entry.evidence_snapshot ->> 'confidenceScore')::numeric
        = item.confidence_score
      ELSE false
    END
    AND entry.evidence_snapshot ->> 'candidateType' = item.candidate_type
    AND (entry.evidence_snapshot ->> 'reasonType')
      IS NOT DISTINCT FROM item.reason_type
    AND entry.evidence_snapshot ->> 'headline' = item.headline
    AND entry.evidence_snapshot ->> 'status' = CASE
      WHEN draft.status = 'published'
        OR delivery.lifecycle_status = 'published' THEN 'published'
      WHEN draft.status = 'ready' THEN 'ready'
      ELSE item.status
    END
    AND entry.item_updated_at = item.updated_at
    AND entry.evidence_snapshot ->> 'draftId'
      IS NOT DISTINCT FROM item.draft_id::text
    AND (
      run_owner_id IS NULL
      OR item.draft_id IS NULL
      OR (
        draft.id IS NOT NULL
        AND entry.draft_updated_at = draft.updated_at
        AND entry.evidence_snapshot ->> 'subjectLine'
          IS NOT DISTINCT FROM draft.subject_line
        AND entry.evidence_snapshot ->> 'draftStatus' = draft.status
      )
    )
    AND (
      entry.baseline_position IS NULL
      OR (
        (CASE
          WHEN draft.status = 'published'
            OR delivery.lifecycle_status = 'published' THEN 'published'
          WHEN draft.status = 'ready' THEN 'ready'
          ELSE item.status
        END) IN ('generated', 'ready', 'published')
        AND item.quality_band = 'strong'
        AND item.draft_id IS NOT NULL
      )
    )
    AND (
      entry.selected_position IS NULL
      OR (
        (CASE
          WHEN draft.status = 'published'
            OR delivery.lifecycle_status = 'published' THEN 'published'
          WHEN draft.status = 'ready' THEN 'ready'
          ELSE item.status
        END) IN (
          'generated',
          'ready',
          'needs_attention',
          'published'
        )
        AND item.draft_id IS NOT NULL
      )
    );

  IF matching_item_count <> requested_count THEN
    RAISE EXCEPTION 'shortlist presentation conflict: one or more items changed after presentation';
  END IF;

  next_revision := current_revision + 1;
  INSERT INTO public.newsletter_editorial_shortlist_revisions (
    run_id,
    revision,
    algorithm_version,
    baseline_fingerprint,
    actor_id,
    session_id,
    command_hash,
    idempotency_key,
    request_payload,
    baseline_count,
    selected_count
  ) VALUES (
    p_run_id,
    next_revision,
    p_algorithm_version,
    p_baseline_fingerprint,
    p_actor_id,
    CASE WHEN run_owner_id IS NULL THEN p_session_id ELSE NULL END,
    p_command_hash,
    p_idempotency_key,
    canonical_request,
    baseline_count,
    selected_count
  )
  RETURNING * INTO inserted;

  INSERT INTO public.newsletter_editorial_shortlist_entries (
    revision_id,
    item_id,
    baseline_position,
    selected_position,
    decision,
    reason_code,
    note,
    evidence_snapshot
  )
  SELECT
    inserted.id,
    entry.item_id,
    entry.baseline_position,
    entry.selected_position,
    entry.decision,
    entry.reason_code,
    nullif(btrim(entry.note), ''),
    entry.evidence_snapshot
  FROM jsonb_to_recordset(p_entries) AS entry(
    item_id uuid,
    baseline_position smallint,
    selected_position smallint,
    decision text,
    reason_code text,
    note text,
    evidence_snapshot jsonb
  );

  INSERT INTO public.newsletter_editorial_shortlist_heads (
    run_id,
    revision_id,
    revision,
    updated_at
  ) VALUES (
    p_run_id,
    inserted.id,
    inserted.revision,
    inserted.created_at
  )
  ON CONFLICT (run_id) DO UPDATE
  SET
    revision_id = EXCLUDED.revision_id,
    revision = EXCLUDED.revision,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY
  SELECT inserted.id, inserted.revision, true, inserted.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.save_newsletter_editorial_shortlist(
  uuid,
  integer,
  text,
  text,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_newsletter_editorial_shortlist(
  uuid,
  integer,
  text,
  text,
  text,
  text,
  uuid,
  text,
  jsonb,
  jsonb
) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
