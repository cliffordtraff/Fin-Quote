CREATE OR REPLACE FUNCTION public.invoke_dashboard_market_context_refresh()
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
    url := 'https://www.theintraday.com/api/cron/refresh-market-context',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || cron_secret,
      'User-Agent',
      'supabase-cron/1.0'
    ),
    -- The route has a 240-second ceiling. Stop waiting 15 seconds earlier so
    -- pg_net records a bounded failure before the platform terminates it.
    timeout_milliseconds := 225000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_dashboard_market_context_refresh()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'dashboard-market-context-refresh'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  -- Calling across the possible UTC offsets lets the route select exactly
  -- three New York attempts at 10:15, 10:22, and 10:29. The later attempts are
  -- cheap no-ops when all three commentary components were already persisted.
  PERFORM cron.schedule(
    'dashboard-market-context-refresh',
    '15,22,29 13-16 * * 1-5',
    $schedule$
      SELECT public.invoke_dashboard_market_context_refresh();
    $schedule$
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_dashboard_market_context_refresh() IS
  'Retry-safely refreshes missing dashboard commentary components behind CRON_SECRET.';
