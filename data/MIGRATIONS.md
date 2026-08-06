# Database Migrations Tracker

This file tracks which migrations have been applied to your Supabase database.

## How to Use This

When you run a migration, check the box:

- [x] ✅ Completed
- [ ] ⬜ Not yet run

## Migration History

### Phase 0: Initial Setup
- [x] `create-query-logs-table.sql` - Creates query logging table
- [x] `create-prompt-versions-table.sql` - Creates prompt versioning table

### Phase 1: Validation System
- [x] `add-validation-columns.sql` - Adds validation tracking to query_logs

### Phase 2: Active Learning & Review
- [x] `add-review-columns.sql` - Adds error categorization columns

### Phase 4: Cost Tracking
- [ ] `add-cost-tracking.sql` - Adds token usage and cost tracking columns

### August 6, 2026: Newsletter Reliability Follow-up

These four versioned Supabase migrations belong to one release and must be
applied in filename order **before** the matching application code is promoted.
They are intentionally unchecked: the implementation and migration files have
been reviewed and exercised locally, but this tracker does not yet have linked
production-application evidence.

- [ ] `20260806135000_newsletter_cron_observability.sql` — Creates the
  service-role-owned `newsletter_cron_runs` heartbeat table for daily,
  mid-morning, Beehiiv-reconciliation, and webhook-outbox invocations. Each row
  records `running`, `succeeded`, or `failed` state with bounded error codes and
  timing, giving the health route durable evidence instead of relying on
  transient request logs.
- [ ] `20260806140000_fence_newsletter_automation_leases.sql` — Replaces the
  daily and mid-morning claim functions with bounded leases and adds renew and
  allowlisted JSON-patch RPCs. Every mutation requires both the current lease
  token and an unexpired database lease, so a worker that resumes after expiry
  and takeover cannot overwrite its successor. Terminal `completed`, `partial`,
  and `failed` states remain terminal when claimed again.
- [ ] `20260806141000_retry_terminal_newsletter_notifications.sql` — Adds
  `notification_applied_at`, attempt count, and last-error fields to daily and
  mid-morning automation runs, plus service-role RPCs that record terminal
  notification attempts. The applied timestamp advances only after success,
  preserving retryability across the crash boundary between committing the run
  result and durably enqueueing its deduplicated operator notification.
- [ ] `20260806142000_track_beehiiv_stats_health.sql` — Adds independent
  Beehiiv statistics freshness and error fields. Lifecycle reconciliation can
  succeed while an optional analytics request fails; that failure preserves
  the last known statistics, records their staleness, and clears only after a
  later successful fetch.

Production completion means more than checking these boxes. Capture the linked
dry run, apply exactly these four versions, verify the new table/columns/RPCs
and service-role-only grants, require an empty second dry run, then attach the
application deployment and cron/health/Beehiiv smoke evidence. Do not mark a
migration complete merely because its file exists in the repository.

## Checking if a Migration Was Run

You can check if columns exist in Supabase:

```sql
-- Check if cost tracking columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'query_logs'
  AND column_name IN (
    'tool_selection_prompt_tokens',
    'answer_prompt_tokens',
    'total_cost_usd'
  );
```

If it returns 3 rows, the migration was successful!

## Quick Reference: What Each Migration Does

### `add-cost-tracking.sql`
**Purpose**: Track OpenAI API usage and costs

**What it adds**:
- Token usage columns (prompt, completion, total) for each LLM call
- `embedding_tokens` for vector search costs
- `total_cost_usd` calculated cost field
- Indexes for efficient cost queries

**When to run**: After implementing cost tracking dashboard

### `add-validation-columns.sql`
**Purpose**: Store validation results for each query

**What it adds**:
- `validation_results` JSONB column
- `validation_passed` boolean
- `validation_run_at` timestamp

### `add-review-columns.sql`
**Purpose**: Enable active learning through manual review

**What it adds**:
- `error_category` for categorizing failures
- `reviewer_notes` for explanations
- `reviewed_at` timestamp
- `is_correct` boolean override

## Future: Automated Migration System

To avoid manual migrations in the future, consider:

1. **Supabase CLI** (Recommended)
   ```bash
   npm install -g supabase
   supabase init
   supabase db diff --use-migra
   ```

2. **Prisma** (Full ORM)
   ```bash
   npx prisma init
   npx prisma db pull
   npx prisma migrate dev
   ```

Both track migration history automatically!
