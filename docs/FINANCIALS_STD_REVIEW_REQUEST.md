# Review Request: financials_std Database Guardrails Design

Please review the following design for correctness, safety, and completeness. Identify any gaps, risks, or improvements.

---

## Context

We have a PostgreSQL table `financials_std` that stores financial statement data (income, balance sheet, cash flow) fetched from the FMP API. We need to:

1. Prevent duplicate rows when re-running ingestion
2. Enable safe UPSERT operations
3. Avoid overwriting valid data with NULLs during partial ingestion

---

## Current State (Problems)

**Table schema:**
```sql
CREATE TABLE financials_std (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  symbol text,                    -- Currently nullable
  year integer,
  period_type text NOT NULL DEFAULT 'annual',
  fiscal_quarter integer,         -- NULL for annual data
  fiscal_label text,
  period_end_date date,           -- Currently nullable
  revenue bigint,
  gross_profit bigint,
  net_income numeric,
  operating_income numeric,
  total_assets numeric,
  total_liabilities numeric,
  shareholders_equity numeric,
  operating_cash_flow numeric,
  eps numeric
);
```

**Existing UNIQUE constraint:**
```sql
UNIQUE (symbol, year, period_type, fiscal_quarter)
```

**Problem 1:** `fiscal_quarter` is NULL for annual data. PostgreSQL treats NULL as distinct in UNIQUE constraints, so `(AAPL, 2024, annual, NULL)` can be inserted multiple times.

**Problem 2:** `symbol` is nullable. A NULL symbol would also bypass uniqueness.

**Problem 3:** Naive Supabase `.upsert()` overwrites all columns, including replacing non-NULL values with NULLs if a partial row is upserted.

---

## Proposed Solution

### New UNIQUE Constraint

```sql
UNIQUE (symbol, period_type, period_end_date)
```

**Rationale:**
- `period_end_date` comes directly from FMP's `date` field and is never NULL
- Each financial statement has exactly one period end date
- No fiscal year calculation ambiguity
- Works for both annual and quarterly data

### NOT NULL Constraints

```sql
ALTER TABLE financials_std ALTER COLUMN symbol SET NOT NULL;
ALTER TABLE financials_std ALTER COLUMN period_end_date SET NOT NULL;
```

### CHECK Constraint

```sql
CHECK (period_type IN ('annual', 'quarterly'))
```

Prevents typos like `'Annual'` from creating invisible duplicates.

### UPSERT Strategy

Current ingestion scripts fetch all three statements (income, balance, cash flow) in parallel, combine them in memory, then write complete rows. This is safe with naive UPSERT.

If separate statement ingestion is ever needed, use COALESCE:
```sql
ON CONFLICT (symbol, period_type, period_end_date)
DO UPDATE SET
  revenue = COALESCE(EXCLUDED.revenue, financials_std.revenue),
  -- ... etc for all columns
```

---

## Migration Steps

1. **Check for NULL symbol rows** — report and fix before proceeding
2. **Check for NULL period_end_date rows** — backfill or re-ingest (not auto-delete)
3. **Find duplicates** by new key `(symbol, period_type, period_end_date)`
4. **Stage duplicates to temp table** — keep row with most non-null fields, use created_at as tie-breaker
5. **Review staged duplicates** before deletion
6. **Delete duplicates** from main table
7. **Add NOT NULL** on `symbol` and `period_end_date`
8. **Drop old UNIQUE**, add new UNIQUE on `(symbol, period_type, period_end_date)`
9. **Add CHECK constraint** on `period_type`
10. **Verify** with diagnostic queries

---

## Deduplication Logic

Keep the row with the **most non-null financial fields**. Tie-breaker: newest `created_at`.

**Rationale:** In multi-pass ingestion, an earlier complete run (all 9 fields) is better than a later partial run (3 fields). "Newest" alone would keep incomplete data.

```sql
ROW_NUMBER() OVER (
  PARTITION BY symbol, period_type, period_end_date
  ORDER BY
    (CASE WHEN revenue IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN gross_profit IS NOT NULL THEN 1 ELSE 0 END +
     -- ... all 9 financial fields
    ) DESC,
    created_at DESC
) as rn
-- Keep rn = 1, delete rn > 1
```

---

## Code Changes

Update conflict target in ingestion scripts:

```typescript
// OLD
onConflict: 'symbol,year,period_type,fiscal_quarter'

// NEW
onConflict: 'symbol,period_type,period_end_date'
```

Add validation to reject/warn on records with null `period_end_date`.

---

## Questions for Review

1. Is `(symbol, period_type, period_end_date)` the correct natural key for FMP financial statement data?

2. Is the deduplication strategy (most complete row wins) sound, or should we prefer newest?

3. Are there edge cases where the same company could have two different financial statements with the same `period_end_date` and `period_type`? (e.g., restatements, amended filings)

4. Is staging duplicates to a temp table before deletion sufficient, or should we back up to a permanent table?

5. Any risks with making `symbol` NOT NULL if existing data might have NULLs?

6. Is the COALESCE-based UPSERT pattern correct for preventing NULL overwrites?

7. Any missing constraints, indexes, or validations?

---

## Files for Reference

If you need to see the full implementation:
- Design doc: `docs/FINANCIALS_STD_GUARDRAILS_DESIGN.md`
- Current ingestion: `scripts/ingest-financials.ts`, `scripts/sp500/batch-ingest-financials.ts`
- Fetch scripts: `scripts/fetch-aapl-data.ts`
