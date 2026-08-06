-- FinViz WISM corpus: stores scraped "Why Is It Moving" catalysts for
-- calibration, few-shot retrieval, and three-bucket analysis.
-- One row per symbol per day.

create table public.finviz_wism_corpus (
  id bigserial primary key,
  symbol text not null,
  summary_date date not null,
  catalyst_text text not null,
  catalyst_type text,          -- 'earnings', 'analyst_action', 'merger_acquisition', etc.
  direction text,              -- 'up', 'down', 'flat', null
  price_change_pct numeric(6,2),
  scraped_at timestamptz not null default now(),
  constraint finviz_wism_corpus_symbol_date_uq unique (symbol, summary_date)
);
comment on table public.finviz_wism_corpus is 'Scraped FinViz "Why Is It Moving" catalysts used for calibration and few-shot retrieval';
comment on column public.finviz_wism_corpus.catalyst_type is 'Auto-classified event type: earnings, analyst_action, merger_acquisition, etc.';
comment on column public.finviz_wism_corpus.direction is 'Price direction: up, down, or flat';
create index finviz_wism_corpus_symbol_idx on public.finviz_wism_corpus (symbol);
create index finviz_wism_corpus_catalyst_type_idx on public.finviz_wism_corpus (catalyst_type);
create index finviz_wism_corpus_direction_idx on public.finviz_wism_corpus (direction);
create index finviz_wism_corpus_date_idx on public.finviz_wism_corpus (summary_date desc);
-- Backfill from existing summary_evals (finviz_catalyst column)
-- This populates the corpus from any evals we've already run.
insert into public.finviz_wism_corpus (symbol, summary_date, catalyst_text, scraped_at)
select
  symbol,
  summary_date,
  finviz_catalyst,
  evaluated_at
from public.summary_evals
where finviz_catalyst is not null
  and finviz_catalyst != ''
on conflict (symbol, summary_date) do nothing;
