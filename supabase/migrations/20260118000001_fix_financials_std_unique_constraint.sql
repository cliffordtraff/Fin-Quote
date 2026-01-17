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
-- Reference: docs/FINANCIALS_STD_GUARDRAILS_DESIGN.md
--
-- ============================================================================
--
-- HOW TO USE THIS MIGRATION:
-- 1. Run STEP 0-1 queries to understand your current data state
-- 2. Run STEP 2 query to find rows with NULL period_end_date or symbol
-- 3. Decide: backfill those rows OR delete them (see options below)
-- 4. Run STEP 3 to find duplicates
-- 5. Review duplicates, then run STEP 4 to deduplicate
-- 6. Run STEPS 5-8 to apply constraints
-- 7. Run STEP 9 to verify
--
-- ============================================================================


-- ============================================================================
-- STEP 0: CHECK FOR NULL symbol (must fix before UNIQUE constraint)
-- ============================================================================
-- The UNIQUE constraint includes `symbol`. If any rows have NULL symbol,
-- they can bypass uniqueness (same NULL problem as fiscal_quarter).

-- Diagnostic query (run manually first):
-- SELECT id, year, period_type, period_end_date, revenue, created_at
-- FROM financials_std
-- WHERE symbol IS NULL;

-- If rows exist with NULL symbol, fix them before proceeding:
-- Option A: Delete if orphaned
-- -- DELETE FROM financials_std WHERE symbol IS NULL;
-- Option B: Update with correct symbol if known
-- -- UPDATE financials_std SET symbol = 'AAPL' WHERE symbol IS NULL AND ...;


-- ============================================================================
-- STEP 1: UNDERSTAND CURRENT DATA STATE
-- ============================================================================
-- Run these queries to understand what you're working with.

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

-- Diagnostic query (run manually first):
-- SELECT id, symbol, year, period_type, fiscal_quarter, period_end_date, revenue, created_at
-- FROM financials_std
-- WHERE period_end_date IS NULL
-- ORDER BY symbol, year DESC;

-- DECISION POINT: What to do with NULL period_end_date rows?
--
-- OPTION A (PREFERRED): Backfill period_end_date
-- Example for annual data (approximate):
-- UPDATE financials_std
-- SET period_end_date = make_date(year, 12, 31)
-- WHERE period_end_date IS NULL AND period_type = 'annual';
--
-- OPTION B: Re-ingest affected symbols
-- npx tsx scripts/fetch-aapl-data.ts SYMBOL both
-- npx tsx scripts/ingest-financials.ts SYMBOL both
--
-- OPTION C (LAST RESORT): Delete NULL rows
-- -- DELETE FROM financials_std WHERE period_end_date IS NULL;


-- ============================================================================
-- STEP 3: FIND DUPLICATES (by the NEW key)
-- ============================================================================
-- This shows any duplicate groups that would violate the new constraint.
-- Run this AFTER resolving NULL period_end_date rows.

-- Diagnostic query (run manually first):
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
-- STEP 4: DEDUPLICATE (staged approach)
-- ============================================================================
-- Strategy: Keep the row with the MOST non-null financial fields.
-- Tie-breaker: If equal completeness, keep the newest (latest created_at).
--
-- WHY "most complete" instead of "newest"?
-- In multi-pass ingestion, an earlier run might have fetched all 3 statements
-- (income, balance, cash flow) while a later partial run only fetched 1.

-- STEP 4a: Create temp table to stage duplicates for review
CREATE TEMP TABLE IF NOT EXISTS financials_std_duplicates_to_delete AS
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
  WHERE period_end_date IS NOT NULL AND symbol IS NOT NULL
) ranked
WHERE rn > 1;

-- STEP 4b: Review staged duplicates before deletion
-- SELECT * FROM financials_std_duplicates_to_delete ORDER BY symbol, period_end_date;
-- SELECT COUNT(*) as rows_to_delete FROM financials_std_duplicates_to_delete;

-- STEP 4c: Delete from main table (only after reviewing staged data)
DELETE FROM financials_std
WHERE id IN (SELECT id FROM financials_std_duplicates_to_delete);

-- Clean up temp table
DROP TABLE IF EXISTS financials_std_duplicates_to_delete;


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
-- STEP 7: ADD CROSS-COMPANY INDEX
-- ============================================================================
-- Supports queries like "all companies for Q4 2024"

CREATE INDEX IF NOT EXISTS idx_financials_std_period_date
ON financials_std (period_type, period_end_date);


-- ============================================================================
-- STEP 8: ADD CHECK CONSTRAINT FOR period_type
-- ============================================================================
-- Prevents typos like 'Annual' or 'quaterly' from bypassing uniqueness.

ALTER TABLE financials_std
DROP CONSTRAINT IF EXISTS financials_std_period_type_check;

ALTER TABLE financials_std
ADD CONSTRAINT financials_std_period_type_check
CHECK (period_type IN ('annual', 'quarterly'));


-- ============================================================================
-- STEP 9: VERIFY
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
-- DOCUMENTATION
-- ============================================================================

COMMENT ON CONSTRAINT unique_financials_period ON financials_std IS
  'Ensures one row per (symbol, period_type, period_end_date). Required for UPSERT. See docs/FINANCIALS_STD_GUARDRAILS_DESIGN.md';
