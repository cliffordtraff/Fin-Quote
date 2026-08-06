create table if not exists public.monthly_ratio_snapshots (
  symbol text not null,
  metric_name text not null check (metric_name in ('peRatio', 'pbRatio', 'evEbitda')),
  as_of_date date not null,
  frequency text not null default 'monthly' check (frequency = 'monthly'),
  metric_value double precision,
  price_close double precision,
  numerator_value double precision,
  denominator_value double precision,
  source_period_end date,
  source_period_type text check (source_period_type in ('quarter', 'annual')),
  calc_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (symbol, metric_name, as_of_date)
);
create index if not exists monthly_ratio_snapshots_symbol_date_idx
  on public.monthly_ratio_snapshots (symbol, as_of_date desc);
create index if not exists monthly_ratio_snapshots_metric_date_idx
  on public.monthly_ratio_snapshots (metric_name, as_of_date desc);
create or replace function public.set_monthly_ratio_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
drop trigger if exists trg_monthly_ratio_snapshots_updated_at on public.monthly_ratio_snapshots;
create trigger trg_monthly_ratio_snapshots_updated_at
before update on public.monthly_ratio_snapshots
for each row
execute function public.set_monthly_ratio_snapshots_updated_at();
