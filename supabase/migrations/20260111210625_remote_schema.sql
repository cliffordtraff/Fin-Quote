drop extension if exists "pg_net";

drop policy "Allow public read access to company metrics" on "public"."company_metrics";

revoke delete on table "public"."company_metrics" from "anon";

revoke insert on table "public"."company_metrics" from "anon";

revoke references on table "public"."company_metrics" from "anon";

revoke select on table "public"."company_metrics" from "anon";

revoke trigger on table "public"."company_metrics" from "anon";

revoke truncate on table "public"."company_metrics" from "anon";

revoke update on table "public"."company_metrics" from "anon";

revoke delete on table "public"."company_metrics" from "authenticated";

revoke insert on table "public"."company_metrics" from "authenticated";

revoke references on table "public"."company_metrics" from "authenticated";

revoke select on table "public"."company_metrics" from "authenticated";

revoke trigger on table "public"."company_metrics" from "authenticated";

revoke truncate on table "public"."company_metrics" from "authenticated";

revoke update on table "public"."company_metrics" from "authenticated";

revoke delete on table "public"."company_metrics" from "service_role";

revoke insert on table "public"."company_metrics" from "service_role";

revoke references on table "public"."company_metrics" from "service_role";

revoke select on table "public"."company_metrics" from "service_role";

revoke trigger on table "public"."company_metrics" from "service_role";

revoke truncate on table "public"."company_metrics" from "service_role";

revoke update on table "public"."company_metrics" from "service_role";

alter table "public"."company_metrics" drop constraint "unique_company_metric_per_period";

alter table "public"."company_metrics" drop constraint "company_metrics_pkey";

drop index if exists "public"."company_metrics_pkey";

drop index if exists "public"."idx_company_metrics_dimension";

drop index if exists "public"."idx_company_metrics_metric_name";

drop index if exists "public"."idx_company_metrics_symbol_metric";

drop index if exists "public"."idx_company_metrics_symbol_year";

drop index if exists "public"."unique_company_metric_per_period";

drop table "public"."company_metrics";


  create table "public"."company" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "symbol" text,
    "name" text,
    "sector" text
      );



  create table "public"."financials_std" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "symbol" text,
    "year" integer,
    "revenue" bigint,
    "gross_profit" bigint,
    "net_income" numeric,
    "operating_income" numeric,
    "total_assets" numeric,
    "total_liabilities" numeric,
    "shareholders_equity" numeric,
    "operating_cash_flow" numeric,
    "eps" numeric
      );



  create table "public"."watchlist_dividends" (
    "symbol" text not null,
    "ex_date" text,
    "payment_date" text,
    "amount" numeric,
    "last_updated" timestamp with time zone not null default timezone('utc'::text, now()),
    "ttl_days" integer default 7,
    "updated_by" text
      );


alter table "public"."watchlist_dividends" enable row level security;


  create table "public"."watchlist_earnings" (
    "symbol" text not null,
    "upcoming" jsonb,
    "recent" jsonb[],
    "status" text,
    "days_away" integer,
    "days_since" integer,
    "event_timestamp_utc" timestamp with time zone,
    "cached_at" timestamp with time zone not null default timezone('utc'::text, now()),
    "expires_at" timestamp with time zone not null default (timezone('utc'::text, now()) + '24:00:00'::interval)
      );


alter table "public"."watchlist_earnings" enable row level security;


  create table "public"."watchlist_extended_hours" (
    "symbol" text not null,
    "session" text not null,
    "price" numeric,
    "change" numeric,
    "change_percent" numeric,
    "volume" bigint,
    "last_updated" timestamp with time zone not null default timezone('utc'::text, now()),
    "ttl_seconds" integer default 60
      );


alter table "public"."watchlist_extended_hours" enable row level security;


  create table "public"."watchlist_items" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "tab_id" uuid not null,
    "type" text not null,
    "position" integer not null,
    "symbol" text,
    "tv_symbol" text,
    "exchange" text,
    "company_name" text,
    "is_adr" boolean,
    "header_text" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."watchlist_items" enable row level security;


  create table "public"."watchlist_metrics" (
    "id" text not null,
    "symbol" text not null,
    "metric_type" text not null,
    "period" text not null,
    "metric_data" jsonb not null,
    "last_updated" timestamp with time zone not null default timezone('utc'::text, now()),
    "ttl_days" integer default 30
      );


alter table "public"."watchlist_metrics" enable row level security;


  create table "public"."watchlist_news_archive" (
    "id" text not null,
    "symbol" text,
    "headline" text not null,
    "summary" text,
    "source" text not null,
    "url" text not null,
    "published_at" timestamp with time zone not null,
    "topics" text[],
    "ai_summary" text,
    "last_updated" timestamp with time zone not null default timezone('utc'::text, now()),
    "ttl_days" integer default 7
      );


alter table "public"."watchlist_news_archive" enable row level security;


  create table "public"."watchlist_quotes" (
    "symbol" text not null,
    "schema_version" integer default 1,
    "api_version" text default 'fmp-v3'::text,
    "quote_data" jsonb not null,
    "last_updated" timestamp with time zone not null default timezone('utc'::text, now()),
    "ttl_seconds" integer default 60,
    "updated_by" text
      );


alter table "public"."watchlist_quotes" enable row level security;


  create table "public"."watchlist_settings" (
    "user_id" uuid not null,
    "active_tab_id" uuid,
    "show_extended_hours" boolean default false,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."watchlist_settings" enable row level security;


  create table "public"."watchlist_symbol_mapping" (
    "symbol" text not null,
    "canonical_symbol" text not null,
    "alias_symbols" text[],
    "company_name" text,
    "last_updated" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."watchlist_symbol_mapping" enable row level security;


  create table "public"."watchlist_tabs" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid not null,
    "name" text not null,
    "position" integer not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."watchlist_tabs" enable row level security;


  create table "public"."watchlists" (
    "user_id" uuid not null,
    "tabs" jsonb not null default '[]'::jsonb,
    "active_tab_index" integer not null default 0,
    "updated_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."watchlists" enable row level security;

drop sequence if exists "public"."company_metrics_id_seq";

CREATE UNIQUE INDEX company_pkey ON public.company USING btree (id);

CREATE UNIQUE INDEX financials_std_pkey ON public.financials_std USING btree (id);

CREATE INDEX idx_watchlist_dividends_last_updated ON public.watchlist_dividends USING btree (last_updated);

CREATE INDEX idx_watchlist_earnings_expires_at ON public.watchlist_earnings USING btree (expires_at);

CREATE INDEX idx_watchlist_earnings_status ON public.watchlist_earnings USING btree (status);

CREATE INDEX idx_watchlist_extended_hours_last_updated ON public.watchlist_extended_hours USING btree (last_updated);

CREATE INDEX idx_watchlist_extended_hours_session ON public.watchlist_extended_hours USING btree (session);

CREATE INDEX idx_watchlist_items_position ON public.watchlist_items USING btree (tab_id, "position");

CREATE INDEX idx_watchlist_items_symbol ON public.watchlist_items USING btree (symbol) WHERE (symbol IS NOT NULL);

CREATE INDEX idx_watchlist_items_tab_id ON public.watchlist_items USING btree (tab_id);

CREATE INDEX idx_watchlist_metrics_period ON public.watchlist_metrics USING btree (period);

CREATE INDEX idx_watchlist_metrics_symbol ON public.watchlist_metrics USING btree (symbol);

CREATE INDEX idx_watchlist_metrics_type ON public.watchlist_metrics USING btree (metric_type);

CREATE INDEX idx_watchlist_news_last_updated ON public.watchlist_news_archive USING btree (last_updated);

CREATE INDEX idx_watchlist_news_published_at ON public.watchlist_news_archive USING btree (published_at DESC);

CREATE INDEX idx_watchlist_news_source ON public.watchlist_news_archive USING btree (source);

CREATE INDEX idx_watchlist_news_symbol ON public.watchlist_news_archive USING btree (symbol);

CREATE INDEX idx_watchlist_quotes_last_updated ON public.watchlist_quotes USING btree (last_updated);

CREATE INDEX idx_watchlist_settings_user_id ON public.watchlist_settings USING btree (user_id);

CREATE INDEX idx_watchlist_symbol_mapping_canonical ON public.watchlist_symbol_mapping USING btree (canonical_symbol);

CREATE INDEX idx_watchlist_tabs_position ON public.watchlist_tabs USING btree (user_id, "position");

CREATE INDEX idx_watchlist_tabs_user_id ON public.watchlist_tabs USING btree (user_id);

CREATE INDEX idx_watchlists_user_id ON public.watchlists USING btree (user_id);

CREATE UNIQUE INDEX unique_tab_item_position ON public.watchlist_items USING btree (tab_id, "position");

CREATE UNIQUE INDEX unique_user_tab_position ON public.watchlist_tabs USING btree (user_id, "position");

CREATE UNIQUE INDEX watchlist_dividends_pkey ON public.watchlist_dividends USING btree (symbol);

CREATE UNIQUE INDEX watchlist_earnings_pkey ON public.watchlist_earnings USING btree (symbol);

CREATE UNIQUE INDEX watchlist_extended_hours_pkey ON public.watchlist_extended_hours USING btree (symbol, session);

CREATE UNIQUE INDEX watchlist_items_pkey ON public.watchlist_items USING btree (id);

CREATE UNIQUE INDEX watchlist_metrics_pkey ON public.watchlist_metrics USING btree (id);

CREATE UNIQUE INDEX watchlist_news_archive_pkey ON public.watchlist_news_archive USING btree (id);

CREATE UNIQUE INDEX watchlist_quotes_pkey ON public.watchlist_quotes USING btree (symbol);

CREATE UNIQUE INDEX watchlist_settings_pkey ON public.watchlist_settings USING btree (user_id);

CREATE UNIQUE INDEX watchlist_symbol_mapping_pkey ON public.watchlist_symbol_mapping USING btree (symbol);

CREATE UNIQUE INDEX watchlist_tabs_pkey ON public.watchlist_tabs USING btree (id);

CREATE UNIQUE INDEX watchlists_pkey ON public.watchlists USING btree (user_id);

alter table "public"."company" add constraint "company_pkey" PRIMARY KEY using index "company_pkey";

alter table "public"."financials_std" add constraint "financials_std_pkey" PRIMARY KEY using index "financials_std_pkey";

alter table "public"."watchlist_dividends" add constraint "watchlist_dividends_pkey" PRIMARY KEY using index "watchlist_dividends_pkey";

alter table "public"."watchlist_earnings" add constraint "watchlist_earnings_pkey" PRIMARY KEY using index "watchlist_earnings_pkey";

alter table "public"."watchlist_extended_hours" add constraint "watchlist_extended_hours_pkey" PRIMARY KEY using index "watchlist_extended_hours_pkey";

alter table "public"."watchlist_items" add constraint "watchlist_items_pkey" PRIMARY KEY using index "watchlist_items_pkey";

alter table "public"."watchlist_metrics" add constraint "watchlist_metrics_pkey" PRIMARY KEY using index "watchlist_metrics_pkey";

alter table "public"."watchlist_news_archive" add constraint "watchlist_news_archive_pkey" PRIMARY KEY using index "watchlist_news_archive_pkey";

alter table "public"."watchlist_quotes" add constraint "watchlist_quotes_pkey" PRIMARY KEY using index "watchlist_quotes_pkey";

alter table "public"."watchlist_settings" add constraint "watchlist_settings_pkey" PRIMARY KEY using index "watchlist_settings_pkey";

alter table "public"."watchlist_symbol_mapping" add constraint "watchlist_symbol_mapping_pkey" PRIMARY KEY using index "watchlist_symbol_mapping_pkey";

alter table "public"."watchlist_tabs" add constraint "watchlist_tabs_pkey" PRIMARY KEY using index "watchlist_tabs_pkey";

alter table "public"."watchlists" add constraint "watchlists_pkey" PRIMARY KEY using index "watchlists_pkey";

alter table "public"."watchlist_dividends" add constraint "watchlist_dividends_updated_by_check" CHECK ((updated_by = ANY (ARRAY['cron'::text, 'on-demand'::text, 'manual'::text]))) not valid;

alter table "public"."watchlist_dividends" validate constraint "watchlist_dividends_updated_by_check";

alter table "public"."watchlist_earnings" add constraint "watchlist_earnings_status_check" CHECK ((status = ANY (ARRAY['none'::text, 'upcoming'::text, 'today_bmo'::text, 'today_amc'::text, 'recent'::text]))) not valid;

alter table "public"."watchlist_earnings" validate constraint "watchlist_earnings_status_check";

alter table "public"."watchlist_extended_hours" add constraint "watchlist_extended_hours_session_check" CHECK ((session = ANY (ARRAY['premarket'::text, 'afterhours'::text]))) not valid;

alter table "public"."watchlist_extended_hours" validate constraint "watchlist_extended_hours_session_check";

alter table "public"."watchlist_items" add constraint "unique_tab_item_position" UNIQUE using index "unique_tab_item_position";

alter table "public"."watchlist_items" add constraint "valid_stock_item" CHECK ((((type = 'stock'::text) AND (symbol IS NOT NULL)) OR ((type = 'header'::text) AND (header_text IS NOT NULL)))) not valid;

alter table "public"."watchlist_items" validate constraint "valid_stock_item";

alter table "public"."watchlist_items" add constraint "watchlist_items_tab_id_fkey" FOREIGN KEY (tab_id) REFERENCES public.watchlist_tabs(id) ON DELETE CASCADE not valid;

alter table "public"."watchlist_items" validate constraint "watchlist_items_tab_id_fkey";

alter table "public"."watchlist_items" add constraint "watchlist_items_type_check" CHECK ((type = ANY (ARRAY['stock'::text, 'header'::text]))) not valid;

alter table "public"."watchlist_items" validate constraint "watchlist_items_type_check";

alter table "public"."watchlist_quotes" add constraint "watchlist_quotes_updated_by_check" CHECK ((updated_by = ANY (ARRAY['cron'::text, 'on-demand'::text, 'manual'::text]))) not valid;

alter table "public"."watchlist_quotes" validate constraint "watchlist_quotes_updated_by_check";

alter table "public"."watchlist_settings" add constraint "watchlist_settings_active_tab_id_fkey" FOREIGN KEY (active_tab_id) REFERENCES public.watchlist_tabs(id) ON DELETE SET NULL not valid;

alter table "public"."watchlist_settings" validate constraint "watchlist_settings_active_tab_id_fkey";

alter table "public"."watchlist_settings" add constraint "watchlist_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."watchlist_settings" validate constraint "watchlist_settings_user_id_fkey";

alter table "public"."watchlist_tabs" add constraint "unique_user_tab_position" UNIQUE using index "unique_user_tab_position";

alter table "public"."watchlist_tabs" add constraint "watchlist_tabs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."watchlist_tabs" validate constraint "watchlist_tabs_user_id_fkey";

alter table "public"."watchlists" add constraint "watchlists_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."watchlists" validate constraint "watchlists_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.search_filing_chunks(query_embedding text, match_count integer DEFAULT 5)
 RETURNS TABLE(chunk_text text, section_name text, filing_type text, filing_date date, fiscal_year integer, fiscal_quarter integer, similarity double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    fc.chunk_text,
    fc.section_name,
    f.filing_type,
    f.filing_date,
    f.fiscal_year,
    f.fiscal_quarter,
    1 - (fc.embedding <=> query_embedding::vector) AS similarity
  FROM filing_chunks fc
  INNER JOIN filings f ON fc.filing_id = f.id
  WHERE fc.embedding IS NOT NULL
  ORDER BY fc.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$function$
;

grant delete on table "public"."company" to "anon";

grant insert on table "public"."company" to "anon";

grant references on table "public"."company" to "anon";

grant select on table "public"."company" to "anon";

grant trigger on table "public"."company" to "anon";

grant truncate on table "public"."company" to "anon";

grant update on table "public"."company" to "anon";

grant delete on table "public"."company" to "authenticated";

grant insert on table "public"."company" to "authenticated";

grant references on table "public"."company" to "authenticated";

grant select on table "public"."company" to "authenticated";

grant trigger on table "public"."company" to "authenticated";

grant truncate on table "public"."company" to "authenticated";

grant update on table "public"."company" to "authenticated";

grant delete on table "public"."company" to "service_role";

grant insert on table "public"."company" to "service_role";

grant references on table "public"."company" to "service_role";

grant select on table "public"."company" to "service_role";

grant trigger on table "public"."company" to "service_role";

grant truncate on table "public"."company" to "service_role";

grant update on table "public"."company" to "service_role";

grant delete on table "public"."financials_std" to "anon";

grant insert on table "public"."financials_std" to "anon";

grant references on table "public"."financials_std" to "anon";

grant select on table "public"."financials_std" to "anon";

grant trigger on table "public"."financials_std" to "anon";

grant truncate on table "public"."financials_std" to "anon";

grant update on table "public"."financials_std" to "anon";

grant delete on table "public"."financials_std" to "authenticated";

grant insert on table "public"."financials_std" to "authenticated";

grant references on table "public"."financials_std" to "authenticated";

grant select on table "public"."financials_std" to "authenticated";

grant trigger on table "public"."financials_std" to "authenticated";

grant truncate on table "public"."financials_std" to "authenticated";

grant update on table "public"."financials_std" to "authenticated";

grant delete on table "public"."financials_std" to "service_role";

grant insert on table "public"."financials_std" to "service_role";

grant references on table "public"."financials_std" to "service_role";

grant select on table "public"."financials_std" to "service_role";

grant trigger on table "public"."financials_std" to "service_role";

grant truncate on table "public"."financials_std" to "service_role";

grant update on table "public"."financials_std" to "service_role";

grant delete on table "public"."watchlist_dividends" to "anon";

grant insert on table "public"."watchlist_dividends" to "anon";

grant references on table "public"."watchlist_dividends" to "anon";

grant select on table "public"."watchlist_dividends" to "anon";

grant trigger on table "public"."watchlist_dividends" to "anon";

grant truncate on table "public"."watchlist_dividends" to "anon";

grant update on table "public"."watchlist_dividends" to "anon";

grant delete on table "public"."watchlist_dividends" to "authenticated";

grant insert on table "public"."watchlist_dividends" to "authenticated";

grant references on table "public"."watchlist_dividends" to "authenticated";

grant select on table "public"."watchlist_dividends" to "authenticated";

grant trigger on table "public"."watchlist_dividends" to "authenticated";

grant truncate on table "public"."watchlist_dividends" to "authenticated";

grant update on table "public"."watchlist_dividends" to "authenticated";

grant delete on table "public"."watchlist_dividends" to "service_role";

grant insert on table "public"."watchlist_dividends" to "service_role";

grant references on table "public"."watchlist_dividends" to "service_role";

grant select on table "public"."watchlist_dividends" to "service_role";

grant trigger on table "public"."watchlist_dividends" to "service_role";

grant truncate on table "public"."watchlist_dividends" to "service_role";

grant update on table "public"."watchlist_dividends" to "service_role";

grant delete on table "public"."watchlist_earnings" to "anon";

grant insert on table "public"."watchlist_earnings" to "anon";

grant references on table "public"."watchlist_earnings" to "anon";

grant select on table "public"."watchlist_earnings" to "anon";

grant trigger on table "public"."watchlist_earnings" to "anon";

grant truncate on table "public"."watchlist_earnings" to "anon";

grant update on table "public"."watchlist_earnings" to "anon";

grant delete on table "public"."watchlist_earnings" to "authenticated";

grant insert on table "public"."watchlist_earnings" to "authenticated";

grant references on table "public"."watchlist_earnings" to "authenticated";

grant select on table "public"."watchlist_earnings" to "authenticated";

grant trigger on table "public"."watchlist_earnings" to "authenticated";

grant truncate on table "public"."watchlist_earnings" to "authenticated";

grant update on table "public"."watchlist_earnings" to "authenticated";

grant delete on table "public"."watchlist_earnings" to "service_role";

grant insert on table "public"."watchlist_earnings" to "service_role";

grant references on table "public"."watchlist_earnings" to "service_role";

grant select on table "public"."watchlist_earnings" to "service_role";

grant trigger on table "public"."watchlist_earnings" to "service_role";

grant truncate on table "public"."watchlist_earnings" to "service_role";

grant update on table "public"."watchlist_earnings" to "service_role";

grant delete on table "public"."watchlist_extended_hours" to "anon";

grant insert on table "public"."watchlist_extended_hours" to "anon";

grant references on table "public"."watchlist_extended_hours" to "anon";

grant select on table "public"."watchlist_extended_hours" to "anon";

grant trigger on table "public"."watchlist_extended_hours" to "anon";

grant truncate on table "public"."watchlist_extended_hours" to "anon";

grant update on table "public"."watchlist_extended_hours" to "anon";

grant delete on table "public"."watchlist_extended_hours" to "authenticated";

grant insert on table "public"."watchlist_extended_hours" to "authenticated";

grant references on table "public"."watchlist_extended_hours" to "authenticated";

grant select on table "public"."watchlist_extended_hours" to "authenticated";

grant trigger on table "public"."watchlist_extended_hours" to "authenticated";

grant truncate on table "public"."watchlist_extended_hours" to "authenticated";

grant update on table "public"."watchlist_extended_hours" to "authenticated";

grant delete on table "public"."watchlist_extended_hours" to "service_role";

grant insert on table "public"."watchlist_extended_hours" to "service_role";

grant references on table "public"."watchlist_extended_hours" to "service_role";

grant select on table "public"."watchlist_extended_hours" to "service_role";

grant trigger on table "public"."watchlist_extended_hours" to "service_role";

grant truncate on table "public"."watchlist_extended_hours" to "service_role";

grant update on table "public"."watchlist_extended_hours" to "service_role";

grant delete on table "public"."watchlist_items" to "anon";

grant insert on table "public"."watchlist_items" to "anon";

grant references on table "public"."watchlist_items" to "anon";

grant select on table "public"."watchlist_items" to "anon";

grant trigger on table "public"."watchlist_items" to "anon";

grant truncate on table "public"."watchlist_items" to "anon";

grant update on table "public"."watchlist_items" to "anon";

grant delete on table "public"."watchlist_items" to "authenticated";

grant insert on table "public"."watchlist_items" to "authenticated";

grant references on table "public"."watchlist_items" to "authenticated";

grant select on table "public"."watchlist_items" to "authenticated";

grant trigger on table "public"."watchlist_items" to "authenticated";

grant truncate on table "public"."watchlist_items" to "authenticated";

grant update on table "public"."watchlist_items" to "authenticated";

grant delete on table "public"."watchlist_items" to "service_role";

grant insert on table "public"."watchlist_items" to "service_role";

grant references on table "public"."watchlist_items" to "service_role";

grant select on table "public"."watchlist_items" to "service_role";

grant trigger on table "public"."watchlist_items" to "service_role";

grant truncate on table "public"."watchlist_items" to "service_role";

grant update on table "public"."watchlist_items" to "service_role";

grant delete on table "public"."watchlist_metrics" to "anon";

grant insert on table "public"."watchlist_metrics" to "anon";

grant references on table "public"."watchlist_metrics" to "anon";

grant select on table "public"."watchlist_metrics" to "anon";

grant trigger on table "public"."watchlist_metrics" to "anon";

grant truncate on table "public"."watchlist_metrics" to "anon";

grant update on table "public"."watchlist_metrics" to "anon";

grant delete on table "public"."watchlist_metrics" to "authenticated";

grant insert on table "public"."watchlist_metrics" to "authenticated";

grant references on table "public"."watchlist_metrics" to "authenticated";

grant select on table "public"."watchlist_metrics" to "authenticated";

grant trigger on table "public"."watchlist_metrics" to "authenticated";

grant truncate on table "public"."watchlist_metrics" to "authenticated";

grant update on table "public"."watchlist_metrics" to "authenticated";

grant delete on table "public"."watchlist_metrics" to "service_role";

grant insert on table "public"."watchlist_metrics" to "service_role";

grant references on table "public"."watchlist_metrics" to "service_role";

grant select on table "public"."watchlist_metrics" to "service_role";

grant trigger on table "public"."watchlist_metrics" to "service_role";

grant truncate on table "public"."watchlist_metrics" to "service_role";

grant update on table "public"."watchlist_metrics" to "service_role";

grant delete on table "public"."watchlist_news_archive" to "anon";

grant insert on table "public"."watchlist_news_archive" to "anon";

grant references on table "public"."watchlist_news_archive" to "anon";

grant select on table "public"."watchlist_news_archive" to "anon";

grant trigger on table "public"."watchlist_news_archive" to "anon";

grant truncate on table "public"."watchlist_news_archive" to "anon";

grant update on table "public"."watchlist_news_archive" to "anon";

grant delete on table "public"."watchlist_news_archive" to "authenticated";

grant insert on table "public"."watchlist_news_archive" to "authenticated";

grant references on table "public"."watchlist_news_archive" to "authenticated";

grant select on table "public"."watchlist_news_archive" to "authenticated";

grant trigger on table "public"."watchlist_news_archive" to "authenticated";

grant truncate on table "public"."watchlist_news_archive" to "authenticated";

grant update on table "public"."watchlist_news_archive" to "authenticated";

grant delete on table "public"."watchlist_news_archive" to "service_role";

grant insert on table "public"."watchlist_news_archive" to "service_role";

grant references on table "public"."watchlist_news_archive" to "service_role";

grant select on table "public"."watchlist_news_archive" to "service_role";

grant trigger on table "public"."watchlist_news_archive" to "service_role";

grant truncate on table "public"."watchlist_news_archive" to "service_role";

grant update on table "public"."watchlist_news_archive" to "service_role";

grant delete on table "public"."watchlist_quotes" to "anon";

grant insert on table "public"."watchlist_quotes" to "anon";

grant references on table "public"."watchlist_quotes" to "anon";

grant select on table "public"."watchlist_quotes" to "anon";

grant trigger on table "public"."watchlist_quotes" to "anon";

grant truncate on table "public"."watchlist_quotes" to "anon";

grant update on table "public"."watchlist_quotes" to "anon";

grant delete on table "public"."watchlist_quotes" to "authenticated";

grant insert on table "public"."watchlist_quotes" to "authenticated";

grant references on table "public"."watchlist_quotes" to "authenticated";

grant select on table "public"."watchlist_quotes" to "authenticated";

grant trigger on table "public"."watchlist_quotes" to "authenticated";

grant truncate on table "public"."watchlist_quotes" to "authenticated";

grant update on table "public"."watchlist_quotes" to "authenticated";

grant delete on table "public"."watchlist_quotes" to "service_role";

grant insert on table "public"."watchlist_quotes" to "service_role";

grant references on table "public"."watchlist_quotes" to "service_role";

grant select on table "public"."watchlist_quotes" to "service_role";

grant trigger on table "public"."watchlist_quotes" to "service_role";

grant truncate on table "public"."watchlist_quotes" to "service_role";

grant update on table "public"."watchlist_quotes" to "service_role";

grant delete on table "public"."watchlist_settings" to "anon";

grant insert on table "public"."watchlist_settings" to "anon";

grant references on table "public"."watchlist_settings" to "anon";

grant select on table "public"."watchlist_settings" to "anon";

grant trigger on table "public"."watchlist_settings" to "anon";

grant truncate on table "public"."watchlist_settings" to "anon";

grant update on table "public"."watchlist_settings" to "anon";

grant delete on table "public"."watchlist_settings" to "authenticated";

grant insert on table "public"."watchlist_settings" to "authenticated";

grant references on table "public"."watchlist_settings" to "authenticated";

grant select on table "public"."watchlist_settings" to "authenticated";

grant trigger on table "public"."watchlist_settings" to "authenticated";

grant truncate on table "public"."watchlist_settings" to "authenticated";

grant update on table "public"."watchlist_settings" to "authenticated";

grant delete on table "public"."watchlist_settings" to "service_role";

grant insert on table "public"."watchlist_settings" to "service_role";

grant references on table "public"."watchlist_settings" to "service_role";

grant select on table "public"."watchlist_settings" to "service_role";

grant trigger on table "public"."watchlist_settings" to "service_role";

grant truncate on table "public"."watchlist_settings" to "service_role";

grant update on table "public"."watchlist_settings" to "service_role";

grant delete on table "public"."watchlist_symbol_mapping" to "anon";

grant insert on table "public"."watchlist_symbol_mapping" to "anon";

grant references on table "public"."watchlist_symbol_mapping" to "anon";

grant select on table "public"."watchlist_symbol_mapping" to "anon";

grant trigger on table "public"."watchlist_symbol_mapping" to "anon";

grant truncate on table "public"."watchlist_symbol_mapping" to "anon";

grant update on table "public"."watchlist_symbol_mapping" to "anon";

grant delete on table "public"."watchlist_symbol_mapping" to "authenticated";

grant insert on table "public"."watchlist_symbol_mapping" to "authenticated";

grant references on table "public"."watchlist_symbol_mapping" to "authenticated";

grant select on table "public"."watchlist_symbol_mapping" to "authenticated";

grant trigger on table "public"."watchlist_symbol_mapping" to "authenticated";

grant truncate on table "public"."watchlist_symbol_mapping" to "authenticated";

grant update on table "public"."watchlist_symbol_mapping" to "authenticated";

grant delete on table "public"."watchlist_symbol_mapping" to "service_role";

grant insert on table "public"."watchlist_symbol_mapping" to "service_role";

grant references on table "public"."watchlist_symbol_mapping" to "service_role";

grant select on table "public"."watchlist_symbol_mapping" to "service_role";

grant trigger on table "public"."watchlist_symbol_mapping" to "service_role";

grant truncate on table "public"."watchlist_symbol_mapping" to "service_role";

grant update on table "public"."watchlist_symbol_mapping" to "service_role";

grant delete on table "public"."watchlist_tabs" to "anon";

grant insert on table "public"."watchlist_tabs" to "anon";

grant references on table "public"."watchlist_tabs" to "anon";

grant select on table "public"."watchlist_tabs" to "anon";

grant trigger on table "public"."watchlist_tabs" to "anon";

grant truncate on table "public"."watchlist_tabs" to "anon";

grant update on table "public"."watchlist_tabs" to "anon";

grant delete on table "public"."watchlist_tabs" to "authenticated";

grant insert on table "public"."watchlist_tabs" to "authenticated";

grant references on table "public"."watchlist_tabs" to "authenticated";

grant select on table "public"."watchlist_tabs" to "authenticated";

grant trigger on table "public"."watchlist_tabs" to "authenticated";

grant truncate on table "public"."watchlist_tabs" to "authenticated";

grant update on table "public"."watchlist_tabs" to "authenticated";

grant delete on table "public"."watchlist_tabs" to "service_role";

grant insert on table "public"."watchlist_tabs" to "service_role";

grant references on table "public"."watchlist_tabs" to "service_role";

grant select on table "public"."watchlist_tabs" to "service_role";

grant trigger on table "public"."watchlist_tabs" to "service_role";

grant truncate on table "public"."watchlist_tabs" to "service_role";

grant update on table "public"."watchlist_tabs" to "service_role";

grant delete on table "public"."watchlists" to "anon";

grant insert on table "public"."watchlists" to "anon";

grant references on table "public"."watchlists" to "anon";

grant select on table "public"."watchlists" to "anon";

grant trigger on table "public"."watchlists" to "anon";

grant truncate on table "public"."watchlists" to "anon";

grant update on table "public"."watchlists" to "anon";

grant delete on table "public"."watchlists" to "authenticated";

grant insert on table "public"."watchlists" to "authenticated";

grant references on table "public"."watchlists" to "authenticated";

grant select on table "public"."watchlists" to "authenticated";

grant trigger on table "public"."watchlists" to "authenticated";

grant truncate on table "public"."watchlists" to "authenticated";

grant update on table "public"."watchlists" to "authenticated";

grant delete on table "public"."watchlists" to "service_role";

grant insert on table "public"."watchlists" to "service_role";

grant references on table "public"."watchlists" to "service_role";

grant select on table "public"."watchlists" to "service_role";

grant trigger on table "public"."watchlists" to "service_role";

grant truncate on table "public"."watchlists" to "service_role";

grant update on table "public"."watchlists" to "service_role";


  create policy "public read"
  on "public"."company"
  as permissive
  for select
  to public
using (true);



  create policy "public read"
  on "public"."financials_std"
  as permissive
  for select
  to public
using (true);



  create policy "Dividends are viewable by everyone"
  on "public"."watchlist_dividends"
  as permissive
  for select
  to public
using (true);



  create policy "Dividends are writable by service role"
  on "public"."watchlist_dividends"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Earnings are viewable by everyone"
  on "public"."watchlist_earnings"
  as permissive
  for select
  to public
using (true);



  create policy "Earnings are writable by service role"
  on "public"."watchlist_earnings"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Extended hours are viewable by everyone"
  on "public"."watchlist_extended_hours"
  as permissive
  for select
  to public
using (true);



  create policy "Extended hours are writable by service role"
  on "public"."watchlist_extended_hours"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can delete items from own watchlist tabs"
  on "public"."watchlist_items"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.watchlist_tabs
  WHERE ((watchlist_tabs.id = watchlist_items.tab_id) AND (watchlist_tabs.user_id = auth.uid())))));



  create policy "Users can insert items in own watchlist tabs"
  on "public"."watchlist_items"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.watchlist_tabs
  WHERE ((watchlist_tabs.id = watchlist_items.tab_id) AND (watchlist_tabs.user_id = auth.uid())))));



  create policy "Users can update items in own watchlist tabs"
  on "public"."watchlist_items"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.watchlist_tabs
  WHERE ((watchlist_tabs.id = watchlist_items.tab_id) AND (watchlist_tabs.user_id = auth.uid())))));



  create policy "Users can view items in own watchlist tabs"
  on "public"."watchlist_items"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.watchlist_tabs
  WHERE ((watchlist_tabs.id = watchlist_items.tab_id) AND (watchlist_tabs.user_id = auth.uid())))));



  create policy "Metrics are viewable by everyone"
  on "public"."watchlist_metrics"
  as permissive
  for select
  to public
using (true);



  create policy "Metrics are writable by service role"
  on "public"."watchlist_metrics"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "News is viewable by everyone"
  on "public"."watchlist_news_archive"
  as permissive
  for select
  to public
using (true);



  create policy "News is writable by service role"
  on "public"."watchlist_news_archive"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Quotes are viewable by everyone"
  on "public"."watchlist_quotes"
  as permissive
  for select
  to public
using (true);



  create policy "Quotes are writable by service role"
  on "public"."watchlist_quotes"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can delete own watchlist settings"
  on "public"."watchlist_settings"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert own watchlist settings"
  on "public"."watchlist_settings"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update own watchlist settings"
  on "public"."watchlist_settings"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view own watchlist settings"
  on "public"."watchlist_settings"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Users manage watchlist settings"
  on "public"."watchlist_settings"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Symbol mappings are viewable by everyone"
  on "public"."watchlist_symbol_mapping"
  as permissive
  for select
  to public
using (true);



  create policy "Symbol mappings are writable by service role"
  on "public"."watchlist_symbol_mapping"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Users can delete own watchlist tabs"
  on "public"."watchlist_tabs"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert own watchlist tabs"
  on "public"."watchlist_tabs"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update own watchlist tabs"
  on "public"."watchlist_tabs"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view own watchlist tabs"
  on "public"."watchlist_tabs"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Users manage watchlists"
  on "public"."watchlists"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));


CREATE TRIGGER update_watchlist_items_updated_at BEFORE UPDATE ON public.watchlist_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_watchlist_settings_updated_at BEFORE UPDATE ON public.watchlist_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_watchlist_tabs_updated_at BEFORE UPDATE ON public.watchlist_tabs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


  create policy "Allow all operations on filings bucket"
  on "storage"."objects"
  as permissive
  for all
  to public
using ((bucket_id = 'filings'::text))
with check ((bucket_id = 'filings'::text));



