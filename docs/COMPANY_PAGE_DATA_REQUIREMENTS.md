# Company Page Data Requirements for Multi-Ticker Support

This document outlines all the financial metrics required for the S&P 500 company pages, based on Finviz.com's layouts for Key Statistics, Balance Sheet, and Cash Flow.

## Overview

We have **132 unique metrics already ingested** in the `financial_metrics` table from FMP's key-metrics, ratios, and growth endpoints. Many UI fields showing "N/A" are actually **query/mapping issues**, not missing data.

### Root Causes of N/A Fields

1. **Metric name mismatches** - UI code looks for wrong field name (e.g., `evToSales` vs actual stored name)
2. **Live API fallback failures** - `stock-key-stats.ts` still makes live FMP calls instead of DB-only reads
3. **Genuinely missing data** - analyst estimates, insider trading, technicals not yet ingested

---

## Current Database Inventory

### `financial_metrics` table (132 metrics already available)

**Valuation:**
- `peRatio`, `pbRatio`, `pfcfRatio`, `priceSalesRatio`, `priceEarningsToGrowthRatio`
- `enterpriseValue`, `enterpriseValueMultiple`, `evToSales`, `evToFreeCashFlow`, `evToOperatingCashFlow`
- `marketCap`, `marketCapitalization`, `grahamNumber`, `grahamNetNet`, `priceFairValue`

**Profitability & Returns:**
- `returnOnAssets`, `returnOnEquity`, `roic`, `returnOnCapitalEmployed`, `returnOnTangibleAssets`
- `grossProfitMargin`, `operatingProfitMargin`, `netProfitMargin`, `ebitdaMargin`, `pretaxProfitMargin`
- `ebitPerRevenue`, `ebtPerEbit`, `netIncomePerEBT`, `effectiveTaxRate`

**Leverage & Liquidity:**
- `currentRatio`, `quickRatio`, `cashRatio`
- `debtRatio`, `debtEquityRatio`, `longTermDebtToCapitalization`, `totalDebtToCapitalization`
- `interestCoverage`, `cashFlowCoverageRatios`, `shortTermCoverageRatios`

**Efficiency:**
- `assetTurnover`, `fixedAssetTurnover`, `inventoryTurnover`, `receivablesTurnover`, `payablesTurnover`
- `daysOfInventoryOnHand`, `daysOfSalesOutstanding`, `daysOfPayablesOutstanding`
- `cashConversionCycle`, `operatingCycle`

**Growth (3Y, 5Y, 10Y available):**
- `revenueGrowth`, `netIncomeGrowth`, `grossProfitGrowth`, `operatingIncomeGrowth`
- `freeCashFlowGrowth`, `operatingCashFlowGrowth`, `assetGrowth`, `debtGrowth`
- `threeYRevenueGrowthPerShare`, `fiveYRevenueGrowthPerShare`, `tenYRevenueGrowthPerShare`
- `threeYNetIncomeGrowthPerShare`, `fiveYNetIncomeGrowthPerShare`, `tenYNetIncomeGrowthPerShare`
- `dividendsperShareGrowth`, `threeYDividendperShareGrowthPerShare`, `fiveYDividendperShareGrowthPerShare`

**Per-Share Metrics:**
- `bookValuePerShare`, `tangibleBookValuePerShare`, `revenuePerShare`, `netIncomePerShare`
- `freeCashFlowPerShare`, `operatingCashFlowPerShare`, `cashPerShare`, `capexPerShare`
- `interestDebtPerShare`, `epsdilutedGrowth`, `epsgrowth`

**Dividends:**
- `dividendYield`, `dividendPayoutRatio`, `payoutRatio`

**Cash Flow:**
- `freeCashFlow`, `capitalExpenditure`, `depreciationAndAmortization`
- `dividendsPaid`, `commonStockRepurchased`, `stockBasedCompensation`
- `freeCashFlowYield`, `freeCashFlowOperatingCashFlowRatio`
- `capexToDepreciation`, `capexToOperatingCashFlow`, `capexToRevenue`
- `dividendPaidAndCapexCoverageRatio`, `capitalExpenditureCoverageRatio`

**Other:**
- `beta`, `numberOfShares`, `workingCapital`, `investedCapital`
- `tangibleAssetValue`, `netCurrentAssetValue`, `netDebtToEBITDA`

---

## Key Statistics Table - Corrected Status

### Column 1: Company Info

| Metric | Status | Database Field | Issue |
|--------|--------|----------------|-------|
| Index | **Missing** | — | Need separate data source |
| Market Cap | **In DB** | `marketCap` or `marketCapitalization` | ✅ |
| Enterprise Value | **In DB** | `enterpriseValue` | ✅ |
| Income | **In DB** | `financials_std.net_income` | ✅ |
| Sales | **In DB** | `financials_std.revenue` | ✅ |
| Book/sh | **In DB** | `bookValuePerShare` | ✅ |
| Cash/sh | **In DB** | `cashPerShare` | ✅ |
| Dividend Est. | **Missing** | — | Need FMP Analyst Estimates API |
| Dividend TTM | **In DB** | `dividendYield` (calculate back) | Check mapping |
| Dividend Ex-Date | **Missing** | — | Need FMP Stock Dividend Calendar API |
| Dividend Gr. 3/5Y | **In DB** | `threeYDividendperShareGrowthPerShare`, `fiveYDividendperShareGrowthPerShare` | Fix query |
| Payout | **In DB** | `payoutRatio` or `dividendPayoutRatio` | ✅ |
| Employees | **Missing** | — | Need FMP Company Profile |
| IPO | **Missing** | — | Need FMP Company Profile |

### Column 2: Valuation Ratios

| Metric | Status | Database Field | Issue |
|--------|--------|----------------|-------|
| P/E | **In DB** | `peRatio` | ✅ |
| Forward P/E | **Missing** | — | Not in FMP ratios/key-metrics endpoints |
| PEG | **In DB** | `priceEarningsToGrowthRatio` | Check field name mapping |
| P/S | **In DB** | `priceSalesRatio` | ✅ |
| P/B | **In DB** | `pbRatio` or `ptbRatio` | ✅ |
| P/C | **In DB** | `pfcfRatio` or `priceCashFlowRatio` | ✅ |
| P/FCF | **In DB** | `priceToFreeCashFlowsRatio` (check exact name) | Fix mapping |
| EV/EBITDA | **In DB** | `enterpriseValueMultiple` | ✅ |
| EV/Sales | **In DB** | `evToSales` | ✅ |
| Quick Ratio | **In DB** | `quickRatio` | ✅ |
| Current Ratio | **In DB** | `currentRatio` | ✅ |
| Debt/Eq | **In DB** | `debtEquityRatio` | ✅ |
| LT Debt/Eq | **In DB** | `longTermDebtToCapitalization` | Fix mapping in UI |
| Option/Short | **Missing** | — | Premium data source |

### Column 3: EPS & Sales Growth

| Metric | Status | Database Field | Issue |
|--------|--------|----------------|-------|
| EPS (ttm) | **In DB** | `financials_std.eps` | ✅ |
| EPS next Y | **Missing** | — | Need FMP Analyst Estimates API |
| EPS next Q | **Missing** | — | Need FMP Analyst Estimates API |
| EPS this Y | **In DB** | `netIncomeGrowth` or `epsgrowth` | ✅ |
| EPS next Y (growth) | **Missing** | — | Need FMP Analyst Estimates API |
| EPS next 5Y | **Missing** | — | Need FMP Analyst Estimates API |
| EPS past 3/5Y | **In DB** | `threeYNetIncomeGrowthPerShare`, `fiveYNetIncomeGrowthPerShare` | ✅ |
| Sales past 3/5Y | **In DB** | `threeYRevenueGrowthPerShare`, `fiveYRevenueGrowthPerShare` | ✅ |
| Sales Y/Y TTM | **In DB** | `revenueGrowth` | ✅ |
| EPS Q/Q | **Missing** | — | Need quarterly calculation |
| Sales Q/Q | **Missing** | — | Need quarterly calculation |
| Earnings Date | **Missing** | — | Need FMP Earnings Calendar |
| EPS Surpr. | **Missing** | — | Need FMP Earnings Surprises |
| Sales Surpr. | **Missing** | — | Need FMP Earnings Surprises |

### Column 4: Ownership & Returns

| Metric | Status | Database Field | Issue |
|--------|--------|----------------|-------|
| Insider Own | **Missing** | — | Need FMP Insider Trading API |
| Insider Trans | **Missing** | — | Need FMP Insider Trading API |
| Inst Own | **Missing** | — | Need FMP Institutional Holders |
| Inst Trans | **Missing** | — | Need FMP Institutional Holders |
| ROA | **In DB** | `returnOnAssets` | ✅ |
| ROE | **In DB** | `returnOnEquity` | ✅ |
| ROIC | **In DB** | `roic` or `returnOnCapitalEmployed` | ✅ |
| Gross Margin | **In DB** | `grossProfitMargin` | ✅ |
| Oper. Margin | **In DB** | `operatingProfitMargin` or `ebitPerRevenue` | ✅ |
| Profit Margin | **In DB** | `netProfitMargin` | ✅ |
| SMA20 | **Missing** | — | Need FMP Technical Indicators |
| SMA50 | **Missing** | — | Need FMP Technical Indicators |
| SMA200 | **Missing** | — | Need FMP Technical Indicators |

### Column 5: Shares & Volatility

| Metric | Status | Database Field | Issue |
|--------|--------|----------------|-------|
| Shs Outstand | **In DB** | `numberOfShares` | ✅ |
| Shs Float | **Missing** | — | Need separate API |
| Short Float | **Missing** | — | Need FMP Short Interest |
| Short Ratio | **Missing** | — | Need FMP Short Interest |
| Short Interest | **Missing** | — | Need FMP Short Interest |
| 52W High | **Live API** | FMP Quote | OK (real-time needed) |
| 52W Low | **Live API** | FMP Quote | OK (real-time needed) |
| Volatility | **Missing** | — | Calculate from price history |
| ATR (14) | **Missing** | — | Need FMP Technical Indicators |
| RSI (14) | **Missing** | — | Need FMP Technical Indicators |
| Beta | **In DB** | `beta` | ✅ |
| Rel Volume | **Live API** | Calculated | OK |
| Avg Volume | **Live API** | FMP Quote | OK |
| Volume | **Live API** | FMP Quote | OK |

### Column 6: Performance

| Metric | Status | Database Field | Issue |
|--------|--------|----------------|-------|
| Perf Week | **Missing** | — | Need FMP Stock Price Change |
| Perf Month | **Missing** | — | Need FMP Stock Price Change |
| Perf Quarter | **Missing** | — | Need FMP Stock Price Change |
| Perf Half Y | **Missing** | — | Need FMP Stock Price Change |
| Perf YTD | **Live API** | FMP Quote | OK |
| Perf Year | **Missing** | — | Need FMP Stock Price Change |
| Perf 3Y | **Missing** | — | Calculate from price history |
| Perf 5Y | **Missing** | — | Calculate from price history |
| Perf 10Y | **Missing** | — | Calculate from price history |
| Recom | **Missing** | — | Need FMP Analyst Estimates |
| Target Price | **Live API** | FMP Quote | OK |
| Prev Close | **Live API** | FMP Quote | OK |
| Price | **Live API** | FMP Quote | OK |
| Change | **Live API** | FMP Quote | OK |

---

## Priority Actions

### Phase 1: Fix Query/Mapping Issues (No new data needed)

These metrics are IN THE DATABASE but showing N/A due to code issues:

1. **`stock-key-stats.ts`** - Fix metric name lookups:
   - `longTermDebtToCapitalization` → LT Debt/Eq
   - `evToSales` → EV/Sales
   - `threeYDividendperShareGrowthPerShare` → Dividend Gr 3Y
   - `priceEarningsToGrowthRatio` → PEG
   - Ensure fallback chain checks all possible field names

2. **`get-all-financials.ts`** - Already queries financial_metrics, verify mappings

### Phase 2: Ingest New Data (Requires FMP API calls)

**Priority order:**

1. **Company Profile** (employees, IPO date) - Simple, one-time per company
2. **Stock Price Change** (performance metrics) - Single endpoint covers Week/Month/Quarter/Half/Year
3. **Analyst Estimates** (forward EPS, target price, recommendations)
4. **Earnings Calendar + Surprises**
5. **Technical Indicators** (SMA, RSI, ATR) - Lower priority, complex to maintain
6. **Insider/Institutional** - Lower priority, premium feel

### Phase 3: Balance Sheet & Cash Flow Details

These are genuinely missing line-item details (not summary metrics):

- Individual asset categories (cash, receivables, inventory, PP&E, etc.)
- Individual liability categories (short-term debt, accounts payable, etc.)
- Detailed cash flow line items (acquisitions, debt issuance/repayment, etc.)

---

## Summary: What's Actually Missing vs. Already Available

| Category | Already in DB | Missing (needs ingestion) |
|----------|--------------|---------------------------|
| Valuation Ratios | 15+ metrics | Forward P/E |
| Profitability | 10+ metrics | — |
| Growth Rates | 20+ metrics (3Y, 5Y, 10Y) | — |
| Per-Share | 10+ metrics | — |
| Dividends | Yield, Payout, Growth | Ex-date, Estimate |
| Analyst | — | Estimates, Target, Recom |
| Technical | Beta | SMA, RSI, ATR, Volatility |
| Performance | — | Week/Month/Quarter/Year changes |
| Ownership | — | Insider, Institutional |
| Company Info | — | Employees, IPO, Index |
| Balance Sheet | Totals + ratios | Line-item details |
| Cash Flow | Key items + ratios | Line-item details |

**Bottom line:** ~70% of N/A fields can be fixed by correcting query mappings. ~30% require new data ingestion.

---

## New Database Tables Schema

We'll create 4 new tables to store the missing data. Each table is designed for a specific data category with appropriate update frequencies.

### 1. `company_profile` - Static company info (update: monthly)

```sql
CREATE TABLE company_profile (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,

  -- Basic Info
  company_name TEXT,
  exchange TEXT,                    -- NYSE, NASDAQ, etc.
  sector TEXT,
  industry TEXT,
  description TEXT,

  -- Company Details
  ceo TEXT,
  employees INTEGER,                -- Full-time employees
  headquarters TEXT,                -- City, State
  country TEXT,
  website TEXT,

  -- Dates
  ipo_date DATE,
  fiscal_year_end TEXT,             -- e.g., "September" for AAPL

  -- Index Membership (derived/manual)
  is_sp500 BOOLEAN DEFAULT FALSE,
  is_nasdaq100 BOOLEAN DEFAULT FALSE,
  is_dow30 BOOLEAN DEFAULT FALSE,

  -- Metadata
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_company_profile_symbol ON company_profile(symbol);
```

**FMP Endpoint:** `GET /api/v3/profile/{symbol}`

**Sample Response Fields:**
- `fullTimeEmployees`, `ipoDate`, `sector`, `industry`, `ceo`, `city`, `state`, `country`, `website`, `description`

---

### 2. `price_performance` - Performance metrics (update: daily)

```sql
CREATE TABLE price_performance (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  as_of_date DATE NOT NULL,         -- Date these metrics were calculated

  -- Short-term Performance (%)
  perf_1d NUMERIC,                  -- 1 day
  perf_5d NUMERIC,                  -- 1 week (5 trading days)
  perf_1m NUMERIC,                  -- 1 month
  perf_3m NUMERIC,                  -- 3 months (quarter)
  perf_6m NUMERIC,                  -- 6 months (half year)
  perf_ytd NUMERIC,                 -- Year to date
  perf_1y NUMERIC,                  -- 1 year
  perf_3y NUMERIC,                  -- 3 years
  perf_5y NUMERIC,                  -- 5 years
  perf_10y NUMERIC,                 -- 10 years
  perf_max NUMERIC,                 -- Max (all time)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(symbol, as_of_date)
);

CREATE INDEX idx_price_performance_symbol_date ON price_performance(symbol, as_of_date DESC);
```

**FMP Endpoint:** `GET /api/v3/stock-price-change/{symbol}`

**Sample Response:**
```json
{
  "symbol": "AAPL",
  "1D": 0.0234,
  "5D": 0.0156,
  "1M": 0.0523,
  "3M": 0.1245,
  "6M": 0.2156,
  "ytd": 0.3245,
  "1Y": 0.4523,
  "3Y": 1.2345,
  "5Y": 2.5678,
  "10Y": 8.1234,
  "max": 45.678
}
```

---

### 3. `analyst_estimates` - Forward estimates (update: weekly)

```sql
CREATE TABLE analyst_estimates (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  estimate_date DATE NOT NULL,      -- Date estimate was published
  period TEXT NOT NULL,             -- 'annual' or 'quarter'
  period_end DATE,                  -- End of the period being estimated

  -- EPS Estimates
  eps_estimated NUMERIC,            -- Consensus EPS estimate
  eps_estimated_low NUMERIC,
  eps_estimated_high NUMERIC,
  eps_estimated_avg NUMERIC,
  number_analysts_eps INTEGER,

  -- Revenue Estimates
  revenue_estimated NUMERIC,
  revenue_estimated_low NUMERIC,
  revenue_estimated_high NUMERIC,
  revenue_estimated_avg NUMERIC,
  number_analysts_revenue INTEGER,

  -- Growth Estimates
  eps_growth_estimated NUMERIC,     -- EPS growth % estimate
  revenue_growth_estimated NUMERIC, -- Revenue growth % estimate

  -- Target Price & Recommendations
  target_price NUMERIC,             -- Consensus target price
  target_price_low NUMERIC,
  target_price_high NUMERIC,
  analyst_rating_buy INTEGER,       -- # of buy ratings
  analyst_rating_hold INTEGER,      -- # of hold ratings
  analyst_rating_sell INTEGER,      -- # of sell ratings
  analyst_rating_strong_buy INTEGER,
  analyst_rating_strong_sell INTEGER,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(symbol, period, period_end)
);

CREATE INDEX idx_analyst_estimates_symbol ON analyst_estimates(symbol, estimate_date DESC);
```

**FMP Endpoints:**
- `GET /api/v3/analyst-estimates/{symbol}` - EPS/Revenue estimates
- `GET /api/v3/analyst-stock-recommendations/{symbol}` - Buy/Hold/Sell ratings
- `GET /api/v3/price-target/{symbol}` - Target prices

---

### 4. `earnings_history` - Historical earnings (update: after each earnings)

```sql
CREATE TABLE earnings_history (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_quarter INTEGER,           -- NULL for annual
  period_end DATE NOT NULL,

  -- Earnings Data
  eps_actual NUMERIC,
  eps_estimated NUMERIC,
  eps_surprise NUMERIC,             -- Actual - Estimated
  eps_surprise_pct NUMERIC,         -- (Actual - Estimated) / |Estimated| * 100

  -- Revenue Data
  revenue_actual NUMERIC,
  revenue_estimated NUMERIC,
  revenue_surprise NUMERIC,
  revenue_surprise_pct NUMERIC,

  -- Dates
  earnings_date DATE,               -- When earnings were announced
  earnings_time TEXT,               -- 'bmo' (before market open) or 'amc' (after market close)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(symbol, fiscal_year, fiscal_quarter)
);

CREATE INDEX idx_earnings_history_symbol ON earnings_history(symbol, period_end DESC);
```

**FMP Endpoints:**
- `GET /api/v3/earnings-surprises/{symbol}` - Historical EPS surprises
- `GET /api/v3/earning_calendar?from=DATE&to=DATE` - Upcoming earnings dates

---

### 5. `technical_indicators` - Technical data (update: daily, optional)

```sql
CREATE TABLE technical_indicators (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  as_of_date DATE NOT NULL,

  -- Moving Averages
  sma_20 NUMERIC,
  sma_50 NUMERIC,
  sma_200 NUMERIC,
  ema_20 NUMERIC,
  ema_50 NUMERIC,

  -- Oscillators
  rsi_14 NUMERIC,                   -- Relative Strength Index (14-day)

  -- Volatility
  atr_14 NUMERIC,                   -- Average True Range (14-day)
  volatility_week NUMERIC,          -- Weekly volatility
  volatility_month NUMERIC,         -- Monthly volatility

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(symbol, as_of_date)
);

CREATE INDEX idx_technical_indicators_symbol_date ON technical_indicators(symbol, as_of_date DESC);
```

**FMP Endpoint:** `GET /api/v3/technical_indicator/daily/{symbol}?type=sma&period=20`

---

## Implementation Plan

### Phase 1: Fix Query Mappings (Week 1)
- [ ] Audit `stock-key-stats.ts` metric name lookups
- [ ] Create mapping file for all `financial_metrics` field names
- [ ] Test with AAPL, MSFT, GOOGL

### Phase 2: Create New Tables (Week 2)
- [ ] Create Supabase migration for all 5 tables
- [ ] Add RLS policies
- [ ] Update TypeScript types in `lib/database.types.ts`

### Phase 3: Build Ingestion Scripts (Week 2-3)

```bash
# Scripts to create:
scripts/ingest-company-profiles.ts    # One-time bulk, then monthly refresh
scripts/ingest-price-performance.ts   # Daily cron job
scripts/ingest-analyst-estimates.ts   # Weekly cron job
scripts/ingest-earnings-history.ts    # After each earnings season
scripts/ingest-technical-indicators.ts # Daily (optional, lower priority)
```

**Ingestion Pattern:**
```typescript
// Example: scripts/ingest-company-profiles.ts
async function ingestCompanyProfiles(symbols: string[]) {
  const batchSize = 50; // FMP rate limit friendly

  for (const batch of chunk(symbols, batchSize)) {
    const profiles = await Promise.all(
      batch.map(symbol => fetchFMPProfile(symbol))
    );

    await supabase
      .from('company_profile')
      .upsert(profiles.map(transformProfile), {
        onConflict: 'symbol'
      });

    await sleep(1000); // Rate limit
  }
}
```

### Phase 4: Update Server Actions (Week 3)
- [ ] Update `stock-key-stats.ts` to read from new tables
- [ ] Remove live FMP API calls where possible
- [ ] Add fallback chain: DB → cached API → live API

### Phase 5: Set Up Cron Jobs (Week 4)
- [ ] Daily: `price_performance`, `technical_indicators`
- [ ] Weekly: `analyst_estimates`
- [ ] Monthly: `company_profile`
- [ ] Post-earnings: `earnings_history`

---

## FMP API Endpoints Reference

| Data Category | Endpoint | New Table | Update Frequency |
|---------------|----------|-----------|------------------|
| Company Profile | `GET /api/v3/profile/{symbol}` | `company_profile` | Monthly |
| Stock Price Change | `GET /api/v3/stock-price-change/{symbol}` | `price_performance` | Daily |
| Analyst Estimates | `GET /api/v3/analyst-estimates/{symbol}` | `analyst_estimates` | Weekly |
| Price Target | `GET /api/v3/price-target/{symbol}` | `analyst_estimates` | Weekly |
| Ratings | `GET /api/v3/analyst-stock-recommendations/{symbol}` | `analyst_estimates` | Weekly |
| Earnings Surprises | `GET /api/v3/earnings-surprises/{symbol}` | `earnings_history` | Quarterly |
| Earnings Calendar | `GET /api/v3/earning_calendar` | `earnings_history` | Weekly |
| Technical Indicators | `GET /api/v3/technical_indicator/daily/{symbol}` | `technical_indicators` | Daily |

---

## Data Freshness Strategy

| Table | Update Frequency | Staleness Threshold | UI Behavior if Stale |
|-------|------------------|---------------------|----------------------|
| `company_profile` | Monthly | 60 days | Show data, no warning |
| `price_performance` | Daily | 2 days | Show data + "as of" date |
| `analyst_estimates` | Weekly | 14 days | Show data + "as of" date |
| `earnings_history` | Quarterly | N/A (historical) | Always show |
| `technical_indicators` | Daily | 2 days | Show "—" if stale |

---

## Notes

- Real-time quote data (price, volume, 52W high/low) should remain as live API calls
- Batch ingestion scripts exist: `scripts/sp500/batch-ingest-metrics.ts`
- Test fixes with AAPL first before rolling out to all S&P 500
- Consider adding `last_updated` column checks in server actions to surface data staleness
