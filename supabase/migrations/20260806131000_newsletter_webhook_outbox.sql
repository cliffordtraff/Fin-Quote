-- Durable, signed delivery for operator-facing newsletter notifications.
-- Notifications remain the source of truth; this outbox owns delivery state,
-- retry timing, and the lease used by the bounded application processor.

CREATE TABLE IF NOT EXISTS public.newsletter_webhook_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  notification_id uuid UNIQUE
    REFERENCES public.newsletter_notifications(id) ON DELETE CASCADE,
  scope_key text NOT NULL,
  payload_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'delivering', 'delivered')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  last_error text,
  delivered_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'delivered' AND delivered_at IS NOT NULL)
    OR (status <> 'delivered' AND delivered_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_newsletter_webhook_outbox_due
  ON public.newsletter_webhook_outbox(next_attempt_at, created_at)
  WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_newsletter_webhook_outbox_scope
  ON public.newsletter_webhook_outbox(scope_key, created_at DESC);

ALTER TABLE public.newsletter_webhook_outbox ENABLE ROW LEVEL SECURITY;

-- There are intentionally no browser-facing policies. The application uses
-- the service role, and the claim/complete functions are granted only to it.
REVOKE ALL ON TABLE public.newsletter_webhook_outbox
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.newsletter_webhook_outbox TO service_role;

-- Browser clients may see their own notifications and may perform exactly one
-- mutation: transition read_at from NULL to a server timestamp. Payload,
-- ownership, delivery, and dedupe fields remain service-only so a browser
-- cannot rewrite a signed webhook or suppress its delivery.
DROP POLICY IF EXISTS "Users can update own newsletter notifications"
  ON public.newsletter_notifications;
CREATE POLICY "Users can mark own newsletter notifications read"
  ON public.newsletter_notifications
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

REVOKE ALL ON TABLE public.newsletter_notifications
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE (read_at)
  ON TABLE public.newsletter_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.newsletter_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.guard_newsletter_notification_user_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.scope_key IS DISTINCT FROM OLD.scope_key
      OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
      OR NEW.session_id IS DISTINCT FROM OLD.session_id
      OR NEW.market_date IS DISTINCT FROM OLD.market_date
      OR NEW.notification_type IS DISTINCT FROM OLD.notification_type
      OR NEW.severity IS DISTINCT FROM OLD.severity
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.message IS DISTINCT FROM OLD.message
      OR NEW.action_url IS DISTINCT FROM OLD.action_url
      OR NEW.metadata_json IS DISTINCT FROM OLD.metadata_json
      OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
      OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION
        'Authenticated users may only mark their own newsletter notification read';
    END IF;

    IF NEW.read_at IS NULL THEN
      RAISE EXCEPTION 'A read notification cannot be marked unread';
    END IF;
    NEW.read_at := coalesce(OLD.read_at, now());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_newsletter_notification_user_update()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_newsletter_notifications_user_update_guard
  ON public.newsletter_notifications;
CREATE TRIGGER a_newsletter_notifications_user_update_guard
  BEFORE UPDATE ON public.newsletter_notifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_newsletter_notification_user_update();

DROP TRIGGER IF EXISTS newsletter_webhook_outbox_updated_at_trigger
  ON public.newsletter_webhook_outbox;
CREATE TRIGGER newsletter_webhook_outbox_updated_at_trigger
  BEFORE UPDATE ON public.newsletter_webhook_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enqueue_newsletter_notification_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.delivered_at IS NOT NULL THEN
    UPDATE public.newsletter_webhook_outbox
    SET
      status = 'delivered',
      delivered_at = coalesce(delivered_at, NEW.delivered_at),
      last_error = NULL,
      lease_token = NULL,
      lease_expires_at = NULL
    WHERE notification_id = NEW.id
      AND delivered_at IS NULL;
    RETURN NEW;
  END IF;

  INSERT INTO public.newsletter_webhook_outbox (
    event_id,
    notification_id,
    scope_key,
    payload_json
  )
  VALUES (
    NEW.id,
    NEW.id,
    NEW.scope_key,
    jsonb_build_object(
      'source', 'the-intraday-newsletter',
      'eventId', NEW.id,
      'eventType', 'newsletter.notification',
      'notification', jsonb_build_object(
        'id', NEW.id,
        'marketDate', NEW.market_date,
        'type', NEW.notification_type,
        'severity', NEW.severity,
        'title', NEW.title,
        'message', NEW.message,
        'actionUrl', NEW.action_url,
        'metadata', NEW.metadata_json,
        'dedupeKey', NEW.dedupe_key,
        'createdAt', NEW.created_at,
        'updatedAt', NEW.updated_at
      )
    )
  )
  -- event_id is also the receiver's idempotency key, so its exact payload must
  -- remain immutable across retries and deduplicated notification refreshes.
  ON CONFLICT (notification_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS newsletter_notifications_webhook_outbox_trigger
  ON public.newsletter_notifications;
CREATE TRIGGER newsletter_notifications_webhook_outbox_trigger
  AFTER INSERT OR UPDATE OF
    scope_key,
    market_date,
    notification_type,
    severity,
    title,
    message,
    action_url,
    metadata_json,
    dedupe_key,
    delivered_at
  ON public.newsletter_notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_newsletter_notification_webhook();

REVOKE ALL ON FUNCTION public.enqueue_newsletter_notification_webhook()
  FROM PUBLIC, anon, authenticated;

-- Backfill undelivered notifications so enabling the destination later does
-- not lose alerts created before this migration.
INSERT INTO public.newsletter_webhook_outbox (
  event_id,
  notification_id,
  scope_key,
  payload_json,
  next_attempt_at
)
SELECT
  notification.id,
  notification.id,
  notification.scope_key,
  jsonb_build_object(
    'source', 'the-intraday-newsletter',
    'eventId', notification.id,
    'eventType', 'newsletter.notification',
    'notification', jsonb_build_object(
      'id', notification.id,
      'marketDate', notification.market_date,
      'type', notification.notification_type,
      'severity', notification.severity,
      'title', notification.title,
      'message', notification.message,
      'actionUrl', notification.action_url,
      'metadata', notification.metadata_json,
      'dedupeKey', notification.dedupe_key,
      'createdAt', notification.created_at,
      'updatedAt', notification.updated_at
    )
  ),
  now()
FROM public.newsletter_notifications AS notification
WHERE notification.delivered_at IS NULL
  AND notification.created_at >= now() - interval '7 days'
ON CONFLICT (notification_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_newsletter_webhook_outbox(
  p_lease_token uuid,
  p_limit integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 45,
  p_outbox_id uuid DEFAULT NULL
)
RETURNS SETOF public.newsletter_webhook_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT outbox.id
    FROM public.newsletter_webhook_outbox AS outbox
    WHERE outbox.delivered_at IS NULL
      AND outbox.next_attempt_at <= now()
      AND (p_outbox_id IS NULL OR outbox.id = p_outbox_id)
      AND (
        outbox.lease_expires_at IS NULL
        OR outbox.lease_expires_at < now()
        OR outbox.lease_token = p_lease_token
      )
    ORDER BY outbox.next_attempt_at ASC, outbox.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(coalesce(p_limit, 5), 10))
  )
  UPDATE public.newsletter_webhook_outbox AS outbox
  SET
    status = 'delivering',
    lease_token = p_lease_token,
    lease_expires_at = now() + make_interval(
      secs => greatest(15, least(coalesce(p_lease_seconds, 45), 120))
    )
  FROM due
  WHERE outbox.id = due.id
  RETURNING outbox.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_newsletter_webhook_attempt(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_delivered boolean,
  p_error text,
  p_next_attempt_at timestamptz
)
RETURNS SETOF public.newsletter_webhook_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  completed public.newsletter_webhook_outbox%ROWTYPE;
  completed_at timestamptz := now();
BEGIN
  UPDATE public.newsletter_webhook_outbox AS outbox
  SET
    status = CASE WHEN p_delivered THEN 'delivered' ELSE 'pending' END,
    attempt_count = outbox.attempt_count + 1,
    last_attempt_at = completed_at,
    last_error = CASE WHEN p_delivered THEN NULL ELSE left(p_error, 2000) END,
    next_attempt_at = CASE
      WHEN p_delivered THEN completed_at
      ELSE greatest(coalesce(p_next_attempt_at, completed_at), completed_at)
    END,
    delivered_at = CASE WHEN p_delivered THEN completed_at ELSE NULL END,
    lease_token = NULL,
    lease_expires_at = NULL
  WHERE outbox.id = p_outbox_id
    AND outbox.lease_token = p_lease_token
  RETURNING outbox.* INTO completed;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_delivered AND completed.notification_id IS NOT NULL THEN
    UPDATE public.newsletter_notifications
    SET delivered_at = coalesce(delivered_at, completed.delivered_at)
    WHERE id = completed.notification_id;
  END IF;

  RETURN NEXT completed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_newsletter_webhook_outbox(
  uuid,
  integer,
  integer,
  uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_newsletter_webhook_attempt(
  uuid,
  uuid,
  boolean,
  text,
  timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_newsletter_webhook_outbox(
  uuid,
  integer,
  integer,
  uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_newsletter_webhook_attempt(
  uuid,
  uuid,
  boolean,
  text,
  timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_newsletter_webhook_outbox()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cron_secret text;
BEGIN
  SELECT decrypted_secret
  INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'newsletter_daily_cron_secret'
  ORDER BY created_at DESC
  LIMIT 1;

  IF coalesce(cron_secret, '') = '' THEN
    RAISE EXCEPTION
      'Vault secret newsletter_daily_cron_secret is not configured';
  END IF;

  RETURN net.http_get(
    url := 'https://www.theintraday.com/api/cron/newsletter-webhook',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || cron_secret,
      'User-Agent',
      'supabase-cron/1.0'
    ),
    timeout_milliseconds := 59000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_newsletter_webhook_outbox()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'newsletter-webhook-outbox'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'newsletter-webhook-outbox',
    '*/5 * * * *',
    $schedule$
      SELECT public.invoke_newsletter_webhook_outbox();
    $schedule$
  );
END;
$$;

COMMENT ON TABLE public.newsletter_webhook_outbox IS
  'Durable, leased delivery queue for signed newsletter alert webhooks.';
COMMENT ON FUNCTION public.claim_newsletter_webhook_outbox(
  uuid,
  integer,
  integer,
  uuid
) IS 'Claims a bounded batch of due webhook events using skip-locked leases.';
COMMENT ON FUNCTION public.complete_newsletter_webhook_attempt(
  uuid,
  uuid,
  boolean,
  text,
  timestamptz
) IS 'Atomically records one webhook attempt and marks its notification delivered on success.';
COMMENT ON FUNCTION public.invoke_newsletter_webhook_outbox() IS
  'Invokes the bounded signed-newsletter-webhook delivery route.';

NOTIFY pgrst, 'reload schema';
