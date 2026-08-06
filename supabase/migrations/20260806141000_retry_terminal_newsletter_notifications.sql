-- Terminal automation state and operator notification delivery are separate
-- crash boundaries. Track the latter explicitly so a completed/failed run is
-- retried until its deduplicated notification and webhook outbox are durable.

ALTER TABLE public.newsletter_daily_automation_runs
  ADD COLUMN IF NOT EXISTS notification_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_last_error text;

ALTER TABLE public.newsletter_mid_morning_runs
  ADD COLUMN IF NOT EXISTS notification_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_last_error text;

ALTER TABLE public.newsletter_daily_automation_runs
  DROP CONSTRAINT IF EXISTS newsletter_daily_notification_attempt_count_check;
ALTER TABLE public.newsletter_daily_automation_runs
  ADD CONSTRAINT newsletter_daily_notification_attempt_count_check
  CHECK (notification_attempt_count >= 0);

ALTER TABLE public.newsletter_mid_morning_runs
  DROP CONSTRAINT IF EXISTS newsletter_mid_morning_notification_attempt_count_check;
ALTER TABLE public.newsletter_mid_morning_runs
  ADD CONSTRAINT newsletter_mid_morning_notification_attempt_count_check
  CHECK (notification_attempt_count >= 0);

CREATE OR REPLACE FUNCTION public.record_newsletter_daily_notification_attempt(
  p_run_id uuid,
  p_succeeded boolean,
  p_error text DEFAULT NULL
)
RETURNS SETOF public.newsletter_daily_automation_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.newsletter_daily_automation_runs AS run
  SET
    notification_attempt_count = run.notification_attempt_count + 1,
    notification_applied_at = CASE
      WHEN p_succeeded THEN coalesce(run.notification_applied_at, statement_timestamp())
      ELSE run.notification_applied_at
    END,
    notification_last_error = CASE
      WHEN p_succeeded THEN NULL
      ELSE left(coalesce(nullif(trim(p_error), ''), 'Unknown notification error'), 2000)
    END,
    updated_at = statement_timestamp()
  WHERE run.id = p_run_id
    AND run.status IN ('completed', 'partial', 'failed')
  RETURNING run.*;
$$;

CREATE OR REPLACE FUNCTION public.record_newsletter_mid_morning_notification_attempt(
  p_run_id uuid,
  p_succeeded boolean,
  p_error text DEFAULT NULL
)
RETURNS SETOF public.newsletter_mid_morning_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.newsletter_mid_morning_runs AS run
  SET
    notification_attempt_count = run.notification_attempt_count + 1,
    notification_applied_at = CASE
      WHEN p_succeeded THEN coalesce(run.notification_applied_at, statement_timestamp())
      ELSE run.notification_applied_at
    END,
    notification_last_error = CASE
      WHEN p_succeeded THEN NULL
      ELSE left(coalesce(nullif(trim(p_error), ''), 'Unknown notification error'), 2000)
    END,
    updated_at = statement_timestamp()
  WHERE run.id = p_run_id
    AND run.status IN ('completed', 'partial', 'failed')
  RETURNING run.*;
$$;

-- A terminal run can be explicitly reconciled or resumed. Its notification may
-- already have been recorded, but that must not suppress a recovered-completion
-- notification. Reset only while the worker still owns an active terminal run.
CREATE OR REPLACE FUNCTION public.reset_newsletter_daily_retry_notification(
  p_run_id uuid,
  p_lease_token uuid
)
RETURNS SETOF public.newsletter_daily_automation_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.newsletter_daily_automation_runs AS run
  SET
    notification_applied_at = NULL,
    notification_last_error = NULL,
    updated_at = clock_timestamp()
  WHERE run.id = p_run_id
    AND run.status IN ('failed', 'partial', 'completed')
    AND run.lease_token = p_lease_token
    AND run.lease_expires_at > clock_timestamp()
  RETURNING run.*;
$$;

CREATE OR REPLACE FUNCTION public.reset_newsletter_mid_morning_retry_notification(
  p_run_id uuid,
  p_lease_token uuid
)
RETURNS SETOF public.newsletter_mid_morning_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.newsletter_mid_morning_runs AS run
  SET
    notification_applied_at = NULL,
    notification_last_error = NULL,
    updated_at = clock_timestamp()
  WHERE run.id = p_run_id
    AND run.status = 'failed'
    AND run.lease_token = p_lease_token
    AND run.lease_expires_at > clock_timestamp()
  RETURNING run.*;
$$;

REVOKE ALL ON FUNCTION public.record_newsletter_daily_notification_attempt(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_newsletter_mid_morning_notification_attempt(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_newsletter_daily_retry_notification(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_newsletter_mid_morning_retry_notification(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_newsletter_daily_notification_attempt(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_newsletter_mid_morning_notification_attempt(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_newsletter_daily_retry_notification(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_newsletter_mid_morning_retry_notification(uuid, uuid) TO service_role;

COMMENT ON COLUMN public.newsletter_daily_automation_runs.notification_applied_at IS
  'Set only after every deduplicated terminal notification is durably recorded.';
COMMENT ON COLUMN public.newsletter_mid_morning_runs.notification_applied_at IS
  'Set only after every deduplicated terminal notification is durably recorded.';
COMMENT ON FUNCTION public.reset_newsletter_daily_retry_notification(uuid, uuid) IS
  'Clears terminal notification state only for a terminal daily run owned by an active lease, so a recovered completion is notified.';
COMMENT ON FUNCTION public.reset_newsletter_mid_morning_retry_notification(uuid, uuid) IS
  'Clears terminal notification state only for a failed mid-morning run owned by an active lease, so a recovered completion is notified.';

NOTIFY pgrst, 'reload schema';
