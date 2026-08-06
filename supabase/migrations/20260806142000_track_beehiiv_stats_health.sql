-- Lifecycle reconciliation can succeed while Beehiiv's optional statistics
-- endpoint fails. Preserve that distinction instead of silently presenting a
-- stale analytics snapshot as fresh.

ALTER TABLE public.newsletter_beehiiv_deliveries
  ADD COLUMN IF NOT EXISTS stats_last_fetched_at timestamptz,
  ADD COLUMN IF NOT EXISTS stats_last_error text;

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
    stats_json = CASE
      WHEN p_error IS NULL THEN coalesce(p_stats_json, '{}'::jsonb)
      ELSE delivery.stats_json
    END,
    stats_last_fetched_at = CASE
      WHEN p_error IS NULL THEN statement_timestamp()
      ELSE delivery.stats_last_fetched_at
    END,
    stats_last_error = CASE
      WHEN p_error IS NULL THEN NULL
      ELSE left(p_error, 2000)
    END,
    last_reconciled_at = statement_timestamp(),
    last_reconcile_error = NULL
  WHERE delivery.owner_id = p_owner_id
    AND delivery.draft_id = p_draft_id
    AND delivery.beehiiv_post_id = p_post_id
    AND delivery.reconcile_lease_token = p_lease_token
    AND delivery.reconcile_lease_expires_at > statement_timestamp()
    AND NOT (
      (delivery.lifecycle_status = 'published'
        AND p_lifecycle_status IN ('draft', 'scheduled', 'unknown'))
      OR (delivery.lifecycle_status = 'archived'
        AND p_lifecycle_status <> 'archived')
    )
  RETURNING delivery.*;
$$;

REVOKE ALL ON FUNCTION public.update_newsletter_beehiiv_lifecycle_claim(
  uuid, uuid, text, uuid, text, text, timestamptz, timestamptz, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_newsletter_beehiiv_lifecycle_claim(
  uuid, uuid, text, uuid, text, text, timestamptz, timestamptz, text, jsonb, text
) TO service_role;

COMMENT ON COLUMN public.newsletter_beehiiv_deliveries.stats_last_error IS
  'Last isolated get_post_stats failure; lifecycle reconciliation may still be healthy.';

NOTIFY pgrst, 'reload schema';
