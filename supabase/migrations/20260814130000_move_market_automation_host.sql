-- The public root domain now serves The Intraday's community-research site.
-- Keep all market/newsletter automation on the dedicated market application.

CREATE OR REPLACE FUNCTION public.invoke_newsletter_daily_automation()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE cron_secret text;
BEGIN
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'newsletter_daily_cron_secret'
  ORDER BY created_at DESC LIMIT 1;
  IF coalesce(cron_secret, '') = '' THEN
    RAISE EXCEPTION 'Vault secret newsletter_daily_cron_secret is not configured';
  END IF;
  RETURN net.http_get(
    url := 'https://markets.theintraday.com/api/cron/newsletter-daily',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret, 'User-Agent', 'supabase-cron/1.0'),
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
DECLARE cron_secret text;
BEGIN
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'newsletter_daily_cron_secret'
  ORDER BY created_at DESC LIMIT 1;
  IF coalesce(cron_secret, '') = '' THEN
    RAISE EXCEPTION 'Vault secret newsletter_daily_cron_secret is not configured';
  END IF;
  RETURN net.http_get(
    url := 'https://markets.theintraday.com/api/cron/newsletter-mid-morning',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret, 'User-Agent', 'supabase-cron/1.0'),
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
DECLARE cron_secret text;
BEGIN
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'newsletter_daily_cron_secret'
  ORDER BY created_at DESC LIMIT 1;
  IF coalesce(cron_secret, '') = '' THEN
    RAISE EXCEPTION 'Vault secret newsletter_daily_cron_secret is not configured';
  END IF;
  RETURN net.http_get(
    url := 'https://markets.theintraday.com/api/cron/newsletter-beehiiv',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret, 'User-Agent', 'supabase-cron/1.0'),
    timeout_milliseconds := 59000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_dashboard_market_context_refresh()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE cron_secret text;
BEGIN
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'newsletter_daily_cron_secret'
  ORDER BY created_at DESC LIMIT 1;
  IF coalesce(cron_secret, '') = '' THEN
    RAISE EXCEPTION 'Vault secret newsletter_daily_cron_secret is not configured';
  END IF;
  RETURN net.http_get(
    url := 'https://markets.theintraday.com/api/cron/refresh-market-context',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret, 'User-Agent', 'supabase-cron/1.0'),
    timeout_milliseconds := 225000
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_newsletter_webhook_outbox()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE cron_secret text;
BEGIN
  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'newsletter_daily_cron_secret'
  ORDER BY created_at DESC LIMIT 1;
  IF coalesce(cron_secret, '') = '' THEN
    RAISE EXCEPTION 'Vault secret newsletter_daily_cron_secret is not configured';
  END IF;
  RETURN net.http_get(
    url := 'https://markets.theintraday.com/api/cron/newsletter-webhook',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret, 'User-Agent', 'supabase-cron/1.0'),
    timeout_milliseconds := 59000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_newsletter_daily_automation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoke_newsletter_mid_morning_automation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoke_newsletter_beehiiv_reconciliation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoke_dashboard_market_context_refresh() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoke_newsletter_webhook_outbox() FROM PUBLIC, anon, authenticated;

