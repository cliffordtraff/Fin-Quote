-- A disconnected Beehiiv account cannot be reconciled. Keep its durable
-- delivery history intact, but do not let those rows make the global cron
-- heartbeat fail on every invocation. If the owner reconnects, the existing
-- lifecycle/error predicates make the same rows immediately claimable again.

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
    WHERE EXISTS (
      SELECT 1
      FROM public.newsletter_integrations AS integration
      WHERE integration.owner_id = delivery.owner_id
        AND integration.provider = 'beehiiv'
    )
      AND (
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

NOTIFY pgrst, 'reload schema';
