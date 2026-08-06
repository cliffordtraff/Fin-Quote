-- Durable, append-only execution heartbeats for the critical newsletter cron
-- routes. Each authorized invocation owns one row from start through terminal
-- completion so overlapping requests cannot overwrite one another.

CREATE TABLE IF NOT EXISTS public.newsletter_cron_runs (
  id uuid PRIMARY KEY,
  job_name text NOT NULL CHECK (
    job_name IN (
      'daily',
      'mid_morning',
      'beehiiv_reconciliation',
      'webhook_outbox'
    )
  ),
  status text NOT NULL DEFAULT 'running' CHECK (
    status IN ('running', 'succeeded', 'failed')
  ),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_code text CHECK (
    error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'running'
      AND completed_at IS NULL
      AND duration_ms IS NULL
      AND error_code IS NULL)
    OR (status = 'succeeded'
      AND completed_at IS NOT NULL
      AND duration_ms IS NOT NULL
      AND error_code IS NULL)
    OR (status = 'failed'
      AND completed_at IS NOT NULL
      AND duration_ms IS NOT NULL
      AND error_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_newsletter_cron_runs_job_started
  ON public.newsletter_cron_runs(job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_cron_runs_running
  ON public.newsletter_cron_runs(started_at)
  WHERE status = 'running';

ALTER TABLE public.newsletter_cron_runs ENABLE ROW LEVEL SECURITY;

-- Cron state is server-owned and the public health response is assembled by a
-- route that exposes only fixed job names, timestamps, and normalized states.
REVOKE ALL ON TABLE public.newsletter_cron_runs
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.newsletter_cron_runs TO service_role;

NOTIFY pgrst, 'reload schema';
