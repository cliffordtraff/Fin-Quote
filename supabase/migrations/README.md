# Database Migrations

This directory is the schema history for the app's Supabase project.

Current state:

- 58 SQL migrations
- Span: October 2024 to July 2026
- Covers core financial tables, filings search, chatbot evaluation/review infrastructure, S&P 500 expansion, insider data, cache tables, and charting-workspace persistence

## How To Read This Folder

- Files are ordered chronologically by timestamp prefix
- Later migrations may tighten constraints or policies introduced by earlier ones
- Some migrations are feature-specific, while others are schema-realignment or security hardening steps

Primary related references:

- `data/MIGRATIONS.md`
- `lib/database.types.ts`
- `supabase/config.toml`

## Migration History

| Date | Migration | Description |
|------|-----------|-------------|
| 2024-10-25 | `20241025000001_initial_schema.sql` | Initial core schema for company, financials, and price history |
| 2024-10-26 | `20241026000001_create_filings_table.sql` | Add SEC filings metadata table |
| 2024-10-27 | `20241027000001_create_filing_chunks_table.sql` | Add filing chunk storage for vector/semantic search |
| 2024-10-27 | `20241027000002_add_storage_policies.sql` | Add storage policies for uploaded assets |
| 2024-10-31 | `20241031000001_create_query_logs_table.sql` | Add query logging for chatbot and evaluation workflows |
| 2024-11-01 | `20241101000001_create_prompt_versions.sql` | Add prompt version tracking |
| 2024-11-01 | `20241101000002_add_prompt_version_to_logs.sql` | Link query logs to prompt versions |
| 2024-11-01 | `20241101000003_create_search_function.sql` | Add filing-search database function |
| 2024-11-01 | `20241101000004_add_user_auth.sql` | Add user-auth support to app tables/workflows |
| 2024-11-02 | `20241102000001_add_validation_columns.sql` | Add answer-validation metadata to query logs |
| 2024-11-02 | `20241102000002_add_review_columns.sql` | Add human review / active-learning fields |
| 2024-11-02 | `20241102000003_add_cost_tracking.sql` | Add token and cost tracking fields |
| 2024-11-06 | `20241106000001_create_financial_metrics_table.sql` | Add extended financial metrics table |
| 2025-01-06 | `20250106_conversations.sql` | Add conversations and messages tables |
| 2025-02-03 | `20250203000001_add_segment_status_to_us_stocks.sql` | Add initial segment-ingestion status tracking for US stocks |
| 2025-11-07 | `20251107_evaluation_annotations.sql` | Add evaluation-annotation support |
| 2025-11-15 | `20251115000001_create_company_metrics_table.sql` | Add dimensional/company metrics for segments and derived company data |
| 2026-01-11 | `20260111210625_remote_schema.sql` | Re-align local migrations with remote schema snapshot |
| 2026-01-11 | `20260111210626_create_company_metrics_table.sql` | Recreate dimensional/company metrics after the imported remote-schema cleanup |
| 2026-01-15 | `20260115000001_add_quarterly_support.sql` | Add quarterly financial/metric support |
| 2026-01-15 | `20260115000002_update_financial_metrics_constraint.sql` | Update financial-metrics uniqueness/constraint rules |
| 2026-01-16 | `20260116000001_add_ticker_filter_to_search.sql` | Add ticker-aware search filtering |
| 2026-01-17 | `20260117000001_sp500_expansion_phase0_phase1.sql` | Add uniqueness hardening and S&P 500 constituents table |
| 2026-01-17 | `20260117000002_add_financial_metrics_rls.sql` | Add/adjust RLS for financial metrics |
| 2026-01-18 | `20260118000001_fix_financials_std_unique_constraint.sql` | Fix `financials_std` uniqueness rules |
| 2026-01-18 | `20260118000002_create_company_data_tables.sql` | Add company profile, price performance, analyst estimates, earnings history, and other company-page data tables |
| 2026-01-24 | `20260124000001_create_insider_tables.sql` | Add insider-trading tables |
| 2026-01-24 | `20260124000002_add_source_id_unique.sql` | Enforce unique source IDs for insider data |
| 2026-01-25 | `20260125000001_add_shares_outstanding.sql` | Add shares-outstanding support |
| 2026-01-26 | `20260126000001_add_llm_cache_tables.sql` | Add cache tables for LLM-generated outputs |
| 2026-02-01 | `20260201000001_create_market_summary_cache.sql` | Add cache table for market summaries |
| 2026-02-01 | `20260201000002_lock_down_llm_cache_policies.sql` | Remove anonymous write access from LLM cache tables |
| 2026-02-01 | `20260201000003_create_us_stocks_table.sql` | Add broader US stocks registry table |
| 2026-02-01 | `20260201000004_add_segment_status_to_us_stocks.sql` | Restore segment-ingestion status tracking after the US stocks table creation |
| 2026-02-03 | `20260203000002_create_market_movers_cache.sql` | Add market-movers cache table |
| 2026-03-08 | `20260308000001_create_charting_docs_table.sql` | Add `docs` table for charting workspace persistence/cloud sync |
| 2026-03-25 | `20260325000001_create_stock_why_moving_cache.sql` | Add cache table for stock “why moving” summaries |
| 2026-03-26 | `20260326000002_create_newsletter_drafts_table.sql` | Add editable newsletter draft persistence |
| 2026-03-26 | `20260326000003_allow_anonymous_newsletter_drafts.sql` | Add anonymous session support for newsletter drafts |
| 2026-03-27 | `20260327000001_create_dashboard_chart_of_day_settings.sql` | Add dashboard chart-of-the-day settings |
| 2026-03-27 | `20260327000002_add_chart_spec_to_dashboard_chart_of_day_settings.sql` | Store chart specs for dashboard chart-of-the-day settings |
| 2026-03-27 | `20260327000003_create_newsletter_chart_library.sql` | Add reusable newsletter chart library metadata and Storage bucket |
| 2026-05-20 | `20260520200500_create_wiim_runs.sql` | Add WIIM morning brief run and candidate tables |
| 2026-05-31 | `20260531162000_enable_rls_on_remaining_public_tables.sql` | Enable RLS on remaining public tables |
| 2026-05-31 | `20260531170000_explicit_data_api_grants.sql` | Add explicit Data API grants for public tables |
| 2026-06-01 | `20260601110000_create_generated_wiim_summaries.sql` | Add generated WIIM summary batch tables |
| 2026-06-10 | `20260610184500_wiim_data_api_grants.sql` | Add explicit Data API grants for WIIM tables |
| 2026-07-28 | `20260728000001_expand_newsletter_draft_workflow.sql` | Expand newsletter drafts to Draft, Review, Ready, and Published stages |
| 2026-07-28 | `20260728000002_create_stock_why_moving_reviews.sql` | Add persistent editorial review state for daily stock catalysts |
| 2026-07-28 | `20260728003000_normalize_insider_aggregate_principal.sql` | Normalize insider aggregate principals and supporting indexes |
| 2026-07-29 | `20260729095500_expand_wiim_run_types.sql` | Store mid-morning WIIM snapshots separately from morning runs |
| 2026-07-29 | `20260729103000_add_catalyst_newsletter_workflow.sql` | Link approved catalysts to idempotent newsletter drafts and track Beehiiv publication history |
| 2026-07-29 | `20260729183000_create_newsletter_daily_runs.sql` | Persist daily 30–50 issue newsletter settings, runs, run items, WIIM metadata, and retry state |
| 2026-07-29 | `20260729190000_default_newsletter_generation_to_eight.sql` | Default daily newsletter generation to 8:00 AM ET |
| 2026-07-30 | `20260730090000_create_newsletter_daily_automation_runs.sql` | Add leased, resumable morning automation state and stage counters |
| 2026-07-30 | `20260730100000_schedule_newsletter_daily_automation.sql` | Add the protected Supabase cron invocation for weekday morning production |
| 2026-07-30 | `20260730120000_create_beehiiv_mcp_delivery.sql` | Persist encrypted Beehiiv MCP connections and idempotent draft deliveries |
| 2026-07-30 | `20260730143000_complete_newsletter_operations.sql` | Add notifications, Beehiiv lifecycle reconciliation, mid-morning automation, and all three operating cron schedules |

## Major Schema Areas

### Core market and financial data

- `company`
- `financials_std`
- `financial_metrics`
- `company_metrics`
- US stocks / S&P 500 registry tables

### Filings and search

- `filings`
- `filing_chunks`
- filing search RPC/function support

### AI, evaluation, and review

- `query_logs`
- prompt version tables
- validation and review columns
- evaluation annotations
- LLM cache tables

### Product features

- conversations and messages
- insider-trading tables
- market summary and movers caches
- charting workspace persistence docs
- stock "why moving" cache and editorial review queue
- newsletter drafts, publishing workflow, reusable chart library, daily and
  mid-morning production runs, durable notifications, and Beehiiv lifecycle
  reconciliation
- WIIM morning brief runs and generated summary batches

## Creating New Migrations

### Method 1: Supabase CLI

Preferred when available:

```bash
supabase migration new add_new_feature
supabase db push
```

### Method 2: Manual SQL file + dashboard apply

1. Create the file:

```bash
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_your_migration_name.sql
```

2. Write idempotent SQL where possible
3. Apply it in the Supabase SQL editor or your normal deployment process
4. Update any related documentation if the schema meaningfully changed

## Naming Convention

Format:

```text
YYYYMMDDHHMMSS_descriptive_name.sql
```

Examples:

- `20241102123045_add_embedding_tokens.sql`
- `20260325000001_create_stock_why_moving_cache.sql`

Avoid:

- `migration.sql`
- `add_column.sql`

## Best Practices

Do:

- Keep migrations small and focused
- Add comments that explain why the change exists
- Prefer idempotent guards when practical
- Add indexes and constraints deliberately
- Keep schema and one-off data backfills separated unless tightly coupled

Do not:

- Drop tables casually
- Assume local and remote schemas are identical without checking
- Rely on anonymous writes for server-owned cache flows
- Forget to update generated types and any migration trackers after schema changes

## Template

```sql
-- Description: What this migration does and why
-- Date: YYYY-MM-DD

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'my_table'
      AND column_name = 'new_column'
  ) THEN
    ALTER TABLE my_table ADD COLUMN new_column TEXT;
  END IF;
END
$$;

COMMIT;
```

## Checking Status

### See applied migrations

```sql
SELECT migration_name, executed_at
FROM supabase_migrations.schema_migrations
ORDER BY executed_at DESC;
```

### Inspect table columns

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'query_logs'
ORDER BY ordinal_position;
```

## Troubleshooting

### "Column already exists"

The migration may already be applied. Either skip it or make it idempotent.

### "Table doesn't exist"

Earlier migrations may be missing, or local and remote schemas may have drifted.

### "Permission denied"

You likely need owner-level or service-role privileges for the operation you are attempting.
