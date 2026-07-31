-- Invoke the bounded Vercel worker every two minutes during the UTC window
-- covering 5:00-8:00 AM New York time across daylight-saving changes.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

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

REVOKE ALL ON FUNCTION public.invoke_newsletter_daily_automation()
  FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'newsletter-daily-automation'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'newsletter-daily-automation',
    '*/2 9-12 * * 1-5',
    $schedule$
      SELECT public.invoke_newsletter_daily_automation();
    $schedule$
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_newsletter_daily_automation() IS
  'Queues one bounded weekday morning newsletter automation invocation.';
