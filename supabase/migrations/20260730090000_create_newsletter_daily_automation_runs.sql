-- Durable state and an atomic lease for the pre-market newsletter pipeline.

CREATE TABLE IF NOT EXISTS public.newsletter_daily_automation_runs (
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
      'newsletters',
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
  summary_completed_count integer NOT NULL DEFAULT 0,
  summary_generated_count integer NOT NULL DEFAULT 0,
  summary_no_result_count integer NOT NULL DEFAULT 0,
  summary_error_count integer NOT NULL DEFAULT 0,
  wiim_run_id uuid REFERENCES public.wiim_runs(id) ON DELETE SET NULL,
  newsletter_scope_count integer NOT NULL DEFAULT 0,
  newsletter_completed_scope_count integer NOT NULL DEFAULT 0,
  newsletter_selected_count integer NOT NULL DEFAULT 0,
  newsletter_generated_count integer NOT NULL DEFAULT 0,
  newsletter_ready_count integer NOT NULL DEFAULT 0,
  newsletter_attention_count integer NOT NULL DEFAULT 0,
  newsletter_failed_count integer NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_newsletter_daily_automation_runs_date
  ON public.newsletter_daily_automation_runs(market_date DESC);

ALTER TABLE public.newsletter_daily_automation_runs ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS newsletter_daily_automation_runs_updated_at_trigger
  ON public.newsletter_daily_automation_runs;
CREATE TRIGGER newsletter_daily_automation_runs_updated_at_trigger
  BEFORE UPDATE ON public.newsletter_daily_automation_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_newsletter_daily_automation(
  p_market_date date,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 270
)
RETURNS SETOF public.newsletter_daily_automation_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.newsletter_daily_automation_runs (market_date)
  VALUES (p_market_date)
  ON CONFLICT (market_date) DO NOTHING;

  RETURN QUERY
  UPDATE public.newsletter_daily_automation_runs
  SET
    lease_token = p_lease_token,
    lease_expires_at = now() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 270), 600))
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

CREATE OR REPLACE FUNCTION public.release_newsletter_daily_automation(
  p_market_date date,
  p_lease_token uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.newsletter_daily_automation_runs
  SET lease_token = NULL, lease_expires_at = NULL
  WHERE market_date = p_market_date
    AND lease_token = p_lease_token;
$$;

REVOKE ALL ON FUNCTION public.claim_newsletter_daily_automation(date, uuid, integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_newsletter_daily_automation(date, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_newsletter_daily_automation(date, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_newsletter_daily_automation(date, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
