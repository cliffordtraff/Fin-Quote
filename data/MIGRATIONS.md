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
