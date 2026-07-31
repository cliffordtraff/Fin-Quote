-- Complete the newsletter operating loop: durable notifications, Beehiiv
-- lifecycle reconciliation, and an automated mid-morning delta run.

ALTER TABLE public.newsletter_beehiiv_deliveries
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS beehiiv_status text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS web_url text,
  ADD COLUMN IF NOT EXISTS stats_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reconcile_error text;

ALTER TABLE public.newsletter_beehiiv_deliveries
  DROP CONSTRAINT IF EXISTS newsletter_beehiiv_deliveries_lifecycle_status_check;

ALTER TABLE public.newsletter_beehiiv_deliveries
  ADD CONSTRAINT newsletter_beehiiv_deliveries_lifecycle_status_check
  CHECK (
    lifecycle_status IN (
      'draft',
      'scheduled',
      'published',
      'archived',
      'unknown'
    )
  );

CREATE INDEX IF NOT EXISTS idx_newsletter_beehiiv_deliveries_lifecycle
  ON public.newsletter_beehiiv_deliveries(
    owner_id,
    lifecycle_status,
    last_reconciled_at
  );

CREATE TABLE IF NOT EXISTS public.newsletter_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  market_date date NOT NULL,
  notification_type text NOT NULL CHECK (
    notification_type IN (
      'morning_late',
      'morning_completed',
      'morning_failed',
      'mid_morning_completed',
      'mid_morning_failed',
      'beehiiv_lifecycle'
    )
  ),
  severity text NOT NULL DEFAULT 'info' CHECK (
    severity IN ('info', 'success', 'warning', 'error')
  ),
  title text NOT NULL,
  message text NOT NULL,
  action_url text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_key, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_notifications_scope_created
  ON public.newsletter_notifications(scope_key, created_at DESC);

ALTER TABLE public.newsletter_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'newsletter_notifications'
      AND policyname = 'Users can read own newsletter notifications'
  ) THEN
    CREATE POLICY "Users can read own newsletter notifications"
      ON public.newsletter_notifications
      FOR SELECT
      USING (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'newsletter_notifications'
      AND policyname = 'Users can update own newsletter notifications'
  ) THEN
    CREATE POLICY "Users can update own newsletter notifications"
      ON public.newsletter_notifications
      FOR UPDATE
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;
END
$$;

DROP TRIGGER IF EXISTS newsletter_notifications_updated_at_trigger
  ON public.newsletter_notifications;
CREATE TRIGGER newsletter_notifications_updated_at_trigger
  BEFORE UPDATE ON public.newsletter_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.newsletter_mid_morning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_date date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'running', 'completed', 'partial', 'failed')
  ),
  stage text NOT NULL DEFAULT 'collecting' CHECK (
    stage IN (
      'collecting',
      'finviz',
      'wiim',
      'summaries',
      'finalizing',
      'completed',
      'failed'
    )
  ),
  candidate_symbols text[] NOT NULL DEFAULT '{}',
  candidate_count integer NOT NULL DEFAULT 0,
  finviz_completed_count integer NOT NULL DEFAULT 0,
  finviz_found_count integer NOT NULL DEFAULT 0,
  finviz_error_count integer NOT NULL DEFAULT 0,
  morning_wiim_run_id uuid REFERENCES public.wiim_runs(id) ON DELETE SET NULL,
  mid_morning_wiim_run_id uuid REFERENCES public.wiim_runs(id) ON DELETE SET NULL,
  summary_completed_count integer NOT NULL DEFAULT 0,
  summary_generated_count integer NOT NULL DEFAULT 0,
  summary_error_count integer NOT NULL DEFAULT 0,
  meaningful_change boolean,
  invocation_count integer NOT NULL DEFAULT 0,
  last_error text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_token uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_mid_morning_runs_date
  ON public.newsletter_mid_morning_runs(market_date DESC);

ALTER TABLE public.newsletter_mid_morning_runs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS newsletter_mid_morning_runs_updated_at_trigger
  ON public.newsletter_mid_morning_runs;
CREATE TRIGGER newsletter_mid_morning_runs_updated_at_trigger
  BEFORE UPDATE ON public.newsletter_mid_morning_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_newsletter_mid_morning_automation(
  p_market_date date,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 90
)
RETURNS SETOF public.newsletter_mid_morning_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.newsletter_mid_morning_runs (market_date)
  VALUES (p_market_date)
  ON CONFLICT (market_date) DO NOTHING;

  RETURN QUERY
  UPDATE public.newsletter_mid_morning_runs
  SET
    lease_token = p_lease_token,
    lease_expires_at = now() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 90), 600))
    ),
    status = CASE
      WHEN status IN ('completed', 'partial') THEN status
      ELSE 'running'
    END,
    started_at = coalesce(started_at, now()),
    last_heartbeat_at = now(),
    invocation_count = invocation_count + 1
  WHERE market_date = p_market_date
    AND (
      lease_expires_at IS NULL
      OR lease_expires_at < now()
      OR lease_token = p_lease_token
    )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_newsletter_mid_morning_automation(
  p_market_date date,
  p_lease_token uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.newsletter_mid_morning_runs
  SET lease_token = NULL, lease_expires_at = NULL
  WHERE market_date = p_market_date
    AND lease_token = p_lease_token;
$$;

REVOKE ALL ON FUNCTION public.claim_newsletter_mid_morning_automation(
  date,
  uuid,
  integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_newsletter_mid_morning_automation(
  date,
  uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_newsletter_mid_morning_automation(
  date,
  uuid,
  integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_newsletter_mid_morning_automation(
  date,
  uuid
) TO service_role;

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
      'beehiiv_archived'
    )
  );

CREATE OR REPLACE FUNCTION public.invoke_newsletter_daily_automation()
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
    url := 'https://www.theintraday.com/api/cron/newsletter-daily',
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

CREATE OR REPLACE FUNCTION public.invoke_newsletter_mid_morning_automation()
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
    url := 'https://www.theintraday.com/api/cron/newsletter-mid-morning',
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

CREATE OR REPLACE FUNCTION public.invoke_newsletter_beehiiv_reconciliation()
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
    url := 'https://www.theintraday.com/api/cron/newsletter-beehiiv',
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

REVOKE ALL ON FUNCTION public.invoke_newsletter_daily_automation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoke_newsletter_mid_morning_automation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoke_newsletter_beehiiv_reconciliation()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'newsletter-daily-automation',
      'newsletter-mid-morning-automation',
      'newsletter-beehiiv-reconciliation'
    )
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  -- The application routes apply America/New_York and trading-day windows.
  -- These wider UTC schedules cover both daylight-saving offsets and recovery.
  PERFORM cron.schedule(
    'newsletter-daily-automation',
    '*/2 8-17 * * 1-5',
    $schedule$
      SELECT public.invoke_newsletter_daily_automation();
    $schedule$
  );

  PERFORM cron.schedule(
    'newsletter-mid-morning-automation',
    '*/2 14-17 * * 1-5',
    $schedule$
      SELECT public.invoke_newsletter_mid_morning_automation();
    $schedule$
  );

  PERFORM cron.schedule(
    'newsletter-beehiiv-reconciliation',
    '*/15 12-23 * * 1-5',
    $schedule$
      SELECT public.invoke_newsletter_beehiiv_reconciliation();
    $schedule$
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_newsletter_daily_automation() IS
  'Invokes one bounded morning newsletter step; the route enforces the ET trading-day window.';
COMMENT ON FUNCTION public.invoke_newsletter_mid_morning_automation() IS
  'Invokes one bounded mid-morning delta report step.';
COMMENT ON FUNCTION public.invoke_newsletter_beehiiv_reconciliation() IS
  'Reconciles Beehiiv draft, scheduled, and published lifecycle state.';

NOTIFY pgrst, 'reload schema';
