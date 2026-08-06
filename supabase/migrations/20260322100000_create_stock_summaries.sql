-- Config version tracking: every set of ranker weights/thresholds is a version
create table public.ranker_config_versions (
  id serial primary key,
  config_version text unique not null,
  weights_json jsonb not null,
  event_type_scores_json jsonb not null,
  min_market_reaction_threshold numeric(4,2) not null default 2.0,
  min_event_significance_threshold numeric(4,2) not null default 60,
  min_candidate_score numeric(4,2) not null default 25,
  earnings_proximity_boost numeric(4,2) not null default 15,
  earnings_window_hours numeric(4,2) not null default 48,
  llm_reranker_threshold numeric(4,2) not null default 10,
  source_quality_tiers_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);
-- Stock summaries: one row per ticker per day
create table public.stock_summaries (
  symbol text not null,
  summary_date date not null,
  summary_text text,
  model text,
  config_version text,
  winning_event jsonb,
  runner_up_event jsonb,
  no_summary_reason text,
  activation_path text,
  earnings_context jsonb,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (symbol, summary_date)
);
-- Automated evals: LLM-as-judge results comparing ours vs FinViz
create table public.summary_evals (
  id bigserial primary key,
  symbol text not null,
  summary_date date not null,
  config_version text,
  generated_summary text not null,
  our_top_event text not null,
  finviz_catalyst text not null,
  topic_match boolean,
  score numeric(4,2),
  feedback text,
  signal_diagnosis text,
  eval_model text not null,
  evaluated_at timestamptz not null default now()
);
-- Manual reviews: human judgments from the eval review page
create table public.manual_eval_reviews (
  id bigserial primary key,
  eval_id bigint references public.summary_evals(id),
  symbol text not null,
  summary_date date not null,
  human_label text not null,
  failure_bucket text,
  notes text,
  reviewed_by text,
  reviewed_at timestamptz not null default now(),
  is_gold_case boolean default false
);
create index manual_eval_reviews_gold_idx on public.manual_eval_reviews (is_gold_case) where is_gold_case = true;
create index manual_eval_reviews_eval_idx on public.manual_eval_reviews (eval_id);
create index summary_evals_config_idx on public.summary_evals (config_version);
create index stock_summaries_symbol_idx on public.stock_summaries (symbol);
-- Seed the default v1 config
insert into public.ranker_config_versions (
  config_version, weights_json, event_type_scores_json,
  min_market_reaction_threshold, min_event_significance_threshold,
  min_candidate_score, earnings_proximity_boost, earnings_window_hours,
  llm_reranker_threshold, source_quality_tiers_json, notes
) values (
  'v1',
  '{"eventType": 20, "tickerRelevance": 25, "temporalAlignment": 20, "coverageConsensus": 15, "sourceQuality": 10, "recency": 10}'::jsonb,
  '{"earnings": 25, "guidance": 24, "analyst_action": 20, "merger_acquisition": 18, "fda_regulatory": 18, "legal": 16, "product_launch": 12, "management_change": 10, "contract_deal": 14, "macro_sector": 5, "generic": 2}'::jsonb,
  2.0, 60, 25, 15, 48, 10,
  '{"reuters": 95, "bloomberg": 95, "the wall street journal": 95, "cnbc": 90, "financial times": 90, "associated press": 90, "barrons": 80, "seeking alpha": 75, "marketwatch": 80, "benzinga": 70, "yahoo finance": 70, "the motley fool": 65, "zacks": 65, "accesswire": 40, "globenewswire": 40, "prnewswire": 40, "business wire": 45}'::jsonb,
  'Initial default configuration'
);
