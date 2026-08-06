-- Make Beehiiv draft synchronization and lifecycle reconciliation safe under
-- concurrent requests, process interruption, and overlapping cron invocations.

ALTER TABLE public.newsletter_draft_events
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_draft_events_dedupe
  ON public.newsletter_draft_events(draft_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.newsletter_beehiiv_deliveries
  ADD COLUMN IF NOT EXISTS lifecycle_applied_status text,
  ADD COLUMN IF NOT EXISTS lifecycle_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconcile_lease_token uuid,
  ADD COLUMN IF NOT EXISTS reconcile_lease_expires_at timestamptz;

ALTER TABLE public.newsletter_beehiiv_deliveries
  DROP CONSTRAINT IF EXISTS newsletter_beehiiv_deliveries_applied_status_check;

ALTER TABLE public.newsletter_beehiiv_deliveries
  ADD CONSTRAINT newsletter_beehiiv_deliveries_applied_status_check
  CHECK (
    lifecycle_applied_status IS NULL
    OR lifecycle_applied_status IN (
      'draft',
      'scheduled',
      'published',
      'archived',
      'unknown'
    )
  );

-- Draft and unknown states have no downstream publication side effects. Leave
-- existing terminal states unapplied so the hardened reconciler verifies them.
UPDATE public.newsletter_beehiiv_deliveries
SET
  lifecycle_applied_status = lifecycle_status,
  lifecycle_applied_at = coalesce(last_reconciled_at, updated_at)
WHERE lifecycle_applied_status IS NULL
  AND lifecycle_status IN ('draft', 'unknown');

CREATE INDEX IF NOT EXISTS idx_newsletter_beehiiv_deliveries_reconcile_claim
  ON public.newsletter_beehiiv_deliveries(
    lifecycle_status,
    lifecycle_applied_status,
    last_reconciled_at,
    reconcile_lease_expires_at
  );

CREATE TABLE IF NOT EXISTS public.newsletter_beehiiv_sync_operations (
  draft_id uuid PRIMARY KEY
    REFERENCES public.newsletter_drafts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publication_id text NOT NULL,
  operation_kind text NOT NULL CHECK (operation_kind IN ('create', 'update')),
  operation_key text NOT NULL,
  content_hash text NOT NULL,
  title text NOT NULL,
  sync_state text NOT NULL DEFAULT 'claimed' CHECK (
    sync_state IN (
      'claimed',
      'creating',
      'updating',
      'remote_recorded',
      'completed',
      'failed',
      'ambiguous'
    )
  ),
  remote_post_id text,
  remote_preview_url text,
  remote_editor_url text,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_beehiiv_sync_operations_owner_state
  ON public.newsletter_beehiiv_sync_operations(owner_id, sync_state, updated_at);

ALTER TABLE public.newsletter_beehiiv_sync_operations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS newsletter_beehiiv_sync_operations_updated_at_trigger
  ON public.newsletter_beehiiv_sync_operations;
CREATE TRIGGER newsletter_beehiiv_sync_operations_updated_at_trigger
  BEFORE UPDATE ON public.newsletter_beehiiv_sync_operations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
SET search_path = public
AS $$
DECLARE
  operation_row public.newsletter_beehiiv_sync_operations%ROWTYPE;
  lease_duration interval := make_interval(
    secs => greatest(30, least(coalesce(p_lease_seconds, 90), 300))
  );
BEGIN
  IF p_operation_kind NOT IN ('create', 'update') THEN
    RAISE EXCEPTION 'Invalid Beehiiv sync operation kind';
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
    now() + lease_duration
  )
  ON CONFLICT (draft_id) DO NOTHING;

  SELECT *
  INTO operation_row
  FROM public.newsletter_beehiiv_sync_operations
  WHERE draft_id = p_draft_id
    AND owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF operation_row.lease_token = p_lease_token THEN
    RETURN NEXT operation_row;
    RETURN;
  END IF;

  IF operation_row.sync_state = 'creating'
    AND coalesce(operation_row.lease_expires_at, '-infinity'::timestamptz) < now()
  THEN
    UPDATE public.newsletter_beehiiv_sync_operations
    SET
      sync_state = 'ambiguous',
      lease_token = NULL,
      lease_expires_at = NULL,
      last_error = coalesce(
        operation_row.last_error,
        'Beehiiv create was interrupted after the remote-call boundary.'
      )
    WHERE draft_id = p_draft_id
    RETURNING * INTO operation_row;

    RETURN NEXT operation_row;
    RETURN;
  END IF;

  IF operation_row.sync_state = 'ambiguous' THEN
    RETURN NEXT operation_row;
    RETURN;
  END IF;

  IF operation_row.lease_expires_at IS NOT NULL
    AND operation_row.lease_expires_at >= now()
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
    UPDATE public.newsletter_beehiiv_sync_operations
    SET
      sync_state = 'remote_recorded',
      lease_token = p_lease_token,
      lease_expires_at = now() + lease_duration,
      attempt_count = attempt_count + 1,
      last_error = NULL
    WHERE draft_id = p_draft_id
    RETURNING * INTO operation_row;

    RETURN NEXT operation_row;
    RETURN;
  END IF;

  -- A recorded remote result is an immutable recovery record. Never attach it
  -- to a different publication, operation, marker, or content hash, and never
  -- discard it to start another remote create. The application reports this as
  -- an explicit manual-recovery conflict.
  IF operation_row.sync_state = 'remote_recorded' THEN
    RETURN NEXT operation_row;
    RETURN;
  END IF;

  UPDATE public.newsletter_beehiiv_sync_operations
  SET
    publication_id = p_publication_id,
    operation_kind = p_operation_kind,
    operation_key = p_operation_key,
    content_hash = p_content_hash,
    title = p_title,
    sync_state = 'claimed',
    remote_post_id = NULL,
    remote_preview_url = NULL,
    remote_editor_url = NULL,
    lease_token = p_lease_token,
    lease_expires_at = now() + lease_duration,
    attempt_count = attempt_count + 1,
    last_error = NULL,
    started_at = now(),
    completed_at = NULL
  WHERE draft_id = p_draft_id
  RETURNING * INTO operation_row;

  RETURN NEXT operation_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_newsletter_beehiiv_reconciliation(
  p_lease_token uuid,
  p_limit integer DEFAULT 12,
  p_lease_seconds integer DEFAULT 90
)
RETURNS SETOF public.newsletter_beehiiv_deliveries
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT delivery.id
    FROM public.newsletter_beehiiv_deliveries AS delivery
    WHERE (
      (
        delivery.lifecycle_status IN ('draft', 'scheduled', 'unknown')
        AND (
          delivery.last_reconciled_at IS NULL
          OR delivery.last_reconciled_at < now() - interval '10 minutes'
        )
      )
      OR (
        delivery.lifecycle_status = 'published'
        AND delivery.published_at >= now() - interval '7 days'
        AND (
          delivery.last_reconciled_at IS NULL
          OR delivery.last_reconciled_at < now() - interval '30 minutes'
        )
      )
      OR delivery.lifecycle_applied_status IS DISTINCT FROM delivery.lifecycle_status
      OR delivery.last_reconcile_error IS NOT NULL
    )
      AND (
        delivery.reconcile_lease_expires_at IS NULL
        OR delivery.reconcile_lease_expires_at < now()
        OR delivery.reconcile_lease_token = p_lease_token
      )
    ORDER BY delivery.last_reconciled_at ASC NULLS FIRST, delivery.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 12), 50))
  )
  UPDATE public.newsletter_beehiiv_deliveries AS delivery
  SET
    reconcile_lease_token = p_lease_token,
    reconcile_lease_expires_at = now() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 90), 300))
    )
  FROM candidates
  WHERE delivery.id = candidates.id
  RETURNING delivery.*;
$$;

CREATE OR REPLACE FUNCTION public.renew_newsletter_beehiiv_reconciliation(
  p_owner_id uuid,
  p_draft_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 90
)
RETURNS SETOF public.newsletter_beehiiv_deliveries
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.newsletter_beehiiv_deliveries AS delivery
  SET reconcile_lease_expires_at = now() + make_interval(
    secs => greatest(30, least(coalesce(p_lease_seconds, 90), 300))
  )
  WHERE delivery.owner_id = p_owner_id
    AND delivery.draft_id = p_draft_id
    AND delivery.reconcile_lease_token = p_lease_token
    AND delivery.reconcile_lease_expires_at > now()
  RETURNING delivery.*;
$$;

CREATE OR REPLACE FUNCTION public.update_newsletter_beehiiv_lifecycle_claim(
  p_owner_id uuid,
  p_draft_id uuid,
  p_post_id text,
  p_lease_token uuid,
  p_lifecycle_status text,
  p_beehiiv_status text,
  p_scheduled_at timestamptz,
  p_published_at timestamptz,
  p_web_url text,
  p_stats_json jsonb,
  p_error text DEFAULT NULL
)
RETURNS SETOF public.newsletter_beehiiv_deliveries
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.newsletter_beehiiv_deliveries AS delivery
  SET
    lifecycle_status = p_lifecycle_status,
    beehiiv_status = p_beehiiv_status,
    scheduled_at = p_scheduled_at,
    published_at = p_published_at,
    web_url = p_web_url,
    stats_json = coalesce(p_stats_json, '{}'::jsonb),
    last_reconciled_at = now(),
    last_reconcile_error = p_error
  WHERE delivery.owner_id = p_owner_id
    AND delivery.draft_id = p_draft_id
    AND delivery.beehiiv_post_id = p_post_id
    AND delivery.reconcile_lease_token = p_lease_token
    AND delivery.reconcile_lease_expires_at > now()
    AND NOT (
      (delivery.lifecycle_status = 'published'
        AND p_lifecycle_status IN ('draft', 'scheduled', 'unknown'))
      OR (delivery.lifecycle_status = 'archived'
        AND p_lifecycle_status <> 'archived')
    )
  RETURNING delivery.*;
$$;

CREATE OR REPLACE FUNCTION public.mark_newsletter_beehiiv_lifecycle_applied(
  p_owner_id uuid,
  p_draft_id uuid,
  p_lease_token uuid,
  p_lifecycle_status text
)
RETURNS SETOF public.newsletter_beehiiv_deliveries
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.newsletter_beehiiv_deliveries AS delivery
  SET
    lifecycle_applied_status = p_lifecycle_status,
    lifecycle_applied_at = now(),
    last_reconcile_error = NULL
  WHERE delivery.owner_id = p_owner_id
    AND delivery.draft_id = p_draft_id
    AND delivery.lifecycle_status = p_lifecycle_status
    AND delivery.reconcile_lease_token = p_lease_token
    AND delivery.reconcile_lease_expires_at > now()
  RETURNING delivery.*;
$$;

CREATE OR REPLACE FUNCTION public.record_newsletter_beehiiv_reconcile_error(
  p_owner_id uuid,
  p_draft_id uuid,
  p_lease_token uuid,
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.newsletter_beehiiv_deliveries AS delivery
  SET
    last_reconciled_at = now(),
    last_reconcile_error = left(p_error, 2000)
  WHERE delivery.owner_id = p_owner_id
    AND delivery.draft_id = p_draft_id
    AND delivery.reconcile_lease_token = p_lease_token
    AND delivery.reconcile_lease_expires_at > now();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_newsletter_beehiiv_sync(
  uuid, uuid, text, text, text, text, text, uuid, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_newsletter_beehiiv_sync(
  uuid, uuid, text, text, text, text, text, uuid, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.claim_newsletter_beehiiv_reconciliation(
  uuid, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_newsletter_beehiiv_reconciliation(
  uuid, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.renew_newsletter_beehiiv_reconciliation(
  uuid, uuid, uuid, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_newsletter_beehiiv_lifecycle_claim(
  uuid, uuid, text, uuid, text, text, timestamptz, timestamptz, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_newsletter_beehiiv_lifecycle_applied(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_newsletter_beehiiv_reconcile_error(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_newsletter_beehiiv_reconciliation(
  uuid, uuid, uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_newsletter_beehiiv_lifecycle_claim(
  uuid, uuid, text, uuid, text, text, timestamptz, timestamptz, text, jsonb, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_newsletter_beehiiv_lifecycle_applied(
  uuid, uuid, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_newsletter_beehiiv_reconcile_error(
  uuid, uuid, uuid, text
) TO service_role;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'newsletter-beehiiv-reconciliation'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  -- Small leased batches every minute keep a forty-issue morning inside the
  -- fifteen-minute lifecycle freshness target without overlapping work.
  PERFORM cron.schedule(
    'newsletter-beehiiv-reconciliation',
    '* 12-23 * * 1-5',
    $schedule$
      SELECT public.invoke_newsletter_beehiiv_reconciliation();
    $schedule$
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
