-- Track each batch generation run
create table if not exists wiim_summary_runs (
  run_id text primary key,
  run_date date not null,
  ticker_count integer not null default 0,
  tickers text[] not null default '{}',
  model text,
  config_version text,
  created_at timestamptz not null default now()
);
create index if not exists idx_wiim_summary_runs_date on wiim_summary_runs(run_date);
-- Add run_id to stock_summaries, drop the unique constraint so we can keep history
alter table stock_summaries add column if not exists run_id text;
-- Drop the old unique constraint if it exists (symbol, summary_date)
-- and replace with one that includes run_id
do $$
begin
  -- Try to drop the old constraint (name may vary)
  begin
    alter table stock_summaries drop constraint if exists stock_summaries_pkey;
  exception when others then null;
  end;
  begin
    alter table stock_summaries drop constraint if exists stock_summaries_symbol_summary_date_key;
  exception when others then null;
  end;
end $$;
-- Add a new primary key that allows multiple generations per symbol+date
-- First add an id column if not exists
alter table stock_summaries add column if not exists id bigint generated always as identity;
-- Create index for fast lookups
create index if not exists idx_stock_summaries_run on stock_summaries(run_id);
create index if not exists idx_stock_summaries_symbol_date on stock_summaries(symbol, summary_date);
