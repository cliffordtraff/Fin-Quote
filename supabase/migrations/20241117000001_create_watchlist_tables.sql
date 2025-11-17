-- Watchlist storage (tabs + settings) for Sunday integration

create table if not exists watchlists (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tabs jsonb not null default '[]'::jsonb,
  active_tab_index integer not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists watchlist_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_extended_hours boolean not null default false,
  column_widths jsonb not null default '{}'::jsonb,
  font_scale numeric not null default 1,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_watchlists_user_id on watchlists(user_id);
create index if not exists idx_watchlist_settings_user_id on watchlist_settings(user_id);

alter table watchlists enable row level security;
alter table watchlist_settings enable row level security;

drop policy if exists "Users manage watchlists" on watchlists;
create policy "Users manage watchlists"
  on watchlists
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage watchlist settings" on watchlist_settings;
create policy "Users manage watchlist settings"
  on watchlist_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
