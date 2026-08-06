-- Cached company profiles from Polygon to avoid repeated API calls
create table if not exists company_profiles (
  symbol text primary key,
  company_name text,
  sector text,
  industry text,
  market_cap bigint,
  updated_at timestamptz not null default now()
);
