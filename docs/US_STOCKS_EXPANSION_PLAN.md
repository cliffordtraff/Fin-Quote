# US Stocks Expansion Plan

**Goal**: Enable search and charting for all US stocks (~8,000), not just S&P 500.

**Status**: Phase 1 & 2 Complete, Phase 3 (Polish) Pending

---

## Overview

Currently, the app only supports ~500 S&P 500 stocks. Users searching for stocks outside this list get no results. This plan expands coverage to all US-listed stocks on major exchanges (NYSE, NASDAQ, AMEX).

### What's Included
- All common stocks on NYSE, NASDAQ, AMEX
- ~8,000 tickers

### What's Excluded
- ETFs (SPY, QQQ, etc.) - can add later
- OTC/Pink sheets
- ADRs (may be included if on major exchanges)

---

## Phase 1: Stock Registry

**Goal**: Get all US stocks searchable immediately.

### 1.1 Create `us_stocks` Table

```sql
CREATE TABLE us_stocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  exchange TEXT NOT NULL,              -- NYSE, NASDAQ, AMEX
  type TEXT DEFAULT 'stock',           -- stock (exclude etf, fund)
  sector TEXT,
  industry TEXT,
  market_cap BIGINT,                   -- for priority sorting
  is_active BOOLEAN DEFAULT true,

  -- Ingestion tracking
  financials_status TEXT DEFAULT 'pending',  -- pending, in_progress, complete, failed, no_data
  financials_updated_at TIMESTAMPTZ,
  financials_error TEXT,               -- error message if failed

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast search
CREATE INDEX idx_us_stocks_symbol ON us_stocks(symbol);
CREATE INDEX idx_us_stocks_name ON us_stocks USING gin(name gin_trgm_ops);  -- fuzzy search
CREATE INDEX idx_us_stocks_status ON us_stocks(financials_status);
CREATE INDEX idx_us_stocks_market_cap ON us_stocks(market_cap DESC NULLS LAST);
```

### 1.2 Load Stock Registry Script

**File**: `scripts/us-stocks/load-registry.ts`

**Data Source**: FMP API `GET /api/v3/stock/list`

**Logic**:
1. Fetch full stock list from FMP (~70,000 global stocks)
2. Filter to US exchanges: NYSE, NASDAQ, AMEX
3. Filter to type = 'stock' (exclude ETFs)
4. Insert into `us_stocks` table
5. Log count and any errors

**Runtime**: ~1 minute (single API call + bulk insert)

**Command**:
```bash
npx tsx scripts/us-stocks/load-registry.ts
```

### 1.3 Update Search to Use New Table

**Files to modify**:
- `lib/symbol-resolver.ts` - Query `us_stocks` instead of `sp500_constituents`
- `app/api/search-stocks/route.ts` - No changes needed (uses symbol-resolver)
- `app/stock/[symbol]/page.tsx` - Update `isValidSymbol()` to check `us_stocks`

**Search priority** (same as current):
1. Exact symbol match
2. Symbol starts-with
3. Name starts-with
4. Fuzzy name match
5. Return top 10 results

---

## Phase 2: Financial Data Ingestion

**Goal**: Load financial statements for all stocks in batches.

### 2.1 Batch Ingestion Script

**File**: `scripts/us-stocks/batch-ingest-financials.ts`

**Logic**:
1. Query `us_stocks` where `financials_status = 'pending'`
2. Order by `market_cap DESC` (largest companies first)
3. For each stock:
   - Set status to `in_progress`
   - Fetch 3 FMP endpoints (income, balance sheet, cash flow)
   - Transform and insert into `financials_std`
   - Set status to `complete` or `failed`
4. Rate limit: 250ms between requests (4/sec, under 300/min limit)
5. Support `--limit N` flag to process N stocks per run

**Command**:
```bash
# Process next 500 pending stocks
npx tsx scripts/us-stocks/batch-ingest-financials.ts --limit 500

# Process all remaining (runs until done)
npx tsx scripts/us-stocks/batch-ingest-financials.ts

# Process specific stock
npx tsx scripts/us-stocks/batch-ingest-financials.ts --symbol PLTR
```

### 2.2 Batch Sizing

| Batch | Stocks | API Calls | Time | Cumulative |
|-------|--------|-----------|------|------------|
| 1 | 500 | 1,500 | ~5 min | 500 |
| 2 | 500 | 1,500 | ~5 min | 1,000 |
| 3 | 500 | 1,500 | ~5 min | 1,500 |
| 4 | 500 | 1,500 | ~5 min | 2,000 |
| ... | ... | ... | ... | ... |
| 16 | 500 | 1,500 | ~5 min | 8,000 |

**Total time for full load**: ~80 minutes (can be split across multiple sessions)

### 2.3 Priority Order

Process stocks by market cap tier:

| Tier | Market Cap | Est. Count | Priority |
|------|------------|------------|----------|
| Mega Cap | >$200B | ~50 | 1 (first) |
| Large Cap | $10B-$200B | ~500 | 2 |
| Mid Cap | $2B-$10B | ~1,500 | 3 |
| Small Cap | <$2B | ~6,000 | 4 (last) |

This ensures the most-searched stocks have data first.

### 2.4 Handling Missing Data

Some stocks won't have financial data (shell companies, SPACs, etc.):
- Mark as `financials_status = 'no_data'`
- Stock page shows "Financial data not available" message
- Stock remains searchable

### 2.5 Extended Metrics (Optional)

After core financials, can also load extended metrics:

**File**: `scripts/us-stocks/batch-ingest-metrics.ts`

Uses same pattern but calls:
- `/api/v3/ratios/{symbol}`
- `/api/v3/key-metrics/{symbol}`

Inserts into `financial_metrics` table.

---

## Phase 3: Code Changes

### 3.1 Symbol Resolver Updates

**File**: `lib/symbol-resolver.ts`

```typescript
// Change from:
const { data } = await supabase
  .from('sp500_constituents')
  .select('symbol, name')
  .eq('is_active', true)

// Change to:
const { data } = await supabase
  .from('us_stocks')
  .select('symbol, name')
  .eq('is_active', true)
```

### 3.2 Stock Page Validation

**File**: `app/stock/[symbol]/page.tsx`

```typescript
// Update isValidSymbol to check us_stocks table
async function isValidSymbol(symbol: string): Promise<boolean> {
  const { data } = await supabase
    .from('us_stocks')
    .select('symbol')
    .eq('symbol', symbol.toUpperCase())
    .eq('is_active', true)
    .single()

  return !!data
}
```

### 3.3 Graceful Degradation

Stock pages should handle missing financial data:

```typescript
// In stock page data loading
const financials = await getAllFinancials(symbol)

if (!financials || financials.length === 0) {
  // Show price chart and company info (from FMP API)
  // Hide financial metrics section
  // Display "Financial statements not available" message
}
```

---

## Phase 4: Maintenance

### 4.1 Weekly Refresh Script

**File**: `scripts/us-stocks/refresh-registry.ts`

**Logic**:
1. Fetch current stock list from FMP
2. Add new stocks (IPOs)
3. Mark delisted stocks as `is_active = false`
4. Update market cap values

**Schedule**: GitHub Action, weekly on Sunday

### 4.2 Incremental Financials Update

**File**: `scripts/us-stocks/update-financials.ts`

**Logic**:
1. For stocks with `financials_status = 'complete'`
2. If `financials_updated_at` > 30 days ago
3. Re-fetch latest quarter
4. Upsert into `financials_std`

**Schedule**: GitHub Action, monthly

---

## File Structure

```
scripts/
└── us-stocks/
    ├── load-registry.ts           # Phase 1: Load stock list
    ├── batch-ingest-financials.ts # Phase 2: Load financial data
    ├── batch-ingest-metrics.ts    # Phase 2 (optional): Extended metrics
    ├── refresh-registry.ts        # Phase 4: Weekly IPO/delist sync
    └── update-financials.ts       # Phase 4: Monthly data refresh

supabase/
└── migrations/
    └── YYYYMMDD_create_us_stocks_table.sql
```

---

## Execution Checklist

### Phase 1: Registry (Day 1) ✅ COMPLETE
- [x] Create migration for `us_stocks` table - `supabase/migrations/20260201000003_create_us_stocks_table.sql`
- [x] Write `load-registry.ts` script - `scripts/us-stocks/load-registry.ts`
- [x] **Run migration**: Applied via Supabase dashboard
- [x] **Run script**: Loaded 9,678 US stocks (NYSE: 3,378, NASDAQ: 5,945, AMEX: 355)
- [x] Update `symbol-resolver.ts` to query new table (changed to direct DB query for 10k+ stocks)
- [x] Update `isValidSymbol()` to query DB directly
- [x] Test: Search works for non-S&P 500 stocks (PLTR, RIVN, HOOD confirmed)

### Phase 2: Financials (Day 1-2) ✅ COMPLETE
- [x] Write `batch-ingest-financials.ts` script - `scripts/us-stocks/batch-ingest-financials.ts`
- [x] Write `check-status.ts` script - `scripts/us-stocks/check-status.ts`
- [x] **Run all batches**: 18 batches processed over multiple sessions
- [x] **Fix bigint type issue**: Added `toBigInt()` helper to round floats from FMP API
- [x] **Final Results**: 9,470 stocks with financial data (97.9%), 362,437 total records
- [x] 4 stocks failed (0.04%) - duplicate row edge case
- [x] 201 stocks have no data (2.1%) - SPACs, shell companies

### Phase 3: Polish
- [ ] Handle missing data gracefully on stock pages
- [ ] Add "Data loading..." state for stocks without financials yet
- [ ] Update any hardcoded S&P 500 references

### Phase 4: Automation
- [ ] Create GitHub Action for weekly registry refresh
- [ ] Create GitHub Action for monthly financials update

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| FMP API rate limits | 250ms delay between requests; batch in chunks |
| FMP API costs | Check plan limits; load in priority order |
| Missing data for small caps | Graceful degradation; show "not available" |
| Script fails mid-batch | Resume support via `financials_status` tracking |
| Stale data | Monthly refresh GitHub Action |

---

## Success Criteria

1. **Search**: Any US stock on major exchanges is searchable ✅ (9,678 stocks)
2. **Stock pages**: Load for any valid ticker ✅
3. **Financials**: Available for top 2,000+ stocks by market cap ✅ (9,470 stocks - 97.9%)
4. **Graceful fallback**: Stocks without financials show price/company info only (Phase 3)
5. **Maintainable**: Automated weekly/monthly refresh jobs (Phase 4)

---

## Questions to Resolve

1. **Include ADRs?** (e.g., BABA, TSM) - Currently yes if on NYSE/NASDAQ
2. **Include BDCs/REITs?** - Currently yes (they're stocks)
3. **Market cap source**: FMP provides this in stock list - use it for priority sorting?
4. **Quarterly data**: Load quarterly financials too, or just annual?

---

## Appendix: FMP API Endpoints

### Stock List
```
GET /api/v3/stock/list
Response: [{ symbol, name, price, exchange, exchangeShortName, type }, ...]
```

### Financial Statements
```
GET /api/v3/income-statement/{symbol}?limit=20
GET /api/v3/balance-sheet-statement/{symbol}?limit=20
GET /api/v3/cash-flow-statement/{symbol}?limit=20
```

### Extended Metrics (Optional)
```
GET /api/v3/ratios/{symbol}?limit=20
GET /api/v3/key-metrics/{symbol}?limit=20
```
