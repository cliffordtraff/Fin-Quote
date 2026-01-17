# Ingestion Spec: `public.financials_std`

## Endpoints Found

| File | Function | FMP Endpoints (v3) |
|------|----------|-------------------|
| `scripts/fetch-aapl-data.ts:84-88` | `fetchFinancials()` | `/income-statement/{symbol}`, `/balance-sheet-statement/{symbol}`, `/cash-flow-statement/{symbol}` |
| `scripts/sp500/batch-ingest-financials.ts:96-105` | `fetchFinancialsForSymbol()` | Same 3 endpoints |

**Period modes:**
- Annual: no `period` param (default)
- Quarterly: `&period=quarter`
- Both: fetched in parallel

---

## Mapping to financials_std

| FMP Field | financials_std Column | Source Statement |
|-----------|----------------------|------------------|
| `symbol` (param) | `symbol` | — |
| `date` (derived) | `year` | Calendar year from `getFiscalYear()` (quarterly), or direct year (annual) |
| — | `period_type` | `'annual'` or `'quarterly'` based on mode |
| `period` (`Q1`-`Q4`) | `fiscal_quarter` | Parsed via `parseFiscalQuarter()` |
| — | `fiscal_label` | `{year}-Q{n}` for quarterly, `null` for annual |
| `date` | `period_end_date` | Direct from FMP (e.g., `2024-09-30`) |
| `revenue` | `revenue` | Income statement |
| `grossProfit` | `gross_profit` | Income statement |
| `netIncome` | `net_income` | Income statement |
| `operatingIncome` | `operating_income` | Income statement |
| `totalAssets` | `total_assets` | Balance sheet |
| `totalLiabilities` | `total_liabilities` | Balance sheet |
| `totalStockholdersEquity` | `shareholders_equity` | Balance sheet |
| `operatingCashFlow` | `operating_cash_flow` | Cash flow |
| `eps` | `eps` | Income statement |

Files: `scripts/fetch-aapl-data.ts:118-134`, `scripts/sp500/batch-ingest-financials.ts:131-147`

---

## Units/Scaling

| Aspect | Value |
|--------|-------|
| **Currency** | USD only (FMP returns USD for US stocks) |
| **Scale** | Raw dollars (not thousands/millions). FMP returns absolute values. |
| **Type coercion** | `revenue`, `gross_profit` → `bigint`; `net_income`, `operating_income`, `total_assets`, `total_liabilities`, `shareholders_equity`, `operating_cash_flow` → `numeric`; `eps` → `numeric` (decimal) |
| **Null handling** | Missing fields → `0` in batch script (`|| 0`), raw `null` in single-symbol script |

---

## Current Write Strategy

**Two patterns exist:**

1. **Single-symbol script** (`scripts/ingest-financials.ts:110-163`):
   - Manual SELECT → match by `(symbol, year, period_type, fiscal_quarter)` → UPDATE by `id` or INSERT
   - **No true UPSERT** — emulates it in JS

2. **Batch script** (`scripts/sp500/batch-ingest-financials.ts:203-206`):
   ```ts
   await supabase.from('financials_std').upsert(allRecords, {
     onConflict: 'symbol,year,period_type,fiscal_quarter',
     ignoreDuplicates: false,
   })
   ```
   - **True UPSERT** via Supabase client

---

## Recommended UNIQUE + Indexes

### A) UNIQUE Constraint

Already exists per migration `20260117000001_sp500_expansion_phase0_phase1.sql`:

```sql
ALTER TABLE financials_std
ADD CONSTRAINT unique_financials_period
UNIQUE (symbol, year, period_type, fiscal_quarter);
```

This correctly identifies one row per symbol/fiscal-period. Note: `fiscal_quarter` is `NULL` for annual rows (PostgreSQL UNIQUE treats `NULL` as distinct, so `(AAPL, 2024, annual, NULL)` won't conflict).

### B) Recommended Indexes

```sql
-- 1. Time series for one symbol (chart queries)
CREATE INDEX IF NOT EXISTS idx_financials_std_symbol_year
ON financials_std (symbol, year DESC, fiscal_quarter NULLS LAST);

-- 2. Latest period for one symbol (already covered by above + LIMIT 1)
-- No separate index needed

-- 3. Cross-company same period (screening)
CREATE INDEX IF NOT EXISTS idx_financials_std_period_symbol
ON financials_std (year, period_type, fiscal_quarter, symbol);
```

Existing index from migration `20260115000001_add_quarterly_support.sql`:
```sql
CREATE INDEX IF NOT EXISTS idx_financials_std_period
ON financials_std (symbol, period_type, year, fiscal_quarter);
```

---

## Recommended UPSERT SQL

For direct SQL (matches your batch script's Supabase call):

```sql
INSERT INTO financials_std (
  symbol,
  year,
  period_type,
  fiscal_quarter,
  fiscal_label,
  period_end_date,
  revenue,
  gross_profit,
  net_income,
  operating_income,
  total_assets,
  total_liabilities,
  shareholders_equity,
  operating_cash_flow,
  eps
)
VALUES (
  $1,  -- symbol
  $2,  -- year
  $3,  -- period_type ('annual' | 'quarterly')
  $4,  -- fiscal_quarter (1-4 or NULL)
  $5,  -- fiscal_label ('2024-Q2' or NULL)
  $6,  -- period_end_date
  $7,  -- revenue
  $8,  -- gross_profit
  $9,  -- net_income
  $10, -- operating_income
  $11, -- total_assets
  $12, -- total_liabilities
  $13, -- shareholders_equity
  $14, -- operating_cash_flow
  $15  -- eps
)
ON CONFLICT (symbol, year, period_type, fiscal_quarter)
DO UPDATE SET
  fiscal_label       = EXCLUDED.fiscal_label,
  period_end_date    = EXCLUDED.period_end_date,
  revenue            = EXCLUDED.revenue,
  gross_profit       = EXCLUDED.gross_profit,
  net_income         = EXCLUDED.net_income,
  operating_income   = EXCLUDED.operating_income,
  total_assets       = EXCLUDED.total_assets,
  total_liabilities  = EXCLUDED.total_liabilities,
  shareholders_equity = EXCLUDED.shareholders_equity,
  operating_cash_flow = EXCLUDED.operating_cash_flow,
  eps                = EXCLUDED.eps;
```

**Supabase JS equivalent** (already used in batch script):
```ts
await supabase.from('financials_std').upsert(records, {
  onConflict: 'symbol,year,period_type,fiscal_quarter',
  ignoreDuplicates: false,
})
```
