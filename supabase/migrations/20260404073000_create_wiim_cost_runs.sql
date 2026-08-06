-- Tracks per-run API cost data for WIIM replay and optimization runs
create table if not exists wiim_cost_runs (
  id bigint generated always as identity primary key,
  run_date date not null,
  run_type text not null default 'replay',  -- 'replay', 'optimize', 'daily-cron'
  iteration integer,                         -- null for single replays, 0-N for optimizer iterations
  ticker_count integer not null default 0,
  call_count integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  cache_hit_rate real not null default 0,
  estimated_cost_usd real not null default 0,
  component_breakdown jsonb,                 -- { "unifiedRanker": { calls, input, output, cost }, ... }
  match_rate real,                           -- topic match rate for this run (if eval)
  config_version text,
  created_at timestamptz not null default now()
);
create index idx_wiim_cost_runs_date on wiim_cost_runs(run_date);
create index idx_wiim_cost_runs_type on wiim_cost_runs(run_type);
