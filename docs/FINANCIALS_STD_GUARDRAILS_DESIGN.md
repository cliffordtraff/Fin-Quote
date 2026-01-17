# financials_std Guardrails Design + Implementation Plan

> **Document Status:** Authoritative design spec (revised)
> **Last Updated:** 2026-01-17
> **Purpose:** Prevent duplicates, enable safe re-runs, protect against NULL overwrites

---

## Table of Contents

1. [What I Found in Your Repo](#1-what-i-found-in-your-repo)
2. [Why the Current UNIQUE Key is Broken](#2-why-the-current-unique-key-is-broken)
3. [Recommended Design](#3-recommended-design)
4. [Migration SQL](#4-migration-sql)
5. [UPSERT Strategy (Critical)](#5-upsert-strategy-critical)
6. [Code Changes](#6-code-changes)
7. [How to Verify](#7-how-to-verify)
8. [Summary of Deliverables](#8-summary-of-deliverables)
9. [Known Limitations & Future Considerations](#9-known-limitations--future-considerations)

---

## 1. What I Found in Your Repo

### Table Definition

**File:** `supabase/migrations/20260111210625_remote_schema.sql:76-90`

```sql
CREATE TABLE "public"."financials_std" (
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
```

**Additional columns added by:** `supabase/migrations/20260115000001_add_quarterly_support.sql:9-22`

```sql
period_type TEXT NOT NULL DEFAULT 'annual'
fiscal_quarter INTEGER
fiscal_label TEXT
period_end_date DATE
```

**Existing UNIQUE constraint:** `supabase/migrations/20260117000001_sp500_expansion_phase0_phase1.sql:15-17`

```sql
UNIQUE (symbol, year, period_type, fiscal_quarter)
```

### Ingestion Entry Points

| File | Function | Write Method |
|------|----------|--------------|
| `scripts/ingest-financials.ts:110-163` | `ingestFinancials()` | Manual SELECT → UPDATE by id / INSERT (emulated upsert in JS) |
| `scripts/sp500/batch-ingest-financials.ts:203-206` | `ingestSingleStock()` | True UPSERT via `supabase.upsert(..., { onConflict: 'symbol,year,period_type,fiscal_quarter' })` |

### How Data Arrives from FMP

The FMP API provides three separate endpoints:
- `/income-statement/{symbol}` → revenue, gross_profit, net_income, operating_income, eps
- `/balance-sheet-statement/{symbol}` → total_assets, total_liabilities, shareholders_equity
- `/cash-flow-statement/{symbol}` → operating_cash_flow

**Current behavior in both scripts:** All three endpoints are fetched, then combined in memory by matching on `(date, period)` before writing to the database.

### Period Representation

From FMP API responses:
- `date`: e.g., `"2024-09-28"` — the period end date (always present)
- `period`: `"FY"` for annual, `"Q1"`/`"Q2"`/`"Q3"`/`"Q4"` for quarterly

How code derives columns:

| Target Column | Derivation |
|---------------|------------|
| `period_end_date` | Direct from FMP `date` field |
| `period_type` | Based on fetch mode: `'annual'` or `'quarterly'` |
| `year` | `fetch-aapl-data.ts`: Uses `getFiscalYear()` which adjusts for fiscal calendar. `batch-ingest-financials.ts`: Uses calendar year from `date` |
| `fiscal_quarter` | Parsed from FMP `period` field: `"Q1"` → `1`, `"FY"` → `null` |
| `fiscal_label` | `"{year}-Q{n}"` for quarterly, `null` for annual |

**Both annual and quarterly are ingested** — confirmed in both scripts.

---

## 2. Why the Current UNIQUE Key is Broken

### The Problem with `UNIQUE (symbol, year, period_type, fiscal_quarter)`

Your current constraint has a critical flaw that allows duplicate annual rows.

**The issue:** `fiscal_quarter` is `NULL` for annual data.

In PostgreSQL, `NULL` means "unknown value." PostgreSQL's UNIQUE constraint logic says: *"Two unknown values might be different, so I won't treat them as duplicates."*

**Demonstration:**

```sql
-- Both of these INSERTs succeed, even though they represent the same period!
INSERT INTO financials_std (symbol, year, period_type, fiscal_quarter, revenue)
VALUES ('AAPL', 2024, 'annual', NULL, 391000000000);

INSERT INTO financials_std (symbol, year, period_type, fiscal_quarter, revenue)
VALUES ('AAPL', 2024, 'annual', NULL, 391000000000);
-- ✓ No error! NULL ≠ NULL in UNIQUE constraints
```

**Result:** Every time you re-run annual ingestion, you create duplicate rows.

### Secondary Issue: Inconsistent `year` Derivation

- `fetch-aapl-data.ts` uses fiscal year logic (AAPL's FY2024 ends in September 2024)
- `batch-ingest-financials.ts` uses calendar year from the `date` field

This inconsistency can cause the same period to be stored with different `year` values depending on which script ran.

**Recommendation:** Now that `period_end_date` is the authoritative key, treat `year` as a convenience/display field only. Standardize derivation as `EXTRACT(YEAR FROM period_end_date)` in all scripts to avoid drift. Fiscal year logic adds complexity and company-specific rules that are no longer necessary for uniqueness.

### Why `(symbol, period_type, period_end_date)` is the Natural Key

The FMP API identifies each financial statement by:
1. The company (`symbol`)
2. Whether it's annual or quarterly (`period_type`)
3. The exact date the period ended (`period_end_date`, e.g., `2024-09-28`)

This is unambiguous:
- `period_end_date` is **never NULL** — FMP always provides the `date` field
- Each reporting period has exactly one end date
- No fiscal year calculations needed — the date itself is the identifier
- Works identically for annual and quarterly data

**This is why we recommend:**

```sql
UNIQUE (symbol, period_type, period_end_date)
```

---

## 3. Recommended Design

### UNIQUE Constraint

```sql
UNIQUE (symbol, period_type, period_end_date)
```

**Why this works:**

| Scenario | Handled? |
|----------|----------|
| Re-run annual ingestion for AAPL | ✓ Same `period_end_date` → UPSERT updates |
| Re-run quarterly ingestion for AAPL | ✓ Same `period_end_date` per quarter → UPSERT updates |
| Different companies, same period | ✓ Different `symbol` → separate rows |
| Fiscal year edge cases (AAPL FY ends Sept) | ✓ `period_end_date` is exact; no ambiguity |
| Annual vs quarterly for same date | ✓ Different `period_type` → separate rows |

### Indexes

**1. The UNIQUE constraint creates an implicit btree index** on `(symbol, period_type, period_end_date)`.

This supports:
- Time series queries: `WHERE symbol=? AND period_type=? ORDER BY period_end_date`
- Latest period lookup: same query with `DESC LIMIT 1`

**2. One additional index for cross-company queries:**

```sql
CREATE INDEX idx_financials_std_period_date
ON financials_std (period_type, period_end_date);
```

**Justification:** If you do screening queries like "show all companies' revenue for Q4 2024," this index helps. If you don't do cross-company queries, you can skip this index.

---

## 4. Migration SQL

**File to create:** `supabase/migrations/20260118000001_fix_financials_std_unique_constraint.sql`

> **IMPORTANT:** This migration includes manual checkpoints. Do NOT run it blindly.
> Read the comments, run the diagnostic queries, and make decisions before proceeding.

```sql
-- ============================================================================
-- MIGRATION: Fix financials_std UNIQUE constraint
-- ============================================================================
--
-- PROBLEM: The existing constraint UNIQUE(symbol, year, period_type, fiscal_quarter)
-- does NOT prevent duplicates for annual data because fiscal_quarter is NULL,
-- and PostgreSQL treats NULL as distinct in UNIQUE constraints.
--
-- SOLUTION: Change to UNIQUE(symbol, period_type, period_end_date) which uses
-- the actual period end date from FMP (never NULL, always unique per period).
--
-- ============================================================================
--
-- HOW TO USE THIS MIGRATION:
-- 1. Run STEP 1 queries to understand your current data state
-- 2. Run STEP 2 query to find rows with NULL period_end_date
-- 3. Decide: backfill those rows OR delete them (see options below)
-- 4. Run STEP 3 to find duplicates
-- 5. Review duplicates, then run STEP 4 to deduplicate
-- 6. Run STEPS 5-7 to apply the new constraint
-- 7. Run STEP 8 to verify
--
-- ============================================================================


-- ============================================================================
-- STEP 0: CHECK FOR NULL symbol (must fix before UNIQUE constraint)
-- ============================================================================
-- The UNIQUE constraint includes `symbol`. If any rows have NULL symbol,
-- they can bypass uniqueness (same NULL problem as fiscal_quarter).
-- Check and fix BEFORE proceeding.

-- SELECT id, year, period_type, period_end_date, revenue, created_at
-- FROM financials_std
-- WHERE symbol IS NULL;

-- If rows exist: either DELETE them (if orphaned) or UPDATE with correct symbol.
-- -- MANUAL / OPTIONAL - UNCOMMENT ONLY AFTER REVIEW
-- -- DELETE FROM financials_std WHERE symbol IS NULL;


-- ============================================================================
-- STEP 1: UNDERSTAND CURRENT DATA STATE
-- ============================================================================
-- Run these queries FIRST to understand what you're working with.

-- How many total rows?
-- SELECT COUNT(*) as total_rows FROM financials_std;

-- How many rows per symbol?
-- SELECT symbol, COUNT(*) as row_count
-- FROM financials_std
-- GROUP BY symbol
-- ORDER BY row_count DESC;

-- Sample of data structure:
-- SELECT symbol, year, period_type, fiscal_quarter, period_end_date, created_at
-- FROM financials_std
-- ORDER BY symbol, period_end_date DESC
-- LIMIT 20;


-- ============================================================================
-- STEP 2: FIND ROWS WITH NULL period_end_date
-- ============================================================================
-- The new UNIQUE constraint requires period_end_date to be NOT NULL.
-- First, find out if any such rows exist.

-- SELECT
--   id,
--   symbol,
--   year,
--   period_type,
--   fiscal_quarter,
--   period_end_date,
--   revenue,
--   created_at
-- FROM financials_std
-- WHERE period_end_date IS NULL
-- ORDER BY symbol, year DESC;

-- ============================================================================
-- DECISION POINT: What to do with NULL period_end_date rows?
-- ============================================================================
--
-- OPTION A (PREFERRED): Backfill period_end_date
-- -------------------------------------------------
-- If these rows have valid financial data but just missing the date,
-- you can backfill from FMP or derive from (year, fiscal_quarter).
--
-- Example backfill for annual data (approximate - actual dates vary by company):
-- UPDATE financials_std
-- SET period_end_date = make_date(year, 12, 31)
-- WHERE period_end_date IS NULL AND period_type = 'annual';
--
-- For quarterly data, you'd need company-specific fiscal calendars.
-- Better approach: re-run the fetch script for affected symbols.
--
-- OPTION B: Re-ingest affected symbols
-- -------------------------------------------------
-- If you have few affected symbols, just re-run ingestion for them:
--   npx tsx scripts/fetch-aapl-data.ts SYMBOL both
--   npx tsx scripts/ingest-financials.ts SYMBOL both
--
-- OPTION C (LAST RESORT): Delete NULL rows
-- -------------------------------------------------
-- Only do this if the rows are truly invalid/orphaned data.
-- REQUIRES EXPLICIT OPERATOR APPROVAL.
--
-- -- MANUAL / OPTIONAL - UNCOMMENT ONLY AFTER REVIEW
-- -- DELETE FROM financials_std WHERE period_end_date IS NULL;


-- ============================================================================
-- STEP 3: FIND DUPLICATES (by the NEW key)
-- ============================================================================
-- This shows any duplicate groups that would violate the new constraint.
-- Run this AFTER resolving NULL period_end_date rows.

-- SELECT
--   symbol,
--   period_type,
--   period_end_date,
--   COUNT(*) as duplicate_count,
--   array_agg(id ORDER BY created_at DESC) as ids,
--   array_agg(created_at ORDER BY created_at DESC) as created_dates
-- FROM financials_std
-- WHERE period_end_date IS NOT NULL
-- GROUP BY symbol, period_type, period_end_date
-- HAVING COUNT(*) > 1
-- ORDER BY symbol, period_end_date;


-- ============================================================================
-- STEP 4: DEDUPLICATE
-- ============================================================================
-- Strategy: Keep the row with the MOST non-null financial fields.
-- Tie-breaker: If equal completeness, keep the newest (latest created_at).
--
-- WHY "most complete" instead of "newest"?
-- In multi-pass ingestion, an earlier run might have fetched all 3 statements
-- (income, balance, cash flow) while a later partial run only fetched 1.
-- We want to keep the complete row, not the incomplete recent one.

-- First, PREVIEW what would be deleted:
-- SELECT
--   id,
--   symbol,
--   period_type,
--   period_end_date,
--   created_at,
--   -- Count non-null financial fields
--   (CASE WHEN revenue IS NOT NULL THEN 1 ELSE 0 END +
--    CASE WHEN gross_profit IS NOT NULL THEN 1 ELSE 0 END +
--    CASE WHEN net_income IS NOT NULL THEN 1 ELSE 0 END +
--    CASE WHEN operating_income IS NOT NULL THEN 1 ELSE 0 END +
--    CASE WHEN total_assets IS NOT NULL THEN 1 ELSE 0 END +
--    CASE WHEN total_liabilities IS NOT NULL THEN 1 ELSE 0 END +
--    CASE WHEN shareholders_equity IS NOT NULL THEN 1 ELSE 0 END +
--    CASE WHEN operating_cash_flow IS NOT NULL THEN 1 ELSE 0 END +
--    CASE WHEN eps IS NOT NULL THEN 1 ELSE 0 END) as non_null_count,
--   'WILL BE DELETED' as action
-- FROM (
--   SELECT
--     *,
--     ROW_NUMBER() OVER (
--       PARTITION BY symbol, period_type, period_end_date
--       ORDER BY
--         -- Primary: most non-null fields wins
--         (CASE WHEN revenue IS NOT NULL THEN 1 ELSE 0 END +
--          CASE WHEN gross_profit IS NOT NULL THEN 1 ELSE 0 END +
--          CASE WHEN net_income IS NOT NULL THEN 1 ELSE 0 END +
--          CASE WHEN operating_income IS NOT NULL THEN 1 ELSE 0 END +
--          CASE WHEN total_assets IS NOT NULL THEN 1 ELSE 0 END +
--          CASE WHEN total_liabilities IS NOT NULL THEN 1 ELSE 0 END +
--          CASE WHEN shareholders_equity IS NOT NULL THEN 1 ELSE 0 END +
--          CASE WHEN operating_cash_flow IS NOT NULL THEN 1 ELSE 0 END +
--          CASE WHEN eps IS NOT NULL THEN 1 ELSE 0 END) DESC,
--         -- Tie-breaker: newest wins
--         created_at DESC
--     ) as rn
--   FROM financials_std
--   WHERE period_end_date IS NOT NULL
-- ) ranked
-- WHERE rn > 1
-- ORDER BY symbol, period_end_date;

-- STEP 4a: STAGE duplicates to temp table for review/backup
-- This is safer than deleting in-place. You can inspect before committing.

CREATE TEMP TABLE financials_std_duplicates_to_delete AS
SELECT id, symbol, period_type, period_end_date, created_at,
  (CASE WHEN revenue IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN gross_profit IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN net_income IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN operating_income IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN total_assets IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN total_liabilities IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN shareholders_equity IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN operating_cash_flow IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN eps IS NOT NULL THEN 1 ELSE 0 END) as non_null_count
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY symbol, period_type, period_end_date
      ORDER BY
        (CASE WHEN revenue IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN gross_profit IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN net_income IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN operating_income IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN total_assets IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN total_liabilities IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN shareholders_equity IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN operating_cash_flow IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN eps IS NOT NULL THEN 1 ELSE 0 END) DESC,
        created_at DESC
    ) as rn
  FROM financials_std
  WHERE period_end_date IS NOT NULL
) ranked
WHERE rn > 1;

-- STEP 4b: REVIEW staged duplicates before deletion
-- SELECT * FROM financials_std_duplicates_to_delete ORDER BY symbol, period_end_date;
-- SELECT COUNT(*) as rows_to_delete FROM financials_std_duplicates_to_delete;

-- STEP 4c: DELETE from main table (only after reviewing staged data)
DELETE FROM financials_std
WHERE id IN (SELECT id FROM financials_std_duplicates_to_delete);


-- ============================================================================
-- STEP 5: MAKE symbol AND period_end_date NOT NULL
-- ============================================================================
-- Now that NULLs are resolved, enforce NOT NULL on both columns.
-- This prevents future rows from bypassing the UNIQUE constraint.

ALTER TABLE financials_std
ALTER COLUMN symbol SET NOT NULL;

ALTER TABLE financials_std
ALTER COLUMN period_end_date SET NOT NULL;


-- ============================================================================
-- STEP 6: DROP OLD CONSTRAINT, ADD NEW ONE
-- ============================================================================

-- Drop the old constraint (safe even if it doesn't exist)
ALTER TABLE financials_std
DROP CONSTRAINT IF EXISTS unique_financials_period;

-- Add the correct UNIQUE constraint
ALTER TABLE financials_std
ADD CONSTRAINT unique_financials_period
UNIQUE (symbol, period_type, period_end_date);


-- ============================================================================
-- STEP 7: ADD CROSS-COMPANY INDEX (optional)
-- ============================================================================
-- Only needed if you do queries like "all companies for Q4 2024"

CREATE INDEX IF NOT EXISTS idx_financials_std_period_date
ON financials_std (period_type, period_end_date);


-- ============================================================================
-- STEP 8: ADD CHECK CONSTRAINT FOR period_type
-- ============================================================================
-- Prevents typos like 'Annual' or 'quaterly' from bypassing uniqueness.
-- Note: This may already exist from migration 20260115000001. Safe to re-run.

ALTER TABLE financials_std
DROP CONSTRAINT IF EXISTS financials_std_period_type_check;

ALTER TABLE financials_std
ADD CONSTRAINT financials_std_period_type_check
CHECK (period_type IN ('annual', 'quarterly'));


-- ============================================================================
-- STEP 10: VERIFY
-- ============================================================================
-- Run these queries to confirm the migration succeeded.

-- Check UNIQUE constraint exists:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'financials_std'::regclass AND contype = 'u';

-- Check CHECK constraint exists:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'financials_std'::regclass AND contype = 'c';

-- Check no duplicates remain:
-- SELECT symbol, period_type, period_end_date, COUNT(*)
-- FROM financials_std
-- GROUP BY symbol, period_type, period_end_date
-- HAVING COUNT(*) > 1;

-- Check no NULL symbol or period_end_date:
-- SELECT COUNT(*) FROM financials_std WHERE symbol IS NULL OR period_end_date IS NULL;
-- (Should return 0)

-- Check indexes:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'financials_std';


-- ============================================================================
-- STEP 11: DOCUMENTATION
-- ============================================================================

COMMENT ON CONSTRAINT unique_financials_period ON financials_std IS
  'Ensures one row per (symbol, period_type, period_end_date). Required for UPSERT. See docs/FINANCIALS_STD_GUARDRAILS_DESIGN.md';
```

---

## 5. UPSERT Strategy (Critical)

### The NULL-Overwrite Problem

> **WARNING:** This is the most dangerous part of the ingestion system. A naive UPSERT can destroy valid data.

**The scenario:**

1. Run 1: You fetch income statement + balance sheet + cash flow for AAPL Q4 2024
   - All 9 financial fields are populated
   - Row inserted successfully

2. Run 2: You fetch ONLY the income statement (partial run, maybe a retry after error)
   - revenue, gross_profit, net_income, operating_income, eps are populated
   - total_assets, total_liabilities, shareholders_equity, operating_cash_flow are `NULL` in the incoming data

3. **With naive UPSERT:** The NULL values from Run 2 overwrite the valid values from Run 1
   - You just lost your balance sheet and cash flow data!

**This happens because:**

```typescript
// DANGEROUS - Supabase .upsert() replaces ALL columns
await supabase.from('financials_std').upsert(records, {
  onConflict: 'symbol,period_type,period_end_date',
})
// If records[0].total_assets is null, it overwrites existing non-null value!
```

### Recommended Strategy: Option A (Merge in Code First)

**Your current scripts already do this correctly.** Both `fetch-aapl-data.ts` and `batch-ingest-financials.ts`:

1. Fetch all three statements (income, balance, cash flow) in parallel
2. Combine them in memory by matching on `(date, period)` using the `combinedByPeriod` object
3. Only then write the complete row to the database

**This is the safe pattern.** As long as you always fetch all three statements together and combine before writing, naive UPSERT is safe.

**Recommendation:** Keep this pattern. Document it. Enforce it.

### What If You Must Ingest Statements Separately?

If you ever need to ingest income/balance/cash flow in separate operations (e.g., different API rate limits, retry logic per statement), you need **COALESCE-based UPSERT**.

Supabase's `.upsert()` method cannot do this. You need raw SQL:

```sql
INSERT INTO financials_std (
  symbol, period_type, period_end_date,
  revenue, gross_profit, net_income, operating_income,
  total_assets, total_liabilities, shareholders_equity,
  operating_cash_flow, eps,
  year, fiscal_quarter, fiscal_label
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
ON CONFLICT (symbol, period_type, period_end_date)
DO UPDATE SET
  -- Only update if incoming value is NOT NULL; otherwise keep existing
  revenue = COALESCE(EXCLUDED.revenue, financials_std.revenue),
  gross_profit = COALESCE(EXCLUDED.gross_profit, financials_std.gross_profit),
  net_income = COALESCE(EXCLUDED.net_income, financials_std.net_income),
  operating_income = COALESCE(EXCLUDED.operating_income, financials_std.operating_income),
  total_assets = COALESCE(EXCLUDED.total_assets, financials_std.total_assets),
  total_liabilities = COALESCE(EXCLUDED.total_liabilities, financials_std.total_liabilities),
  shareholders_equity = COALESCE(EXCLUDED.shareholders_equity, financials_std.shareholders_equity),
  operating_cash_flow = COALESCE(EXCLUDED.operating_cash_flow, financials_std.operating_cash_flow),
  eps = COALESCE(EXCLUDED.eps, financials_std.eps),
  year = COALESCE(EXCLUDED.year, financials_std.year),
  fiscal_quarter = COALESCE(EXCLUDED.fiscal_quarter, financials_std.fiscal_quarter),
  fiscal_label = COALESCE(EXCLUDED.fiscal_label, financials_std.fiscal_label);
```

To use this in your scripts, you would create a Supabase RPC function or use `.rpc()` with raw SQL.

### Summary of UPSERT Safety

| Pattern | Safe? | When to Use |
|---------|-------|-------------|
| Merge all statements in code, then single UPSERT | ✓ Safe | **Current scripts do this. Keep it.** |
| Naive `.upsert()` with partial data | ✗ DANGEROUS | Never. Will overwrite valid data with NULLs. |
| COALESCE-based SQL UPSERT | ✓ Safe | Only if you must ingest statements separately. |

---

## 6. Code Changes

### Change 1: Update conflict target in both scripts

Both scripts need to use the new UNIQUE key.

**File:** `scripts/ingest-financials.ts`

The current manual SELECT/UPDATE/INSERT pattern should be replaced with UPSERT. Since this script always fetches complete data (via the JSON file from `fetch-aapl-data.ts`), naive UPSERT is safe here.

**Replace the loop logic (lines ~93-164) with:**

```typescript
// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Validate all records have period_end_date
const recordsWithDates = financials.filter(f => f.period_end_date !== null)
const skippedCount = financials.length - recordsWithDates.length

if (skippedCount > 0) {
  console.log(`WARNING: Skipping ${skippedCount} records with null period_end_date`)
  console.log('These records cannot be upserted. Consider re-fetching the data.')
}

if (recordsWithDates.length === 0) {
  console.error('No valid records to upsert. All records have null period_end_date.')
  return
}

// Upsert all records
// SAFE because fetch-aapl-data.ts always combines all 3 statements before saving
console.log(`Upserting ${recordsWithDates.length} records...`)

const { error } = await supabase
  .from('financials_std')
  .upsert(recordsWithDates, {
    onConflict: 'symbol,period_type,period_end_date',
    ignoreDuplicates: false,
  })

if (error) {
  console.error('Error upserting records:', error.message)
  return
}

console.log(`\n--- Summary ---`)
console.log(`Upserted: ${recordsWithDates.length} records`)
console.log(`Skipped (null period_end_date): ${skippedCount}`)
```

**File:** `scripts/sp500/batch-ingest-financials.ts`

**Line 203-206, change the conflict target:**

```typescript
// OLD:
const { error } = await supabase.from('financials_std').upsert(allRecords, {
  onConflict: 'symbol,year,period_type,fiscal_quarter',
  ignoreDuplicates: false,
})

// NEW:
const { error } = await supabase.from('financials_std').upsert(allRecords, {
  onConflict: 'symbol,period_type,period_end_date',
  ignoreDuplicates: false,
})
```

### Change 2: Ensure `period_end_date` is always set

Both fetch scripts already set `period_end_date: item.date` from FMP. Verified:

- `scripts/fetch-aapl-data.ts:124` — `period_end_date: item.date`
- `scripts/sp500/batch-ingest-financials.ts:137` — `period_end_date: item.date`

**No changes needed here**, but add validation in the ingestion step (shown above).

### Change 3: Add logging for debugging

In `scripts/sp500/batch-ingest-financials.ts`, consider adding a check before upserting:

```typescript
// Validate no null period_end_dates
const recordsWithNullDates = allRecords.filter(r => r.period_end_date === null)
if (recordsWithNullDates.length > 0) {
  console.warn(`WARNING: ${recordsWithNullDates.length} records have null period_end_date for ${symbol}`)
}
```

---

## 7. How to Verify

### After Running the Migration

**1. Check constraint exists:**

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'financials_std'::regclass AND contype = 'u';
```

Expected output:
```
conname                  | pg_get_constraintdef
-------------------------|--------------------------------------------------
unique_financials_period | UNIQUE (symbol, period_type, period_end_date)
```

**2. Check no duplicates remain:**

```sql
SELECT symbol, period_type, period_end_date, COUNT(*)
FROM financials_std
GROUP BY symbol, period_type, period_end_date
HAVING COUNT(*) > 1;
```

Expected: 0 rows.

**3. Check no NULL period_end_date:**

```sql
SELECT COUNT(*) FROM financials_std WHERE period_end_date IS NULL;
```

Expected: 0.

**4. Check indexes:**

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'financials_std';
```

Should show:
- `financials_std_pkey` (id)
- `unique_financials_period` (symbol, period_type, period_end_date)
- `idx_financials_std_period_date` (period_type, period_end_date) — if you created it

### Test the UPSERT Behavior

After code changes, test that re-running ingestion updates instead of duplicating:

```bash
# Run ingestion
npx tsx scripts/fetch-aapl-data.ts AAPL annual
npx tsx scripts/ingest-financials.ts AAPL annual

# Check row count
# (in Supabase SQL Editor)
SELECT COUNT(*) FROM financials_std WHERE symbol = 'AAPL' AND period_type = 'annual';
-- Note the count (e.g., 20)

# Re-run ingestion
npx tsx scripts/ingest-financials.ts AAPL annual

# Check row count again — should be the same
SELECT COUNT(*) FROM financials_std WHERE symbol = 'AAPL' AND period_type = 'annual';
-- Should still be 20, not 40
```

### Sample Query Examples

**1. Time series for one symbol (chart):**

```sql
EXPLAIN ANALYZE
SELECT * FROM financials_std
WHERE symbol = 'AAPL' AND period_type = 'annual'
ORDER BY period_end_date DESC;
```

Should use `unique_financials_period` index.

**2. Latest period for one symbol:**

```sql
EXPLAIN ANALYZE
SELECT * FROM financials_std
WHERE symbol = 'AAPL' AND period_type = 'quarterly'
ORDER BY period_end_date DESC
LIMIT 1;
```

Should use `unique_financials_period` index with backward scan.

**3. Cross-company same period (screening):**

```sql
EXPLAIN ANALYZE
SELECT * FROM financials_std
WHERE period_type = 'annual' AND period_end_date = '2024-09-28';
```

Should use `idx_financials_std_period_date` index (if created).

---

## 8. Summary of Deliverables

| Item | Status | Notes |
|------|--------|-------|
| Migration SQL file | Ready | `supabase/migrations/20260118000001_fix_financials_std_unique_constraint.sql` |
| `scripts/ingest-financials.ts` changes | Documented | Replace loop with UPSERT, add validation |
| `scripts/sp500/batch-ingest-financials.ts` changes | Documented | Line 204: change `onConflict` value |
| UPSERT safety documentation | Included | Section 5 explains NULL-overwrite risk |
| Verification queries | Included | Section 7 |

---

## Appendix: Why This Matters (Beginner Summary)

### Without these guardrails:
- Re-running ingestion creates duplicate rows
- Your charts show incorrect data (double-counted periods)
- Queries expecting one row get multiple
- Storage grows with garbage data
- Partial ingestion runs can destroy valid data

### With these guardrails:
- The database enforces "one row per period" — duplicates are impossible
- UPSERT means re-running is safe: existing data gets updated
- Proper UNIQUE key uses `period_end_date` which is never NULL
- Indexes make your common queries fast
- You can confidently run nightly refreshes without cleanup scripts

### Key concepts explained:

| Term | What it means |
|------|---------------|
| **UNIQUE constraint** | A rule that prevents duplicate combinations of columns |
| **UPSERT** | "Insert or Update" — if row exists, update it; otherwise insert |
| **NULL in UNIQUE** | PostgreSQL treats NULL as "unknown" so `NULL ≠ NULL` in constraints |
| **COALESCE** | SQL function that returns the first non-NULL value |
| **Natural key** | The columns that inherently identify a row (vs. synthetic `id`) |
| **Conflict target** | The columns UPSERT checks to detect "this row already exists" |

---

## 9. Known Limitations & Future Considerations

### Current Assumptions

1. **Single row per period:** This design assumes one authoritative row per (symbol, period_type, period_end_date). If you need to retain multiple filings or restatements for the same period (e.g., original filing vs. amended 10-K/A), you would need to add a `filed_at` or `version` column and change the UNIQUE key.

2. **Complete statement ingestion:** The current scripts fetch all three statements (income, balance, cash flow) together via `Promise.all()`. If one fails, the entire fetch fails. This prevents partial data from being written. If you later need retry logic per statement, use the COALESCE-based UPSERT pattern documented in Section 5.

3. **`year` is a convenience field:** With `period_end_date` as the authoritative key, `year` is now used only for display/filtering. The inconsistent derivation (fiscal vs calendar) doesn't affect uniqueness but may cause confusing query results. Consider standardizing to `EXTRACT(YEAR FROM period_end_date)`.

### Not Addressed in This Design

- **Soft deletes:** If you need audit trails, consider adding `deleted_at` instead of hard deleting duplicates.
- **Partitioning:** If the table grows very large (millions of rows), consider partitioning by `period_type` or year range.
- **Row-level security:** If multi-tenant access is needed, add RLS policies on `symbol`.

### Open Questions for Operator

Before running the migration, confirm:

1. Do any ingestion runs ever proceed with missing statements (API gaps/timeouts)? If yes, implement COALESCE upsert or add validation to reject partial rows.

2. Do you need to retain multiple filings/restatements per period? If yes, this design needs modification before implementation.
