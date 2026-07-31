-- Keep pre-open and live-session WIIM snapshots as separate, comparable runs.

ALTER TABLE public.wiim_runs
  DROP CONSTRAINT IF EXISTS wiim_runs_run_type_check;

ALTER TABLE public.wiim_runs
  ADD CONSTRAINT wiim_runs_run_type_check
  CHECK (run_type IN ('morning', 'mid_morning'));

COMMENT ON TABLE public.wiim_runs IS
  'One row per persisted WIIM morning or mid-morning brief run.';
