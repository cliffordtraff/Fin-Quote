# S&P 500 Stock Screener - Implementation Plan

## Overview

A stock screener that allows users to filter S&P 500 stocks by various metrics including P/E ratio, market cap, sector, dividend yield, and performance.

**Key Requirements:**
- Display all 500 S&P 500 stocks with key metrics
- Filter by: sector, market cap, P/E ratio, dividend yield, performance
- Sortable columns
- Click row to navigate to stock detail page
- Data refreshed daily via cron job

---

## Architecture

### Data Flow

```
DAILY INGESTION (cron job):
┌─────────────┐      ┌───────────────────┐      ┌─────────────────┐
│   FMP API   │ ───► │ Ingestion Script  │ ───► │ Supabase Table  │
│  (500 stocks)│      │ scripts/ingest-   │      │ sp500_metrics   │
└─────────────┘      │ sp500-metrics.ts  │      └─────────────────┘
                     └───────────────────┘

USER REQUEST (on-demand):
┌─────────────┐      ┌───────────────────┐      ┌─────────────────┐
│   Browser   │ ───► │  Server Action    │ ───► │ Supabase Query  │
│  (filters)  │      │ getScreenerResults│      │ (no FMP calls)  │
└─────────────┘      └───────────────────┘      └─────────────────┘
```

### Why This Architecture?

1. **Cost efficient**: FMP API called once daily, not on every user request
2. **Fast filtering**: Database queries are fast; no API latency for users
3. **Scalable**: 1000 users filtering = 1000 cheap database queries, not 1000 expensive API calls

---

## Database Schema

### Table: `sp500_metrics`

| Column | Type | Description |
|--------|------|-------------|
| `symbol` | TEXT (PK) | Stock ticker (e.g., "AAPL") |
| `name` | TEXT | Company name |
| `sector` | TEXT | GICS sector (Technology, Healthcare, etc.) |
| `industry` | TEXT | More specific classification |
| `price` | DECIMAL | Current stock price |
| `market_cap` | BIGINT | Market capitalization in dollars |
| `pe_ratio` | DECIMAL | Price-to-earnings ratio |
| `forward_pe` | DECIMAL | Forward P/E ratio |
| `dividend_yield` | DECIMAL | Annual dividend yield (decimal, e.g., 0.0245 = 2.45%) |
| `eps` | DECIMAL | Earnings per share |
| `beta` | DECIMAL | Stock volatility vs market |
| `week52_high` | DECIMAL | 52-week high price |
| `week52_low` | DECIMAL | 52-week low price |
| `return_1d` | DECIMAL | 1-day return (decimal) |
| `return_1w` | DECIMAL | 1-week return |
| `return_1m` | DECIMAL | 1-month return |
| `return_ytd` | DECIMAL | Year-to-date return |
| `return_1y` | DECIMAL | 1-year return |
| `avg_volume` | BIGINT | Average daily volume |
| `updated_at` | TIMESTAMPTZ | Last data refresh timestamp |

### Indexes

```sql
-- Single column indexes for common filters
CREATE INDEX idx_sp500_sector ON sp500_metrics(sector);
CREATE INDEX idx_sp500_market_cap ON sp500_metrics(market_cap);
CREATE INDEX idx_sp500_pe_ratio ON sp500_metrics(pe_ratio);
CREATE INDEX idx_sp500_dividend_yield ON sp500_metrics(dividend_yield);
CREATE INDEX idx_sp500_price ON sp500_metrics(price);
CREATE INDEX idx_sp500_return_ytd ON sp500_metrics(return_ytd);

-- Composite index for common filter + sort combination
CREATE INDEX idx_sp500_sector_market_cap ON sp500_metrics(sector, market_cap);

-- Text search index for symbol/name lookup
CREATE INDEX idx_sp500_symbol_trgm ON sp500_metrics USING gin(symbol gin_trgm_ops);
CREATE INDEX idx_sp500_name_trgm ON sp500_metrics USING gin(name gin_trgm_ops);
```

Indexes on commonly filtered/sorted columns. Trigram indexes enable fast partial text search (requires `pg_trgm` extension).

---

## Files to Create

### 1. Database Migration
**File:** `supabase/migrations/YYYYMMDD_create_sp500_metrics.sql`

Creates the `sp500_metrics` table with all columns and indexes.

### 2. Data Ingestion Script
**File:** `scripts/ingest-sp500-metrics.ts`

**What it does:**
1. Fetches S&P 500 constituent list from FMP
2. For each stock, fetches profile and metrics
3. Upserts data into `sp500_metrics` table

**FMP API endpoints used (bulk batching):**
- `/v3/sp500_constituent` - list of all 500 symbols (1 call)
- `/v3/quote/{symbol1,symbol2,...}` - batch 50 symbols per call (10 calls total)
- `/v3/stock-price-change/{symbol1,symbol2,...}` - batch 50 symbols per call (10 calls total)
- `/v3/stock-screener` - get sector/industry for all stocks (1 call)

**Total: ~22 API calls for all 500 stocks**

**Rate limit handling:**
- Add 200ms delay between batch calls
- Exponential backoff on 429 errors (start 1s, max 30s)
- Maximum 3 retries per request
- Checkpoint progress to database (track last successful batch)
- Resume from checkpoint if script fails mid-run

**Run frequency:** Daily via GitHub Action (similar to existing `daily-data-update.yml`)

### 3. Server Action
**File:** `app/actions/screener.ts`

**Function:** `getScreenerResults(filters)`

**Input parameters:**
- `search`: string - text search for symbol or name
- `sectors`: string[] - filter to specific sectors
- `marketCapMin`: number - minimum market cap
- `marketCapMax`: number - maximum market cap
- `peMin`: number - minimum P/E ratio
- `peMax`: number - maximum P/E ratio
- `includeNullPe`: boolean - include stocks with null P/E (default: true)
- `dividendYieldMin`: number - minimum dividend yield
- `sortBy`: string - column to sort by
- `sortOrder`: 'asc' | 'desc'
- `page`: number - for pagination
- `limit`: number - results per page (default 50)

**Logic:**
1. Start with base Supabase query
2. Conditionally add filters based on which parameters are provided
3. Apply sorting
4. Apply pagination (offset/limit)
5. Return results + total count

**Why one server action, not multiple:**
- All filters go to the same action
- Action builds query dynamically based on what's provided
- Changing any filter calls the same action with updated parameters

### 4. UI Page
**File:** `app/screener/page.tsx`

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│  Stock Screener                    [Export CSV] [Reset All] │
├──────────────┬──────────────────────────────────────────────┤
│              │  [🔍 Search by symbol or name...]            │
│  FILTERS     │                                               │
│              │  RESULTS TABLE                               │
│  Sector      │  Symbol | Name | Sector | Price | Mkt Cap... │
│  [dropdown]  │  ───────────────────────────────────────────  │
│              │  AAPL   | Apple| Tech   | $185  | $2.8T      │
│  Market Cap  │  MSFT   | Micro| Tech   | $378  | $2.8T      │
│  [slider]    │  GOOGL  | Alpha| Comm   | $142  | $1.7T      │
│              │  ...                                          │
│  P/E Ratio   │                                               │
│  [min] [max] │  Showing 1-50 of 127 results                 │
│  ☑ Include   │  [Prev] [1] [2] [3] [Next]                   │
│    N/A P/E   │                                               │
│              │  Data as of: Jan 24, 2026 3:45 PM            │
│  Div Yield   │                                               │
│  [min input] │                                               │
│              │                                               │
└──────────────┴──────────────────────────────────────────────┘
```

### 5. Filter Components
**File:** `components/screener/ScreenerFilters.tsx`

Individual filter controls:
- **SectorFilter**: Multi-select dropdown with all 11 GICS sectors
- **MarketCapFilter**: Range slider or preset buttons (Mega >$200B, Large >$10B, Mid >$2B, Small <$2B)
- **PERatioFilter**: Min/max number inputs
- **DividendYieldFilter**: Minimum input
- **PerformanceFilter**: Range for YTD or 1-year return

### 6. Results Table
**File:** `components/screener/ScreenerTable.tsx`

Features:
- Column headers that are clickable for sorting
- Visual indicator showing current sort column/direction
- Row hover states
- Click row to navigate to `/stock/[symbol]`

### 7. GitHub Action Update
**File:** `.github/workflows/daily-data-update.yml`

Add step to run `ingest-sp500-metrics.ts` after existing data updates.

---

## Filter Options

### Sector (Multi-select)
All 11 GICS sectors:
- Technology
- Healthcare
- Financials
- Consumer Discretionary
- Consumer Staples
- Industrials
- Energy
- Utilities
- Real Estate
- Materials
- Communication Services

### Market Cap (Range or Presets)
- Mega Cap: >$200B
- Large Cap: $10B - $200B
- Mid Cap: $2B - $10B
- Small Cap: <$2B

Or free-form slider: $0 to $3T

### P/E Ratio (Min/Max)
- Input fields for min and max
- Common presets: <15 (value), 15-25 (fair), >25 (growth)
- Handle null P/E (unprofitable companies)

### Dividend Yield (Minimum)
- Slider or input: 0% to 10%+
- "Dividend payers only" checkbox (yield > 0)

### Performance (Range)
- YTD return: -50% to +100%
- Or 1-year return

---

## State Management

### URL Parameters
Sync filter state with URL so results are shareable:

```
/screener?sectors=Technology,Healthcare&peMax=25&sortBy=market_cap
```

Benefits:
- Bookmark filtered views
- Share links with specific filters
- Browser back/forward works

### Loading States
- Show skeleton/spinner while fetching
- Disable filters during load to prevent rapid re-queries
- Debounce filter changes (wait 300ms after last change before fetching)

---

## Pagination

### Approach
- Server-side pagination (not load all 500 and filter client-side)
- 50 results per page
- Show total count: "Showing 1-50 of 127 results"
- Page navigation: [Prev] [1] [2] [3] [Next]

### Implementation
- `page` parameter passed to server action
- Server action uses `.range(offset, offset + limit - 1)`
- Use Supabase `{ count: 'exact' }` option to get total count efficiently
- Return `{ stocks: [], total: number }`

---

## Sorting

### Sortable Columns
- Symbol (alphabetical)
- Name (alphabetical)
- Price (numeric)
- Market Cap (numeric)
- P/E Ratio (numeric)
- Dividend Yield (numeric)
- YTD Return (numeric)

### Implementation
- Click column header to sort ascending
- Click again to sort descending
- Visual arrow indicator showing direction
- `sortBy` and `sortOrder` passed to server action

---

## Edge Cases

### No Results
Display friendly message: "No stocks match your filters. Try adjusting your criteria."

### Null Values
- P/E can be null/negative for unprofitable companies
- Filter UI should handle "include N/A" option
- Display as "N/A" or "-" in table

### API Failures
- Ingestion script: retry logic, partial updates OK
- Server action: return error state, UI shows "Unable to load data"

### Stale Data
- Show "Data as of: Jan 24, 2026" timestamp
- If data is >24 hours old, show warning
- Track freshness in `ingestion_status` table (last_run, status, error_message)

---

## FMP API Considerations

### How FMP Endpoints Work

Each endpoint returns **multiple fields** in one response, not one metric per call:

| Endpoint | Fields Returned (per stock) |
|----------|----------------------------|
| `/v3/quote/{symbol}` | price, P/E, EPS, market cap, 52-week high/low, volume, avgVolume, 1-day change |
| `/v3/stock-price-change/{symbol}` | 1D, 5D, 1M, 3M, 6M, YTD, 1Y, 3Y, 5Y, 10Y returns |
| `/v3/stock-screener` | symbol, name, sector, industry, market cap, price, beta, dividend |

**Bulk requests:** Most endpoints accept comma-separated symbols:
- `/v3/quote/AAPL,MSFT,GOOGL` → returns data for 3 stocks in 1 call
- Can batch up to ~50 symbols per call

### Optimized API Strategy (Tested & Verified)

| Step | Endpoint | Symbols | Calls | Data Retrieved |
|------|----------|---------|-------|----------------|
| 1 | `/v3/sp500_constituent` | - | 1 | List of 500 symbols |
| 2 | `/v3/quote/{50 symbols}` | 500 ÷ 50 | 10 | price, P/E, EPS, market cap, 52-week high/low, volume |
| 3 | `/v3/stock-price-change/{50 symbols}` | 500 ÷ 50 | 10 | 1D, 1W, 1M, YTD, 1Y returns |
| 4 | `/v3/stock-screener` | - | 1 | sector, industry (bulk, all stocks) |

**Total: ~22 API calls** (vs 1,500+ with individual calls)

This works because:
- `/v3/quote` supports comma-separated symbols and returns P/E, price, market cap, 52-week range
- `/v3/stock-price-change` supports comma-separated symbols for performance data
- `/v3/stock-screener` returns sector/industry for many stocks in one call

### Rate Limits
- FMP free tier: 250 calls/day (sufficient - we only need ~22)
- Add 200ms delay between batch calls to be safe

### Ingestion Reliability
1. **Idempotent upserts**: Use `ON CONFLICT (symbol) DO UPDATE`, never truncate
2. **Checkpoint/resume**: Track last successful batch in `ingestion_status` table
3. **Exponential backoff**: 1s → 2s → 4s → 8s → 16s → 30s max on errors
4. **Failure alerts**: GitHub Action sends notification on failure

---

## Implementation Order

### Phase 1: Foundation
1. Create database migration
2. Run migration in Supabase
3. Create ingestion script
4. Test with 10 stocks first
5. Run full ingestion for all 500

### Phase 2: Backend
6. Create server action with basic query
7. Add filter logic one at a time
8. Add sorting
9. Add pagination
10. Test all combinations

### Phase 3: Frontend
11. Create basic page with table (no filters)
12. Add sector filter
13. Add market cap filter
14. Add P/E filter
15. Add remaining filters
16. Add sorting UI
17. Add pagination UI

### Phase 4: Polish
18. URL parameter sync
19. Loading states
20. Empty states
21. Error handling
22. Mobile responsiveness
23. Add to navigation

### Phase 5: Automation
24. Add to GitHub Action for daily refresh
25. Monitor for failures
26. Add data freshness indicator

---

---

## TypeScript Types

**File:** `lib/screener.types.ts`

```typescript
export interface SP500Stock {
  symbol: string
  name: string
  sector: string
  industry: string | null
  price: number
  market_cap: number
  pe_ratio: number | null
  forward_pe: number | null
  dividend_yield: number | null
  eps: number | null
  beta: number | null
  week52_high: number | null
  week52_low: number | null
  return_1d: number | null
  return_1w: number | null
  return_1m: number | null
  return_ytd: number | null
  return_1y: number | null
  avg_volume: number | null
  updated_at: string
}

export interface ScreenerFilters {
  search?: string
  sectors?: string[]
  marketCapMin?: number
  marketCapMax?: number
  peMin?: number
  peMax?: number
  includeNullPe?: boolean
  dividendYieldMin?: number
  sortBy?: keyof SP500Stock
  sortOrder?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export interface ScreenerResult {
  stocks: SP500Stock[]
  total: number
  error?: string
}

export interface IngestionStatus {
  id: string
  last_run: string
  status: 'success' | 'failed' | 'running'
  stocks_updated: number
  error_message: string | null
}
```

---

## Ingestion Status Table

**File:** `supabase/migrations/YYYYMMDD_create_ingestion_status.sql`

```sql
CREATE TABLE ingestion_status (
  id TEXT PRIMARY KEY DEFAULT 'sp500_metrics',
  last_run TIMESTAMPTZ,
  status TEXT CHECK (status IN ('success', 'failed', 'running')),
  stocks_updated INTEGER DEFAULT 0,
  last_symbol_processed TEXT,
  error_message TEXT
);

-- Insert initial row
INSERT INTO ingestion_status (id, status) VALUES ('sp500_metrics', 'pending');
```

This table tracks:
- When the last ingestion ran
- Whether it succeeded or failed
- How many stocks were updated
- Where to resume if interrupted
- Any error message for debugging

---

## Export to CSV

**Implementation:**
- "Export CSV" button in header
- Client-side generation using current filtered results
- Include all visible columns
- Filename: `sp500-screener-YYYY-MM-DD.csv`

```typescript
function exportToCsv(stocks: SP500Stock[]) {
  const headers = ['Symbol', 'Name', 'Sector', 'Price', 'Market Cap', ...]
  const rows = stocks.map(s => [s.symbol, s.name, s.sector, s.price, ...])
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
  // Trigger download
}
```

---

## Decisions Made (from Reviewer Feedback)

| Issue | Decision |
|-------|----------|
| Column names starting with digits | Renamed to `week52_high`, `week52_low` |
| Pagination total count | Use Supabase `{ count: 'exact' }` option |
| Heavy API load (1,500 calls) | Use bulk endpoints, reduce to ~15-20 calls |
| Rate limit handling | Exponential backoff + checkpoint/resume |
| Additional indexes needed | Added price, return_ytd, composite (sector, market_cap), trigram for search |
| Null P/E handling | Added explicit `includeNullPe` toggle |
| Data freshness tracking | Added `ingestion_status` table |
| GitHub Action reliability | Idempotent upserts, failure alerts |
| Text search | Added search input + trigram indexes |
| Export functionality | Added CSV export button |
| TypeScript types | Added `lib/screener.types.ts` |

---

## Success Criteria

- [ ] All 500 S&P 500 stocks displayed
- [ ] Sector filter works (single and multi-select)
- [ ] Market cap range filter works
- [ ] P/E ratio range filter works
- [ ] Dividend yield filter works
- [ ] Sorting by any column works
- [ ] Pagination works
- [ ] Click row navigates to stock page
- [ ] Filters sync to URL
- [ ] Data refreshes daily automatically
- [ ] Mobile responsive
- [ ] Loading states smooth
- [ ] No errors in console
- [ ] Text search by symbol/name works
- [ ] Export to CSV works
- [ ] "Include N/A P/E" toggle works
- [ ] Data freshness indicator shows last update time

---

## Related Files

**Existing patterns to follow:**
- Server action: `app/actions/gainers.ts`
- Table component: `components/GainersTable.tsx`
- Data ingestion: `scripts/ingest-fmp-insiders.ts`
- GitHub Action: `.github/workflows/daily-data-update.yml`

**New files to create:**
- `supabase/migrations/YYYYMMDD_create_sp500_metrics.sql`
- `supabase/migrations/YYYYMMDD_create_ingestion_status.sql`
- `scripts/ingest-sp500-metrics.ts`
- `app/actions/screener.ts`
- `app/screener/page.tsx`
- `components/screener/ScreenerFilters.tsx`
- `components/screener/ScreenerTable.tsx`
- `lib/screener.types.ts`
