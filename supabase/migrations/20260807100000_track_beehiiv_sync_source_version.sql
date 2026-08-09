-- Tie every Beehiiv sync receipt to the exact newsletter_drafts.updated_at
-- version whose content crossed the remote boundary. A completion timestamp
-- cannot provide this guarantee: a newer draft may be saved while Beehiiv is
-- still processing the older payload.

ALTER TABLE public.newsletter_beehiiv_sync_operations
  ADD COLUMN IF NOT EXISTS source_draft_updated_at timestamptz;

ALTER TABLE public.newsletter_beehiiv_deliveries
  ADD COLUMN IF NOT EXISTS source_draft_updated_at timestamptz;

COMMENT ON COLUMN public.newsletter_beehiiv_sync_operations.source_draft_updated_at IS
  'Exact newsletter_drafts.updated_at version used to build this remote Beehiiv operation.';

COMMENT ON COLUMN public.newsletter_beehiiv_deliveries.source_draft_updated_at IS
  'Exact newsletter_drafts.updated_at version represented by the remote Beehiiv content. NULL marks a legacy receipt that predates source-version tracking.';

-- During a rolling deploy, an older application instance may update content
-- without knowing about source_draft_updated_at. Never let it accidentally
-- carry the previous content version forward as proof for a new payload.
CREATE OR REPLACE FUNCTION public.clear_stale_beehiiv_source_draft_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.content_hash IS DISTINCT FROM OLD.content_hash
    AND NEW.source_draft_updated_at IS NOT DISTINCT FROM OLD.source_draft_updated_at
  THEN
    NEW.source_draft_updated_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS newsletter_beehiiv_sync_operations_clear_source_version
  ON public.newsletter_beehiiv_sync_operations;
CREATE TRIGGER newsletter_beehiiv_sync_operations_clear_source_version
  BEFORE UPDATE ON public.newsletter_beehiiv_sync_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_stale_beehiiv_source_draft_version();

DROP TRIGGER IF EXISTS newsletter_beehiiv_deliveries_clear_source_version
  ON public.newsletter_beehiiv_deliveries;
CREATE TRIGGER newsletter_beehiiv_deliveries_clear_source_version
  BEFORE UPDATE ON public.newsletter_beehiiv_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_stale_beehiiv_source_draft_version();

REVOKE ALL ON FUNCTION public.clear_stale_beehiiv_source_draft_version()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_stale_beehiiv_source_draft_version()
  TO service_role;

-- An update request can continue running at Beehiiv after our lease expires.
-- Fence an expired `updating` row before either the legacy claim or the v2
-- claim can replace it. No automatic retry may clear this state: even an
-- identical retry cannot prove that the original timed-out request has stopped
-- and will not apply after some later different-content sync.
CREATE OR REPLACE FUNCTION public.fence_indeterminate_beehiiv_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.operation_kind = 'update'
    AND (
      (
        OLD.sync_state = 'updating'
        AND (
          (
            NEW.sync_state = 'claimed'
            AND coalesce(
              OLD.lease_expires_at,
              '-infinity'::timestamptz
            ) < pg_catalog.clock_timestamp()
          )
          OR (
            NEW.sync_state = 'failed'
            AND OLD.source_draft_updated_at IS NULL
          )
        )
      )
      OR (
        -- Defense in depth for a legacy failed row that committed immediately
        -- before this migration's one-time backfill became visible.
        OLD.sync_state = 'failed'
        AND OLD.source_draft_updated_at IS NULL
        AND NEW.sync_state = 'claimed'
      )
    )
  THEN
    NEW.publication_id := OLD.publication_id;
    NEW.operation_kind := OLD.operation_kind;
    NEW.operation_key := OLD.operation_key;
    NEW.content_hash := OLD.content_hash;
    NEW.source_draft_updated_at := OLD.source_draft_updated_at;
    NEW.title := OLD.title;
    NEW.sync_state := 'ambiguous';
    NEW.remote_post_id := OLD.remote_post_id;
    NEW.remote_preview_url := OLD.remote_preview_url;
    NEW.remote_editor_url := OLD.remote_editor_url;
    NEW.lease_token := NULL;
    NEW.lease_expires_at := NULL;
    NEW.attempt_count := OLD.attempt_count;
    NEW.last_error := coalesce(
      NEW.last_error,
      OLD.last_error,
      'Beehiiv update was interrupted after the remote-call boundary.'
    );
    NEW.started_at := OLD.started_at;
    NEW.completed_at := OLD.completed_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS newsletter_beehiiv_sync_operations_ambiguous_update_fence
  ON public.newsletter_beehiiv_sync_operations;
CREATE TRIGGER newsletter_beehiiv_sync_operations_ambiguous_update_fence
  BEFORE UPDATE ON public.newsletter_beehiiv_sync_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.fence_indeterminate_beehiiv_update();

REVOKE ALL ON FUNCTION public.fence_indeterminate_beehiiv_update()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fence_indeterminate_beehiiv_update()
  TO service_role;

-- Every pre-migration update failure is indeterminate: the legacy application
-- classified transport timeouts as `failed`, even though Beehiiv could still
-- apply them later. Fence both those rows and any update already beyond the
-- remote-call boundary before a new application instance can claim them.
UPDATE public.newsletter_beehiiv_sync_operations AS operation
SET
  sync_state = 'ambiguous',
  lease_token = NULL,
  lease_expires_at = NULL,
  last_error = coalesce(
    operation.last_error,
    'Legacy Beehiiv update may still finish after the source-version migration.'
  )
WHERE operation.operation_kind = 'update'
  AND operation.source_draft_updated_at IS NULL
  AND operation.sync_state IN ('failed', 'updating');

-- Preserve the legacy signature during a migration-first rolling deploy, but
-- serialize its first claim against publication. If publication committed
-- first, the draft is no longer ready and v1 returns no claim. If v1 locked
-- first, publication waits and then sees the claimed operation in its trigger.
CREATE OR REPLACE FUNCTION public.claim_newsletter_beehiiv_sync(
  p_owner_id uuid,
  p_draft_id uuid,
  p_publication_id text,
  p_operation_kind text,
  p_operation_key text,
  p_content_hash text,
  p_title text,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 90
)
RETURNS SETOF public.newsletter_beehiiv_sync_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_row public.newsletter_beehiiv_sync_operations%ROWTYPE;
  lease_duration interval := pg_catalog.make_interval(
    secs => greatest(30, least(coalesce(p_lease_seconds, 90), 300))
  );
BEGIN
  IF p_operation_kind NOT IN ('create', 'update') THEN
    RAISE EXCEPTION 'Invalid Beehiiv sync operation kind';
  END IF;

  PERFORM 1
  FROM public.newsletter_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.owner_id = p_owner_id
    AND draft.status = 'ready'
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.newsletter_beehiiv_sync_operations (
    draft_id,
    owner_id,
    publication_id,
    operation_kind,
    operation_key,
    content_hash,
    title,
    sync_state,
    lease_token,
    lease_expires_at
  )
  VALUES (
    p_draft_id,
    p_owner_id,
    p_publication_id,
    p_operation_kind,
    p_operation_key,
    p_content_hash,
    p_title,
    'claimed',
    p_lease_token,
    pg_catalog.now() + lease_duration
  )
  ON CONFLICT (draft_id) DO NOTHING;

  SELECT operation.*
  INTO operation_row
  FROM public.newsletter_beehiiv_sync_operations AS operation
  WHERE operation.draft_id = p_draft_id
    AND operation.owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF operation_row.lease_token = p_lease_token THEN
    RETURN NEXT operation_row;
    RETURN;
  END IF;

  IF operation_row.sync_state = 'creating'
    AND coalesce(
      operation_row.lease_expires_at,
      '-infinity'::timestamptz
    ) < pg_catalog.now()
  THEN
    UPDATE public.newsletter_beehiiv_sync_operations AS operation
    SET
      sync_state = 'ambiguous',
      lease_token = NULL,
      lease_expires_at = NULL,
      last_error = coalesce(
        operation_row.last_error,
        'Beehiiv create was interrupted after the remote-call boundary.'
      )
    WHERE operation.draft_id = p_draft_id
    RETURNING operation.* INTO operation_row;

    RETURN NEXT operation_row;
    RETURN;
  END IF;

  IF operation_row.sync_state = 'ambiguous' THEN
    RETURN NEXT operation_row;
    RETURN;
  END IF;

  IF operation_row.lease_expires_at IS NOT NULL
    AND operation_row.lease_expires_at >= pg_catalog.now()
  THEN
    RETURN NEXT operation_row;
    RETURN;
  END IF;

  IF (
      operation_row.sync_state = 'remote_recorded'
      OR (
        operation_row.sync_state = 'completed'
        AND operation_row.operation_kind = 'create'
      )
    )
    AND operation_row.publication_id = p_publication_id
    AND operation_row.operation_kind = p_operation_kind
    AND operation_row.operation_key = p_operation_key
    AND operation_row.content_hash = p_content_hash
    AND operation_row.remote_post_id IS NOT NULL
  THEN
    UPDATE public.newsletter_beehiiv_sync_operations AS operation
    SET
      sync_state = 'remote_recorded',
      lease_token = p_lease_token,
      lease_expires_at = pg_catalog.now() + lease_duration,
      attempt_count = attempt_count + 1,
      last_error = NULL
    WHERE operation.draft_id = p_draft_id
    RETURNING operation.* INTO operation_row;

    RETURN NEXT operation_row;
    RETURN;
  END IF;

  IF operation_row.sync_state = 'remote_recorded' THEN
    RETURN NEXT operation_row;
    RETURN;
  END IF;

  UPDATE public.newsletter_beehiiv_sync_operations AS operation
  SET
    publication_id = p_publication_id,
    operation_kind = p_operation_kind,
    operation_key = p_operation_key,
    content_hash = p_content_hash,
    -- A legacy caller cannot attest which draft version produced this new
    -- remote attempt. Clear even same-hash evidence so an updating->failed
    -- timeout is conservatively ambiguity-fenced during deployment overlap.
    source_draft_updated_at = NULL,
    title = p_title,
    sync_state = 'claimed',
    remote_post_id = NULL,
    remote_preview_url = NULL,
    remote_editor_url = NULL,
    lease_token = p_lease_token,
    lease_expires_at = pg_catalog.now() + lease_duration,
    attempt_count = attempt_count + 1,
    last_error = NULL,
    started_at = pg_catalog.now(),
    completed_at = NULL
  WHERE operation.draft_id = p_draft_id
  RETURNING operation.* INTO operation_row;

  RETURN NEXT operation_row;
END;
$$;

-- Keep the original claim_newsletter_beehiiv_sync signature intact for an
-- older application during deployment overlap. V2 delegates all lease and
-- recovery decisions to V1, then durably binds an owned claim to the source
-- draft version. An ambiguous update remains permanently fenced: even an
-- identical retry cannot prove that the original timed-out request will not
-- apply after a later different-content sync.
CREATE OR REPLACE FUNCTION public.claim_newsletter_beehiiv_sync_v2(
  p_owner_id uuid,
  p_draft_id uuid,
  p_publication_id text,
  p_operation_kind text,
  p_operation_key text,
  p_content_hash text,
  p_title text,
  p_source_draft_updated_at timestamptz,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 90
)
RETURNS SETOF public.newsletter_beehiiv_sync_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_row public.newsletter_beehiiv_sync_operations%ROWTYPE;
BEGIN
  IF p_source_draft_updated_at IS NULL THEN
    RAISE EXCEPTION 'Beehiiv sync source draft version is required';
  END IF;

  -- This exact-version row lock closes the missing-operation phantom with
  -- publication. Claim-first makes publication wait and observe the operation;
  -- publication-first changes status/updated_at, so this returns no claim.
  PERFORM 1
  FROM public.newsletter_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.owner_id = p_owner_id
    AND draft.status = 'ready'
    AND draft.updated_at = p_source_draft_updated_at
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT claimed.*
  INTO operation_row
  FROM public.claim_newsletter_beehiiv_sync(
    p_owner_id,
    p_draft_id,
    p_publication_id,
    p_operation_kind,
    p_operation_key,
    p_content_hash,
    p_title,
    p_lease_token,
    p_lease_seconds
  ) AS claimed
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF operation_row.lease_token = p_lease_token
    AND operation_row.publication_id = p_publication_id
    AND operation_row.operation_kind = p_operation_kind
    AND operation_row.operation_key = p_operation_key
    AND operation_row.content_hash = p_content_hash
  THEN
    UPDATE public.newsletter_beehiiv_sync_operations AS operation
    SET source_draft_updated_at = p_source_draft_updated_at
    WHERE operation.draft_id = p_draft_id
      AND operation.owner_id = p_owner_id
      AND operation.lease_token = p_lease_token
    RETURNING operation.* INTO operation_row;
  END IF;

  RETURN NEXT operation_row;
END;
$$;

-- PostgreSQL performs this comparison at full timestamptz precision. This
-- avoids JavaScript Date's millisecond truncation hiding a save that occurred
-- only a few microseconds after the version sent to Beehiiv.
CREATE OR REPLACE FUNCTION public.is_newsletter_draft_source_version_current(
  p_owner_id uuid,
  p_draft_id uuid,
  p_source_draft_updated_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.newsletter_drafts AS draft
    WHERE draft.id = p_draft_id
      AND draft.owner_id = p_owner_id
      AND draft.updated_at = p_source_draft_updated_at
  );
$$;

-- Advance a byte-identical delivery receipt to a newer local row version only
-- when both the current draft and every stable receipt field still match the
-- caller's observation. This defensive CAS cannot overwrite a newer sync
-- receipt; the primary unchanged-content flow additionally uses the leased,
-- atomic recorded-operation persistence below.
CREATE OR REPLACE FUNCTION public.rebind_newsletter_beehiiv_delivery_source_version(
  p_owner_id uuid,
  p_draft_id uuid,
  p_publication_id text,
  p_post_id text,
  p_content_hash text,
  p_expected_source_draft_updated_at timestamptz,
  p_source_draft_updated_at timestamptz
)
RETURNS SETOF public.newsletter_beehiiv_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_source_draft_updated_at IS NULL THEN
    RAISE EXCEPTION 'Beehiiv delivery source draft version is required';
  END IF;

  -- Hold the source row stable until the receipt update commits. If a save won
  -- the race before this lock, its newer updated_at makes the function return
  -- no row instead of blessing stale content.
  PERFORM 1
  FROM public.newsletter_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.owner_id = p_owner_id
    AND draft.updated_at = p_source_draft_updated_at
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.newsletter_beehiiv_deliveries AS delivery
  SET source_draft_updated_at = p_source_draft_updated_at
  WHERE delivery.owner_id = p_owner_id
    AND delivery.draft_id = p_draft_id
    AND delivery.publication_id = p_publication_id
    AND delivery.beehiiv_post_id = p_post_id
    AND delivery.content_hash = p_content_hash
    AND delivery.source_draft_updated_at IS NOT DISTINCT FROM
      p_expected_source_draft_updated_at
  RETURNING delivery.*;
END;
$$;

-- Persist a recorded remote result and complete its lease as one transaction.
-- Checking ownership before the delivery upsert prevents a stalled recovery
-- request from waking after B completed and C synced newer content, overwriting
-- C's receipt, and only then discovering that A's lease was obsolete.
CREATE OR REPLACE FUNCTION public.persist_newsletter_beehiiv_sync_receipt(
  p_owner_id uuid,
  p_draft_id uuid,
  p_lease_token uuid
)
RETURNS SETOF public.newsletter_beehiiv_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  operation_row public.newsletter_beehiiv_sync_operations%ROWTYPE;
  delivery_row public.newsletter_beehiiv_deliveries%ROWTYPE;
BEGIN
  -- Keep lock order consistent with publication: draft, operation, delivery.
  -- The source need not still be current; an older remote result must still be
  -- receipted so the newer local version is explicitly shown as needing sync.
  PERFORM 1
  FROM public.newsletter_drafts AS draft
  WHERE draft.id = p_draft_id
    AND draft.owner_id = p_owner_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT operation.*
  INTO operation_row
  FROM public.newsletter_beehiiv_sync_operations AS operation
  WHERE operation.owner_id = p_owner_id
    AND operation.draft_id = p_draft_id
    AND operation.lease_token = p_lease_token
    AND operation.sync_state = 'remote_recorded'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF operation_row.remote_post_id IS NULL
    OR operation_row.remote_editor_url IS NULL
    OR operation_row.source_draft_updated_at IS NULL
  THEN
    RAISE EXCEPTION
      'Recorded Beehiiv sync is missing durable receipt fields';
  END IF;

  INSERT INTO public.newsletter_beehiiv_deliveries (
    draft_id,
    owner_id,
    publication_id,
    beehiiv_post_id,
    title,
    preview_url,
    editor_url,
    content_hash,
    source_draft_updated_at,
    synced_at
  )
  VALUES (
    operation_row.draft_id,
    operation_row.owner_id,
    operation_row.publication_id,
    operation_row.remote_post_id,
    operation_row.title,
    operation_row.remote_preview_url,
    operation_row.remote_editor_url,
    operation_row.content_hash,
    operation_row.source_draft_updated_at,
    pg_catalog.clock_timestamp()
  )
  ON CONFLICT (draft_id) DO UPDATE
  SET
    publication_id = EXCLUDED.publication_id,
    beehiiv_post_id = EXCLUDED.beehiiv_post_id,
    title = EXCLUDED.title,
    preview_url = EXCLUDED.preview_url,
    editor_url = EXCLUDED.editor_url,
    content_hash = EXCLUDED.content_hash,
    source_draft_updated_at = EXCLUDED.source_draft_updated_at,
    synced_at = EXCLUDED.synced_at
  WHERE newsletter_beehiiv_deliveries.owner_id = operation_row.owner_id
  RETURNING * INTO delivery_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Beehiiv delivery belongs to another owner';
  END IF;

  -- The rolling-writer trigger deliberately clears unchanged source evidence
  -- when content_hash changes. This second, same-transaction assignment is the
  -- source-aware writer's proof that the new hash came from this operation.
  UPDATE public.newsletter_beehiiv_deliveries AS delivery
  SET source_draft_updated_at = operation_row.source_draft_updated_at
  WHERE delivery.id = delivery_row.id
    AND delivery.owner_id = operation_row.owner_id
  RETURNING delivery.* INTO delivery_row;

  UPDATE public.newsletter_beehiiv_sync_operations AS operation
  SET
    sync_state = 'completed',
    lease_token = NULL,
    lease_expires_at = NULL,
    completed_at = pg_catalog.clock_timestamp(),
    last_error = NULL
  WHERE operation.owner_id = p_owner_id
    AND operation.draft_id = p_draft_id
    AND operation.lease_token = p_lease_token
    AND operation.sync_state = 'remote_recorded';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Beehiiv sync lease was superseded before completion';
  END IF;

  RETURN NEXT delivery_row;
END;
$$;

-- Publication and archive/status bookkeeping changes updated_at without
-- changing the bytes exported to Beehiiv. Keep that content-version receipt
-- current in the same transaction. A managed publication transition is also
-- rejected at the database boundary unless its receipt represented OLD, which
-- closes the race between the application-level check and the draft update.
CREATE OR REPLACE FUNCTION public.rebind_beehiiv_metadata_only_draft_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  content_is_equivalent boolean;
  managed_delivery_exists boolean;
  managed_sync_state text;
  rebound_count integer;
  publication_transition boolean;
BEGIN
  IF TG_OP <> 'UPDATE'
    OR NEW.owner_id IS NULL
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
    -- Derived-column migrations deliberately disable the draft timestamp
    -- trigger. With no version advance there is nothing to rebind, and a
    -- no-op delivery UPDATE would only falsify its operational recency.
    OR NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
  THEN
    RETURN NEW;
  END IF;

  publication_transition :=
    NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published';
  content_is_equivalent :=
    (NEW.draft_json - 'publication') IS NOT DISTINCT FROM
      (OLD.draft_json - 'publication');

  IF publication_transition THEN
    SELECT operation.sync_state
    INTO managed_sync_state
    FROM public.newsletter_beehiiv_sync_operations AS operation
    WHERE operation.owner_id = NEW.owner_id
      AND operation.draft_id = NEW.id
    FOR UPDATE;

    IF managed_sync_state IN (
      'claimed',
      'creating',
      'updating',
      'remote_recorded',
      'ambiguous'
    ) THEN
      RAISE EXCEPTION
        'Managed Beehiiv sync is still in flight or needs recovery';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.newsletter_beehiiv_deliveries AS delivery
    WHERE delivery.owner_id = NEW.owner_id
      AND delivery.draft_id = NEW.id
  )
  INTO managed_delivery_exists;

  IF publication_transition AND managed_delivery_exists THEN
    IF NOT content_is_equivalent THEN
      RAISE EXCEPTION
        'Managed Beehiiv publication content does not match the saved draft version';
    END IF;

    UPDATE public.newsletter_beehiiv_deliveries AS delivery
    SET source_draft_updated_at = NEW.updated_at
    WHERE delivery.owner_id = NEW.owner_id
      AND delivery.draft_id = NEW.id
      AND delivery.source_draft_updated_at = OLD.updated_at;
    GET DIAGNOSTICS rebound_count = ROW_COUNT;

    IF rebound_count <> 1 THEN
      RAISE EXCEPTION
        'Managed Beehiiv publication source version does not match the saved draft version';
    END IF;
  ELSIF content_is_equivalent THEN
    -- Archive/restore and other status-only changes do not alter Beehiiv bytes.
    -- A stale or legacy receipt simply does not match OLD and is left stale.
    UPDATE public.newsletter_beehiiv_deliveries AS delivery
    SET source_draft_updated_at = NEW.updated_at
    WHERE delivery.owner_id = NEW.owner_id
      AND delivery.draft_id = NEW.id
      AND delivery.source_draft_updated_at = OLD.updated_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS newsletter_drafts_rebind_beehiiv_metadata_version
  ON public.newsletter_drafts;
CREATE TRIGGER newsletter_drafts_rebind_beehiiv_metadata_version
  AFTER UPDATE ON public.newsletter_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.rebind_beehiiv_metadata_only_draft_update();

REVOKE ALL ON FUNCTION public.claim_newsletter_beehiiv_sync_v2(
  uuid, uuid, text, text, text, text, text, timestamptz, uuid, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_newsletter_beehiiv_sync_v2(
  uuid, uuid, text, text, text, text, text, timestamptz, uuid, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.is_newsletter_draft_source_version_current(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_newsletter_draft_source_version_current(
  uuid, uuid, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.rebind_newsletter_beehiiv_delivery_source_version(
  uuid, uuid, text, text, text, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebind_newsletter_beehiiv_delivery_source_version(
  uuid, uuid, text, text, text, timestamptz, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.persist_newsletter_beehiiv_sync_receipt(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_newsletter_beehiiv_sync_receipt(
  uuid, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.rebind_beehiiv_metadata_only_draft_update()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebind_beehiiv_metadata_only_draft_update()
  TO service_role;

NOTIFY pgrst, 'reload schema';
