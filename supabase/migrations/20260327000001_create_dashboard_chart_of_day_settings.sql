CREATE TABLE IF NOT EXISTS public.dashboard_chart_of_day_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  ticker TEXT NOT NULL,
  template_id TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'annual'
    CHECK (period_type IN ('annual', 'quarterly')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT dashboard_chart_of_day_settings_singleton CHECK (id = 'default')
);

ALTER TABLE public.dashboard_chart_of_day_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_dashboard_chart_of_day_settings_updated_at
  BEFORE UPDATE ON public.dashboard_chart_of_day_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.dashboard_chart_of_day_settings (
  id,
  ticker,
  template_id,
  period_type
)
VALUES (
  'default',
  'AAPL',
  'revenue_vs_net_income',
  'annual'
)
ON CONFLICT (id) DO NOTHING;
