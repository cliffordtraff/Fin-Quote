ALTER TABLE public.dashboard_chart_of_day_settings
  ADD COLUMN IF NOT EXISTS chart_spec JSONB;
