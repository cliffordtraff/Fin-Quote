# Database Migrations

This directory is the schema history for the app's Supabase project.

Current state:

- 90 SQL migrations as of 2026-08-06
- Span: October 2024 to August 2026
- Covers core financial tables, filings search, chatbot evaluation/review infrastructure, S&P 500 expansion, insider data, cache tables, and charting-workspace persistence

## How To Read This Folder

- Files are ordered chronologically by timestamp prefix
- Later migrations may tighten constraints or policies introduced by earlier ones
- Some migrations are feature-specific, while others are schema-realignment or security hardening steps

Primary related references:

- `data/MIGRATIONS.md`
- `lib/database.types.ts`
- `supabase/config.toml`
- `supabase/tests/authorization_boundaries.sql`
- `docs/migration-ledger-convergence.md`

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
| 2026-03-20 | `20260320210000_create_monthly_ratio_snapshots.sql` | Add reproducible monthly valuation-ratio snapshots |
| 2026-03-20 | `20260320214500_add_fcf_yield_to_monthly_ratio_snapshots.sql` | Add free-cash-flow yield to monthly ratio snapshots |
| 2026-03-21 | `20260321140000_add_cash_to_financials_std.sql` | Add standardized cash and cash-equivalents data |
| 2026-03-21 | `20260321150000_add_bulk_update_cash_fn.sql` | Add the bulk cash backfill function |
| 2026-03-22 | `20260322100000_create_stock_summaries.sql` | Add stock summaries, ranker configs, evaluations, and manual reviews |
| 2026-03-22 | `20260322160000_add_source_type_boosts.sql` | Historical ranker source boosts; retired by the August convergence migration |
| 2026-03-22 | `20260322170000_create_finviz_wism_corpus.sql` | Historical FinViz WIIM corpus; retired by the August convergence migration |
| 2026-03-25 | `20260325000001_create_stock_why_moving_cache.sql` | Add cache table for stock “why moving” summaries |
| 2026-03-26 | `20260326000002_create_newsletter_drafts_table.sql` | Add editable newsletter draft persistence |
| 2026-03-26 | `20260326000003_allow_anonymous_newsletter_drafts.sql` | Add anonymous session support for newsletter drafts |
| 2026-03-27 | `20260327000001_create_dashboard_chart_of_day_settings.sql` | Add dashboard chart-of-the-day settings |
| 2026-03-27 | `20260327000002_add_chart_spec_to_dashboard_chart_of_day_settings.sql` | Store chart specs for dashboard chart-of-the-day settings |
| 2026-03-27 | `20260327000003_create_newsletter_chart_library.sql` | Add reusable newsletter chart library metadata and Storage bucket |
| 2026-04-02 | `20260402080000_add_finviz_catalyst_type_to_evals.sql` | Add catalyst-type classification to summary evaluations |
| 2026-04-02 | `20260402090000_add_bucket_to_evals.sql` | Add three-bucket evaluation classification |
| 2026-04-03 | `20260403000000_add_direct_rank_columns.sql` | Add direct-ranker comparison instrumentation |
| 2026-04-03 | `20260403000001_add_candidate_pool_columns.sql` | Persist evaluation candidate pools and matched titles |
| 2026-04-03 | `20260403121500_add_bucket_detail_to_evals.sql` | Add granular evaluation bucket details |
| 2026-04-03 | `20260403170000_add_selected_event_columns_to_evals.sql` | Persist selected event metadata on evaluations |
| 2026-04-03 | `20260403183000_add_eval_quality_columns.sql` | Separate benchmark match from explanation quality |
| 2026-04-03 | `20260403193000_add_canonical_explanation_to_summary_evals.sql` | Persist canonical WIIM explanations |
| 2026-04-03 | `20260403200000_add_miss_reason_to_evals.sql` | Add structured miss reasons |
| 2026-04-04 | `20260404073000_create_wiim_cost_runs.sql` | Track WIIM replay and optimization costs |
| 2026-04-04 | `20260404160000_add_feedback_to_stock_summaries.sql` | Add human feedback to stock summaries |
| 2026-04-04 | `20260404180000_add_summary_versioning.sql` | Add summary run history and versioning |
| 2026-04-04 | `20260404200000_create_company_profiles_cache.sql` | Add provider-backed company profile cache |
| 2026-04-06 | `20260406080000_create_finviz_catalysts.sql` | Add current FinViz catalyst storage |
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
| 2026-08-03 | `20260803170000_schedule_dashboard_market_context.sql` | Retry missing dashboard commentary components at 10:15, 10:22, and 10:29 ET behind the protected scheduler boundary |
| 2026-08-06 | `20260806130000_harden_beehiiv_delivery.sql` | Add leased, recoverable Beehiiv synchronization and lifecycle hardening |
| 2026-08-06 | `20260806131000_newsletter_webhook_outbox.sql` | Add leased, HMAC-signed newsletter alert delivery with durable exponential retries |
| 2026-08-06 | `20260806132000_adopt_untracked_live_tables.sql` | Reproduce six live tables that predated the migration ledger |
| 2026-08-06 | `20260806133000_converge_review_schema_and_cache_security.sql` | Converge catalyst review schema, cache RLS, and retired WIIM objects |
| 2026-08-06 | `20260806134000_complete_schema_convergence.sql` | Finish live/replay schema convergence and remove stale browser writes from server-owned reference data |
| 2026-08-06 | `20260806135000_newsletter_cron_observability.sql` | Add durable execution heartbeats for critical newsletter schedules |
| 2026-08-06 | `20260806140000_fence_newsletter_automation_leases.sql` | Fence automation writes to the current, unexpired lease owner |
| 2026-08-06 | `20260806141000_retry_terminal_newsletter_notifications.sql` | Track and safely retry terminal operator notifications across crash boundaries |
| 2026-08-06 | `20260806142000_track_beehiiv_stats_health.sql` | Track Beehiiv statistics freshness separately from lifecycle reconciliation |
| 2026-08-06 | `20260806143000_lock_down_data_api_authorization.sql` | Replace broad browser grants with an explicit read, owner, service, function, and Storage authorization matrix |

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

## Authorization Model

Database access has two independent locks:

1. PostgreSQL grants decide whether a role may attempt an operation on a table,
   sequence, or function.
2. Row Level Security policies decide which rows that permitted operation may
   reach.

Both must be correct. RLS cannot rescue an accidental table grant when a broad
permissive policy also matches, and a perfect owner policy is useless if its
role never received the required table privilege. Policies are permissive by
default: matching policies are combined with `OR`, not `AND`. Every policy
therefore names its intended role with `TO authenticated` or `TO service_role`;
omitting `TO` means PostgreSQL applies it to `PUBLIC`.

The current contract is:

- `anon` receives `SELECT` only on the deliberate public market/reference
  surface;
- `authenticated` receives the same public reads plus narrowly scoped DML on
  owner tables, with RLS binding rows to `auth.uid()`;
- query-log creation and telemetry fields are server-owned; authenticated
  callers can read/delete their own rows and update only feedback columns;
- `service_role` owns ingestion, caches, operational records, review data, and
  privileged RPC execution; and
- future public-schema objects start private to browser roles through altered
  default privileges.

Supabase Storage is a special case. The platform-managed
`supabase_storage_admin` role owns the underlying `storage.objects` ACLs, so an
application migration should not pretend it can revoke those reserved grants.
Browser upload, overwrite, and delete authority is enforced by the Storage RLS
policy set. The pgTAP contract verifies RLS is enabled, confirms no matching
browser write policy exists for `filings` or `newsletter-charts`, and attempts
real DML as browser roles to prove those operations are denied.

`supabase/tests/authorization_boundaries.sql` is the executable source of truth
for this matrix. Update it whenever a migration deliberately expands a browser
role; a policy name that merely *sounds* private is not evidence of an
authorization boundary.

## Ledger Drift

Migration files, live schema, and `supabase_migrations.schema_migrations` are
three separate records. Never make them agree by editing an applied file or
blindly replaying historical SQL.

The repository was audited and reconciled in August 2026. The evidence, exact
version lists, adoption-table fingerprints, backup gate, repair commands, and
post-change assertions live in
`docs/migration-ledger-convergence.md`. Follow that runbook for this project;
do not improvise with `migration repair` or `--include-all`.

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
