alter table public.monthly_ratio_snapshots
  drop constraint if exists monthly_ratio_snapshots_metric_name_check;
alter table public.monthly_ratio_snapshots
  add constraint monthly_ratio_snapshots_metric_name_check
  check (metric_name in ('peRatio', 'pbRatio', 'evEbitda', 'fcfYield'));
