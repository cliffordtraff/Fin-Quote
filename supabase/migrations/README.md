# Database Migrations

This directory contains all database migrations in chronological order.

## Migration History

| Date | Migration | Description |
|------|-----------|-------------|
| 2024-10-25 | `initial_schema` | Initial database structure (company, financials_std, price_history) |
| 2024-10-26 | `create_filings_table` | SEC filings storage |
| 2024-10-27 | `create_filing_chunks_table` | Vector search chunks for filings |
| 2024-10-27 | `add_storage_policies` | RLS policies for file storage |
| 2024-10-31 | `create_query_logs_table` | Query logging for evaluation |
| 2024-11-01 | `create_prompt_versions` | Prompt versioning system |
| 2024-11-01 | `add_prompt_version_to_logs` | Link logs to prompt versions |
| 2024-11-01 | `create_search_function` | pgvector similarity search |
| 2024-11-01 | `add_user_auth` | User authentication columns |
| 2024-11-02 | `add_validation_columns` | Answer validation tracking |
| 2024-11-02 | `add_review_columns` | Active learning review system |
| 2024-11-02 | `add_cost_tracking` | OpenAI API cost tracking |

## Creating New Migrations

### Method 1: Supabase CLI (Recommended - Requires Login)

```bash
# Create a new migration file
supabase migration new add_new_feature

# Edit the generated file
# File location: supabase/migrations/TIMESTAMP_add_new_feature.sql

# Apply to remote database
supabase db push
```

### Method 2: Manual (Current Method)

1. **Create the file** with timestamp format:
   ```bash
   touch supabase/migrations/$(date +%Y%m%d%H%M%S)_your_migration_name.sql
   ```

2. **Write your SQL** in the file

3. **Apply to Supabase**:
   - Open [Supabase Dashboard](https://app.supabase.com) → SQL Editor
   - Copy and paste your migration SQL
   - Click "Run"

4. **Update MIGRATIONS.md** in `/data/` directory

### Method 3: Using npm Scripts (Planned)

```bash
# Future: One command to create and apply
npm run migration:new add_new_feature
npm run migration:push
```

## Migration Naming Convention

Format: `YYYYMMDDHHMMSS_descriptive_name.sql`

Examples:
- ✅ `20241102123045_add_embedding_tokens.sql`
- ✅ `20241103090000_create_analytics_table.sql`
- ❌ `migration.sql` (too vague)
- ❌ `add_column.sql` (no timestamp)

## Rollback Strategy

Currently, rollbacks must be done manually:

1. Create a new "undo" migration
2. Write SQL to reverse the changes
3. Apply it like any other migration

Example:
```sql
-- 20241102123045_add_embedding_tokens.sql
ALTER TABLE query_logs ADD COLUMN embedding_tokens INTEGER;

-- Rollback (if needed):
-- 20241102130000_remove_embedding_tokens.sql
ALTER TABLE query_logs DROP COLUMN embedding_tokens;
```

## Best Practices

### DO:
- ✅ Keep migrations small and focused
- ✅ Test migrations on a copy first
- ✅ Add comments explaining WHY
- ✅ Use transactions for multiple statements
- ✅ Check for existing objects before creating

### DON'T:
- ❌ Mix schema and data changes in one migration
- ❌ Use `DROP TABLE` without backup
- ❌ Forget to add indexes for foreign keys
- ❌ Hard-code IDs or UUIDs

### Migration Template

```sql
-- Description: What this migration does and why
-- Phase: Which feature/phase this belongs to
-- Date: YYYY-MM-DD

BEGIN;

-- Check if already applied (idempotency)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'my_table' AND column_name = 'new_column'
  ) THEN
    ALTER TABLE my_table ADD COLUMN new_column TEXT;
  END IF;
END $$;

COMMIT;
```

## Checking Migration Status

### See what's been applied:
```sql
-- In Supabase SQL Editor
SELECT migration_name, executed_at
FROM supabase_migrations.schema_migrations
ORDER BY executed_at DESC;
```

### Verify column exists:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'query_logs'
ORDER BY ordinal_position;
```

## Troubleshooting

### "Column already exists"
Your migration has already been applied. Either:
- Skip it (it's done!)
- Make it idempotent (check before adding)

### "Table doesn't exist"
Migrations must be run in order. Check which migrations are missing.

### "Permission denied"
You need the service_role key or database owner permissions.

## Future: Automated Setup

Once you run `supabase login`:

```bash
# One-time setup
supabase login
supabase link --project-ref hccwmbmnmbmhuslmbymq

# Then migrations become automatic
supabase migration new add_feature
# Edit the file
supabase db push  # Applies to remote!
```

This tracks which migrations have been applied automatically.

## Related Documentation

- `data/MIGRATIONS.md` - Checklist of applied migrations
- `docs/COST_TRACKING_SETUP.md` - Cost tracking migration details
- `docs/PHASE_4_IMPLEMENTATION.md` - Validation system migrations
