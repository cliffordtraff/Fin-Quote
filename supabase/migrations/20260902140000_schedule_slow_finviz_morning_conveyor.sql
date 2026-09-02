-- Run the durable morning workflow once per minute so its two-symbol Finviz
-- conveyor can cover the full S&P 500 without burst traffic. The application
-- enforces the 3:15 AM America/New_York start, trading days, and noon cutoff;
-- this wider UTC range covers both daylight-saving offsets and recovery.

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
    '* 7-17 * * 1-5',
    $schedule$
      SELECT public.invoke_newsletter_daily_automation();
    $schedule$
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_newsletter_daily_automation() IS
  'Advances the one-minute durable morning workflow; the app rate-limits Finviz to a two-symbol sequential conveyor.';
