# GOOGL Implementation Plan

## Overview

This document details the complete implementation plan for adding Google/Alphabet (GOOGL) support to Fin Quote. The implementation is divided into four phases, with Phase 1 (Standard Metrics) being the highest priority.

**Current State:** All data and functionality is hardcoded to Apple (AAPL).

**Target State:** Support for both AAPL and GOOGL with a stock selector UI, dynamic metrics, and company-specific segment data.

---

## GOOGL Company Research

### Business Segments

Google/Alphabet reports three main business segments in their SEC filings:

| Segment | % of Revenue (2024) | Description |
|---------|---------------------|-------------|
| **Google Services** | ~87% | Search, YouTube, Android, Chrome, Maps, Play, Devices, Subscriptions |
| **Google Cloud** | ~12% | Google Cloud Platform (GCP), Google Workspace |
| **Other Bets** | ~1% | Waymo, Verily, Wing, Calico, CapitalG, GV, X |

### Metrics Reported by Segment

- Revenue (by segment)
- Operating Income/Loss (by segment)
- Operating Margin (by segment)

### Geographic Breakdown

- United States
- EMEA (Europe, Middle East, Africa)
- APAC (Asia Pacific)
- Other Americas

### Key Financial Dates

| Item | Value |
|------|-------|
| **Fiscal Year End** | December 31 |
| **SEC CIK** | 0001652044 |
| **Stock Symbol** | GOOGL (Class A), GOOG (Class C) |
| **Fiscal Quarter Schedule** | Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec |

### Segment Structure History

- **Pre-2020:** Single "Google" segment reported
- **Q4 2020:** Split into Google Services and Google Cloud
- **Current:** Three segments (Google Services, Google Cloud, Other Bets)

---

## Phase 1: Standard Metrics

**Goal:** Get all standard financial metrics (Revenue, Net Income, EPS, P/E, etc.) working for GOOGL on the charts page.

**Priority:** HIGH - This is the foundation for everything else.

### 1.1 Update Data Fetch Scripts

#### 1.1.1 Modify `scripts/fetch-aapl-data.ts`

**Current State:** Hardcoded to fetch AAPL data from FMP API.

**Changes Required:**

1. Rename file to `scripts/fetch-financial-data.ts` (optional, for clarity)

2. Add command-line argument for symbol:
   ```bash
   npx tsx scripts/fetch-financial-data.ts AAPL
   npx tsx scripts/fetch-financial-data.ts GOOGL
   ```

3. Replace all hardcoded `'AAPL'` references with the symbol parameter

4. Update output filename to include symbol:
   - `data/aapl-financials.json` → `data/{symbol}-financials.json`

5. Handle different fiscal year ends:
   - AAPL: September (month 9)
   - GOOGL: December (month 12)

**FMP API Endpoints Used:**
- `/income-statement/{symbol}?period=annual&limit=20`
- `/income-statement/{symbol}?period=quarter&limit=80`
- `/balance-sheet-statement/{symbol}?period=annual&limit=20`
- `/balance-sheet-statement/{symbol}?period=quarter&limit=80`
- `/cash-flow-statement/{symbol}?period=annual&limit=20`
- `/cash-flow-statement/{symbol}?period=quarter&limit=80`

**Data Transformations:**
- Map FMP field names to our standardized schema
- Calculate fiscal year/quarter based on company's fiscal calendar
- Handle null values and data gaps

#### 1.1.2 Modify `scripts/fetch-fmp-metrics.ts`

**Current State:** Fetches 139 extended metrics for AAPL.

**Changes Required:**

1. Add command-line argument for symbol

2. Update output filename: `data/{symbol}-fmp-metrics.json`

3. Update all API calls to use dynamic symbol

**FMP API Endpoints Used:**
- `/ratios/{symbol}?period=annual&limit=20`
- `/ratios/{symbol}?period=quarter&limit=80`
- `/key-metrics/{symbol}?period=annual&limit=20`
- `/key-metrics/{symbol}?period=quarter&limit=80`
- `/growth/{symbol}?period=annual&limit=20`
- `/enterprise-values/{symbol}?period=annual&limit=20`
- `/enterprise-values/{symbol}?period=quarter&limit=80`

### 1.2 Update Data Ingest Scripts

#### 1.2.1 Modify `scripts/ingest-financials.ts`

**Current State:** Reads `data/aapl-financials.json` and inserts into `financials_std` table.

**Changes Required:**

1. Add command-line argument for symbol

2. Read from `data/{symbol}-financials.json`

3. Ensure `symbol` field is set correctly in database records

4. Add upsert logic to prevent duplicates (on `symbol` + `year` + `period_type` + `fiscal_quarter`)

**Database Table:** `financials_std`

**Columns:**
- `symbol` (TEXT)
- `year` (INTEGER)
- `period_type` ('annual' | 'quarterly')
- `fiscal_quarter` (INTEGER, nullable)
- `revenue`, `gross_profit`, `net_income`, `operating_income`
- `total_assets`, `total_liabilities`, `shareholders_equity`
- `operating_cash_flow`, `eps`

#### 1.2.2 Modify `scripts/ingest-fmp-metrics.ts`

**Current State:** Reads `data/aapl-fmp-metrics.json` and inserts into `financial_metrics` table.

**Changes Required:**

1. Add command-line argument for symbol

2. Read from `data/{symbol}-fmp-metrics.json`

3. Ensure `symbol` field is set correctly

4. Add upsert logic on `symbol` + `year` + `period` + `metric_name`

**Database Table:** `financial_metrics`

**Columns:**
- `symbol` (TEXT)
- `year` (INTEGER)
- `period` ('FY' | 'Q1' | 'Q2' | 'Q3' | 'Q4')
- `metric_name` (TEXT)
- `metric_value` (NUMERIC)
- `metric_category` (TEXT)
- `data_source` (TEXT)

### 1.3 Add Company to Database

#### 1.3.1 Insert GOOGL into `company` Table

```sql
INSERT INTO company (symbol, name, sector)
VALUES ('GOOGL', 'Alphabet Inc.', 'Technology')
ON CONFLICT (symbol) DO NOTHING;
```

### 1.4 Update Backend (Server Actions)

#### 1.4.1 Modify `app/actions/chart-metrics.ts`

**Current State:** All queries hardcoded to `symbol = 'AAPL'`.

**Changes Required:**

1. Add `symbol` parameter to `getMultipleMetrics()` function:
   ```typescript
   export async function getMultipleMetrics(params: {
     symbol: string  // NEW
     metrics: MetricId[]
     minYear?: number
     maxYear?: number
     period?: 'annual' | 'quarterly'
   })
   ```

2. Replace all `.eq('symbol', 'AAPL')` with `.eq('symbol', params.symbol)`

3. Update `getAvailableMetrics()` to optionally filter by symbol (for segment metrics)

**Files with hardcoded 'AAPL':**
- Line 220: `.eq('symbol', 'AAPL')`
- Line 257: `.eq('symbol', 'AAPL')`
- Line 289: `.eq('symbol', 'AAPL')`
- Line 485: `.eq('symbol', 'AAPL')`

#### 1.4.2 Modify `app/actions/financials.ts`

**Current State:** Hardcoded to AAPL.

**Changes Required:**

1. Add `symbol` parameter to `getAaplFinancialsByMetric()` (rename to `getFinancialsByMetric()`)

2. Update all database queries to use dynamic symbol

#### 1.4.3 Modify `app/actions/get-financial-metric.ts`

**Current State:** Hardcoded to AAPL.

**Changes Required:**

1. Add `symbol` parameter

2. Update queries to use dynamic symbol

### 1.5 Update Frontend (Charts Page)

#### 1.5.1 Create Stock Selector Component

**New File:** `components/StockSelector.tsx`

**Features:**
- Dropdown with checkboxes for AAPL and GOOGL
- Shows selected stock(s) as chips/tags
- Allows single or multiple selection
- Emits `onChange` with array of selected symbols

**Props:**
```typescript
interface StockSelectorProps {
  availableStocks: { symbol: string; name: string }[]
  selectedStocks: string[]
  onChange: (symbols: string[]) => void
  allowMultiple?: boolean
}
```

**UI Design:**
```
┌─────────────────────────────────┐
│ Stocks ▼                        │
├─────────────────────────────────┤
│ ☑ AAPL - Apple Inc.            │
│ ☐ GOOGL - Alphabet Inc.        │
└─────────────────────────────────┘
```

#### 1.5.2 Modify `app/charts/page.tsx`

**Changes Required:**

1. Add state for selected stocks:
   ```typescript
   const [selectedStocks, setSelectedStocks] = useState<string[]>(['AAPL'])
   ```

2. Add StockSelector component to the UI (near Annual/Quarterly toggle)

3. Pass selected symbol(s) to `getMultipleMetrics()` calls

4. Update chart labels to include stock name when multiple stocks selected

**UI Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│ [Annual] [Quarterly]  │ Stocks: [AAPL ▼]  │ [Range Slider]   │
├──────────────────────────────────────────────────────────────┤
│ Income Statement (2) ▼ │ Balance Sheet ▼ │ Cash Flow ▼ │ ...│
├──────────────────────────────────────────────────────────────┤
│ ☑ Revenue  ☑ Net Income                                      │
├──────────────────────────────────────────────────────────────┤
│                         CHART                                │
└──────────────────────────────────────────────────────────────┘
```

#### 1.5.3 Update Chart Labels

**When single stock selected:**
- Legend: "Revenue", "Net Income"
- Tooltip: "2024: $391.0B"

**When multiple stocks selected:**
- Legend: "Apple Revenue", "Google Revenue"
- Tooltip: "Apple 2024: $391.0B"

### 1.6 Testing Phase 1

#### 1.6.1 Data Validation

- [ ] Verify GOOGL financials data fetched correctly (20 years annual, 80 quarters)
- [ ] Verify GOOGL extended metrics fetched correctly (139 metrics)
- [ ] Verify data ingested into Supabase tables
- [ ] Spot-check values against Google's investor relations

#### 1.6.2 Chart Validation

- [ ] Select GOOGL only → chart shows GOOGL data
- [ ] Select AAPL only → chart shows AAPL data (regression test)
- [ ] Select both → chart shows both with correct labels
- [ ] Toggle Annual/Quarterly → data updates correctly
- [ ] Move year range slider → data filters correctly

---

## Phase 2: SEC Filings & RAG

**Goal:** Download and index GOOGL 10-K/10-Q filings for semantic search (chatbot).

**Priority:** MEDIUM - Enables chatbot to answer questions about GOOGL filings.

### 2.1 Fetch Filing Metadata

#### 2.1.1 Modify `scripts/fetch-sec-filings.ts`

**Current State:** Hardcoded to AAPL's CIK.

**Changes Required:**

1. Add command-line argument for symbol

2. Create CIK lookup map:
   ```typescript
   const CIK_MAP: Record<string, string> = {
     'AAPL': '0000320193',
     'GOOGL': '0001652044',
   }
   ```

3. Update fiscal year calculation to handle different fiscal year ends:
   ```typescript
   const FISCAL_YEAR_END_MONTH: Record<string, number> = {
     'AAPL': 9,   // September
     'GOOGL': 12, // December
   }
   ```

4. Save output to `data/{symbol}-filings.json`

**SEC EDGAR API:**
```
https://data.sec.gov/submissions/CIK{cik}.json
```

**Rate Limiting:** 10 requests per second max, add 100ms delay between requests.

**User-Agent Required:** `'Fin Quote App contact@example.com'`

### 2.2 Ingest Filing Metadata

#### 2.2.1 Modify `scripts/ingest-filings.ts`

**Changes Required:**

1. Add command-line argument for symbol

2. Read from `data/{symbol}-filings.json`

3. Upsert on `accession_number` (already unique)

### 2.3 Download Filing HTML

#### 2.3.1 Modify `scripts/download-filings.ts`

**Current State:** Queries filings table filtered to AAPL.

**Changes Required:**

1. Add command-line argument for symbol

2. Update query: `.eq('ticker', symbol)`

3. Update storage path: `filings/html/{symbol}-{filing_type}-{fiscal_year}.html`

**Rate Limiting:** 1 second delay between SEC downloads (required by SEC).

### 2.4 Chunk Filings

#### 2.4.1 `scripts/chunk-filings.ts`

**Current State:** Already symbol-agnostic (parses from filename).

**Changes Required:** None - script already handles any ticker.

**Chunk Settings:**
- Chunk size: 800 words
- Overlap: 100 words
- Section detection: Risk Factors, MD&A, Business, Financial Statements, Notes

### 2.5 Embed Filings

#### 2.5.1 `scripts/embed-filings.ts`

**Current State:** Already symbol-agnostic.

**Changes Required:** None.

**Embedding Settings:**
- Model: `text-embedding-3-small`
- Dimensions: 1536
- Batch size: 10 chunks
- Rate limiting: 500ms between batches

### 2.6 Update RAG Search

#### 2.6.1 Modify `app/actions/search-filings.ts`

**Current State:** May be hardcoded to AAPL.

**Changes Required:**

1. Add `symbol` parameter to search function

2. Filter search results by ticker:
   ```typescript
   .eq('filings.ticker', symbol)
   ```

### 2.7 Testing Phase 2

- [ ] Verify filing metadata fetched for GOOGL (10 years of 10-K/10-Q)
- [ ] Verify filings ingested into database
- [ ] Verify HTML files downloaded to Supabase Storage
- [ ] Verify chunking produces expected number of chunks
- [ ] Verify embeddings generated
- [ ] Test RAG search: "What are Google's risk factors?"

---

## Phase 3: Segment-Specific Metrics (iXBRL Parsing)

**Goal:** Extract Google Services, Cloud, and Other Bets revenue from SEC filings using iXBRL parsing.

**Priority:** MEDIUM - Enables "Stock Specific" metrics for GOOGL.

### 3.1 Research GOOGL iXBRL Structure

#### 3.1.1 Download Sample Filing

1. Download GOOGL 10-K 2024 HTML from SEC
2. Open in text editor and search for:
   - `<ix:nonFraction` tags (fact values)
   - `<xbrli:context` tags (dimensional context)
   - `<xbrldi:explicitMember` tags (segment dimensions)

#### 3.1.2 Identify XBRL Axes

**Expected Axes (to verify):**

| Axis Type | Likely XBRL Axis Name |
|-----------|----------------------|
| Segment | `us-gaap:StatementBusinessSegmentsAxis` |
| Geographic | `srt:StatementGeographicalAxis` |

#### 3.1.3 Identify XBRL Members

**Expected Members (to verify):**

| Segment | Likely XBRL Member Name |
|---------|------------------------|
| Google Services | `goog:GoogleServicesMember` or similar |
| Google Cloud | `goog:GoogleCloudMember` or similar |
| Other Bets | `goog:OtherBetsMember` or similar |

**Geographic Members:**
| Region | Likely XBRL Member Name |
|--------|------------------------|
| United States | `country:US` |
| EMEA | `goog:EMEAMember` or similar |
| APAC | `goog:APACMember` or similar |

### 3.2 Create GOOGL iXBRL Mappings

#### 3.2.1 Create `lib/ixbrl-mappings/googl.ts`

**Structure (following AAPL pattern):**

```typescript
export const GOOGL_MAPPINGS = {
  // Company identification
  symbol: 'GOOGL',
  name: 'Alphabet Inc.',

  // Fiscal calendar
  fiscalYearEndMonth: 12, // December

  // XBRL axis identifiers
  axes: {
    segment: 'us-gaap:StatementBusinessSegmentsAxis',
    geographic: 'srt:StatementGeographicalAxis',
  },

  // XBRL member to display name mappings
  members: {
    // Segments (to be filled after research)
    'goog:GoogleServicesMember': {
      displayName: 'Google Services',
      type: 'segment'
    },
    'goog:GoogleCloudMember': {
      displayName: 'Google Cloud',
      type: 'segment'
    },
    'goog:OtherBetsMember': {
      displayName: 'Other Bets',
      type: 'segment'
    },

    // Geographic (to be filled after research)
    'country:US': {
      displayName: 'United States',
      type: 'geographic'
    },
    // ... more geographic members
  },

  // Metrics to extract
  metrics: [
    {
      xbrlFact: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
      metricName: 'segment_revenue',
      metricCategory: 'segment_reporting',
    },
    {
      xbrlFact: 'us-gaap:OperatingIncomeLoss',
      metricName: 'segment_operating_income',
      metricCategory: 'segment_reporting',
    },
  ],
}
```

#### 3.2.2 Update `lib/ixbrl-mappings/index.ts`

```typescript
import { AAPL_MAPPINGS } from './aapl'
import { GOOGL_MAPPINGS } from './googl'

export const COMPANY_MAPPINGS: Record<string, CompanyMappings> = {
  AAPL: AAPL_MAPPINGS,
  GOOGL: GOOGL_MAPPINGS,
}

export function getMappingsForSymbol(symbol: string): CompanyMappings | null {
  return COMPANY_MAPPINGS[symbol] ?? null
}
```

### 3.3 Parse GOOGL Segment Data

#### 3.3.1 Run Parsing Script

```bash
# Test parsing (dry run)
npx tsx scripts/parse-ixbrl-segments.ts --ticker GOOGL --filing googl-10-k-2024.html

# Parse and ingest
npx tsx scripts/parse-ixbrl-segments.ts --ticker GOOGL --ingest
```

#### 3.3.2 Verify Data Extraction

Check that segment data is extracted correctly:
- Google Services revenue
- Google Cloud revenue
- Other Bets revenue
- Operating income by segment
- Geographic breakdown

### 3.4 Add GOOGL Segments to Chart Metrics

#### 3.4.1 Update `METRIC_CONFIG` in `chart-metrics.ts`

Add GOOGL-specific segment metrics:

```typescript
// === GOOGL SEGMENTS ===
googl_segment_services: {
  label: 'Google Services Revenue',
  unit: 'currency',
  statement: 'stock',
  definition: 'Revenue from Google Services including Search, YouTube, Android, Chrome, Maps, Play, and Devices.',
  source: 'company_metrics',
  dimensionType: 'segment',
  dimensionValue: 'Google Services',
  symbol: 'GOOGL', // NEW: restrict to specific symbol
},
googl_segment_cloud: {
  label: 'Google Cloud Revenue',
  unit: 'currency',
  statement: 'stock',
  definition: 'Revenue from Google Cloud Platform and Google Workspace.',
  source: 'company_metrics',
  dimensionType: 'segment',
  dimensionValue: 'Google Cloud',
  symbol: 'GOOGL',
},
googl_segment_other_bets: {
  label: 'Other Bets Revenue',
  unit: 'currency',
  statement: 'stock',
  definition: 'Revenue from Other Bets including Waymo, Verily, Wing, and other ventures.',
  source: 'company_metrics',
  dimensionType: 'segment',
  dimensionValue: 'Other Bets',
  symbol: 'GOOGL',
},
```

### 3.5 Testing Phase 3

- [ ] Verify iXBRL parsing extracts correct segment values
- [ ] Cross-check extracted values against Google's earnings reports
- [ ] Verify segment data ingested into `company_metrics` table
- [ ] Verify GOOGL segments appear in chart dropdown
- [ ] Verify GOOGL segments chart correctly

---

## Phase 4: UI Updates

**Goal:** Make the "Stock Specific" dropdown dynamic based on selected stock(s).

**Priority:** LOW - Polish after core functionality works.

### 4.1 Dynamic Stock Specific Dropdown

#### 4.1.1 Update `getAvailableMetrics()` in `chart-metrics.ts`

**Changes Required:**

1. Add `symbols` parameter:
   ```typescript
   export async function getAvailableMetrics(symbols?: string[])
   ```

2. Filter segment metrics by symbol:
   ```typescript
   // Only return segment metrics for selected symbols
   if (config.symbol && !symbols?.includes(config.symbol)) {
     return false
   }
   ```

#### 4.1.2 Update `MetricSelector.tsx`

**Changes Required:**

1. Accept `selectedStocks` prop

2. Re-fetch available metrics when selected stocks change

3. Group "Stock Specific" metrics by stock when multiple selected:
   ```
   Stock Specific ▼
   ├── Apple
   │   ├── iPhone Revenue
   │   ├── Services Revenue
   │   └── ...
   └── Google
       ├── Google Services Revenue
       ├── Google Cloud Revenue
       └── Other Bets Revenue
   ```

### 4.2 Multi-Stock Chart Comparison

#### 4.2.1 Update `MultiMetricChart.tsx`

**When comparing same metric across stocks:**

- Legend: "Apple Revenue", "Google Revenue"
- Different colors for each stock
- Tooltip shows both values

**Bar Chart Grouping:**
```
     2022        2023        2024
  ┌───┬───┐  ┌───┬───┐  ┌───┬───┐
  │ A │ G │  │ A │ G │  │ A │ G │
  └───┴───┘  └───┴───┘  └───┴───┘
```

### 4.3 URL State Management

#### 4.3.1 Add URL Parameters

Update charts page to use URL params:
- `/charts?symbols=AAPL,GOOGL&metrics=revenue,net_income&period=annual`

**Benefits:**
- Shareable chart links
- Browser back/forward works
- Bookmarkable views

### 4.4 Testing Phase 4

- [ ] Verify Stock Specific dropdown shows correct metrics per stock
- [ ] Verify multi-stock comparison displays correctly
- [ ] Verify URL parameters work correctly
- [ ] Test all combinations: single stock, multiple stocks, mixed metrics

---

## Database Schema Reference

### Existing Tables (No Changes Needed)

```sql
-- Company information
CREATE TABLE company (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sector TEXT
);

-- Core financial metrics (9 metrics)
CREATE TABLE financials_std (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol TEXT NOT NULL REFERENCES company(symbol),
  year INTEGER NOT NULL,
  period_type TEXT NOT NULL, -- 'annual' or 'quarterly'
  fiscal_quarter INTEGER,    -- NULL for annual, 1-4 for quarterly
  revenue NUMERIC,
  gross_profit NUMERIC,
  net_income NUMERIC,
  operating_income NUMERIC,
  total_assets NUMERIC,
  total_liabilities NUMERIC,
  shareholders_equity NUMERIC,
  operating_cash_flow NUMERIC,
  eps NUMERIC,
  UNIQUE(symbol, year, period_type, fiscal_quarter)
);

-- Extended metrics (139 metrics from FMP)
CREATE TABLE financial_metrics (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  year INTEGER NOT NULL,
  period TEXT NOT NULL,      -- 'FY', 'Q1', 'Q2', 'Q3', 'Q4'
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  metric_category TEXT,
  data_source TEXT,
  UNIQUE(symbol, year, period, metric_name)
);

-- Segment/dimensional metrics (from iXBRL parsing)
CREATE TABLE company_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol TEXT NOT NULL,
  year INTEGER NOT NULL,
  period TEXT NOT NULL,      -- 'FY', 'Q1', 'Q2', 'Q3', 'Q4'
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  unit TEXT,
  dimension_type TEXT,       -- 'product', 'segment', 'geographic'
  dimension_value TEXT,      -- 'iPhone', 'Google Cloud', 'Americas'
  data_source TEXT,
  UNIQUE(symbol, year, period, metric_name, dimension_type, dimension_value)
);

-- SEC filing metadata
CREATE TABLE filings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticker TEXT NOT NULL,
  filing_type TEXT NOT NULL,
  filing_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  accession_number TEXT UNIQUE NOT NULL,
  document_url TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_quarter INTEGER
);

-- Filing chunks for RAG
CREATE TABLE filing_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filing_id UUID REFERENCES filings(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  section_name TEXT,
  word_count INTEGER,
  UNIQUE(filing_id, chunk_index)
);
```

---

## File Changes Summary

### Scripts to Modify

| File | Changes |
|------|---------|
| `scripts/fetch-aapl-data.ts` | Add symbol parameter, rename to `fetch-financial-data.ts` |
| `scripts/fetch-fmp-metrics.ts` | Add symbol parameter |
| `scripts/ingest-financials.ts` | Add symbol parameter |
| `scripts/ingest-fmp-metrics.ts` | Add symbol parameter |
| `scripts/fetch-sec-filings.ts` | Add symbol parameter, CIK lookup |
| `scripts/ingest-filings.ts` | Add symbol parameter |
| `scripts/download-filings.ts` | Add symbol parameter |

### Server Actions to Modify

| File | Changes |
|------|---------|
| `app/actions/chart-metrics.ts` | Add symbol parameter to all functions |
| `app/actions/financials.ts` | Add symbol parameter |
| `app/actions/get-financial-metric.ts` | Add symbol parameter |
| `app/actions/search-filings.ts` | Add symbol filter |

### New Files to Create

| File | Purpose |
|------|---------|
| `lib/ixbrl-mappings/googl.ts` | GOOGL iXBRL axis/member mappings |
| `components/StockSelector.tsx` | Stock selection dropdown component |
| `data/googl-financials.json` | GOOGL financial data (generated) |
| `data/googl-fmp-metrics.json` | GOOGL extended metrics (generated) |
| `data/googl-filings.json` | GOOGL SEC filing metadata (generated) |

### Files to Modify

| File | Changes |
|------|---------|
| `app/charts/page.tsx` | Add stock selector, pass symbol to data fetching |
| `components/MetricSelector.tsx` | Filter metrics by selected stock |
| `components/MultiMetricChart.tsx` | Multi-stock labels and grouping |
| `lib/ixbrl-mappings/index.ts` | Export GOOGL mappings |

---

## Execution Checklist

### Phase 1: Standard Metrics

- [ ] **1.1** Update `fetch-aapl-data.ts` with symbol parameter
- [ ] **1.2** Update `fetch-fmp-metrics.ts` with symbol parameter
- [ ] **1.3** Run fetch for GOOGL: `npx tsx scripts/fetch-financial-data.ts GOOGL`
- [ ] **1.4** Run fetch for GOOGL metrics: `npx tsx scripts/fetch-fmp-metrics.ts GOOGL`
- [ ] **1.5** Update `ingest-financials.ts` with symbol parameter
- [ ] **1.6** Update `ingest-fmp-metrics.ts` with symbol parameter
- [ ] **1.7** Insert GOOGL into `company` table
- [ ] **1.8** Run ingest for GOOGL: `npx tsx scripts/ingest-financials.ts GOOGL`
- [ ] **1.9** Run ingest for GOOGL metrics: `npx tsx scripts/ingest-fmp-metrics.ts GOOGL`
- [ ] **1.10** Update `chart-metrics.ts` with symbol parameter
- [ ] **1.11** Create `StockSelector.tsx` component
- [ ] **1.12** Update `app/charts/page.tsx` with stock selector
- [ ] **1.13** Test GOOGL charts
- [ ] **1.14** Test AAPL charts (regression)
- [ ] **1.15** Commit and deploy

### Phase 2: SEC Filings & RAG

- [ ] **2.1** Update `fetch-sec-filings.ts` with symbol parameter and CIK map
- [ ] **2.2** Run fetch for GOOGL filings: `npx tsx scripts/fetch-sec-filings.ts GOOGL`
- [ ] **2.3** Update `ingest-filings.ts` with symbol parameter
- [ ] **2.4** Run ingest for GOOGL filings
- [ ] **2.5** Update `download-filings.ts` with symbol parameter
- [ ] **2.6** Run download for GOOGL filings
- [ ] **2.7** Run chunking for GOOGL filings
- [ ] **2.8** Run embedding for GOOGL filings
- [ ] **2.9** Update `search-filings.ts` with symbol filter
- [ ] **2.10** Test RAG search for GOOGL
- [ ] **2.11** Commit and deploy

### Phase 3: Segment Metrics

- [ ] **3.1** Download GOOGL 10-K and analyze iXBRL structure
- [ ] **3.2** Document GOOGL XBRL axes and members
- [ ] **3.3** Create `lib/ixbrl-mappings/googl.ts`
- [ ] **3.4** Update `lib/ixbrl-mappings/index.ts`
- [ ] **3.5** Test parsing: `npx tsx scripts/parse-ixbrl-segments.ts --ticker GOOGL`
- [ ] **3.6** Verify extracted values against earnings reports
- [ ] **3.7** Run ingest for GOOGL segments
- [ ] **3.8** Add GOOGL segment metrics to `METRIC_CONFIG`
- [ ] **3.9** Test GOOGL segment charts
- [ ] **3.10** Commit and deploy

### Phase 4: UI Polish

- [ ] **4.1** Update `getAvailableMetrics()` to filter by symbol
- [ ] **4.2** Update `MetricSelector.tsx` for dynamic filtering
- [ ] **4.3** Update `MultiMetricChart.tsx` for multi-stock comparison
- [ ] **4.4** Add URL parameter support
- [ ] **4.5** Test all combinations
- [ ] **4.6** Commit and deploy

---

## Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| FMP API rate limits | Medium | Medium | Add delays, cache responses |
| GOOGL iXBRL structure different than expected | Medium | High | Download sample filing first, adjust mappings |
| Segment structure changed historically | Medium | Medium | Only parse recent filings, note data gaps |
| Database performance with more data | Low | Medium | Existing indexes should handle it |
| Chart rendering slow with multiple stocks | Low | Low | Limit to 2-3 stocks at a time |

---

## Future Considerations

### Adding More Stocks

Once GOOGL is working, the same process can be repeated for:
- MSFT (Microsoft)
- AMZN (Amazon)
- META (Meta/Facebook)
- NVDA (NVIDIA)

Each new stock requires:
1. Fetch and ingest financial data
2. Fetch and ingest SEC filings
3. Create iXBRL mappings for segments
4. Add to stock selector UI

### Potential Enhancements

- **Stock search/autocomplete** instead of fixed dropdown
- **Sector comparison** (compare all tech stocks)
- **Custom date ranges** beyond available data
- **Export to Excel** with multi-stock data
- **Alerts** when new filings are available

---

## Appendix: FMP API Reference

### Endpoints Used

| Endpoint | Data Retrieved |
|----------|---------------|
| `/income-statement/{symbol}` | Revenue, gross profit, net income, operating income, EPS |
| `/balance-sheet-statement/{symbol}` | Assets, liabilities, equity |
| `/cash-flow-statement/{symbol}` | Operating cash flow, free cash flow, capex |
| `/ratios/{symbol}` | P/E, P/B, P/S, ROE, ROA, margins |
| `/key-metrics/{symbol}` | Market cap, enterprise value, per-share metrics |
| `/enterprise-values/{symbol}` | EV, shares outstanding |
| `/growth/{symbol}` | Revenue growth, earnings growth |

### Rate Limits

- 250 API calls/day (free tier)
- 750 API calls/day (starter tier)
- Consider caching responses locally

---

## Appendix: SEC EDGAR Reference

### CIK Numbers

| Company | CIK |
|---------|-----|
| Apple (AAPL) | 0000320193 |
| Alphabet (GOOGL) | 0001652044 |
| Microsoft (MSFT) | 0000789019 |
| Amazon (AMZN) | 0001018724 |
| Meta (META) | 0001326801 |

### Filing Types

| Type | Description | Frequency |
|------|-------------|-----------|
| 10-K | Annual report | Yearly |
| 10-Q | Quarterly report | 3x per year |
| 8-K | Current report | As needed |

### API Endpoints

```
# Company filings list
https://data.sec.gov/submissions/CIK{cik}.json

# Filing document
https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{document}
```

### Rate Limits

- 10 requests per second maximum
- User-Agent header required
- Be respectful of SEC servers
