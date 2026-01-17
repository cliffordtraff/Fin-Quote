# S&P 500 Expansion Plan

## Complete Implementation Guide for Scaling Fin Quote to 500+ Stocks

**Version:** 1.0
**Created:** January 2026
**Status:** Planning

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Context](#project-context)
3. [Current State Analysis](#current-state-analysis)
4. [Target State](#target-state)
5. [Technical Architecture](#technical-architecture)
6. [Phase 0: Migration of Existing Data](#phase-0-migration-of-existing-data)
7. [Phase 1: S&P 500 Ticker Management](#phase-1-sp-500-ticker-management)
8. [Phase 2: Financial Data Ingestion](#phase-2-financial-data-ingestion)
9. [Phase 3: SEC Filing Infrastructure (DEFERRED)](#phase-3-sec-filing-infrastructure-deferred)
10. [Phase 4: Segment Data Ingestion (FMP API)](#phase-4-segment-data-ingestion-fmp-api)
11. [Phase 5: Chatbot Multi-Stock Support](#phase-5-chatbot-multi-stock-support)
12. [Phase 6: Charts Multi-Stock Expansion](#phase-6-charts-multi-stock-expansion)
13. [Testing Strategy](#testing-strategy)
14. [Feature Flags & Gradual Rollout](#feature-flags--gradual-rollout)
15. [Infrastructure & Operations](#infrastructure--operations)
16. [Risk Assessment & Mitigation](#risk-assessment--mitigation)
17. [Success Criteria](#success-criteria)
18. [Appendix](#appendix)

---

## Phase Dependencies

Understanding which phases can run in parallel vs. which must be sequential:

```
                    ┌──────────────────────────────────────────────┐
                    │         PHASE DEPENDENCIES (Simplified)      │
                    └──────────────────────────────────────────────┘

┌─────────┐         ┌─────────┐         ┌─────────┐         ┌─────────┐
│ Phase 0 │────────▶│ Phase 1 │────────▶│ Phase 2 │────────▶│ Phase 4 │
│Migration│         │ Tickers │         │Financials│         │Segments │
└─────────┘         └─────────┘         └────┬────┘         │(FMP API)│
                                              │              └────┬────┘
                                              │                   │
                         ┌────────────────────┼───────────────────┤
                         │                    │                   │
                         ▼                    ▼                   ▼
                   ┌─────────┐          ┌─────────┐          ┌─────────┐
                   │ Phase 6 │          │ Phase 5 │          │(Parallel)│
                   │ Charts  │          │ Chatbot │          │   OK    │
                   └─────────┘          └─────────┘          └─────────┘

                   ┌─────────┐
                   │ Phase 3 │  ◀── DEFERRED (Optional)
                   │ Filings │      Not needed for segment data
                   └─────────┘      (FMP API provides segments)
```

**Key Insights:**
- **Phase 3 (SEC Filings) is now DEFERRED** - FMP API provides segment data directly
- **Phase 4 (Segments)** now uses FMP API instead of iXBRL parsing - much simpler!
- **Phase 5 & 6** can run in parallel after Phase 4 completes
- **Blocking dependencies:** 0→1→2→4 must be sequential, then 5 & 6 can parallelize
- **Significant simplification:** No need to download 17,500 filings or build XBRL parsers

---

## Executive Summary

### What We're Building

We are expanding **Fin Quote**, a financial data platform with an AI-powered chatbot, from supporting 2 stocks (Apple and Google) to supporting all **500 S&P 500 companies**. This expansion includes:

- **Complete financial data** for all 500 stocks (10 years annual, 7 years quarterly)
- **Business segment data** (product & geographic revenue) via FMP API for all companies
- **AI chatbot** capable of answering questions about any S&P 500 stock
- **Interactive charts** comparing financial metrics across any combination of stocks

> **Key Simplification:** SEC filing downloads and iXBRL parsing have been **deferred**. FMP's Segment API provides product and geographic revenue breakdowns directly, eliminating the need to download 17,500 filings or build custom XBRL parsers. This reduces implementation time significantly while still providing segment data for all S&P 500 companies.

### Why This Matters

Currently, users can only ask questions about Apple (AAPL) and view charts for Apple and Google (GOOGL). By expanding to the full S&P 500, we create a comprehensive financial research platform that can:

- Answer natural language questions about any major US company
- Compare financial performance across competitors
- Visualize trends in revenue, profits, and business segments

### Scope

| Metric | Current State | Target State |
|--------|---------------|--------------|
| Stocks supported | 2 (AAPL, GOOGL) | 500 (S&P 500) |
| Years of data | 10 years | 10 years annual, 7 years quarterly |
| SEC filings | ~20 (AAPL only) | DEFERRED (using FMP API for segments) |
| Segment data | AAPL + GOOGL | All 500 stocks (via FMP API) |
| Chatbot stocks | AAPL only | All 500 |
| Chart stocks | AAPL + GOOGL | All 500 |

### Estimated Implementation Time

| Phase | Description | Estimated Hours |
|-------|-------------|-----------------|
| Phase 0 | AAPL→GOOGL Migration | 4-6 hours |
| Phase 1 | S&P 500 Ticker Management | 6-8 hours |
| Phase 2 | Financial Data Ingestion | 8-12 hours |
| Phase 3 | SEC Filing Infrastructure | **DEFERRED** |
| Phase 4 | Segment Data (FMP API) | 6-8 hours |
| Phase 5 | Chatbot Multi-Stock | 10-15 hours |
| Phase 6 | Charts Multi-Stock | 8-12 hours |
| **Total** | | **~42-61 hours** |

> **Time Savings:** By deferring SEC filing infrastructure and using FMP API for segment data, we save approximately **17-33 hours** of implementation time (Phase 3 would have been 7-11 hours, and Phase 4 with iXBRL would have been 16-22 hours vs 6-8 hours with FMP API).

---

## Project Context

### What is Fin Quote?

Fin Quote is a **Next.js-based financial data platform** that combines:

1. **AI-Powered Chatbot**: Users ask natural language questions like "What was Apple's revenue in 2023?" or "How has iPhone revenue changed over time?" The system uses a two-step LLM architecture:
   - Step 1: An LLM selects the appropriate data-fetching tool based on the question
   - Step 2: The tool fetches data from our database
   - Step 3: Another LLM generates a grounded answer using only the fetched data
   - Step 4: Validators check the answer for accuracy

2. **Interactive Charting Platform**: Users can select stocks and metrics to visualize financial data over time. Supports:
   - Multiple metrics on one chart
   - Multi-stock comparison
   - Annual and quarterly data
   - Business segment breakdowns

### Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14 (App Router), React, Tailwind CSS |
| Backend | Next.js Server Actions, API Routes |
| Database | Supabase (PostgreSQL) |
| File Storage | Supabase Storage |
| LLM | OpenAI GPT-5-nano (tool selection), GPT-5-mini (answer generation) |
| Charts | Highcharts |
| Financial Data API | Financial Modeling Prep (FMP) |
| SEC Data | SEC EDGAR API |

### Database Schema Overview

**Core Tables:**

```
company
├── id (uuid)
├── symbol (text) - Stock ticker (e.g., "AAPL")
├── name (text) - Company name (e.g., "Apple Inc.")
├── sector (text) - GICS sector
└── cik (text) - SEC Central Index Key

financials_std
├── id (uuid)
├── symbol (text)
├── year (integer)
├── fiscal_quarter (integer, nullable) - NULL for annual, 1-4 for quarterly
├── period_type (text) - "annual" or "quarterly"
├── revenue (bigint)
├── gross_profit (bigint)
├── net_income (bigint)
├── operating_income (bigint)
├── total_assets (bigint)
├── total_liabilities (bigint)
├── shareholders_equity (bigint)
├── operating_cash_flow (bigint)
└── eps (numeric)

financial_metrics
├── id (uuid)
├── symbol (text)
├── year (integer)
├── period (text) - "FY", "Q1", "Q2", "Q3", "Q4"
├── metric_name (text) - e.g., "peRatio", "freeCashFlow"
└── metric_value (numeric)

company_metrics (segment data)
├── id (uuid)
├── symbol (text)
├── year (integer)
├── period (text)
├── metric_name (text) - e.g., "segment_revenue"
├── dimension_type (text) - e.g., "product", "geographic"
├── dimension_value (text) - e.g., "iPhone", "Americas"
└── metric_value (numeric)

filings
├── id (uuid)
├── symbol (text)
├── filing_type (text) - "10-K" or "10-Q"
├── filing_date (date)
├── fiscal_year (integer)
├── fiscal_quarter (integer, nullable)
├── accession_number (text) - SEC unique identifier
└── filing_url (text)

filing_chunks
├── id (uuid)
├── filing_id (uuid, FK)
├── chunk_index (integer)
├── content (text) - Chunk text (~500-1000 tokens)
├── section (text) - e.g., "Risk Factors", "MD&A"
└── token_count (integer)
```

### Current Data Flow

**For Chatbot Questions:**
```
User Question → Tool Selection LLM → Tool Execution → Data Fetch → Answer Generation LLM → Validation → Response
```

**For Charts:**
```
User Selects Metrics → Server Action → Database Query → Transform Data → Highcharts Render
```

---

## Current State Analysis

### What We Have (Working)

**Apple (AAPL):**
- ✅ 20 years of annual financial data (2005-2024)
- ✅ 7 years of quarterly financial data (2018-2024)
- ✅ 139 extended metrics (P/E ratio, ROE, etc.)
- ✅ Business segments (iPhone, Services, Mac, iPad, Wearables)
- ✅ Geographic segments (Americas, Europe, China, Japan, Asia Pacific)
- ✅ ~20 SEC filings downloaded and chunked
- ✅ Chatbot fully functional
- ✅ Charts fully functional

**Google/Alphabet (GOOGL):**
- ✅ Annual financial data
- ✅ Extended metrics
- ✅ Business segments (Google Services, Google Cloud, Other Bets)
- ✅ Product breakdown (Search, YouTube, Network, Subscriptions)
- ✅ Geographic segments (US, EMEA, Asia Pacific, Other Americas)
- ✅ Charts functional
- ❌ No SEC filings downloaded
- ❌ Chatbot does not support GOOGL questions

### What's Missing for Scale

1. **No automated data pipeline** - Currently running manual scripts for each stock
2. **No S&P 500 ticker list** - No table tracking which stocks to include
3. **Hardcoded stock references** - Some code assumes AAPL
4. **No progress tracking** - No way to track ingestion status across 500 stocks
5. **Limited error handling** - Scripts fail completely on single errors

> **Note:** CIK mappings and filing queue systems are no longer needed since we're using FMP API for segment data instead of downloading SEC filings.

### Code Files That Need Updates

| File | Current State | Required Changes |
|------|---------------|------------------|
| `app/actions/ask-question.ts` | AAPL-only prompts | Add dynamic stock context |
| `lib/tools.ts` | AAPL references in prompts | Parameterize stock |
| `app/charts/page.tsx` | 2-stock dropdown | Stock search/autocomplete |
| `components/Sidebar.tsx` | No stock selector | Add stock selector |
| `scripts/fetch-aapl-data.ts` | Single stock | Batch processing |
| `scripts/ingest-financials.ts` | Single stock | Queue-based ingestion |
| `scripts/ingest-segments.ts` | Does not exist | Create for FMP segment API |

> **Note:** Filing scripts (`fetch-sec-filings.ts`, `download-filings.ts`, `chunk-filings.ts`) are no longer needed for S&P 500 expansion since segment data comes from FMP API.

---

## Target State

### End User Experience

**Chatbot:**
- User selects any S&P 500 stock from a searchable dropdown
- Asks questions like "What was Microsoft's cloud revenue in 2023?"
- Gets accurate, grounded answers with data citations

**Charts:**
- User searches for any stock (autocomplete with 500 options)
- Selects up to 5 stocks for comparison
- Views any financial metric across companies
- Drills into business segments for any company

### Data Completeness

For each of the 500 S&P 500 stocks:
- 10 years of annual financial statements (2015-2024)
- 7 years of quarterly financial statements (2018-2024)
- 139 extended financial metrics
- Business and geographic segment revenue (via FMP API, where reported)

### Performance Targets

| Metric | Target |
|--------|--------|
| Financial data query | < 100ms |
| Chatbot response | < 5 seconds |
| Chart render | < 500ms |
| Stock autocomplete | < 50ms |

---

## Technical Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE                            │
├─────────────────────┬─────────────────────┬─────────────────────────┤
│     Chatbot UI      │     Charts UI       │    Stock Selector       │
│  (Sidebar.tsx)      │  (charts/page.tsx)  │  (StockSearch.tsx)      │
└─────────┬───────────┴──────────┬──────────┴────────────┬────────────┘
          │                      │                       │
          ▼                      ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SERVER ACTIONS                              │
├─────────────────────┬─────────────────────┬─────────────────────────┤
│  ask-question.ts    │  chart-metrics.ts   │  search-stocks.ts       │
│  (LLM Orchestration)│  (Data Fetching)    │  (Autocomplete)         │
└─────────┬───────────┴──────────┬──────────┴────────────┬────────────┘
          │                      │                       │
          ▼                      ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          SUPABASE                                   │
├──────────────────────────────────┬──────────────────────────────────┤
│          PostgreSQL              │        Supabase Storage          │
│        (Financial Data)          │    (Filing HTMLs + assets)       │
└──────────────────────────────────┴──────────────────────────────────┘
```

### Data Ingestion Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DATA INGESTION PIPELINE                         │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   S&P 500    │     │     FMP      │     │  SEC EDGAR   │
│  Ticker List │     │     API      │     │     API      │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                    INGESTION ORCHESTRATOR                        │
│  (scripts/ingest-sp500.ts)                                       │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │  Ticker    │  │ Financial  │  │  Filing    │  │  Segment   │ │
│  │  Manager   │→ │  Ingester  │→ │  Ingester  │→ │  Parser    │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘ │
└──────────────────────────────────────────────────────────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                         SUPABASE                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │sp500_const- │ │financials_  │ │  filings +  │ │ company_   │ │
│  │ituents     │ │std + metrics│ │filing_chunks│ │ metrics    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Rate Limiting Strategy

| API | Rate Limit | Our Strategy |
|-----|------------|--------------|
| FMP API | 300/min (paid) | 250/min with backoff |
| SEC EDGAR | 10/sec | 8/sec with retry |
| Supabase | 1,000/sec | No concern |

---

## Phase 0: Migration of Existing Data

### Objective

Ensure existing AAPL and GOOGL data is preserved and compatible with the new multi-stock architecture before adding 498 more stocks.

### Current Data Inventory

**Apple (AAPL):**
| Data Type | Table | Records | Status |
|-----------|-------|---------|--------|
| Annual financials | `financials_std` | ~20 years | ✅ Complete |
| Quarterly financials | `financials_std` | ~28 quarters | ✅ Complete |
| Extended metrics | `financial_metrics` | ~139 metrics × 10 years | ✅ Complete |
| Product segments | `company_metrics` | 5 segments × 7 years | ✅ Complete |
| Geographic segments | `company_metrics` | 5 regions × 7 years | ✅ Complete |
| SEC filings | `filings` | ~20 filings | ✅ Complete |
| Filing chunks | `filing_chunks` | ~2,000 chunks | ✅ Complete |

**Google (GOOGL):**
| Data Type | Table | Records | Status |
|-----------|-------|---------|--------|
| Annual financials | `financials_std` | ~10 years | ✅ Complete |
| Quarterly financials | `financials_std` | ~28 quarters | ✅ Complete |
| Extended metrics | `financial_metrics` | ~139 metrics × 10 years | ✅ Complete |
| Business segments | `company_metrics` | 3 segments × 5 years | ✅ Complete |
| Geographic segments | `company_metrics` | 4 regions × 5 years | ✅ Complete |
| SEC filings | `filings` | 0 | ❌ Not started |
| Filing chunks | `filing_chunks` | 0 | ❌ Not started |

### Migration Steps

#### Step 0.1: Backup Existing Data

Before any schema changes, create backups:

```bash
# Export existing data to JSON files
npx tsx scripts/migration/backup-existing-data.ts
```

**File:** `scripts/migration/backup-existing-data.ts`

```typescript
async function backupExistingData() {
  const tables = [
    'financials_std',
    'financial_metrics',
    'company_metrics',
    'filings',
    'filing_chunks',
    'company'
  ]

  for (const table of tables) {
    const { data } = await supabase
      .from(table)
      .select('*')
      .in('symbol', ['AAPL', 'GOOGL'])

    await writeFile(
      `data/backups/${table}-backup-${Date.now()}.json`,
      JSON.stringify(data, null, 2)
    )

    console.log(`Backed up ${data.length} rows from ${table}`)
  }
}
```

Output artifacts:
- `data/backups/financials_std-backup-*.json`
- `data/backups/financial_metrics-backup-*.json`
- `data/backups/company_metrics-backup-*.json`
- `data/backups/filings-backup-*.json`
- `data/backups/filing_chunks-backup-*.json`

#### Step 0.2: Verify Data Integrity

**File:** `scripts/migration/verify-existing-data.ts`

Check existing data before migration:

```typescript
async function verifyExistingData() {
  const checks = {
    aapl: {
      financials: await countRows('financials_std', 'AAPL'),
      metrics: await countRows('financial_metrics', 'AAPL'),
      segments: await countRows('company_metrics', 'AAPL'),
      filings: await countRows('filings', 'AAPL'),
    },
    googl: {
      financials: await countRows('financials_std', 'GOOGL'),
      metrics: await countRows('financial_metrics', 'GOOGL'),
      segments: await countRows('company_metrics', 'GOOGL'),
      filings: await countRows('filings', 'GOOGL'),
    }
  }

  // Verify no duplicates exist
  const duplicates = await findDuplicates()
  if (duplicates.length > 0) {
    console.error('Found duplicates that need resolution:', duplicates)
  }

  return checks
}

async function findDuplicates() {
  // Check for duplicate entries (same symbol + year + quarter)
  const { data } = await supabase.rpc('find_duplicate_financials')
  return data
}
```

SQL function to find duplicates:
```sql
CREATE OR REPLACE FUNCTION find_duplicate_financials()
RETURNS TABLE(symbol text, year int, fiscal_quarter int, count bigint)
AS $$
  SELECT symbol, year, fiscal_quarter, COUNT(*) as count
  FROM financials_std
  GROUP BY symbol, year, fiscal_quarter
  HAVING COUNT(*) > 1
$$ LANGUAGE sql;
```

#### Step 0.3: Add Missing Columns (if needed)

If any new columns are added in Phase 1-2, migrate existing data:

```sql
-- Example: If we add a 'data_source' column
ALTER TABLE financials_std ADD COLUMN IF NOT EXISTS data_source TEXT DEFAULT 'fmp';

-- Backfill existing data
UPDATE financials_std
SET data_source = 'fmp'
WHERE data_source IS NULL;
```

#### Step 0.4: Seed sp500_constituents with AAPL/GOOGL

When creating the `sp500_constituents` table in Phase 1, ensure AAPL and GOOGL are included with correct status:

```typescript
// In scripts/sp500/ingest-constituents.ts

async function ingestConstituents(constituents: Constituent[]) {
  // Mark AAPL and GOOGL as already having data
  for (const c of constituents) {
    const existingData = await checkExistingData(c.symbol)

    const dataStatus = {
      financials_std: {
        status: existingData.hasFinancials ? 'complete' : 'pending',
        last_updated: existingData.hasFinancials ? new Date().toISOString() : null,
      },
      financial_metrics: {
        status: existingData.hasMetrics ? 'complete' : 'pending',
      },
      filings: {
        status: existingData.hasFilings ? 'complete' : 'pending',
        '10k_count': existingData.filing10kCount,
        '10q_count': existingData.filing10qCount,
      },
      segments: {
        status: existingData.hasSegments ? 'complete' : 'pending',
      }
    }

    await upsertConstituent(c, dataStatus)
  }
}
```

#### Step 0.5: Deduplicate on Upsert

Ensure all ingestion scripts use upsert logic to handle re-runs:

```typescript
// In lib/ingestion/upsert.ts

async function upsertFinancials(rows: FinancialsRow[]) {
  // Use Supabase upsert with conflict resolution
  const { error } = await supabase
    .from('financials_std')
    .upsert(rows, {
      onConflict: 'symbol,year,fiscal_quarter',
      ignoreDuplicates: false, // Update existing rows
    })

  if (error) throw error
}
```

Add unique constraints if not present:
```sql
-- Ensure unique constraint exists
ALTER TABLE financials_std
ADD CONSTRAINT unique_financials_period
UNIQUE (symbol, year, fiscal_quarter);

ALTER TABLE financial_metrics
ADD CONSTRAINT unique_metrics_period
UNIQUE (symbol, year, period, metric_name);

ALTER TABLE company_metrics
ADD CONSTRAINT unique_company_metrics
UNIQUE (symbol, year, period, metric_name, dimension_type, dimension_value);
```

### Handling Edge Cases

| Scenario | Resolution |
|----------|------------|
| Existing AAPL data differs from fresh FMP fetch | Keep existing data, log discrepancy for review |
| Duplicate rows found | Keep most recent, delete older duplicates |
| New schema columns added | Backfill with defaults or computed values |
| AAPL/GOOGL not in S&P 500 list | Manually add (both are definitely in S&P 500) |

### Validation Checks

After Phase 0 completion, verify:
- [ ] Backup files exist for all tables
- [ ] No duplicate rows in any table
- [ ] AAPL has ~20 years annual data intact
- [ ] GOOGL has ~10 years annual data intact
- [ ] All segment data preserved
- [ ] Unique constraints added to prevent future duplicates

### Estimated Duration

| Task | Time |
|------|------|
| Write backup script | 1 hour |
| Run backups | 15 minutes |
| Write schema update migrations | 2 hours |
| Run verification queries | 30 minutes |
| Fix any issues found | 1-2 hours |
| **Total** | **~4-6 hours** |

> **Note:** Most time is spent on writing and testing scripts, not running them.

---

## Phase 1: S&P 500 Ticker Management

### Objective

Create and maintain an authoritative list of S&P 500 constituents, enabling systematic data ingestion for all stocks.

### Background

The S&P 500 index changes composition ~20-30 times per year as companies are added/removed. We need:
- Current list of all 500 tickers
- Metadata (sector, industry) for categorization
- Historical tracking of index changes

> **Note on CIK:** Since we're using FMP API for segment data (not SEC EDGAR), CIK mappings are **optional**. The schema includes a `cik` column for future SEC integration, but it's not required for MVP.

### Database Schema

**New Table: `sp500_constituents`**

```sql
CREATE TABLE sp500_constituents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cik TEXT, -- SEC Central Index Key (OPTIONAL - for future SEC integration)
  sector TEXT, -- GICS Sector (e.g., "Technology")
  sub_industry TEXT, -- GICS Sub-Industry (e.g., "Systems Software")
  headquarters_location TEXT,
  date_added DATE, -- When added to S&P 500
  date_removed DATE, -- NULL if current constituent
  is_active BOOLEAN DEFAULT true,
  data_status JSONB DEFAULT '{}', -- Track ingestion progress
  alternate_symbols JSONB DEFAULT '{}', -- Vendor-specific symbol mappings
  fiscal_year_end_month INTEGER, -- 1-12 (e.g., 9 for September = Apple)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX idx_sp500_symbol ON sp500_constituents(symbol);
CREATE INDEX idx_sp500_active ON sp500_constituents(is_active) WHERE is_active = true;
CREATE INDEX idx_sp500_cik ON sp500_constituents(cik);
```

**Historical Membership Scope:**

> **Important:** This plan seeds `sp500_constituents` with the **current** S&P 500 membership only. We do NOT backfill historical membership data (which stocks were in the index in 2015, 2018, etc.).
>
> - `date_added` will be NULL for most stocks (we don't have reliable historical data)
> - `date_removed` only gets populated if a stock leaves the index *after* we start tracking
> - Historical membership data requires expensive third-party sources (S&P Global, Bloomberg)
>
> This means: queries like "show me S&P 500 returns for 2018" would use today's constituents, not 2018's actual membership. This is a known limitation acceptable for MVP.

**alternate_symbols JSONB Structure:**

Handles ticker variations across different data vendors:

```json
{
  "fmp": "BRK-B",      // Financial Modeling Prep uses hyphen
  "sec": "BRK.B",      // SEC EDGAR uses dot
  "yahoo": "BRK-B",    // Yahoo Finance uses hyphen
  "ui": "BRK.B"        // Display in our UI
}
```

**Common symbol edge cases:**
| Canonical Symbol | FMP | SEC | Notes |
|------------------|-----|-----|-------|
| BRK.B | BRK-B | BRK.B | Berkshire Hathaway Class B |
| BF.B | BF-B | BF.B | Brown-Forman Class B |

**Helper function for symbol lookup:**
```typescript
function getSymbolForVendor(
  constituent: SP500Constituent,
  vendor: 'fmp' | 'sec' | 'yahoo' | 'ui'
): string {
  return constituent.alternate_symbols?.[vendor] || constituent.symbol
}
```

**data_status JSONB Structure:**
```json
{
  "financials_std": {
    "status": "complete", // "pending" | "in_progress" | "complete" | "error"
    "last_updated": "2024-01-15T10:30:00Z",
    "years_available": [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],
    "error_message": null
  },
  "financial_metrics": {
    "status": "complete",
    "last_updated": "2024-01-15T10:35:00Z"
  },
  "filings": {
    "status": "in_progress",
    "10k_count": 7,
    "10q_count": 20,
    "last_updated": "2024-01-15T11:00:00Z"
  },
  "segments": {
    "status": "pending",
    "segment_types": []
  }
}
```

### Implementation Steps

#### Step 1.1: Create Database Migration

**File:** `supabase/migrations/20260116000001_add_sp500_constituents.sql`

Create the migration file with:
- Table creation with all columns
- Indexes for performance
- Trigger for `updated_at` timestamp
- RLS policies (if using Supabase Auth)

#### Step 1.2: Fetch S&P 500 List from FMP API

**File:** `scripts/sp500/fetch-constituents.ts`

FMP provides an endpoint for S&P 500 constituents:
```
GET https://financialmodelingprep.com/api/v3/sp500_constituent?apikey={key}
```

Response includes:
- symbol
- name
- sector
- subSector
- headQuarter
- dateFirstAdded

Script should:
1. Fetch current S&P 500 list from FMP
2. Parse response into our schema format
3. Handle missing/null values gracefully
4. Output to JSON for review before database insert

#### Step 1.3: Fetch CIK Mappings from SEC (OPTIONAL)

> **This step is optional for MVP.** CIK mappings are only needed if/when we implement SEC EDGAR integration in the future. Skip this step for initial launch.

**File:** `scripts/sp500/fetch-cik-mappings.ts`

SEC provides a bulk file mapping tickers to CIKs:
```
GET https://www.sec.gov/files/company_tickers.json
```

Response format:
```json
{
  "0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."},
  "1": {"cik_str": 789019, "ticker": "MSFT", "title": "MICROSOFT CORP"}
}
```

Script should:
1. Download SEC ticker-CIK mapping file
2. Create lookup table from ticker to CIK
3. Match against our S&P 500 list
4. Zero-pad CIK to 10 digits (SEC requirement)
5. Log any tickers without CIK matches for manual resolution
6. Output merged data with CIKs

#### Step 1.4: Ingest to Database

**File:** `scripts/sp500/ingest-constituents.ts`

Script should:
1. Read merged JSON (tickers + CIKs)
2. Upsert to `sp500_constituents` table (update if exists, insert if new)
3. Mark removed companies as `is_active = false`
4. Initialize `data_status` JSONB for tracking
5. Log summary: X inserted, Y updated, Z marked inactive

#### Step 1.5: Create Constituent Update Script

**File:** `scripts/sp500/update-constituents.ts`

For quarterly updates when S&P 500 changes:
1. Fetch latest list from FMP
2. Compare against current database
3. Identify additions (new companies)
4. Identify removals (companies leaving index)
5. Update database accordingly
6. Trigger data ingestion for new additions
7. Generate report of changes

#### Step 1.6: Create Status Tracking Utilities

**File:** `lib/sp500/status.ts`

Utility functions:
- `getIngestionStatus(symbol)` - Get data status for one stock
- `getOverallProgress()` - Summary stats (X/500 complete)
- `getPendingStocks(dataType)` - Get stocks needing specific data
- `updateStatus(symbol, dataType, status)` - Update status after ingestion
- `getErroredStocks()` - Get stocks with ingestion errors

### Data Sources

| Source | URL | Data Provided |
|--------|-----|---------------|
| FMP S&P 500 List | `api/v3/sp500_constituent` | Tickers, names, sectors |
| SEC Company Tickers | `sec.gov/files/company_tickers.json` | CIK mappings |
| Wikipedia (backup) | S&P 500 companies list | Verification source |

### Validation Checks

After Phase 1 completion, verify:
- [ ] Exactly 500-505 active constituents (may include recent changes)
- [ ] All stocks have sector classification
- [ ] No duplicate symbols
- [ ] `data_status` initialized for all stocks
- [ ] *(Optional)* CIK populated if SEC integration planned

### Error Handling

| Error Scenario | Handling |
|----------------|----------|
| FMP API down | Retry 3x with exponential backoff, then fail with alert |
| Ticker not in SEC mapping | Log warning, allow NULL CIK, flag for manual resolution |
| Database connection lost | Retry with backoff, resume from checkpoint |
| Duplicate symbol conflict | Upsert (update existing record) |

### Output Artifacts

- `data/sp500-constituents.json` - Raw list for reference
- `data/sp500-with-cik.json` - Merged list with CIKs
- Database table populated with 500 records
- Status tracking initialized

### Estimated Duration

- Development: 4-6 hours
- Execution: < 5 minutes
- Manual verification: 1 hour

---

## Phase 2: Financial Data Ingestion

### Objective

Populate `financials_std` and `financial_metrics` tables with complete financial history for all 500 S&P 500 stocks.

### Background

Currently, we fetch financial data using the Financial Modeling Prep (FMP) API. The existing scripts work for single stocks but need to be enhanced for batch processing with:
- Queue-based processing
- Progress tracking
- Error recovery
- Rate limit compliance

### Data Requirements

For each stock:

| Data Type | Source Table | Time Range | Frequency |
|-----------|--------------|------------|-----------|
| Income Statement | `financials_std` | 2015-2024 | Annual |
| Balance Sheet | `financials_std` | 2015-2024 | Annual |
| Cash Flow Statement | `financials_std` | 2015-2024 | Annual |
| Income Statement | `financials_std` | 2018-2024 | Quarterly |
| Balance Sheet | `financials_std` | 2018-2024 | Quarterly |
| Cash Flow Statement | `financials_std` | 2018-2024 | Quarterly |
| Key Metrics | `financial_metrics` | 2015-2024 | Annual |
| Key Metrics | `financial_metrics` | 2018-2024 | Quarterly |

### FMP API Endpoints

```
# Income Statement (Annual)
GET /api/v3/income-statement/{symbol}?limit=10&apikey={key}

# Income Statement (Quarterly)
GET /api/v3/income-statement/{symbol}?period=quarter&limit=40&apikey={key}

# Balance Sheet (Annual)
GET /api/v3/balance-sheet-statement/{symbol}?limit=10&apikey={key}

# Balance Sheet (Quarterly)
GET /api/v3/balance-sheet-statement/{symbol}?period=quarter&limit=40&apikey={key}

# Cash Flow Statement (Annual)
GET /api/v3/cash-flow-statement/{symbol}?limit=10&apikey={key}

# Cash Flow Statement (Quarterly)
GET /api/v3/cash-flow-statement/{symbol}?period=quarter&limit=40&apikey={key}

# Key Metrics (Annual)
GET /api/v3/key-metrics/{symbol}?limit=10&apikey={key}

# Key Metrics (Quarterly)
GET /api/v3/key-metrics/{symbol}?period=quarter&limit=40&apikey={key}
```

### API Call Estimation: Per-Symbol vs Bulk

#### Option A: Per-Symbol Fetching (Current Approach)

| Endpoint | Calls per Stock | Total Calls (500 stocks) |
|----------|-----------------|--------------------------|
| Income Statement (A) | 1 | 500 |
| Income Statement (Q) | 1 | 500 |
| Balance Sheet (A) | 1 | 500 |
| Balance Sheet (Q) | 1 | 500 |
| Cash Flow (A) | 1 | 500 |
| Cash Flow (Q) | 1 | 500 |
| Key Metrics (A) | 1 | 500 |
| Key Metrics (Q) | 1 | 500 |
| **Total** | **8** | **4,000** |

At 250 requests/minute (safe margin below 300 limit): **~16 minutes** total

**Problems with per-symbol approach:**
- 4,000 API calls for initial load
- Easy to hit daily rate limits on lower FMP tiers
- Fragile: partial failures require tracking which symbols succeeded/failed
- Slow: network overhead of 4,000 HTTP requests

#### Option B: FMP Bulk API (Recommended)

FMP provides bulk endpoints that return data for **ALL companies in a single request**:

```
# Bulk Income Statement (all companies for one year)
GET /api/v3/income-statement-bulk?year=2023&period=annual&apikey={key}

# Bulk Balance Sheet
GET /api/v3/balance-sheet-statement-bulk?year=2023&period=annual&apikey={key}

# Bulk Cash Flow
GET /api/v3/cash-flow-statement-bulk?year=2023&period=annual&apikey={key}

# Bulk Key Metrics
GET /api/v3/key-metrics-bulk?year=2023&period=annual&apikey={key}
```

**Bulk API Call Estimation:**

| Data Type | Years | Periods | API Calls |
|-----------|-------|---------|-----------|
| Income Statement | 10 | 2 (A+Q) | 20 |
| Balance Sheet | 10 | 2 (A+Q) | 20 |
| Cash Flow | 10 | 2 (A+Q) | 20 |
| Key Metrics | 10 | 2 (A+Q) | 20 |
| **Total** | | | **80** |

**Comparison:**

| Approach | API Calls | Time | Reliability |
|----------|-----------|------|-------------|
| Per-Symbol | 4,000 | ~16 min | Fragile (partial failures) |
| Bulk | 80 | ~2 min | Robust (all-or-nothing per year) |

**Bulk API reduces calls by 50x.**

#### Bulk API Implementation

**Step 2.0: Verify Bulk API Access**

> **Important:** Bulk endpoints may require FMP Premium tier ($49/month) or higher. Before implementing, verify access:

```bash
# Test bulk endpoint access
curl "https://financialmodelingprep.com/api/v3/income-statement-bulk?year=2023&period=annual&apikey=$FMP_API_KEY" | head -c 500
```

If you get data, bulk is available. If you get an error about tier/subscription, fall back to per-symbol approach.

**File:** `scripts/fetch-financials-bulk.ts`

```typescript
// Bulk API fetcher - gets ALL companies for a given year
async function fetchBulkFinancials(year: number, period: 'annual' | 'quarter') {
  const endpoints = [
    `income-statement-bulk?year=${year}&period=${period}`,
    `balance-sheet-statement-bulk?year=${year}&period=${period}`,
    `cash-flow-statement-bulk?year=${year}&period=${period}`,
  ]

  const results: Record<string, any[]> = {}

  for (const endpoint of endpoints) {
    const url = `${FMP_BASE_URL}/${endpoint}&apikey=${FMP_API_KEY}`
    const response = await fetch(url)
    const data = await response.json()

    // Filter to only S&P 500 symbols
    const sp500Symbols = await getSP500Symbols()
    const filtered = data.filter((row: any) => sp500Symbols.includes(row.symbol))

    results[endpoint.split('?')[0]] = filtered
    console.log(`${endpoint}: ${data.length} total, ${filtered.length} S&P 500`)

    // Small delay between bulk requests
    await sleep(1000)
  }

  return results
}

// Main ingestion using bulk API
async function ingestAllFinancials() {
  const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]

  for (const year of years) {
    console.log(`\n=== Processing ${year} Annual ===`)
    const annualData = await fetchBulkFinancials(year, 'annual')
    await upsertFinancials(annualData, 'annual')

    if (year >= 2018) {
      console.log(`\n=== Processing ${year} Quarterly ===`)
      const quarterlyData = await fetchBulkFinancials(year, 'quarter')
      await upsertFinancials(quarterlyData, 'quarterly')
    }
  }

  console.log('\n✅ Bulk ingestion complete!')
}
```

**Fallback Strategy:**

If bulk API is not available on current FMP tier:
1. Use per-symbol approach (Option A) with queue-based processing
2. Consider upgrading FMP tier if doing frequent full refreshes
3. Bulk API is most valuable for initial load; incremental updates can use per-symbol

### Implementation Steps

#### Step 2.1: Create Ingestion Queue Table

**File:** `supabase/migrations/20260116000002_add_ingestion_queue.sql`

```sql
CREATE TABLE ingestion_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol TEXT NOT NULL,
  task_type TEXT NOT NULL, -- 'financials_annual', 'financials_quarterly', 'metrics_annual', etc.
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'complete', 'error'
  priority INTEGER DEFAULT 0, -- Higher = process first
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(symbol, task_type)
);

CREATE INDEX idx_queue_status ON ingestion_queue(status, priority DESC);
CREATE INDEX idx_queue_symbol ON ingestion_queue(symbol);
```

#### Step 2.2: Create Queue Management Utilities

**File:** `lib/ingestion/queue.ts`

Functions:
- `initializeQueue(taskType)` - Create queue entries for all S&P 500 stocks
- `getNextBatch(taskType, batchSize)` - Get next N pending tasks
- `markInProgress(taskIds)` - Update status to in_progress
- `markComplete(taskId)` - Update status to complete
- `markError(taskId, errorMessage)` - Update with error, increment attempts
- `resetStuckTasks()` - Reset tasks stuck in_progress for > 10 minutes
- `getQueueStats()` - Return counts by status

#### Step 2.3: Create FMP API Client with Rate Limiting

**File:** `lib/fmp/client.ts`

Features:
- Rate limiter (250 requests/minute)
- Automatic retry with exponential backoff
- Request logging
- Error classification (rate limit vs API error vs network)
- Response caching (optional, for development)

```typescript
interface FMPClientConfig {
  apiKey: string
  requestsPerMinute: number
  maxRetries: number
  baseDelay: number // milliseconds
}

class FMPClient {
  // Rate-limited fetch
  async fetch<T>(endpoint: string): Promise<T>

  // Specific data fetchers
  async getIncomeStatement(symbol: string, period: 'annual' | 'quarter'): Promise<IncomeStatement[]>
  async getBalanceSheet(symbol: string, period: 'annual' | 'quarter'): Promise<BalanceSheet[]>
  async getCashFlow(symbol: string, period: 'annual' | 'quarter'): Promise<CashFlow[]>
  async getKeyMetrics(symbol: string, period: 'annual' | 'quarter'): Promise<KeyMetrics[]>
}
```

#### Step 2.4: Create Financial Data Transformer

**File:** `lib/ingestion/transform-financials.ts`

Transform FMP response to our database schema:

```typescript
// Transform FMP income statement to our schema
function transformIncomeStatement(
  symbol: string,
  data: FMPIncomeStatement[],
  periodType: 'annual' | 'quarterly'
): FinancialsStdRow[]

// Transform FMP balance sheet to our schema
function transformBalanceSheet(
  symbol: string,
  data: FMPBalanceSheet[],
  periodType: 'annual' | 'quarterly'
): FinancialsStdRow[]

// Transform FMP cash flow to our schema
function transformCashFlow(
  symbol: string,
  data: FMPCashFlow[],
  periodType: 'annual' | 'quarterly'
): FinancialsStdRow[]

// Transform FMP key metrics to our schema
function transformKeyMetrics(
  symbol: string,
  data: FMPKeyMetrics[],
  periodType: 'annual' | 'quarterly'
): FinancialMetricsRow[]
```

#### Step 2.5: Create Batch Ingestion Worker

**File:** `scripts/ingest-financials-batch.ts`

Main ingestion script:

```typescript
// Configuration
const BATCH_SIZE = 10 // Process 10 stocks at a time
const CONCURRENCY = 5 // Parallel API calls within batch

async function runIngestion() {
  // 1. Get pending tasks from queue
  // 2. For each batch:
  //    a. Mark tasks as in_progress
  //    b. Fetch data from FMP (parallel within rate limit)
  //    c. Transform to our schema
  //    d. Upsert to database
  //    e. Mark tasks as complete (or error)
  //    f. Update sp500_constituents.data_status
  // 3. Log progress
  // 4. Repeat until queue empty
}
```

#### Step 2.6: Create Data Validation Utilities

**File:** `lib/ingestion/validate-financials.ts`

Validation checks:
- `validateCompleteness(symbol)` - Check all years present
- `validateConsistency(symbol)` - Check balance sheet balances
- `validateReasonableness(symbol)` - Check for outliers/anomalies
- `generateValidationReport()` - Summary of data quality

Specific checks:
- Revenue > 0 for all years
- Total Assets = Total Liabilities + Shareholders' Equity
- No duplicate year/quarter entries
- Years in expected range (2015-2024)
- Quarters 1-4 for quarterly data

#### TTM (Trailing Twelve Months) Completeness Validation

TTM calculations require **4 contiguous quarters** of data. If any quarter is missing, the TTM value would be mathematically invalid.

**File:** `lib/validation/ttm-completeness.ts`

```typescript
interface TTMValidationResult {
  symbol: string
  canCalculateTTM: boolean
  latestCompleteDate: string | null  // e.g., "2024-Q3"
  missingQuarters: string[]          // e.g., ["2024-Q4"]
  reason?: string
}

// Check if we have 4 contiguous quarters for TTM calculation
function validateTTMCompleteness(
  symbol: string,
  quarterlyData: QuarterlyRecord[]
): TTMValidationResult {
  // Sort by date descending
  const sorted = quarterlyData.sort((a, b) =>
    new Date(b.periodEndDate).getTime() - new Date(a.periodEndDate).getTime()
  )

  // Get the 4 most recent quarters
  const recentFour = sorted.slice(0, 4)

  // Check if we have exactly 4 quarters
  if (recentFour.length < 4) {
    return {
      symbol,
      canCalculateTTM: false,
      latestCompleteDate: null,
      missingQuarters: [`Need ${4 - recentFour.length} more quarters`],
      reason: 'insufficient_data'
    }
  }

  // Check contiguity (each quarter should be ~90 days apart)
  const gaps: string[] = []
  for (let i = 0; i < recentFour.length - 1; i++) {
    const current = new Date(recentFour[i].periodEndDate)
    const previous = new Date(recentFour[i + 1].periodEndDate)
    const daysDiff = (current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24)

    // Allow 80-100 days between quarters (some variance for fiscal calendars)
    if (daysDiff < 80 || daysDiff > 120) {
      gaps.push(`Gap between ${recentFour[i].period} and ${recentFour[i + 1].period}: ${Math.round(daysDiff)} days`)
    }
  }

  if (gaps.length > 0) {
    return {
      symbol,
      canCalculateTTM: false,
      latestCompleteDate: null,
      missingQuarters: gaps,
      reason: 'non_contiguous_quarters'
    }
  }

  return {
    symbol,
    canCalculateTTM: true,
    latestCompleteDate: `${recentFour[0].year}-Q${recentFour[0].fiscalQuarter}`,
    missingQuarters: []
  }
}

// Batch validate all stocks for TTM readiness
async function validateAllTTMCompleteness(): Promise<{
  ready: string[]
  notReady: TTMValidationResult[]
}> {
  const sp500 = await getSP500Symbols()
  const ready: string[] = []
  const notReady: TTMValidationResult[] = []

  for (const symbol of sp500) {
    const quarterlyData = await getQuarterlyData(symbol)
    const result = validateTTMCompleteness(symbol, quarterlyData)

    if (result.canCalculateTTM) {
      ready.push(symbol)
    } else {
      notReady.push(result)
    }
  }

  console.log(`TTM Readiness: ${ready.length}/${sp500.length} stocks (${Math.round(ready.length/sp500.length*100)}%)`)

  return { ready, notReady }
}
```

**UI Handling for TTM:**

When TTM data is unavailable for a stock:
- Hide TTM toggle/option for that stock
- Show tooltip: "TTM unavailable - missing Q4 2024 data"
- Fall back to annual data display

```typescript
// In chart-metrics.ts
async function getMetricsWithTTMCheck(symbol: string, period: 'annual' | 'quarterly' | 'ttm') {
  if (period === 'ttm') {
    const ttmCheck = await validateTTMCompleteness(symbol, await getQuarterlyData(symbol))

    if (!ttmCheck.canCalculateTTM) {
      // Return annual data with warning instead of invalid TTM
      return {
        data: await getAnnualData(symbol),
        warning: `TTM unavailable for ${symbol}: ${ttmCheck.reason}`,
        fallbackPeriod: 'annual'
      }
    }
  }

  // ... proceed with normal data fetch
}
```

#### Step 2.7: Create Progress Dashboard (CLI)

**File:** `scripts/ingestion-status.ts`

Display:
```
S&P 500 Financial Data Ingestion Status
========================================
Financials (Annual):   485/500 complete (97%)  ████████████████████░░
Financials (Quarterly): 420/500 complete (84%)  ████████████████░░░░░░
Key Metrics (Annual):  500/500 complete (100%) ██████████████████████
Key Metrics (Quarterly): 380/500 complete (76%) ███████████████░░░░░░░

Errors: 3 stocks with failures
  - BRK.B: API returned 404 (use BRK-B instead)
  - GOOGL: Rate limit exceeded (will retry)
  - META: Missing Q4 2024 data (not yet reported)

Estimated time remaining: 12 minutes
```

#### Step 2.8: Create Incremental Update Script

**File:** `scripts/update-financials.ts`

For ongoing updates (run daily/weekly):
1. Check which stocks have new quarters available
2. Fetch only new data (not full history)
3. Upsert new records
4. Update `data_status.last_updated`

### Data Mapping Reference

**FMP Income Statement → financials_std:**
| FMP Field | Our Field |
|-----------|-----------|
| revenue | revenue |
| grossProfit | gross_profit |
| netIncome | net_income |
| operatingIncome | operating_income |
| eps | eps |

**FMP Balance Sheet → financials_std:**
| FMP Field | Our Field |
|-----------|-----------|
| totalAssets | total_assets |
| totalLiabilities | total_liabilities |
| totalStockholdersEquity | shareholders_equity |

**FMP Cash Flow → financials_std:**
| FMP Field | Our Field |
|-----------|-----------|
| operatingCashFlow | operating_cash_flow |

**FMP Key Metrics → financial_metrics:**
| FMP Field | Our metric_name |
|-----------|-----------------|
| peRatio | peRatio |
| pbRatio | pbRatio |
| debtToEquity | debtToEquity |
| returnOnEquity | returnOnEquity |
| freeCashFlow | freeCashFlow |
| ... (139 metrics total) | ... |

### Error Handling

| Error Type | Detection | Response |
|------------|-----------|----------|
| Rate limit (429) | HTTP status | Pause 60s, retry |
| Not found (404) | HTTP status | Try alternate symbol (BRK.B → BRK-B) |
| Invalid data | Validation fails | Log warning, skip record |
| Network timeout | Request timeout | Retry 3x with backoff |
| Database error | Insert fails | Retry, then mark task as error |

### Symbol Edge Cases

Some stocks have non-standard symbols:
| Standard Symbol | FMP Symbol | Notes |
|----------------|------------|-------|
| BRK.B | BRK-B | Berkshire Hathaway Class B |
| BF.B | BF-B | Brown-Forman Class B |

Create a symbol mapping table for these cases.

### Validation Checks

After Phase 2 completion, verify:
- [ ] 500 stocks have annual data (2015-2024)
- [ ] 500 stocks have quarterly data (2018-2024)
- [ ] No duplicate entries (symbol + year + quarter)
- [ ] All required fields populated (no NULL revenue, etc.)
- [ ] Data passes consistency checks
- [ ] `sp500_constituents.data_status` updated for all stocks

### Rollback & Recovery Procedures

If bad data is ingested or ingestion fails partway through:

#### Scenario 1: Corrupted Data for Specific Stocks

**File:** `scripts/rollback/rollback-financials.ts`

```typescript
async function rollbackFinancials(options: {
  symbols: string[]           // Stocks to rollback
  afterDate: string          // Delete records updated after this date
  dataTypes: ('annual' | 'quarterly')[]
  dryRun?: boolean           // Preview deletions without executing
}) {
  console.log(`Rollback: ${options.symbols.length} symbols, after ${options.afterDate}`)

  for (const symbol of options.symbols) {
    // Find records to delete
    const toDelete = await supabase
      .from('financials_std')
      .select('id, symbol, year, fiscal_quarter, updated_at')
      .eq('symbol', symbol)
      .gte('updated_at', options.afterDate)

    console.log(`${symbol}: ${toDelete.data?.length || 0} records to delete`)

    if (options.dryRun) continue

    // Delete records
    await supabase
      .from('financials_std')
      .delete()
      .eq('symbol', symbol)
      .gte('updated_at', options.afterDate)

    // Reset ingestion status
    await updateDataStatus(symbol, 'financials_std', {
      status: 'pending',
      error_message: `Rolled back on ${new Date().toISOString()}`,
    })
  }
}
```

**Usage:**
```bash
# Preview what would be deleted
npx tsx scripts/rollback/rollback-financials.ts --symbols MSFT,AAPL --after 2026-01-15 --dry-run

# Execute rollback
npx tsx scripts/rollback/rollback-financials.ts --symbols MSFT,AAPL --after 2026-01-15
```

#### Scenario 2: Full Phase 2 Restart

If the entire Phase 2 ingestion needs to be re-run:

```bash
# 1. Export current state for comparison
npx tsx scripts/migration/backup-existing-data.ts

# 2. Clear all financial data (DANGEROUS - requires confirmation)
npx tsx scripts/rollback/clear-financials.ts --confirm-delete-all

# 3. Reset all ingestion statuses
npx tsx scripts/rollback/reset-ingestion-status.ts --data-type financials_std

# 4. Re-run ingestion
npx tsx scripts/ingest-financials-batch.ts
```

#### Scenario 3: Restore from Backup

If backups exist from Phase 0:

```typescript
// scripts/rollback/restore-from-backup.ts
async function restoreFromBackup(options: {
  backupFile: string  // e.g., 'data/backups/financials_std-backup-1705123456.json'
  symbols?: string[]  // Optional: restore only specific symbols
}) {
  const backup = JSON.parse(readFileSync(options.backupFile, 'utf-8'))

  const toRestore = options.symbols
    ? backup.filter((r: any) => options.symbols.includes(r.symbol))
    : backup

  // Use upsert to restore without duplicates
  await supabase
    .from('financials_std')
    .upsert(toRestore, { onConflict: 'symbol,year,fiscal_quarter' })

  console.log(`Restored ${toRestore.length} records from backup`)
}
```

#### Logging for Audit Trail

All ingestion and rollback operations should be logged:

```sql
CREATE TABLE ingestion_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Operation type (canonical values)
  operation TEXT NOT NULL CHECK (operation IN (
    'ingest',           -- Normal data ingestion
    'ingest_incremental', -- Incremental update (new data only)
    'rollback',         -- Undo a previous ingestion
    'restore',          -- Restore from backup
    'delete'            -- Manual deletion
  )),

  -- Data type (canonical values)
  data_type TEXT NOT NULL CHECK (data_type IN (
    'financials_std',    -- Core financial metrics (9 metrics)
    'financial_metrics', -- Extended metrics (139 metrics from FMP)
    'filings',           -- SEC filing metadata
    'filing_chunks',     -- Chunked filing text
    'company_metrics',   -- Segment data
    'sp500_constituents' -- Ticker list updates
  )),

  -- Scope
  symbols TEXT[],              -- Affected symbols (NULL = all)
  record_count INTEGER,        -- Records affected

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,    -- NULL if still running or failed
  duration_ms INTEGER,         -- Computed on completion

  -- Status
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
    'running', 'completed', 'failed', 'cancelled'
  )),
  error_message TEXT,          -- Populated on failure

  -- Context
  user_info TEXT,              -- Who ran it (hostname, user, or 'github-actions')
  script_name TEXT,            -- e.g., 'ingest-financials-batch.ts'
  git_commit TEXT,             -- Optional: commit hash for reproducibility

  -- Metrics (for monitoring)
  api_calls_made INTEGER,      -- Track rate limit usage
  records_created INTEGER,
  records_updated INTEGER,
  records_skipped INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying recent jobs by data_type
CREATE INDEX idx_ingestion_logs_data_type ON ingestion_logs(data_type, started_at DESC);
```

**Canonical Values Reference:**

| Field | Valid Values |
|-------|--------------|
| `operation` | `ingest`, `ingest_incremental`, `rollback`, `restore`, `delete` |
| `data_type` | `financials_std`, `financial_metrics`, `filings`, `filing_chunks`, `company_metrics`, `sp500_constituents` |
| `status` | `running`, `completed`, `failed`, `cancelled` |

**Key Principles:**
- Always backup before bulk operations
- Use dry-run mode to preview changes
- Log all modifications for audit trail
- Test rollback procedures before needing them

### Estimated Duration

- Development: 8-10 hours
- Execution: ~30 minutes (with rate limiting)
- Validation: 1-2 hours

---

## Phase 3: SEC Filing Infrastructure (DEFERRED)

> **STATUS: DEFERRED** - This phase is no longer required for the S&P 500 expansion.
>
> **Reason:** FMP's Segment API (`/stable/revenue-product-segmentation` and `/stable/revenue-geographic-segmentation`) provides product and geographic revenue breakdowns directly, eliminating the need to:
> - Download 17,500+ SEC filings (~30GB storage)
> - Build iXBRL/XBRL parsing infrastructure
> - Maintain filing chunking pipelines
>
> **What we gain by deferring:**
> - ~7-11 hours of pipeline execution time saved
> - ~$7.50/month in Supabase Storage costs saved
> - No need to maintain SEC EDGAR rate limiting code
> - No need to handle filing format variations across 500 companies
>
> **What we lose:**
> - Operating income by segment (not available via FMP)
> - Cost of sales breakdown (products vs services)
> - Country-level revenue (US, China specifically)
> - Long-lived assets by country
> - Access to raw filing text (MD&A, Risk Factors, etc.)
>
> **Reconsider this phase when:**
> - Users request operating income by segment analysis
> - Semantic search over filings (RAG) becomes a priority
> - Regulatory compliance requires archived filings

### Original Scope (Preserved for Reference)

If this phase is re-activated in the future, the original plan involved:

| Task | Effort | Complexity |
|------|--------|------------|
| Filing discovery (SEC EDGAR API) | 1-2 hours | Medium |
| Filing download (17,500 files) | 4-6 hours | High (rate limits) |
| Filing chunking | 2-3 hours | Medium |
| Storage management (~30GB) | Ongoing | Low |
| **Total** | **7-11 hours** | **High** |

The detailed implementation (EDGAR client, chunking scripts, pipeline orchestrator) has been moved to:
**`docs/archive/PHASE_3_SEC_FILINGS_DETAILED.md`** (to be created if needed)

---

## Phase 4: Segment Data Ingestion (FMP API)

### Objective

Ingest business segment and geographic segment revenue data from FMP's pre-parsed Segment API for all 500 S&P 500 stocks.

### Background

**Major Simplification:** Instead of downloading SEC filings and building complex iXBRL/XBRL parsers, we use FMP's Segment API endpoints that provide pre-parsed, normalized segment data.

**What we get from FMP:**
- Product/Business segment revenue (iPhone, Services, Cloud, etc.)
- Geographic segment revenue (Americas, Europe, Asia-Pacific, etc.)

**What we don't get (acceptable trade-off):**
- Operating income by segment
- Cost breakdown by segment
- Country-level revenue detail (US, China specifically)

Current segment coverage:
- AAPL: 5 product segments, 4-5 geographic regions
- GOOGL: 3 business segments, 4 geographic regions

Target: Segment revenue data for all 500 stocks where FMP provides it.

### Segment Data Types

| Type | Description | Example (Apple) |
|------|-------------|-----------------|
| Product/Business | Revenue by product line or business unit | iPhone, Services, Mac |
| Geographic | Revenue by region | Americas, Europe, Greater China |

### Data Source: FMP Segment API

FMP provides pre-parsed segment data via two endpoints:

```
# Product/Business Segment Revenue
GET /stable/revenue-product-segmentation?symbol={SYMBOL}&apikey={key}

# Geographic Segment Revenue
GET /stable/revenue-geographic-segmentation?symbol={SYMBOL}&apikey={key}
```

**Sample Response (AAPL product segments):**
```json
[
  {
    "date": "2024-09-28",
    "symbol": "AAPL",
    "iPhone": 201183000000,
    "Mac": 29984000000,
    "iPad": 26694000000,
    "Wearables, Home and Accessories": 37005000000,
    "Services": 96169000000
  },
  {
    "date": "2023-09-30",
    "symbol": "AAPL",
    "iPhone": 200583000000,
    ...
  }
]
```

**Sample Response (AAPL geographic segments):**
```json
[
  {
    "date": "2024-09-28",
    "symbol": "AAPL",
    "Americas": 167045000000,
    "Europe": 101325000000,
    "Greater China": 66672000000,
    "Japan": 25052000000,
    "Rest of Asia Pacific": 30941000000
  }
]
```

### API Cost Analysis

FMP segment endpoints count against your API quota:
- 500 stocks × 2 endpoints (product + geographic) = **1,000 API calls**
- One-time initial load, then annual refresh
- Much cheaper than building/maintaining iXBRL parsing infrastructure

### Implementation Steps

#### Step 4.1: Create Segment Data Types

**File:** `types/segments.ts`

```typescript
interface SegmentData {
  symbol: string
  year: number
  period: string           // 'FY' (annual only from FMP)
  metricName: string       // 'segment_revenue'
  dimensionType: string    // 'product' | 'geographic'
  dimensionValue: string   // 'iPhone', 'Americas', etc.
  value: number            // In actual dollars (FMP provides normalized values)
  dataSource: string       // 'fmp_api'
  createdAt: Date
  updatedAt: Date
}

interface SegmentIngestionResult {
  symbol: string
  productSegments: number  // Count of product segments found
  geoSegments: number      // Count of geographic segments found
  years: number[]          // Years with data
  status: 'success' | 'no_data' | 'error'
  errorMessage?: string
}
```

#### Step 4.2: Create FMP Segment Fetcher

**File:** `lib/segments/fmp-fetcher.ts`

```typescript
const FMP_BASE_URL = 'https://financialmodelingprep.com/stable'

async function fetchFMPSegments(symbol: string): Promise<SegmentData[]> {
  const results: SegmentData[] = []

  // Fetch product segments
  const productUrl = `${FMP_BASE_URL}/revenue-product-segmentation?symbol=${symbol}&apikey=${FMP_API_KEY}`
  const productResponse = await fetch(productUrl)

  if (!productResponse.ok) {
    console.warn(`${symbol}: Product segment API returned ${productResponse.status}`)
  } else {
    const productData = await productResponse.json()

    for (const row of productData) {
      const year = new Date(row.date).getFullYear()
      // Extract segment names (all keys except date, symbol)
      const segmentKeys = Object.keys(row).filter(k => !['date', 'symbol'].includes(k))

      for (const segmentName of segmentKeys) {
        if (row[segmentName] !== null && row[segmentName] !== 0) {
          results.push({
            symbol,
            year,
            period: 'FY',
            metricName: 'segment_revenue',
            dimensionType: 'product',
            dimensionValue: segmentName,
            value: row[segmentName],
            dataSource: 'fmp_api',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        }
      }
    }
  }

  // Fetch geographic segments
  const geoUrl = `${FMP_BASE_URL}/revenue-geographic-segmentation?symbol=${symbol}&apikey=${FMP_API_KEY}`
  const geoResponse = await fetch(geoUrl)

  if (!geoResponse.ok) {
    console.warn(`${symbol}: Geographic segment API returned ${geoResponse.status}`)
  } else {
    const geoData = await geoResponse.json()

    for (const row of geoData) {
      const year = new Date(row.date).getFullYear()
      const segmentKeys = Object.keys(row).filter(k => !['date', 'symbol'].includes(k))

      for (const segmentName of segmentKeys) {
        if (row[segmentName] !== null && row[segmentName] !== 0) {
          results.push({
            symbol,
            year,
            period: 'FY',
            metricName: 'segment_revenue',
            dimensionType: 'geographic',
            dimensionValue: segmentName,
            value: row[segmentName],
            dataSource: 'fmp_api',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        }
      }
    }
  }

  return results
}
```

#### Step 4.3: Create Segment Ingestion Script

**File:** `scripts/ingest-segments.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { fetchFMPSegments } from '../lib/segments/fmp-fetcher'

const BATCH_SIZE = 50  // Process 50 stocks per batch
const DELAY_MS = 1000  // 1 second delay between batches (rate limiting)

async function ingestAllSegments() {
  console.log('Starting segment data ingestion from FMP API...')

  // Get all S&P 500 stocks
  const { data: stocks, error } = await supabase
    .from('company')
    .select('symbol, name')
    .order('symbol')

  if (error) throw error

  const results: SegmentIngestionResult[] = []
  let totalProductSegments = 0
  let totalGeoSegments = 0
  let companiesWithData = 0

  // Process in batches
  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE)
    console.log(`\nProcessing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(stocks.length / BATCH_SIZE)}`)

    for (const stock of batch) {
      try {
        const segments = await fetchFMPSegments(stock.symbol)

        if (segments.length === 0) {
          results.push({
            symbol: stock.symbol,
            productSegments: 0,
            geoSegments: 0,
            years: [],
            status: 'no_data',
          })
          console.log(`  ${stock.symbol}: No segment data available`)
          continue
        }

        // Upsert segments to database
        const { error: upsertError } = await supabase
          .from('company_metrics')
          .upsert(
            segments.map(s => ({
              symbol: s.symbol,
              year: s.year,
              period: s.period,
              metric_name: s.metricName,
              dimension_type: s.dimensionType,
              dimension_value: s.dimensionValue,
              metric_value: s.value,
              data_source: s.dataSource,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'symbol,year,period,metric_name,dimension_type,dimension_value' }
          )

        if (upsertError) throw upsertError

        const productCount = segments.filter(s => s.dimensionType === 'product').length
        const geoCount = segments.filter(s => s.dimensionType === 'geographic').length
        const years = [...new Set(segments.map(s => s.year))].sort()

        results.push({
          symbol: stock.symbol,
          productSegments: productCount,
          geoSegments: geoCount,
          years,
          status: 'success',
        })

        totalProductSegments += productCount
        totalGeoSegments += geoCount
        companiesWithData++

        console.log(`  ${stock.symbol}: ${productCount} product, ${geoCount} geo segments (${years.length} years)`)

      } catch (err) {
        results.push({
          symbol: stock.symbol,
          productSegments: 0,
          geoSegments: 0,
          years: [],
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        })
        console.error(`  ${stock.symbol}: ERROR - ${err}`)
      }
    }

    // Rate limiting delay between batches
    if (i + BATCH_SIZE < stocks.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS))
    }
  }

  // Summary report
  console.log('\n' + '='.repeat(60))
  console.log('SEGMENT INGESTION COMPLETE')
  console.log('='.repeat(60))
  console.log(`Total companies processed: ${stocks.length}`)
  console.log(`Companies with segment data: ${companiesWithData}`)
  console.log(`Total product segments: ${totalProductSegments}`)
  console.log(`Total geographic segments: ${totalGeoSegments}`)
  console.log(`Companies without data: ${results.filter(r => r.status === 'no_data').length}`)
  console.log(`Errors: ${results.filter(r => r.status === 'error').length}`)

  // Log to ingestion_logs table
  await supabase.from('ingestion_logs').insert({
    operation: 'segment_ingestion',
    data_type: 'segments',
    status: 'completed',
    records_processed: stocks.length,
    records_succeeded: companiesWithData,
    records_failed: results.filter(r => r.status === 'error').length,
    metadata: {
      totalProductSegments,
      totalGeoSegments,
      companiesWithData,
    },
  })
}

// Run
ingestAllSegments().catch(console.error)
```

#### Step 4.4: Create Segment Name Normalization

**File:** `lib/segments/name-normalizer.ts`

Normalize segment names across companies for cross-company comparison:

```typescript
// Mapping table for normalized segment names
const SEGMENT_MAPPINGS = {
  // Product/Business segments
  'cloud': ['Cloud', 'Cloud Services', 'AWS', 'Azure', 'Google Cloud', 'Cloud Computing', 'Intelligent Cloud'],
  'advertising': ['Advertising', 'Ads', 'Google Advertising', 'Ad Revenue', 'YouTube ads'],
  'devices': ['Devices', 'Hardware', 'Consumer Electronics', 'Surface'],
  'services': ['Services', 'Google Services', 'Subscriptions'],
  'smartphone': ['iPhone', 'Mobile', 'Smartphone'],
  'computing': ['Mac', 'Personal Computing', 'Windows', 'PC'],
  'tablet': ['iPad', 'Tablet'],
  'wearables': ['Wearables', 'Wearables, Home and Accessories', 'Other Products'],

  // Geographic segments
  'north_america': ['Americas', 'North America', 'United States', 'US', 'U.S.', 'United States and Canada'],
  'europe': ['Europe', 'EMEA', 'European Union', 'Europe, Middle East and Africa'],
  'asia_pacific': ['Asia Pacific', 'APAC', 'Asia', 'Rest of Asia Pacific'],
  'greater_china': ['Greater China', 'China', 'China region'],
  'japan': ['Japan'],
  'other_regions': ['Rest of World', 'Other', 'Other Countries'],
}

function normalizeSegmentName(name: string, type: 'product' | 'geographic'): string {
  const nameLower = name.toLowerCase()

  for (const [normalized, variants] of Object.entries(SEGMENT_MAPPINGS)) {
    if (variants.some(v => nameLower.includes(v.toLowerCase()))) {
      return normalized
    }
  }

  // Return original name if no mapping found (preserve company-specific segments)
  return name.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

export { normalizeSegmentName, SEGMENT_MAPPINGS }
```

#### Step 4.5: Create Segment Validation

**File:** `lib/segments/validate.ts`

```typescript
interface SegmentValidationResult {
  symbol: string
  year: number
  valid: boolean
  warnings: string[]
  errors: string[]
  productTotal: number
  geoTotal: number
  companyRevenue: number
  productVariance: number   // % difference from company revenue
  geoVariance: number
}

async function validateSegmentData(symbol: string, year: number): Promise<SegmentValidationResult> {
  const warnings: string[] = []
  const errors: string[] = []

  // Get segment data
  const { data: segments } = await supabase
    .from('company_metrics')
    .select('*')
    .eq('symbol', symbol)
    .eq('year', year)
    .eq('metric_name', 'segment_revenue')

  // Get company total revenue for comparison
  const { data: financials } = await supabase
    .from('financials_std')
    .select('revenue')
    .eq('symbol', symbol)
    .eq('year', year)
    .single()

  const companyRevenue = financials?.revenue || 0

  // Sum product segments
  const productTotal = segments
    ?.filter(s => s.dimension_type === 'product')
    .reduce((sum, s) => sum + (s.metric_value || 0), 0) || 0

  // Sum geographic segments
  const geoTotal = segments
    ?.filter(s => s.dimension_type === 'geographic')
    .reduce((sum, s) => sum + (s.metric_value || 0), 0) || 0

  // Calculate variance (segments should roughly equal total revenue)
  const productVariance = companyRevenue > 0
    ? Math.abs(productTotal - companyRevenue) / companyRevenue
    : 0
  const geoVariance = companyRevenue > 0
    ? Math.abs(geoTotal - companyRevenue) / companyRevenue
    : 0

  // Validation checks
  if (productTotal > 0 && productVariance > 0.15) {
    warnings.push(`Product segments sum to ${formatCurrency(productTotal)}, differs from revenue ${formatCurrency(companyRevenue)} by ${(productVariance * 100).toFixed(1)}%`)
  }

  if (geoTotal > 0 && geoVariance > 0.15) {
    warnings.push(`Geographic segments sum to ${formatCurrency(geoTotal)}, differs from revenue ${formatCurrency(companyRevenue)} by ${(geoVariance * 100).toFixed(1)}%`)
  }

  return {
    symbol,
    year,
    valid: errors.length === 0,
    warnings,
    errors,
    productTotal,
    geoTotal,
    companyRevenue,
    productVariance,
    geoVariance,
  }
}
```

#### Step 4.6: Create Segment Query Functions

**File:** `lib/segments/queries.ts`

```typescript
// Get all segments for a company
async function getCompanySegments(symbol: string, year?: number) {
  let query = supabase
    .from('company_metrics')
    .select('*')
    .eq('symbol', symbol)
    .eq('metric_name', 'segment_revenue')
    .order('year', { ascending: false })

  if (year) {
    query = query.eq('year', year)
  }

  return query
}

// Get segment comparison across companies (e.g., cloud revenue)
async function getSegmentComparison(
  segmentName: string,
  dimensionType: 'product' | 'geographic',
  year: number
) {
  const { data } = await supabase
    .from('company_metrics')
    .select('symbol, metric_value')
    .eq('metric_name', 'segment_revenue')
    .eq('dimension_type', dimensionType)
    .ilike('dimension_value', `%${segmentName}%`)
    .eq('year', year)
    .order('metric_value', { ascending: false })

  return data
}

// Get geographic revenue mix for a company
async function getGeographicMix(symbol: string, year: number) {
  const { data } = await supabase
    .from('company_metrics')
    .select('dimension_value, metric_value')
    .eq('symbol', symbol)
    .eq('year', year)
    .eq('metric_name', 'segment_revenue')
    .eq('dimension_type', 'geographic')

  const total = data?.reduce((sum, s) => sum + (s.metric_value || 0), 0) || 0

  return data?.map(s => ({
    region: s.dimension_value,
    revenue: s.metric_value,
    percentage: total > 0 ? (s.metric_value / total) * 100 : 0,
  }))
}
```

### Database Schema

Add segment support to `company_metrics` table:

```sql
-- Add unique constraint for segment data (if not exists)
ALTER TABLE company_metrics
ADD CONSTRAINT company_metrics_segment_unique
UNIQUE (symbol, year, period, metric_name, dimension_type, dimension_value);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_company_metrics_segments
ON company_metrics(metric_name, dimension_type)
WHERE metric_name = 'segment_revenue';

CREATE INDEX IF NOT EXISTS idx_company_metrics_symbol_year
ON company_metrics(symbol, year);
```

### Error Handling

| Error | Detection | Response |
|-------|-----------|----------|
| API rate limit | 429 response | Exponential backoff, retry |
| No segment data | Empty array response | Mark as 'no_data' (valid - not all companies report segments) |
| Network error | Fetch exception | Retry up to 3 times, then mark as error |
| Invalid data | Validation fails | Log warning, still store data |

### Validation Checks

After Phase 4 completion, verify:
- [ ] 400+ stocks have segment data (not all companies report)
- [ ] Segment totals within 15% of total revenue
- [ ] No duplicate segment entries
- [ ] Cross-company segment queries work
- [ ] All API calls logged in `ingestion_logs`

### Estimated Duration

| Step | Time | Notes |
|------|------|-------|
| Create types and fetcher | 1 hour | |
| Create ingestion script | 2 hours | |
| Run full ingestion | 30 min | ~1000 API calls |
| Create validation | 1 hour | |
| Create query functions | 1 hour | |
| Testing and fixes | 1-2 hours | |
| **Total** | **6-8 hours** | Down from 16-22 hours with iXBRL |

### Comparison: FMP API vs iXBRL Parsing

| Aspect | FMP API (chosen) | iXBRL Parsing (deferred) |
|--------|------------------|--------------------------|
| **Implementation time** | 6-8 hours | 16-22 hours |
| **Maintenance** | None (FMP handles parsing) | Ongoing (format changes) |
| **Data coverage** | ~80% of S&P 500 | ~90% (some unstructured) |
| **Operating income** | Not available | Available |
| **Cost breakdown** | Not available | Available |
| **API cost** | 1,000 calls | Free (after file download) |
| **Storage** | ~10MB | ~30GB (filing files) |
| **Accuracy** | Pre-validated by FMP | Varies (parsing quality) |

---

## Phase 5: Chatbot Multi-Stock Support

### Objective

Enable the AI chatbot to answer questions about any S&P 500 stock, not just Apple.

### Important Note: Filing Tools

> **Filing-based tools (`getRecentFilings`, `searchFilings`) currently only work for AAPL.**
>
> Since SEC filing infrastructure is deferred (Phase 3), only Apple has filing data from the pre-expansion work. For other stocks:
> - Filing tools should return graceful "no filings available" messages
> - The chatbot should guide users to financial/segment data instead
> - This is an acceptable limitation for MVP

### Current Limitations

1. Tool selection prompt assumes AAPL: "Select a tool to answer questions about Apple..."
2. Tool implementations have hardcoded 'AAPL' symbols
3. No stock selector in chatbot UI
4. Answer validation checks AAPL data only
5. Conversation context doesn't track selected stock
6. Filing tools only work for AAPL (acceptable limitation - see note above)

### Implementation Steps

#### Step 5.1: Add Stock Selector to Chatbot UI

**File:** `components/ChatStockSelector.tsx`

```typescript
interface ChatStockSelectorProps {
  selectedSymbol: string
  onSelect: (symbol: string) => void
}

function ChatStockSelector({ selectedSymbol, onSelect }: ChatStockSelectorProps) {
  // Searchable dropdown with 500 stocks
  // Shows: Symbol, Company Name, Sector
  // Recent selections at top
  // Keyboard navigation support
}
```

Features:
- Searchable input (type "micro" → Microsoft, Micron)
- Recent stocks remembered
- Sector grouping option
- Mobile-friendly

#### Step 5.2: Update Sidebar Component

**File:** `components/Sidebar.tsx`

Changes:
- Add `selectedStock` state
- Pass to `ChatStockSelector`
- Include in conversation context
- Display "Asking about: MSFT" indicator
- Store selected stock per conversation

#### Step 5.3: Update Tool Definitions

**File:** `lib/tools.ts`

Add `symbol` parameter to all tools:

```typescript
const TOOL_MENU = {
  getFinancialsByMetric: {
    description: 'Get financial metrics for a stock',
    parameters: {
      symbol: { type: 'string', description: 'Stock ticker (e.g., MSFT)' },
      metric: { type: 'string', description: 'Metric name' },
      limit: { type: 'number', description: 'Number of years' },
    },
  },
  // ... other tools
}
```

#### Step 5.4: Update Tool Selection Prompt

**File:** `lib/tools.ts` - `buildToolSelectionPrompt()`

Current:
```
You are answering questions about Apple Inc. (AAPL) stock.
Select a tool to fetch the data needed...
```

Updated:
```
You are answering questions about {COMPANY_NAME} ({SYMBOL}).
Sector: {SECTOR}
Key business areas: {SEGMENTS}

Select a tool to fetch the data needed...

The user's question is: {QUESTION}

Available tools:
{TOOL_DEFINITIONS}

Always use symbol="{SYMBOL}" when calling tools.
```

#### Step 5.5: Update Server Actions

**File:** `app/actions/ask-question.ts`

Changes:
- Accept `symbol` parameter
- Pass symbol to tool selection prompt
- Pass symbol to tool execution
- Include symbol in validation context
- Log symbol in query_logs

```typescript
export async function askQuestion(params: {
  question: string
  symbol: string // NEW
  conversationHistory?: ConversationMessage[]
}): Promise<AskQuestionResult> {
  // Fetch company context
  const company = await getCompanyInfo(params.symbol)

  // Build prompt with company context
  const prompt = buildToolSelectionPrompt({
    question: params.question,
    company,
    conversationHistory: params.conversationHistory,
  })

  // ... rest of orchestration
}
```

#### Step 5.6: Update Individual Tool Actions

Update each tool to use dynamic symbol:

**File:** `app/actions/financials.ts`
```typescript
export async function getFinancialsByMetric(params: {
  symbol: string, // Was hardcoded 'AAPL'
  metric: FinancialMetric,
  limit?: number,
})
```

**File:** `app/actions/filings.ts` *(AAPL only - see note below)*
```typescript
// NOTE: Filing tools currently only work for AAPL (pre-existing data)
// Other stocks will return "no filings available" gracefully
export async function getRecentFilings(params: {
  symbol: string,
  limit?: number,
})
```

#### Step 5.7: Update Answer Validation

**File:** `lib/validators.ts`

Update validators to check against correct stock's data:

```typescript
export async function validateAnswer(params: {
  answer: string
  symbol: string // NEW
  dataUsed: ToolResult
  question: string
}): Promise<ValidationResult> {
  // Fetch actual data for the correct symbol
  const actualData = await getActualData(params.symbol, params.dataUsed)

  // Validate numbers match
  // Validate years are in data
  // Validate filing citations
}
```

#### Step 5.8: Handle Missing Data Gracefully

**File:** `lib/tools.ts` - Answer generation prompt

Add instructions for handling missing data:

```
If the requested data is not available for {SYMBOL}, respond with:
"I don't have [specific data type] for {COMPANY_NAME}. This might be because:
- The company doesn't report this segment separately
- The data hasn't been loaded yet
- The time period requested isn't available

I can help with other questions about {COMPANY_NAME}'s financials."
```

#### Step 5.9: Add Data Availability Check

**File:** `lib/data-availability.ts`

Before answering, check what data exists:

```typescript
export async function checkDataAvailability(symbol: string): Promise<{
  hasFinancials: boolean
  financialsRange: { start: number, end: number } | null
  hasSegments: boolean
  segmentTypes: string[]  // ['product', 'geographic']
  hasFilings: boolean     // Only true for AAPL currently
}> {
  // Query database for data presence
  // Note: Filing data only exists for AAPL from pre-expansion work
}
```

#### Step 5.10: Update Conversation Storage

**File:** Database schema update

Add symbol to conversations:
```sql
ALTER TABLE conversations ADD COLUMN symbol TEXT DEFAULT 'AAPL';
ALTER TABLE messages ADD COLUMN symbol TEXT;
```

### UI/UX Considerations

1. **Stock context always visible:** Show "Asking about: MSFT (Microsoft)" in chat header
2. **Easy switching:** Dropdown accessible without scrolling
3. **Conversation continuity:** Changing stock starts new conversation
4. **Recent stocks:** Quick access to recently queried stocks
5. **Data status indicator:** Show if stock has complete data

### Validation Checks

After Phase 5 completion, verify:
- [ ] Can select any S&P 500 stock
- [ ] Questions answered correctly for different stocks
- [ ] Validation works for all stocks
- [ ] Missing data handled gracefully
- [ ] Conversation history includes stock context
- [ ] Tool calls use correct symbol

### Estimated Duration

- Development: 12-16 hours
- Testing: 4-6 hours

---

## Phase 6: Charts Multi-Stock Expansion

### Objective

Enable the charting platform to display data for any S&P 500 stock, with searchable stock selection and proper handling of data availability.

### Current State

- Hardcoded array of 2 stocks (AAPL, GOOGL)
- Dropdown selector works for 2 options
- Multi-stock comparison works

### Target State

- Search across 500 stocks
- Select up to 5 stocks for comparison
- Segment metrics load dynamically per stock
- Handle missing data gracefully

### Implementation Steps

#### Step 6.1: Create Stock Search Component

**File:** `components/StockSearch.tsx`

Replace dropdown with searchable autocomplete:

```typescript
interface StockSearchProps {
  selectedStocks: string[]
  onSelect: (symbols: string[]) => void
  maxSelections?: number
}

function StockSearch({ selectedStocks, onSelect, maxSelections = 5 }: StockSearchProps) {
  // Features:
  // - Debounced search (300ms)
  // - Server-side search (too many for client filter)
  // - Show: Symbol, Name, Sector
  // - Highlight matching text
  // - Keyboard navigation
  // - Selected stocks shown as chips
  // - Remove individual selections
}
```

#### Step 6.2: Create Stock Search API

**File:** `app/actions/search-stocks.ts`

```typescript
export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  // Search by symbol (exact prefix match first)
  // Search by company name (fuzzy match)
  // Limit to 20 results
  // Return: symbol, name, sector
}
```

SQL query:
```sql
SELECT symbol, name, sector
FROM sp500_constituents
WHERE is_active = true
  AND (
    symbol ILIKE $1 || '%'  -- Prefix match on symbol
    OR name ILIKE '%' || $1 || '%'  -- Contains match on name
  )
ORDER BY
  CASE WHEN symbol ILIKE $1 || '%' THEN 0 ELSE 1 END,  -- Symbols first
  symbol
LIMIT 20
```

#### Step 6.3: Update Charts Page

**File:** `app/charts/page.tsx`

Changes:
- Replace `AVAILABLE_STOCKS` constant with dynamic fetch
- Use `StockSearch` component
- Lazy-load segment metrics when stocks selected
- Show loading state for segment data

```typescript
// Remove this:
const AVAILABLE_STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
]

// Replace with:
const [availableStocks, setAvailableStocks] = useState<Stock[]>([])
const [selectedStocks, setSelectedStocks] = useState<string[]>(['AAPL'])

// On stock selection change, fetch segment metrics
useEffect(() => {
  loadSegmentMetrics(selectedStocks)
}, [selectedStocks])
```

#### Step 6.4: Dynamic Segment Metric Loading

**File:** `app/actions/chart-metrics.ts`

Update `getAvailableMetrics()` to accept stocks:

```typescript
export async function getAvailableMetrics(symbols?: string[]) {
  // Base metrics (always available)
  const baseMetrics = getBaseFinancialMetrics()

  // Segment metrics (stock-specific)
  if (symbols && symbols.length > 0) {
    for (const symbol of symbols) {
      const segments = await getSegmentMetricsForStock(symbol)
      // Add with stock prefix: "AAPL_segment_iphone"
    }
  }

  return [...baseMetrics, ...segmentMetrics]
}
```

#### Step 6.5: Handle Missing Data in Charts

**File:** `components/MultiMetricChart.tsx`

When data is missing for a stock/metric:
- Show partial data (other stocks that have it)
- Display indicator: "No data for MSFT"
- Don't break entire chart

```typescript
// Handle null/missing values
const seriesData = stocks.map(stock => {
  const data = metricsData.find(d => d.symbol === stock && d.metric === metric)
  if (!data) {
    return { symbol: stock, data: null, missing: true }
  }
  return { symbol: stock, data: data.values, missing: false }
})

// Show warning for missing data
{missingStocks.length > 0 && (
  <div className="text-yellow-600 text-sm">
    No {metric} data for: {missingStocks.join(', ')}
  </div>
)}
```

#### Step 6.6: Optimize Data Fetching

**File:** `app/actions/chart-metrics.ts`

Current: Fetches all data for selected stocks every render
Target: Cache and incremental fetch

```typescript
// Cache key: stocks + metrics + dateRange
const cacheKey = getCacheKey(symbols, metrics, minYear, maxYear)

// Check cache first
const cached = await getFromCache(cacheKey)
if (cached) return cached

// Fetch only what's needed
const data = await fetchMetricsData(...)
await setCache(cacheKey, data, TTL_5_MINUTES)
return data
```

#### Step 6.7: Add Popular Stocks Section

**File:** `components/StockSearch.tsx`

Quick access to commonly compared stocks:

```typescript
const POPULAR_COMPARISONS = [
  { label: 'Big Tech', stocks: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'] },
  { label: 'Banks', stocks: ['JPM', 'BAC', 'WFC', 'C', 'GS'] },
  { label: 'Retail', stocks: ['WMT', 'AMZN', 'TGT', 'COST', 'HD'] },
]

// Show as chips: "Compare: Big Tech | Banks | Retail"
```

#### Step 6.8: Update Color System for 5 Stocks

**File:** `app/charts/page.tsx`

Current: 2 color families (blue for AAPL, green for GOOGL)
Need: 5 distinct color families

```typescript
const STOCK_COLOR_FAMILIES = {
  // Each stock gets a color family with light/dark variants
  0: ['#1a3a5c', '#2a4a6c', '#3a5a7c', '#4a6a8c'], // Blues
  1: ['#1a4a3a', '#2a5a4a', '#3a6a5a', '#4a7a6a'], // Teals
  2: ['#5c1a3a', '#6c2a4a', '#7c3a5a', '#8c4a6a'], // Purples
  3: ['#5c3a1a', '#6c4a2a', '#7c5a3a', '#8c6a4a'], // Browns
  4: ['#3a1a5c', '#4a2a6c', '#5a3a7c', '#6a4a8c'], // Violets
}
```

### Performance Considerations

- **Search debouncing:** 300ms delay before API call
- **Limit selections:** Max 5 stocks to prevent chart clutter
- **Pagination:** Don't load all 500 stocks at once
- **Caching:** Cache metric data for 5 minutes

### Validation Checks

After Phase 6 completion, verify:
- [ ] Can search and find any S&P 500 stock
- [ ] Can select up to 5 stocks
- [ ] Segment metrics load correctly per stock
- [ ] Missing data handled gracefully
- [ ] Chart renders correctly with 5 stocks
- [ ] Colors distinguishable for all stocks

### Estimated Duration

- Development: 8-10 hours
- Testing: 2-3 hours

---

## Testing Strategy

### Objective

Ensure code quality, prevent regressions, and verify performance at scale through comprehensive testing at each phase.

### Testing Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        Testing Pyramid                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      ┌─────────────┐                            │
│                      │   E2E Tests │  (Few, slow, high value)   │
│                      └─────────────┘                            │
│                  ┌─────────────────────┐                        │
│                  │  Integration Tests  │  (Medium count)        │
│                  └─────────────────────┘                        │
│            ┌─────────────────────────────────┐                  │
│            │         Unit Tests              │  (Many, fast)    │
│            └─────────────────────────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Unit Tests

**Purpose:** Test individual functions in isolation

#### Data Transformation Tests

**File:** `lib/__tests__/transform-financials.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import {
  transformIncomeStatement,
  transformBalanceSheet,
  transformKeyMetrics
} from '../ingestion/transform-financials'

describe('transformIncomeStatement', () => {
  it('maps FMP fields to our schema correctly', () => {
    const fmpData = [{
      date: '2023-09-30',
      symbol: 'AAPL',
      revenue: 383285000000,
      grossProfit: 169148000000,
      netIncome: 96995000000,
      operatingIncome: 114301000000,
      eps: 6.16,
    }]

    const result = transformIncomeStatement('AAPL', fmpData, 'annual')

    expect(result[0]).toMatchObject({
      symbol: 'AAPL',
      year: 2023,
      fiscal_quarter: null,
      period_type: 'annual',
      revenue: 383285000000,
      gross_profit: 169148000000,
      net_income: 96995000000,
      operating_income: 114301000000,
      eps: 6.16,
    })
  })

  it('extracts fiscal quarter from quarterly data', () => {
    const fmpData = [{
      date: '2023-06-30',
      symbol: 'AAPL',
      revenue: 81797000000,
      // ... other fields
    }]

    const result = transformIncomeStatement('AAPL', fmpData, 'quarterly')

    expect(result[0].fiscal_quarter).toBe(3) // Q3 for June end
    expect(result[0].period_type).toBe('quarterly')
  })

  it('handles null/missing values gracefully', () => {
    const fmpData = [{
      date: '2023-09-30',
      symbol: 'AAPL',
      revenue: 383285000000,
      grossProfit: null, // Missing data
      netIncome: undefined,
    }]

    const result = transformIncomeStatement('AAPL', fmpData, 'annual')

    expect(result[0].gross_profit).toBeNull()
    expect(result[0].net_income).toBeNull()
  })

  it('handles empty array input', () => {
    const result = transformIncomeStatement('AAPL', [], 'annual')
    expect(result).toEqual([])
  })
})

describe('transformBalanceSheet', () => {
  it('maps balance sheet fields correctly', () => {
    const fmpData = [{
      date: '2023-09-30',
      symbol: 'AAPL',
      totalAssets: 352583000000,
      totalLiabilities: 290437000000,
      totalStockholdersEquity: 62146000000,
    }]

    const result = transformBalanceSheet('AAPL', fmpData, 'annual')

    expect(result[0].total_assets).toBe(352583000000)
    expect(result[0].total_liabilities).toBe(290437000000)
    expect(result[0].shareholders_equity).toBe(62146000000)
  })
})
```

#### FMP Client Tests

**File:** `lib/__tests__/fmp-client.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FMPClient } from '../fmp/client'

describe('FMPClient', () => {
  let client: FMPClient

  beforeEach(() => {
    client = new FMPClient({
      apiKey: 'test-key',
      requestsPerMinute: 250,
      maxRetries: 3,
    })
  })

  it('respects rate limits', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')

    // Make 5 rapid requests
    const promises = Array(5).fill(null).map(() =>
      client.getIncomeStatement('AAPL', 'annual')
    )

    await Promise.all(promises)

    // Should have delays between calls
    expect(fetchSpy).toHaveBeenCalledTimes(5)
  })

  it('retries on 429 rate limit error', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })

    await client.getIncomeStatement('AAPL', 'annual')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('throws after max retries exceeded', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue({ status: 429 })

    await expect(client.getIncomeStatement('AAPL', 'annual'))
      .rejects.toThrow('Max retries exceeded')
  })
})
```

#### Segment Fetcher Tests

**File:** `lib/__tests__/segment-fetcher.test.ts`

```typescript
describe('FMP Segment Fetcher', () => {
  it('fetches product segment revenue from FMP API', async () => {
    // Mock FMP API response
    const mockResponse = [
      {
        date: '2024-09-28',
        symbol: 'AAPL',
        iPhone: 201183000000,
        Mac: 29984000000,
        Services: 96169000000,
      },
    ]

    fetchMock.mockResponseOnce(JSON.stringify(mockResponse))

    const segments = await fetchFMPSegments('AAPL')

    expect(segments).toContainEqual({
      symbol: 'AAPL',
      year: 2024,
      period: 'FY',
      metricName: 'segment_revenue',
      dimensionType: 'product',
      dimensionValue: 'iPhone',
      value: 201183000000,
      dataSource: 'fmp_api',
    })
  })

  it('normalizes segment names across companies', () => {
    expect(normalizeSegmentName('Cloud Services', 'product')).toBe('cloud')
    expect(normalizeSegmentName('AWS', 'product')).toBe('cloud')
    expect(normalizeSegmentName('Azure', 'product')).toBe('cloud')
    expect(normalizeSegmentName('Google Cloud', 'product')).toBe('cloud')
  })
})
```

### Integration Tests

**Purpose:** Test components working together with real database

#### Multi-Stock Query Tests

**File:** `tests/integration/multi-stock-queries.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { getFinancialsByMetric } from '@/app/actions/financials'
import { getChartMetrics } from '@/app/actions/chart-metrics'
import { searchStocks } from '@/app/actions/search-stocks'

describe('Multi-stock financial queries', () => {
  // These tests run against the real database with test data

  it('fetches revenue for any S&P 500 stock', async () => {
    const testSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'JPM']

    for (const symbol of testSymbols) {
      const result = await getFinancialsByMetric({
        symbol,
        metric: 'revenue',
        limit: 5,
      })

      expect(result.data.length).toBeGreaterThan(0)
      expect(result.data[0].symbol).toBe(symbol)
      expect(result.data[0].revenue).toBeGreaterThan(0)
    }
  })

  it('handles stocks with missing quarterly data', async () => {
    // Some stocks may not have full quarterly history
    const result = await getFinancialsByMetric({
      symbol: 'BRK.B', // Berkshire might have different reporting
      metric: 'revenue',
      limit: 5,
      periodType: 'quarterly',
    })

    // Should not throw, return available data
    expect(result.error).toBeUndefined()
  })

  it('chart metrics returns data for multiple stocks', async () => {
    const data = await getChartMetrics({
      symbols: ['AAPL', 'MSFT', 'GOOGL'],
      metrics: ['revenue', 'net_income'],
      startYear: 2020,
      endYear: 2024,
    })

    expect(data.length).toBe(6) // 3 stocks × 2 metrics

    // Each stock should have data
    const aaplRevenue = data.find(d => d.symbol === 'AAPL' && d.metric === 'revenue')
    expect(aaplRevenue?.values.length).toBeGreaterThan(0)
  })
})

describe('Stock search', () => {
  it('finds stocks by symbol prefix', async () => {
    const results = await searchStocks('MS')

    expect(results.some(r => r.symbol === 'MSFT')).toBe(true)
    expect(results.some(r => r.symbol === 'MS')).toBe(true) // Morgan Stanley
  })

  it('finds stocks by company name', async () => {
    const results = await searchStocks('Apple')

    expect(results.some(r => r.symbol === 'AAPL')).toBe(true)
  })

  it('returns max 20 results', async () => {
    const results = await searchStocks('A') // Many matches

    expect(results.length).toBeLessThanOrEqual(20)
  })
})
```

#### Chatbot Multi-Stock Tests

**File:** `tests/integration/chatbot-multi-stock.test.ts`

```typescript
describe('Chatbot multi-stock support', () => {
  it('answers questions about different stocks', async () => {
    const testCases = [
      { symbol: 'MSFT', question: "What was Microsoft's revenue in 2023?" },
      { symbol: 'GOOGL', question: "What is Alphabet's net income?" },
      { symbol: 'JPM', question: "What are JPMorgan's total assets?" },
    ]

    for (const { symbol, question } of testCases) {
      const result = await askQuestion({ symbol, question })

      expect(result.answer).toBeTruthy()
      expect(result.toolUsed).toBe('getFinancialsByMetric')
      expect(result.toolArgs.symbol).toBe(symbol)
    }
  })

  it('handles missing data gracefully', async () => {
    const result = await askQuestion({
      symbol: 'NEWSTOCK', // Hypothetical stock with no data
      question: "What was revenue in 2023?",
    })

    expect(result.answer).toContain("don't have")
    expect(result.error).toBeUndefined() // Graceful, not error
  })

  it('validates answers against correct stock data', async () => {
    const result = await askQuestion({
      symbol: 'AAPL',
      question: "What was Apple's revenue in 2023?",
    })

    expect(result.validationPassed).toBe(true)
    expect(result.answer).toContain('383') // ~$383B
  })
})
```

### Regression Tests

**Purpose:** Ensure existing AAPL/GOOGL functionality doesn't break

**File:** `tests/regression/baseline.test.ts`

```typescript
import { describe, it, expect } from 'vitest'

// Known good values captured before expansion
const AAPL_BASELINE = {
  revenue_2023: 383285000000,
  revenue_2022: 394328000000,
  net_income_2023: 96995000000,
  segments: ['iPhone', 'Mac', 'iPad', 'Wearables', 'Services'],
  geographic: ['Americas', 'Europe', 'Greater China', 'Japan', 'Rest of Asia Pacific'],
}

const GOOGL_BASELINE = {
  revenue_2023: 307394000000,
  segments: ['Google Services', 'Google Cloud', 'Other Bets'],
}

describe('AAPL regression tests', () => {
  it('returns correct revenue values', async () => {
    const result = await getFinancialsByMetric({
      symbol: 'AAPL',
      metric: 'revenue',
      limit: 10,
    })

    const rev2023 = result.data.find(d => d.year === 2023)
    const rev2022 = result.data.find(d => d.year === 2022)

    expect(rev2023?.revenue).toBe(AAPL_BASELINE.revenue_2023)
    expect(rev2022?.revenue).toBe(AAPL_BASELINE.revenue_2022)
  })

  it('returns all product segments', async () => {
    const segments = await getSegmentData({
      symbol: 'AAPL',
      dimensionType: 'product',
      year: 2023,
    })

    const segmentNames = segments.map(s => s.dimensionValue)
    for (const expected of AAPL_BASELINE.segments) {
      expect(segmentNames).toContain(expected)
    }
  })

  it('returns all geographic segments', async () => {
    const segments = await getSegmentData({
      symbol: 'AAPL',
      dimensionType: 'geographic',
      year: 2023,
    })

    const segmentNames = segments.map(s => s.dimensionValue)
    for (const expected of AAPL_BASELINE.geographic) {
      expect(segmentNames).toContain(expected)
    }
  })

  it('chatbot answers match pre-expansion quality', async () => {
    const result = await askQuestion({
      symbol: 'AAPL',
      question: "What was Apple's iPhone revenue in 2023?",
    })

    expect(result.validationPassed).toBe(true)
    expect(result.answer).toMatch(/\$?2[0-9]{2}/) // ~$200B range
  })
})

describe('GOOGL regression tests', () => {
  it('returns correct revenue values', async () => {
    const result = await getFinancialsByMetric({
      symbol: 'GOOGL',
      metric: 'revenue',
      limit: 5,
    })

    const rev2023 = result.data.find(d => d.year === 2023)
    expect(rev2023?.revenue).toBe(GOOGL_BASELINE.revenue_2023)
  })

  it('returns all business segments', async () => {
    const segments = await getSegmentData({
      symbol: 'GOOGL',
      dimensionType: 'business',
      year: 2023,
    })

    const segmentNames = segments.map(s => s.dimensionValue)
    for (const expected of GOOGL_BASELINE.segments) {
      expect(segmentNames).toContain(expected)
    }
  })
})

describe('Chart functionality regression', () => {
  it('renders AAPL + GOOGL comparison correctly', async () => {
    const data = await getChartMetrics({
      symbols: ['AAPL', 'GOOGL'],
      metrics: ['revenue', 'gross_profit'],
      startYear: 2020,
    })

    expect(data.length).toBe(4) // 2 stocks × 2 metrics

    // AAPL should have higher revenue
    const aaplRev = data.find(d => d.symbol === 'AAPL' && d.metric === 'revenue')
    const googlRev = data.find(d => d.symbol === 'GOOGL' && d.metric === 'revenue')

    expect(aaplRev?.values[0]?.value).toBeGreaterThan(googlRev?.values[0]?.value)
  })
})
```

### Performance Tests

**Purpose:** Ensure system performs well at scale

**File:** `tests/performance/load.test.ts`

```typescript
import { describe, it, expect } from 'vitest'

describe('Query performance', () => {
  it('single stock query completes under 100ms', async () => {
    const start = performance.now()

    await getFinancialsByMetric({
      symbol: 'AAPL',
      metric: 'revenue',
      limit: 10,
    })

    const duration = performance.now() - start
    expect(duration).toBeLessThan(100)
  })

  it('handles 50 concurrent queries under 2 seconds', async () => {
    const symbols = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META',
      'NVDA', 'TSLA', 'JPM', 'V', 'JNJ',
      // ... 40 more random S&P 500 stocks
    ].slice(0, 50)

    const start = performance.now()

    await Promise.all(
      symbols.map(symbol =>
        getFinancialsByMetric({ symbol, metric: 'revenue', limit: 5 })
      )
    )

    const duration = performance.now() - start
    expect(duration).toBeLessThan(2000)
  })

  it('stock search responds under 50ms', async () => {
    const queries = ['A', 'MS', 'Apple', 'Bank', 'Tech']

    for (const query of queries) {
      const start = performance.now()
      await searchStocks(query)
      const duration = performance.now() - start

      expect(duration).toBeLessThan(50)
    }
  })

  it('chart with 5 stocks × 4 metrics loads under 500ms', async () => {
    const start = performance.now()

    await getChartMetrics({
      symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'],
      metrics: ['revenue', 'net_income', 'gross_profit', 'operating_income'],
      startYear: 2015,
    })

    const duration = performance.now() - start
    expect(duration).toBeLessThan(500)
  })
})

describe('Database performance', () => {
  it('financials_std query uses index', async () => {
    const { data } = await supabase
      .from('financials_std')
      .select('*')
      .eq('symbol', 'AAPL')
      .order('year', { ascending: false })
      .limit(10)
      .explain()

    // Check that index scan is used, not sequential scan
    expect(data).toContain('Index Scan')
  })
})
```

### Test Organization

```
tests/
├── unit/                          # Fast, isolated tests
│   ├── transform-financials.test.ts
│   ├── fmp-client.test.ts
│   ├── segment-parser.test.ts
│   └── validators.test.ts
├── integration/                   # Tests with database
│   ├── multi-stock-queries.test.ts
│   ├── chatbot-multi-stock.test.ts
│   └── chart-metrics.test.ts
├── regression/                    # Baseline verification
│   ├── aapl-baseline.test.ts
│   ├── googl-baseline.test.ts
│   └── chart-baseline.test.ts
├── performance/                   # Load and speed tests
│   └── load.test.ts
└── e2e/                          # Full browser tests (optional)
    └── charts-page.test.ts
```

### Test Commands

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:regression": "vitest run tests/regression",
    "test:performance": "vitest run tests/performance",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --reporter=junit"
  }
}
```

### Testing by Phase

| Phase | Tests to Run | Purpose |
|-------|--------------|---------|
| Phase 0 | `test:regression` | Verify AAPL/GOOGL baseline before changes |
| Phase 1 | `test:unit` (constituents) | Verify ticker/CIK parsing |
| Phase 2 | `test:unit` (transforms), `test:integration` | Verify data ingestion |
| Phase 3 | `test:unit` (chunking) | Verify filing processing |
| Phase 4 | `test:unit` (parsers) | Verify segment extraction |
| Phase 5 | `test:integration` (chatbot), `test:regression` | Verify multi-stock chatbot |
| Phase 6 | `test:integration` (charts), `test:performance` | Verify charts at scale |

### Test Data & Environments

**Isolation requirement:** Integration and load tests must NOT run against production data.

**Setup:**
- Create a separate Supabase project for testing (e.g., `finquote-test`)
- Or use an isolated schema within the same project (e.g., `test_*` tables)
- Seed test data from fixtures in `test-data/fixtures/`

**Fixture files:**
```
test-data/
├── fixtures/
│   ├── financials-sample.json    # 10 stocks × 5 years
│   └── segments-sample.json      # AAPL + GOOGL segments from FMP
└── baselines/
    ├── aapl-expected.json        # Known good AAPL values
    └── googl-expected.json       # Known good GOOGL values
```

**Reset between runs:**
```bash
npm run test:reset    # Truncates test tables and reseeds fixtures
```

**Environment variables for testing:**
```bash
TEST_SUPABASE_URL=https://your-test-project.supabase.co
TEST_SUPABASE_ANON_KEY=your-test-anon-key
```

### Domain-Specific Test Checks

**Filing chunk tests should verify:**
- Section detection works (finds "Risk Factors", "MD&A", etc.)
- Chunk sizes within bounds (400-600 tokens)
- No chunks are empty or duplicated
- Chunk overlap is preserved (50 tokens)

**Segment parser tests should verify:**
- Extracted segment totals match reported revenue (±5% tolerance)
- All expected segments found (iPhone, Services, etc.)
- No duplicate segments for same year/period
- Geographic segments sum to total (±10% tolerance for rounding)

```typescript
it('segment totals match reported revenue', async () => {
  const segments = await parseSegments('AAPL', 2023)
  const totalRevenue = await getReportedRevenue('AAPL', 2023)

  const segmentSum = segments.reduce((sum, s) => sum + s.value, 0)
  const tolerance = totalRevenue * 0.05 // 5%

  expect(Math.abs(segmentSum - totalRevenue)).toBeLessThan(tolerance)
})
```

### Performance Test Configuration

**Load profile:**
- Concurrency: 10, 25, 50 simultaneous requests
- Dataset: Minimum 100 stocks with full data
- Duration: 60 seconds sustained load

**Targets (p95/p99):**
| Operation | p95 Target | p99 Target |
|-----------|------------|------------|
| Single stock query | 150ms | 300ms |
| Stock search | 75ms | 150ms |
| Chart data (5 stocks) | 750ms | 1.5s |
| 50 concurrent queries | 3s | 5s |

**Environment requirements:**
- Do NOT run performance tests on laptops (inconsistent results)
- Use CI runners with dedicated resources or a staging server
- Ensure test database has realistic data volume (not just fixtures)

### Regression Baselines

**Location:** `test-data/baselines/`

**What's captured:**
- Known good financial values (AAPL revenue 2023 = $383.3B)
- Expected segment counts and names
- Query response shapes

**Updating baselines:**
When behavior changes intentionally (e.g., new data format):

```bash
# 1. Run tests to see what changed
npm run test:regression

# 2. Review changes manually - confirm diff is expected
npm run test:regression -- --update-snapshots

# 3. Commit updated baselines with explanation
git add test-data/baselines/
git commit -m "Update baselines: added new metric field"
```

**Rule:** Never auto-update baselines without reviewing the diff.

### Coverage Guidelines

**Scope:**
- 80% coverage applies to **new and changed code only**
- Exclude from coverage: generated files, migrations, type definitions

**Exclusion patterns** (add to vitest.config.ts):
```typescript
coverage: {
  exclude: [
    'supabase/migrations/**',
    'lib/database.types.ts',
    '**/*.d.ts',
    'scripts/**'  // One-time scripts
  ]
}
```

**CI gate:** Consider a soft gate (warning, not failure) for coverage drops.

### E2E Test Scope

**Keep E2E minimal** - focus on smoke tests, not comprehensive browser testing.

**Recommended E2E tests:**
1. Charts page loads with AAPL + GOOGL selected
2. Stock search returns results
3. Chatbot returns answer for basic financial question
4. No console errors on page load

**What to skip:**
- Full user flows (better covered by integration tests)
- Visual regression (too brittle)
- Filing search (deferred feature)

### CI/CD Integration

Run tests automatically on each commit:

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

### Success Criteria for Testing

- [ ] Unit test coverage > 80% for new code
- [ ] All regression tests pass after each phase
- [ ] Performance tests meet targets (100ms single query, 2s for 50 concurrent)
- [ ] No test failures in CI before merging
- [ ] Baseline values captured before Phase 1

---

## Feature Flags & Gradual Rollout

### Overview

Rather than switching from 2 stocks to 500 stocks all at once, we use feature flags to enable gradual rollout with the ability to quickly disable features if issues arise.

### Feature Flag Configuration

Add to `.env.local`:

```bash
# Feature Flags for S&P 500 Expansion
ENABLE_MULTI_STOCK_CHARTS=true        # Enable 500 stocks in charts (Phase 6)
ENABLE_MULTI_STOCK_CHATBOT=false      # Enable multi-stock chatbot (Phase 5)
ENABLE_STOCK_COMPARISON=false         # Enable cross-stock comparison queries
MAX_STOCKS_IN_CHART=10                # Maximum stocks in a single chart
```

### Rollout Strategy

| Phase | Feature Flag | Default | Description |
|-------|--------------|---------|-------------|
| Phase 6 (Charts) | `ENABLE_MULTI_STOCK_CHARTS` | `true` | Lower risk - read-only visualization |
| Phase 5 (Chatbot) | `ENABLE_MULTI_STOCK_CHATBOT` | `false` | Higher risk - LLM tool selection changes |
| Phase 5 (Comparison) | `ENABLE_STOCK_COMPARISON` | `false` | Enables "Compare AAPL vs MSFT" queries |

### Implementation

**1. Charts Feature Flag (lib/feature-flags.ts)**

```typescript
export function isMultiStockChartsEnabled(): boolean {
  return process.env.ENABLE_MULTI_STOCK_CHARTS === 'true'
}

export function getAvailableStocksForCharts(): string[] {
  if (isMultiStockChartsEnabled()) {
    return getAllSP500Tickers() // Returns 500 tickers
  }
  return ['AAPL', 'GOOGL'] // Original 2 stocks
}
```

**2. Chatbot Feature Flag**

```typescript
export function isMultiStockChatbotEnabled(): boolean {
  return process.env.ENABLE_MULTI_STOCK_CHATBOT === 'true'
}

export function getChatbotSupportedStocks(): string[] {
  if (isMultiStockChatbotEnabled()) {
    return getAllSP500Tickers()
  }
  return ['AAPL'] // Original AAPL-only behavior
}
```

**3. Tool Selection Prompt Gating**

In `lib/tools.ts`, update `buildToolSelectionPrompt()`:

```typescript
function buildToolSelectionPrompt(question: string, history: Message[]) {
  const supportedStocks = getChatbotSupportedStocks()

  if (supportedStocks.length === 1) {
    // Original AAPL-only prompt
    return `You are helping answer questions about Apple (AAPL) stock...`
  } else {
    // Multi-stock prompt
    return `You are helping answer questions about S&P 500 stocks...

Available stocks: ${supportedStocks.join(', ')}

If the user asks about a stock not in this list, respond:
"I can only answer questions about S&P 500 stocks. The stock you mentioned is not in my database."`
  }
}
```

### Rollout Phases

**Week 1-2: Charts Only**
```bash
ENABLE_MULTI_STOCK_CHARTS=true
ENABLE_MULTI_STOCK_CHATBOT=false
```
- Users can chart any S&P 500 stock
- Chatbot remains AAPL-only
- Monitor: chart load times, error rates

**Week 3-4: Chatbot Beta (Internal)**
```bash
ENABLE_MULTI_STOCK_CHATBOT=true  # For internal testing only
```
- Test with internal users first
- Validate tool selection accuracy across stocks
- Monitor: validation pass rates, regeneration rates

**Week 5+: Full Rollout**
```bash
ENABLE_MULTI_STOCK_CHATBOT=true
ENABLE_STOCK_COMPARISON=true
```
- Enable for all users
- Monitor for 1 week before considering stable

### Rollback Procedure

If issues are detected:

1. **Immediate Rollback** - Set flag to `false` in Vercel environment variables
2. **No Code Deploy Required** - Flags read at runtime
3. **Partial Rollback** - Can disable chatbot while keeping charts enabled

### Monitoring During Rollout

Track these metrics after each flag is enabled:

| Metric | Target | Rollback Trigger |
|--------|--------|------------------|
| Tool selection accuracy | >95% | <90% |
| Answer validation pass rate | >85% | <75% |
| Chart render time (p95) | <2s | >5s |
| API error rate | <1% | >5% |
| Database query time (p95) | <500ms | >2s |

### UI Indicators

When multi-stock is disabled, show clear messaging:

```tsx
// In Sidebar.tsx or chat input
{!isMultiStockChatbotEnabled() && (
  <div className="text-xs text-gray-500 mb-2">
    Currently answering questions about AAPL only.
    Multi-stock support coming soon.
  </div>
)}
```

---

## Infrastructure & Operations

### Database Indexes

Add indexes for performance at scale:

```sql
-- Financials queries
CREATE INDEX idx_financials_symbol_year ON financials_std(symbol, year DESC);
CREATE INDEX idx_financials_symbol_period ON financials_std(symbol, period_type, year DESC);

-- Metrics queries
CREATE INDEX idx_metrics_symbol_name ON financial_metrics(symbol, metric_name, year DESC);

-- Segments queries
CREATE INDEX idx_company_metrics_symbol ON company_metrics(symbol, metric_name, year DESC);

-- Filing lookups
CREATE INDEX idx_filings_symbol_type ON filings(symbol, filing_type, fiscal_year DESC);
CREATE INDEX idx_chunks_filing ON filing_chunks(filing_id);
```

### Worker Environment for Long-Running Jobs

**Problem:** Ingestion jobs can run 6+ hours. Running them in web request lifecycle causes:
- Vercel/Next.js function timeouts (max 60s on hobby, 300s on pro)
- Memory exhaustion
- No ability to resume after crashes
- No progress visibility

**Solution:** Run ingestion in dedicated worker processes with checkpointing.

#### Option 1: Local Script Execution (Recommended for MVP)

Run scripts directly from development machine or a dedicated server:

```bash
# Use tmux or screen for persistence
tmux new -s ingestion

# Run with logging
npx tsx scripts/ingest-financials-batch.ts 2>&1 | tee logs/ingestion-$(date +%Y%m%d).log

# Detach: Ctrl+B, D
# Reattach: tmux attach -t ingestion
```

**Checkpointing for Resume:**

```typescript
// scripts/ingest-financials-batch.ts

interface Checkpoint {
  lastProcessedSymbol: string
  lastProcessedTaskType: string
  processedCount: number
  errorCount: number
  startedAt: string
  lastUpdatedAt: string
}

async function runWithCheckpointing() {
  const checkpointFile = 'data/ingestion-checkpoint.json'

  // Load checkpoint if exists
  let checkpoint: Checkpoint | null = null
  if (existsSync(checkpointFile)) {
    checkpoint = JSON.parse(readFileSync(checkpointFile, 'utf-8'))
    console.log(`Resuming from checkpoint: ${checkpoint.lastProcessedSymbol}`)
  }

  const queue = await getPendingTasks(checkpoint?.lastProcessedSymbol)

  for (const task of queue) {
    try {
      await processTask(task)

      // Update checkpoint after each successful task
      checkpoint = {
        lastProcessedSymbol: task.symbol,
        lastProcessedTaskType: task.taskType,
        processedCount: (checkpoint?.processedCount || 0) + 1,
        errorCount: checkpoint?.errorCount || 0,
        startedAt: checkpoint?.startedAt || new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      }
      writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2))

    } catch (error) {
      console.error(`Error processing ${task.symbol}: ${error.message}`)
      checkpoint.errorCount++
      writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2))

      // Continue to next task (don't fail entire batch)
    }
  }

  // Clean up checkpoint on success
  unlinkSync(checkpointFile)
  console.log('Ingestion complete!')
}
```

#### Option 2: GitHub Actions (For Scheduled Jobs)

Use GitHub Actions for scheduled ingestion with longer timeouts:

```yaml
# .github/workflows/daily-ingestion.yml
name: Daily Data Ingestion

on:
  schedule:
    - cron: '0 6 * * *'  # 6 AM UTC daily
  workflow_dispatch:  # Manual trigger

jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 360  # 6 hours max

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - name: Run incremental ingestion
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          FMP_API_KEY: ${{ secrets.FMP_API_KEY }}
        run: |
          npx tsx scripts/update-financials.ts

      - name: Upload logs on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: ingestion-logs
          path: logs/
```

#### Option 3: Dedicated Worker Service (For Scale)

For production at scale, consider:
- **Railway/Render background workers** - Long-running processes with auto-restart
- **AWS Lambda with Step Functions** - For complex multi-stage pipelines
- **Inngest/Trigger.dev** - Serverless job orchestration with built-in retry

**Environment Variables for Workers:**

```bash
# .env.worker (separate from .env.local)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # NOT anon key
FMP_API_KEY=your-fmp-key

# Worker-specific settings
BATCH_SIZE=50
MAX_CONCURRENT=5
CHECKPOINT_INTERVAL=10  # Save checkpoint every N tasks
```

**Key Principle:** Never run multi-hour ingestion from web requests. Always use:
1. Local scripts with checkpointing (MVP)
2. CI/CD scheduled jobs (daily updates)
3. Dedicated workers (production scale)

### Monitoring & Alerting

**Metrics to Track:**
- Data freshness per stock
- Query latency (p50, p95, p99)
- Error rates by endpoint
- Storage utilization

**Alerts:**
- Data older than 7 days for any stock
- Query latency > 2 seconds
- Error rate > 1%
- Storage > 80% capacity

### Scheduled Jobs

| Job | Frequency | Description |
|-----|-----------|-------------|
| Update S&P 500 list | Quarterly | Check for index changes |
| Fetch new financials | Daily | Get latest earnings data |
| Refresh segment data | Quarterly | Fetch updated segments from FMP |
| Validate data integrity | Weekly | Run consistency checks |
| Clean up old logs | Daily | Remove query logs > 30 days |

### Backup Strategy

- **Supabase:** Automatic daily backups (Pro plan)
- **Local data cache:** JSON exports of critical tables

### Cost Projections

| Resource | Monthly Cost |
|----------|--------------|
| Supabase Pro | $25 |
| Supabase Storage (minimal) | ~$1 |
| FMP API (paid tier) | $29 |
| OpenAI GPT (chatbot) | ~$50 (usage-based) |
| **Total** | **~$105/month** |

> **Note:** Storage costs reduced significantly by not downloading SEC filings (~30GB savings).

---

## Risk Assessment & Mitigation

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| FMP API changes/downtime | Medium | High | Cache data locally, retry logic |
| FMP segment data incomplete | Low | Medium | Cross-validate against company totals |
| Supabase limits | Low | Medium | Monitor usage, upgrade if needed |
| Data volume exceeds tier limits | Low | Medium | Monitor row counts, upgrade plan if needed |
| Data quality issues | Medium | Medium | Validation checks, manual review |

### Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Pipeline failure mid-run | Medium | Medium | Checkpointing, resume capability |
| Incorrect data ingested | Low | High | Validation, ability to re-ingest |
| Performance degradation | Medium | Medium | Indexes, caching, monitoring |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| API pricing changes | Medium | Medium | Budget buffer, alternative sources |
| S&P 500 composition changes | Certain | Low | Quarterly update process |
| User confusion with more stocks | Low | Low | Good UX, data availability indicators |

---

## Success Criteria

### Phase 0: Migration
- [ ] Backup files created for all existing data
- [ ] No duplicate rows in any table
- [ ] AAPL/GOOGL data verified intact
- [ ] Unique constraints added to prevent duplicates

### Phase 1: Ticker Management
- [ ] 500 S&P 500 tickers in database
- [ ] 100% have valid CIK numbers
- [ ] All have sector classification
- [ ] Update script works for quarterly changes

### Phase 2: Financial Data
- [ ] 500 stocks with 10 years annual data
- [ ] 500 stocks with 7 years quarterly data
- [ ] Data passes validation checks
- [ ] Incremental update works

### Phase 3: SEC Filings (DEFERRED)

> **SKIPPED** - Phase 3 deferred. Segment data obtained via FMP API instead.
> Existing AAPL filings remain functional for chatbot filing tools.

### Phase 4: Segment Data (FMP API)
- [ ] 400+ stocks have segment data from FMP
- [ ] Data validates against company totals (within 15%)
- [ ] Cross-company queries work
- [ ] Segment name normalization applied

### Phase 5: Chatbot
- [ ] Can select any S&P 500 stock
- [ ] Questions answered accurately
- [ ] Missing data handled gracefully
- [ ] Performance acceptable (< 5s)

### Phase 6: Charts
- [ ] Can search and select any stock
- [ ] Multi-stock comparison works (5 stocks)
- [ ] Segment metrics load dynamically
- [ ] Missing data doesn't break chart

### Overall
- [ ] End-to-end testing passes
- [ ] Performance targets met
- [ ] Documentation complete
- [ ] Monitoring in place

---

## Appendix

### A. S&P 500 Sectors (GICS)

| Sector | Count | Examples |
|--------|-------|----------|
| Information Technology | 75 | AAPL, MSFT, NVDA |
| Health Care | 65 | JNJ, UNH, PFE |
| Financials | 70 | JPM, BAC, BRK.B |
| Consumer Discretionary | 55 | AMZN, TSLA, HD |
| Communication Services | 25 | GOOGL, META, DIS |
| Industrials | 75 | HON, UPS, CAT |
| Consumer Staples | 35 | PG, KO, WMT |
| Energy | 25 | XOM, CVX, COP |
| Utilities | 30 | NEE, DUK, SO |
| Real Estate | 30 | AMT, PLD, CCI |
| Materials | 30 | LIN, APD, SHW |

### B. FMP API Response Examples

**Income Statement:**
```json
{
  "date": "2023-09-30",
  "symbol": "AAPL",
  "reportedCurrency": "USD",
  "revenue": 383285000000,
  "costOfRevenue": 214137000000,
  "grossProfit": 169148000000,
  "operatingIncome": 114301000000,
  "netIncome": 96995000000,
  "eps": 6.16
}
```

**Key Metrics:**
```json
{
  "date": "2023-09-30",
  "symbol": "AAPL",
  "peRatio": 28.54,
  "priceToSalesRatio": 7.23,
  "pbRatio": 47.12,
  "debtToEquity": 1.81,
  "returnOnEquity": 1.56,
  "freeCashFlow": 99584000000
}
```

### C. SEC EDGAR Response Examples

**Company Submissions:**
```json
{
  "cik": "320193",
  "entityType": "operating",
  "name": "Apple Inc.",
  "filings": {
    "recent": {
      "accessionNumber": ["0000320193-23-000077", ...],
      "filingDate": ["2023-11-03", ...],
      "form": ["10-K", ...],
      "primaryDocument": ["aapl-20230930.htm", ...]
    }
  }
}
```

### D. Common Segment Names by Industry

**Technology:**
- Products, Services, Cloud, Advertising, Subscriptions

**Retail:**
- Stores, E-commerce, Wholesale, Membership

**Financial:**
- Consumer Banking, Commercial Banking, Investment Banking, Asset Management

**Healthcare:**
- Pharmaceuticals, Medical Devices, Healthcare Services

### E. Glossary

| Term | Definition |
|------|------------|
| CIK | Central Index Key - SEC's unique identifier for companies |
| RAG | Retrieval Augmented Generation - AI technique using document search |
| iXBRL | Inline eXtensible Business Reporting Language - structured filing format |
| pgvector | PostgreSQL extension for vector similarity search |
| Accession Number | SEC's unique identifier for a specific filing |
| GICS | Global Industry Classification Standard - sector taxonomy |

---

## Out of Scope / Deferred Decisions

This section documents architectural changes and features that were considered but **intentionally excluded** from this plan. This prevents re-litigating decisions and provides context for future planning.

### Rejected: Full company_id (UUID) Migration

**What was suggested:** Replace all `symbol` foreign keys with `company_id` (UUID) across all tables. Create a `company_aliases` table for symbol mappings.

**Why rejected:**
- **Over-engineered for MVP**: Symbol-based joins work fine for S&P 500 data where symbols are stable
- **Migration complexity**: Would require updating 10+ tables, all queries, all scripts
- **Low ROI**: Symbol changes are rare (~2-3/year for S&P 500) and can be handled manually or with simpler solutions
- **Breaks existing patterns**: Current codebase consistently uses `symbol` as the key

**Simpler alternative implemented:** Added `alternate_symbols JSONB` column to `sp500_constituents` for vendor-specific mappings (e.g., `{"fmp": "BRK-B", "edgar": "BRK.B"}`).

**Reconsider when:** Expanding beyond S&P 500 to international stocks with frequent ticker changes, or if symbol conflicts become a recurring issue.

---

### Rejected: Separate index_membership Table

**What was suggested:** Create a separate `index_membership` table to track which stocks belong to which indices (S&P 500, NASDAQ-100, etc.) with historical membership data.

**Why rejected:**
- **Single-index MVP**: We're only tracking S&P 500 for now
- **Unnecessary abstraction**: The `sp500_constituents` table already has `date_added` and `date_removed` columns for membership history
- **Premature optimization**: Multi-index support is not on the roadmap

**Reconsider when:** Adding NASDAQ-100, Russell 2000, or other indices to the platform.

---

### Rejected: Embedding-Based Filing Search (RAG)

**What was suggested:** Generate embeddings for all SEC filing chunks and enable semantic search across filings.

**Why rejected:**
- **Cost prohibitive**: ~$17,500 for 17,500 filings × 50K tokens each
- **Not core to MVP**: Users primarily want financial metrics, not document search
- **Maintenance burden**: Embeddings need regeneration when chunking changes

**Current approach:** No filing embeddings. Segment data obtained via FMP API.

**Reconsider when:** User research indicates demand for "search across all 10-Ks for mention of X" functionality, and budget allows for embedding costs.

---

### Deferred: SEC Filing Download & iXBRL Parsing

**What was originally planned:** Download ~17,500 SEC filings (10-K and 10-Q) and build iXBRL/XBRL parsers to extract segment data directly from regulatory filings.

**Why deferred:**
- **FMP API provides segment data**: The `/stable/revenue-product-segmentation` and `/stable/revenue-geographic-segmentation` endpoints provide pre-parsed, normalized segment revenue data
- **Massive simplification**: Saves 10-14 hours of development time
- **Storage savings**: ~30GB of filing storage not needed
- **Maintenance reduction**: No need to maintain XBRL parsing code or handle format variations

**What we lose by deferring:**
- Operating income by segment (only revenue available via FMP)
- Cost of sales breakdown (Products vs Services)
- Country-level revenue detail (US, China specifically vs regional totals)
- Long-lived assets by geography
- Raw filing text for future RAG capabilities

**Current approach:** Use FMP Segment API as the sole source for segment data. See Phase 4 implementation.

**Reconsider when:**
- Users need segment-level profitability (operating income by segment)
- Country-level revenue breakdowns become a priority feature
- Building RAG/semantic search over filing content
- FMP segment API data proves insufficient or unreliable

---

### Rejected: Real-Time Data Streaming

**What was suggested:** Implement WebSocket connections for real-time price updates and live data feeds.

**Why rejected:**
- **Scope creep**: MVP focuses on historical financial data analysis, not real-time trading
- **Cost**: Real-time data feeds are expensive ($500+/month for professional-grade)
- **Complexity**: Requires different architecture (WebSockets, streaming infrastructure)

**Current approach:** Daily price data fetched on-demand from FMP API with caching.

**Reconsider when:** Building trading-oriented features or real-time alerting.

---

### Rejected: Multi-Tenant Architecture

**What was suggested:** Design for multiple organizations/teams with data isolation and separate billing.

**Why rejected:**
- **Consumer MVP**: Current product is a single-tenant consumer app
- **Premature**: No paying customers yet to justify enterprise architecture
- **Complexity**: Row-level security, tenant isolation, billing integration

**Reconsider when:** Pursuing B2B sales or enterprise customers.

---

### Deferred: Automated S&P 500 Rebalancing

**What was suggested:** Automatically detect and ingest data when S&P 500 composition changes (quarterly).

**Why deferred (not rejected):**
- **Nice to have**: Manual quarterly updates are acceptable for MVP
- **Complexity**: Requires monitoring external sources, triggering pipelines
- **Low frequency**: Only ~20-25 changes per year

**Current approach:** Manual quarterly review and update using `scripts/update-sp500-constituents.ts`.

**Plan to implement:** After MVP launch, when operational overhead becomes noticeable.

---

### Deferred: Comprehensive Audit Logging

**What was suggested:** Log all data changes with full audit trail (who changed what, when, previous values).

**Why deferred:**
- **Read-heavy workload**: Most operations are reads; writes are batch ingestion
- **Supabase limitations**: Full audit logging requires additional infrastructure
- **Privacy considerations**: Need to define retention policies first

**Current approach:** `ingestion_logs` table tracks batch job metadata (started, completed, counts, errors).

**Plan to implement:** When compliance requirements emerge (SOC 2, enterprise customers).

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-16 | Claude | Initial draft |

---

*This document serves as the master plan for expanding Fin Quote to support all S&P 500 stocks. Each phase should be completed in order, with validation checks passing before proceeding to the next phase.*
