# Insider Trading Feature - Implementation Plan

## Overview

This document outlines the complete implementation plan for enhancing the `/insiders` feature with database persistence, historical data, and new UI pages.

**Current State:** MVP with FMP API calls on each page load, client-side filtering, 5-minute ISR cache.

**Target State:** Supabase-backed data store with scheduled ingestion, server-side pagination, insider detail pages, and optional SEC historical backfill.

---

## 1. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA SOURCES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐              ┌─────────────────────────────────────┐  │
│  │   FMP API       │              │   SEC EDGAR (Phase 2)               │  │
│  │   (Live Feed)   │              │   Bulk ZIP Archives                 │  │
│  │                 │              │   Forms 3/4/5 Datasets              │  │
│  └────────┬────────┘              └──────────────────┬──────────────────┘  │
│           │                                          │                      │
│           │ Every 30 min                             │ One-time backfill    │
│           │ (Vercel Cron)                            │ (Manual script)      │
│           ▼                                          ▼                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           INGESTION LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     app/api/cron/ingest-insiders/route.ts           │   │
│  │                                                                      │   │
│  │  1. Fetch from FMP (limit: 500)                                     │   │
│  │  2. Transform to normalized schema                                   │   │
│  │  3. Upsert to Supabase (ON CONFLICT DO UPDATE)                      │   │
│  │  4. Log results to ingestion_logs table                             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPABASE (PostgreSQL)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  insider_transactions │  │      insiders        │  │  ingestion_logs  │  │
│  │  (Core fact table)    │  │  (Dimension table)   │  │  (Telemetry)     │  │
│  │                       │  │                      │  │                  │  │
│  │  - id (PK)            │  │  - id (PK)           │  │  - id            │  │
│  │  - symbol             │  │  - cik               │  │  - source        │  │
│  │  - insider_id (FK)    │  │  - name              │  │  - rows_fetched  │  │
│  │  - filing_date        │  │  - name_normalized   │  │  - rows_inserted │  │
│  │  - transaction_date   │  │  - created_at        │  │  - rows_updated  │  │
│  │  - transaction_type   │  │                      │  │  - errors        │  │
│  │  - shares             │  └──────────────────────┘  │  - duration_ms   │  │
│  │  - price              │                            │  - created_at    │  │
│  │  - value              │                            └──────────────────┘  │
│  │  - shares_owned_after │                                                  │
│  │  - owner_type         │  Indexes:                                        │
│  │  - security_name      │  - (transaction_date DESC)                       │
│  │  - sec_link           │  - (symbol, transaction_date DESC)               │
│  │  - source             │  - (insider_id, transaction_date DESC)           │
│  │  - source_id          │  - (value DESC) WHERE transaction_date > now-7d  │
│  │  - created_at         │                                                  │
│  └──────────────────────┘                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVER ACTIONS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  app/actions/insider-trading.ts                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  getLatestInsiderTrades(limit, offset)     → DB query               │   │
│  │  getInsiderTradesBySymbol(symbol, limit)   → DB query               │   │
│  │  getInsiderTradesByInsider(insiderId)      → DB query               │   │
│  │  getTopTradesThisWeek(limit)               → DB query (value DESC)  │   │
│  │  getInsiderProfile(insiderId)              → DB query + aggregates  │   │
│  │  searchInsiders(query)                     → DB full-text search    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              UI LAYER                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  /insiders                    /insider/[id]           /stock/[symbol]       │
│  ┌─────────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │ • Latest Trades     │     │ Insider Profile │     │ Insiders Tab    │   │
│  │ • Top Trades (Week) │     │ • Name, CIK     │     │ • Company trades│   │
│  │ • By Ticker         │     │ • Trade history │     │ • Summary stats │   │
│  │ • By Insider        │     │ • Summary stats │     │                 │   │
│  │                     │     │ • Companies list│     │                 │   │
│  │ Filters:            │     │                 │     │                 │   │
│  │ • Type (Buy/Sell)   │     │                 │     │                 │   │
│  │ • Date range        │     │                 │     │                 │   │
│  │                     │     │                 │     │                 │   │
│  │ Pagination (50/pg)  │     │                 │     │                 │   │
│  └─────────────────────┘     └─────────────────┘     └─────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phased Implementation Plan

### Phase 0: Database Foundation (2-3 days)

**Goal:** Create database schema and migrate existing functionality to use DB.

| Task | File(s) | Description |
|------|---------|-------------|
| 0.1 | `supabase/migrations/xxx_create_insider_tables.sql` | Create `insider_transactions`, `insiders`, `ingestion_logs` tables |
| 0.2 | `supabase/migrations/xxx_create_insider_indexes.sql` | Add performance indexes |
| 0.3 | `lib/database.types.ts` | Add TypeScript types for new tables |
| 0.4 | `app/api/cron/ingest-insiders/route.ts` | Create ingestion endpoint |
| 0.5 | `vercel.json` | Configure cron schedule |
| 0.6 | `app/actions/insider-trading.ts` | Update to query DB with FMP fallback |
| 0.7 | — | Manual test: trigger ingestion, verify data in Supabase |

**Acceptance Criteria:**
- [ ] Tables created in Supabase with RLS policies
- [ ] Cron job runs every 30 minutes without errors
- [ ] Ingestion logs show rows inserted/updated
- [ ] `/insiders` page loads data from database
- [ ] No regression in existing UI functionality

---

### Phase 1: Server-Side Pagination & Performance (2 days)

**Goal:** Move filtering and pagination to server for better performance.

| Task | File(s) | Description |
|------|---------|-------------|
| 1.1 | `app/actions/insider-trading.ts` | Add `offset` param, return `{ trades, total, hasMore }` |
| 1.2 | `components/InsidersPageClient.tsx` | Replace client-side pagination with server calls |
| 1.3 | `components/InsidersPageClient.tsx` | Add URL params for filters (`?type=purchase&days=7`) |
| 1.4 | `app/actions/insider-trading.ts` | Move transaction/date filtering to SQL WHERE clauses |
| 1.5 | — | Performance test: verify <200ms query times |

**Acceptance Criteria:**
- [ ] Page loads first 50 results in <500ms
- [ ] "Next page" fetches from server, not client filter
- [ ] URL reflects current filters (shareable links)
- [ ] Total count shown ("Showing 1-50 of 12,345")

---

### Phase 2: Insider Profile Pages (3-4 days)

**Goal:** Add `/insider/[id]` pages with trade history and stats.

| Task | File(s) | Description |
|------|---------|-------------|
| 2.1 | `app/actions/insider-trading.ts` | Add `getInsiderProfile(id)` with aggregates |
| 2.2 | `app/insider/[id]/page.tsx` | Create insider profile page |
| 2.3 | `components/InsiderProfileHeader.tsx` | Name, total trades, net value |
| 2.4 | `components/InsiderTradeHistory.tsx` | Paginated trade list for this insider |
| 2.5 | `components/InsiderTradesTable.tsx` | Make `reportingName` clickable → `/insider/[id]` |
| 2.6 | `app/actions/insider-trading.ts` | Add `searchInsiders(query)` for autocomplete |
| 2.7 | `components/InsidersPageClient.tsx` | Update "By Insider" tab to use search → profile link |

**Acceptance Criteria:**
- [ ] `/insider/[id]` shows insider name, CIK (if available)
- [ ] Trade history table with all transactions by this insider
- [ ] Summary stats: total buys, total sells, net shares, net value (30/90/365 days)
- [ ] Clicking insider name in main table navigates to profile

---

### Phase 3: Stock Page Integration (2 days)

**Goal:** Add insider trading tab to `/stock/[symbol]` pages.

| Task | File(s) | Description |
|------|---------|-------------|
| 3.1 | `app/actions/insider-trading.ts` | Add `getInsiderTradesBySymbolWithStats(symbol)` |
| 3.2 | `app/stock/[symbol]/page.tsx` | Add "Insiders" tab |
| 3.3 | `components/StockInsidersTab.tsx` | Create component with trades + summary |
| 3.4 | `components/InsiderTradesTable.tsx` | Hide symbol column when on stock page |

**Acceptance Criteria:**
- [ ] `/stock/AAPL` has "Insiders" tab
- [ ] Shows recent insider trades for that company
- [ ] Summary: "X insiders bought Y shares ($Z) in last 90 days"

---

### Phase 4: SEC Bulk Data Ingestion (COMPLETED)

**Goal:** Import structured data from SEC quarterly ZIPs as the primary data source.

**Status:** COMPLETED - Fast batched ingestion implemented.

#### Performance Results

| Metric | Original Script | Batched Script |
|--------|-----------------|----------------|
| **Runtime** | 2-4 hours | **17 seconds** |
| **DB Round-trips** | ~118,000 | ~50 |
| **Throughput** | ~5 rows/sec | ~3,500 rows/sec |

**Scripts:**
- `scripts/ingest-sec-local.ts` - Original (slow, per-row inserts)
- `scripts/ingest-sec-local-fast.ts` - **Use this one** (batched, 700x faster)

**Key Optimizations:**
1. Batch insert insiders in chunks of 2,000 (vs per-row RPC call)
2. Fetch existing records for in-memory deduplication (vs relying on DB constraint)
3. Filter out source duplicates (SEC data has ~1,500 duplicate rows within TSV)
4. Batch insert transactions in chunks of 2,000 (vs per-row insert)

**Usage:**
```bash
# Download SEC quarterly ZIP from:
# https://www.sec.gov/data-research/sec-markets-data/insider-transactions-data-sets

# Extract to data/sec-insiders/
unzip 2025q4_form345.zip -d data/sec-insiders/2025q4_form345/

# Run fast ingestion
npx tsx scripts/ingest-sec-local-fast.ts
```

**Why this should be Phase 0.5 (not optional):**
- SEC data is free, authoritative, and pre-structured
- ~40 MB/year compressed = trivial to store
- FMP just scrapes SEC anyway - go to the source
- Eliminates API rate limit concerns

| Task | File(s) | Description |
|------|---------|-------------|
| 4.1 | `scripts/download-sec-insider-data.ts` | Download SEC quarterly ZIPs |
| 4.2 | `scripts/parse-sec-insider-data.ts` | Parse TSV files (already DB-ready format) |
| 4.3 | `scripts/ingest-sec-insider-data.ts` | Batch insert to Supabase |
| 4.4 | `docs/SEC-INSIDER-DATA-MAPPING.md` | Document field mapping |
| 4.5 | — | Run ingestion, verify data |

**SEC Data Format (Already Structured!):**

The SEC provides TSV files with these columns:
```
NONDERIV_TRANS.tsv (non-derivative transactions):
- ACCESSION_NUMBER (unique filing ID)
- ISSUERCIK, ISSUERNAME, ISSUERTRADINGSYMBOL
- RPTOWNERCIK, RPTOWNERNAME
- RPTOWNER_RELATIONSHIP (Director, Officer, 10% Owner, Other)
- OFFICERTITLE
- TRANSACTIONDATE
- TRANSACTIONCODE (P, S, M, A, G, etc.)
- TRANSACTIONSHARES
- TRANSACTIONPRICEPERSHARE
- SHARESOWNEDFOLLOWINGTRANSACTION
- DIRECTINDIRECT (D or I)

DERIV_TRANS.tsv (derivative transactions - options, warrants):
- Similar fields + UNDERLYINGSECURITYSHARES, EXERCISEPRICE, EXPIRATIONDATE
```

**Acceptance Criteria:**
- [ ] Script downloads all quarterly ZIPs for specified year range
- [ ] TSV parsing handles all SEC field variations
- [ ] Batch insert completes without timeout (use transactions)
- [ ] Dedupe works via ACCESSION_NUMBER (SEC's unique ID)
- [ ] Source field = 'sec' for these records
- [ ] 2-3 years of data loads in under 5 minutes

---

## 3. Database Schema SQL

```sql
-- Migration: 001_create_insider_tables.sql

-- =============================================================================
-- INSIDERS TABLE (Dimension)
-- =============================================================================
CREATE TABLE IF NOT EXISTS insiders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cik TEXT,                          -- SEC CIK number (may be null for FMP-only)
  name TEXT NOT NULL,                -- Original name from filing
  name_normalized TEXT NOT NULL,     -- Lowercase, trimmed for matching
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT insiders_name_normalized_unique UNIQUE (name_normalized)
);

-- Index for lookups
CREATE INDEX idx_insiders_cik ON insiders(cik) WHERE cik IS NOT NULL;
CREATE INDEX idx_insiders_name_normalized ON insiders(name_normalized);

-- =============================================================================
-- INSIDER_TRANSACTIONS TABLE (Fact)
-- =============================================================================
CREATE TABLE IF NOT EXISTS insider_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  insider_id UUID REFERENCES insiders(id),

  -- Core fields
  symbol TEXT NOT NULL,
  filing_date DATE NOT NULL,
  transaction_date DATE NOT NULL,

  -- Transaction details
  transaction_type TEXT,             -- 'P-Purchase', 'S-Sale', 'M-Exercise', etc.
  transaction_code CHAR(1),          -- P, S, M, A, G, etc.
  acquisition_disposition CHAR(1),   -- A or D

  -- Quantities
  shares NUMERIC(18,4) NOT NULL DEFAULT 0,
  price NUMERIC(18,4),               -- NULL if not disclosed
  value NUMERIC(18,2) GENERATED ALWAYS AS (shares * COALESCE(price, 0)) STORED,
  shares_owned_after NUMERIC(18,4),

  -- Insider info (denormalized for query performance)
  reporting_name TEXT NOT NULL,
  owner_type TEXT,                   -- 'officer', 'director', '10% owner', etc.
  officer_title TEXT,                -- 'CEO', 'CFO', etc.

  -- Security info
  security_name TEXT,
  form_type TEXT DEFAULT '4',        -- '3', '4', '5', '4/A', etc.

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'fmp', -- 'fmp' or 'sec'
  source_id TEXT,                    -- FMP doesn't provide unique ID, use link hash
  sec_link TEXT,                     -- Full EDGAR URL

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Dedupe constraint options:
  -- Option A: Use SEC accession number (preferred - guaranteed unique)
  accession_number TEXT,             -- SEC's unique filing ID (e.g., "0001234567-24-000123")

  CONSTRAINT insider_transactions_accession_unique
    UNIQUE (accession_number, transaction_date, shares, transaction_code)
    WHERE accession_number IS NOT NULL,

  -- Option B: Fallback for FMP-only records (no accession number)
  CONSTRAINT insider_transactions_dedupe UNIQUE (
    symbol,
    reporting_name,
    transaction_date,
    transaction_code,
    shares,
    price,
    filing_date
  ) WHERE accession_number IS NULL
);

-- =============================================================================
-- INDEXES FOR QUERY PATTERNS
-- =============================================================================

-- Latest trades feed (default view)
CREATE INDEX idx_insider_tx_latest
  ON insider_transactions(transaction_date DESC, created_at DESC);

-- By symbol (stock page, ticker search)
CREATE INDEX idx_insider_tx_symbol
  ON insider_transactions(symbol, transaction_date DESC);

-- By insider (insider profile page)
CREATE INDEX idx_insider_tx_insider
  ON insider_transactions(insider_id, transaction_date DESC);

-- By reporting name (fallback if insider_id not set)
CREATE INDEX idx_insider_tx_reporting_name
  ON insider_transactions(reporting_name, transaction_date DESC);

-- Top trades by value (last 7 days) - partial index
CREATE INDEX idx_insider_tx_top_week
  ON insider_transactions(value DESC)
  WHERE transaction_date >= CURRENT_DATE - INTERVAL '7 days'
    AND value > 0;

-- Filter by transaction type
CREATE INDEX idx_insider_tx_type
  ON insider_transactions(transaction_code, transaction_date DESC);

-- =============================================================================
-- INGESTION_LOGS TABLE (Telemetry)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ingestion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,              -- 'fmp', 'sec', 'backfill'
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',     -- 'running', 'success', 'failed'

  -- Metrics
  rows_fetched INTEGER DEFAULT 0,
  rows_inserted INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,
  error_details JSONB,

  -- Performance
  duration_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ingestion_logs_created ON ingestion_logs(created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE insiders ENABLE ROW LEVEL SECURITY;
ALTER TABLE insider_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_logs ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables
CREATE POLICY "Public read access" ON insiders
  FOR SELECT USING (true);

CREATE POLICY "Public read access" ON insider_transactions
  FOR SELECT USING (true);

CREATE POLICY "Public read access" ON ingestion_logs
  FOR SELECT USING (true);

-- Service role can write (for ingestion)
CREATE POLICY "Service role insert" ON insiders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role update" ON insiders
  FOR UPDATE USING (true);

CREATE POLICY "Service role insert" ON insider_transactions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role update" ON insider_transactions
  FOR UPDATE USING (true);

CREATE POLICY "Service role insert" ON ingestion_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role update" ON ingestion_logs
  FOR UPDATE USING (true);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to normalize insider names for matching
CREATE OR REPLACE FUNCTION normalize_insider_name(name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get or create insider
CREATE OR REPLACE FUNCTION get_or_create_insider(
  p_name TEXT,
  p_cik TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_normalized TEXT;
  v_insider_id UUID;
BEGIN
  v_normalized := normalize_insider_name(p_name);

  -- Try to find existing
  SELECT id INTO v_insider_id
  FROM insiders
  WHERE name_normalized = v_normalized;

  -- Create if not found
  IF v_insider_id IS NULL THEN
    INSERT INTO insiders (name, name_normalized, cik)
    VALUES (p_name, v_normalized, p_cik)
    ON CONFLICT (name_normalized) DO UPDATE SET
      cik = COALESCE(EXCLUDED.cik, insiders.cik),
      updated_at = NOW()
    RETURNING id INTO v_insider_id;
  END IF;

  RETURN v_insider_id;
END;
$$ LANGUAGE plpgsql;
```

---

## 4. Ingestion Strategy & Pseudocode

### Data Source Priority

The SEC provides **pre-structured, DB-ready datasets** that should be the primary source:

| Source | Use Case | Update Frequency | Cost |
|--------|----------|------------------|------|
| **SEC Bulk ZIPs** | Historical + quarterly refresh | Quarterly | Free |
| **FMP API** | Live feed (last 1-2 days) | Every 6 hours | Free tier |

**Why SEC over FMP for bulk data:**
- SEC is the authoritative source (FMP scrapes SEC anyway)
- Pre-flattened TSV format = no parsing XML
- ~40 MB/year compressed = trivial storage
- Free, no API limits

### Ingestion Approach

```
┌─────────────────────────────────────────────────────────────────┐
│                     INGESTION STRATEGY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  QUARTERLY (manual or scheduled):                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Download SEC quarterly ZIP                           │   │
│  │     https://www.sec.gov/files/structureddata/            │   │
│  │     data/insider-transactions/                           │   │
│  │  2. Extract TSV files (NONDERIV + DERIV tables)          │   │
│  │  3. Bulk insert to Supabase (COPY or batch INSERT)       │   │
│  │  4. Dedupe against existing records                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  DAILY/HOURLY (GitHub Actions cron):                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Fetch latest 500 trades from FMP API                 │   │
│  │  2. Filter to only trades from last 7 days               │   │
│  │  3. Upsert to Supabase (ON CONFLICT skip/update)         │   │
│  │  4. Log results                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Cron Setup: Add to Existing Daily Workflow

You already have a daily cron at `.github/workflows/daily-data-update.yml` that runs at 2am UTC.
**Add insider ingestion as a new step** instead of creating a separate workflow.

**Updated workflow (add this step):**

```yaml
# In .github/workflows/daily-data-update.yml
# Add after the existing "Fetch SEC filings" step:

      # 6. Ingest latest insider trades from FMP (bridges gap until next SEC quarterly)
      - name: Ingest insider trades
        run: npx tsx scripts/ingest-fmp-insiders.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          FMP_API_KEY: ${{ secrets.FMP_API_KEY }}
```

**Why add to existing workflow instead of new one:**
- All daily data updates run together
- Single point of monitoring
- Already has `workflow_dispatch` for manual runs
- No additional configuration needed

**Frequency:** Once daily at 2am UTC (same as existing jobs)

**Manual trigger:** Click "Run workflow" button in GitHub Actions UI anytime you want fresher data

### Ingestion Route

**File:** `app/api/cron/ingest-insiders/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role key for writes
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FMP_API_KEY = process.env.FMP_API_KEY
const BATCH_SIZE = 500
const CRON_SECRET = process.env.CRON_SECRET // Verify request is from Vercel

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Create log entry
  const { data: logEntry } = await supabase
    .from('ingestion_logs')
    .insert({ source: 'fmp', started_at: new Date().toISOString() })
    .select()
    .single()

  const logId = logEntry?.id

  try {
    // 1. Fetch from FMP
    const url = `https://financialmodelingprep.com/api/v4/insider-trading?limit=${BATCH_SIZE}&apikey=${FMP_API_KEY}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`FMP API error: ${response.status}`)
    }

    const fmpData = await response.json()

    if (!Array.isArray(fmpData)) {
      throw new Error('Invalid FMP response format')
    }

    // 2. Transform and upsert
    let inserted = 0
    let updated = 0
    let skipped = 0

    for (const trade of fmpData) {
      // Skip if missing required fields
      if (!trade.symbol || !trade.reportingName || !trade.transactionDate) {
        skipped++
        continue
      }

      // Get or create insider
      const { data: insiderId } = await supabase
        .rpc('get_or_create_insider', {
          p_name: trade.reportingName,
          p_cik: trade.reportingCik || null
        })

      // Map FMP fields to our schema
      const record = {
        symbol: trade.symbol,
        insider_id: insiderId,
        filing_date: trade.filingDate,
        transaction_date: trade.transactionDate,
        transaction_type: trade.transactionType,
        transaction_code: trade.transactionType?.charAt(0) || null,
        acquisition_disposition: trade.acquistionOrDisposition,
        shares: trade.securitiesTransacted || 0,
        price: trade.price || null,
        shares_owned_after: trade.securitiesOwned || null,
        reporting_name: trade.reportingName,
        owner_type: trade.typeOfOwner,
        security_name: trade.securityName,
        form_type: trade.formType || '4',
        source: 'fmp',
        source_id: trade.link ? hashString(trade.link) : null,
        sec_link: trade.link
      }

      // Upsert (insert or update on conflict)
      const { error, status } = await supabase
        .from('insider_transactions')
        .upsert(record, {
          onConflict: 'symbol,reporting_name,transaction_date,transaction_code,shares,price,filing_date',
          ignoreDuplicates: false
        })

      if (error) {
        if (error.code === '23505') { // Unique violation = already exists
          skipped++
        } else {
          console.error('Insert error:', error)
          skipped++
        }
      } else {
        // Supabase doesn't distinguish insert vs update easily
        // Count as inserted for simplicity
        inserted++
      }
    }

    // 3. Update log entry
    const duration = Date.now() - startTime
    await supabase
      .from('ingestion_logs')
      .update({
        completed_at: new Date().toISOString(),
        status: 'success',
        rows_fetched: fmpData.length,
        rows_inserted: inserted,
        rows_updated: updated,
        rows_skipped: skipped,
        duration_ms: duration
      })
      .eq('id', logId)

    return NextResponse.json({
      success: true,
      fetched: fmpData.length,
      inserted,
      updated,
      skipped,
      duration_ms: duration
    })

  } catch (error) {
    // Log failure
    await supabase
      .from('ingestion_logs')
      .update({
        completed_at: new Date().toISOString(),
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime
      })
      .eq('id', logId)

    console.error('Ingestion failed:', error)
    return NextResponse.json(
      { error: 'Ingestion failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

// Simple hash function for source_id
function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}
```

---

## 5. API / Server Action Signatures

**File:** `app/actions/insider-trading.ts`

```typescript
'use server'

import { createServerClient } from '@/lib/supabase/server'

// =============================================================================
// TYPES
// =============================================================================

export interface InsiderTransaction {
  id: string
  symbol: string
  insider_id: string | null
  filing_date: string
  transaction_date: string
  transaction_type: string | null
  transaction_code: string | null
  acquisition_disposition: string | null
  shares: number
  price: number | null
  value: number
  shares_owned_after: number | null
  reporting_name: string
  owner_type: string | null
  officer_title: string | null
  security_name: string | null
  sec_link: string | null
  source: string
}

export interface InsiderProfile {
  id: string
  name: string
  cik: string | null
  total_transactions: number
  total_buys: number
  total_sells: number
  net_shares_30d: number
  net_value_30d: number
  net_shares_90d: number
  net_value_90d: number
  net_shares_365d: number
  net_value_365d: number
  companies: string[] // Unique symbols
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

// =============================================================================
// SERVER ACTIONS
// =============================================================================

/**
 * Get latest insider trades with pagination
 */
export async function getLatestInsiderTrades(
  page: number = 1,
  pageSize: number = 50,
  filters?: {
    transactionType?: 'purchase' | 'sale' | 'all'
    days?: number
  }
): Promise<PaginatedResult<InsiderTransaction>> {
  const supabase = await createServerClient()
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('insider_transactions')
    .select('*', { count: 'exact' })
    .order('transaction_date', { ascending: false })
    .range(offset, offset + pageSize - 1)

  // Apply filters
  if (filters?.transactionType === 'purchase') {
    query = query.eq('transaction_code', 'P')
  } else if (filters?.transactionType === 'sale') {
    query = query.eq('transaction_code', 'S')
  }

  if (filters?.days) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - filters.days)
    query = query.gte('transaction_date', cutoff.toISOString().split('T')[0])
  }

  const { data, count, error } = await query

  if (error) {
    console.error('Error fetching insider trades:', error)
    return { data: [], total: 0, page, pageSize, hasMore: false }
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
    hasMore: (count || 0) > offset + pageSize
  }
}

/**
 * Get insider trades for a specific symbol
 */
export async function getInsiderTradesBySymbol(
  symbol: string,
  page: number = 1,
  pageSize: number = 50
): Promise<PaginatedResult<InsiderTransaction>> {
  const supabase = await createServerClient()
  const offset = (page - 1) * pageSize

  const { data, count, error } = await supabase
    .from('insider_transactions')
    .select('*', { count: 'exact' })
    .eq('symbol', symbol.toUpperCase())
    .order('transaction_date', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (error) {
    console.error('Error fetching trades by symbol:', error)
    return { data: [], total: 0, page, pageSize, hasMore: false }
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
    hasMore: (count || 0) > offset + pageSize
  }
}

/**
 * Get top trades by value in the last 7 days
 */
export async function getTopTradesThisWeek(
  limit: number = 50
): Promise<InsiderTransaction[]> {
  const supabase = await createServerClient()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)

  const { data, error } = await supabase
    .from('insider_transactions')
    .select('*')
    .gte('transaction_date', cutoff.toISOString().split('T')[0])
    .gt('value', 0)
    .order('value', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching top trades:', error)
    return []
  }

  return data || []
}

/**
 * Get insider profile with trade history and stats
 */
export async function getInsiderProfile(
  insiderId: string
): Promise<InsiderProfile | null> {
  const supabase = await createServerClient()

  // Get insider info
  const { data: insider, error: insiderError } = await supabase
    .from('insiders')
    .select('*')
    .eq('id', insiderId)
    .single()

  if (insiderError || !insider) {
    return null
  }

  // Get aggregated stats
  const { data: stats } = await supabase
    .rpc('get_insider_stats', { p_insider_id: insiderId })

  // Get unique companies
  const { data: companies } = await supabase
    .from('insider_transactions')
    .select('symbol')
    .eq('insider_id', insiderId)
    .order('symbol')

  const uniqueSymbols = [...new Set(companies?.map(c => c.symbol) || [])]

  return {
    id: insider.id,
    name: insider.name,
    cik: insider.cik,
    total_transactions: stats?.total_transactions || 0,
    total_buys: stats?.total_buys || 0,
    total_sells: stats?.total_sells || 0,
    net_shares_30d: stats?.net_shares_30d || 0,
    net_value_30d: stats?.net_value_30d || 0,
    net_shares_90d: stats?.net_shares_90d || 0,
    net_value_90d: stats?.net_value_90d || 0,
    net_shares_365d: stats?.net_shares_365d || 0,
    net_value_365d: stats?.net_value_365d || 0,
    companies: uniqueSymbols
  }
}

/**
 * Get trades by insider ID with pagination
 */
export async function getInsiderTrades(
  insiderId: string,
  page: number = 1,
  pageSize: number = 50
): Promise<PaginatedResult<InsiderTransaction>> {
  const supabase = await createServerClient()
  const offset = (page - 1) * pageSize

  const { data, count, error } = await supabase
    .from('insider_transactions')
    .select('*', { count: 'exact' })
    .eq('insider_id', insiderId)
    .order('transaction_date', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (error) {
    console.error('Error fetching insider trades:', error)
    return { data: [], total: 0, page, pageSize, hasMore: false }
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
    hasMore: (count || 0) > offset + pageSize
  }
}

/**
 * Search insiders by name (for autocomplete)
 */
export async function searchInsiders(
  query: string,
  limit: number = 10
): Promise<{ id: string; name: string; cik: string | null }[]> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('insiders')
    .select('id, name, cik')
    .ilike('name', `%${query}%`)
    .limit(limit)

  if (error) {
    console.error('Error searching insiders:', error)
    return []
  }

  return data || []
}
```

---

## 6. UI Component Breakdown

### Updated Component Tree

```
app/insiders/
├── page.tsx                      # Server component (fetch initial data)
└── loading.tsx                   # Loading skeleton

app/insider/[id]/
├── page.tsx                      # Insider profile page
└── loading.tsx

components/
├── InsidersPageClient.tsx        # Main client component (tabs, filters)
├── InsiderTradesTable.tsx        # Reusable table (updated for DB schema)
├── InsiderFilters.tsx            # Transaction type + date dropdowns
├── InsiderPagination.tsx         # Server-side pagination controls
├── InsiderProfileHeader.tsx      # Name, CIK, summary stats
├── InsiderTradeHistory.tsx       # Paginated trade list for profile
├── InsiderSearchInput.tsx        # Autocomplete search for insiders
└── StockInsidersTab.tsx          # Tab content for /stock/[symbol]
```

### Key Component Changes

**InsidersPageClient.tsx:**
- Remove client-side `filteredTrades` useMemo
- Add `useSearchParams` for URL state
- Call server action on filter/page change
- Show loading state during fetches

**InsiderTradesTable.tsx:**
- Update to use new `InsiderTransaction` type
- Make `reporting_name` a link to `/insider/[id]`
- Add `sec_link` column with external link icon

**InsiderProfileHeader.tsx (New):**
```typescript
interface InsiderProfileHeaderProps {
  profile: InsiderProfile
}

// Displays:
// - Insider name (large)
// - CIK badge (if available)
// - Stats grid: Total trades, Buys, Sells
// - Net activity cards: 30d, 90d, 365d
```

---

## 7. Acceptance Criteria Checklist

### Phase 0: Database Foundation

- [ ] **DB-001:** `insider_transactions` table exists in Supabase
- [ ] **DB-002:** `insiders` table exists with unique constraint on normalized name
- [ ] **DB-003:** `ingestion_logs` table exists for telemetry
- [ ] **DB-004:** All indexes created and visible in Supabase dashboard
- [ ] **DB-005:** RLS policies allow public read, service role write
- [ ] **CRON-001:** `/api/cron/ingest-insiders` endpoint responds to GET
- [ ] **CRON-002:** Endpoint rejects requests without valid `CRON_SECRET`
- [ ] **CRON-003:** Vercel cron configured in `vercel.json`
- [ ] **CRON-004:** Ingestion creates log entry with start time
- [ ] **CRON-005:** Ingestion updates log entry with completion status
- [ ] **CRON-006:** Duplicate transactions are skipped (not duplicated)
- [ ] **API-001:** `getLatestInsiderTrades()` returns data from database
- [ ] **API-002:** Existing `/insiders` page works without regression

### Phase 1: Server-Side Pagination

- [ ] **PAG-001:** Server action accepts `page` and `pageSize` parameters
- [ ] **PAG-002:** Response includes `total` count for pagination UI
- [ ] **PAG-003:** URL reflects current page (`?page=2`)
- [ ] **PAG-004:** URL reflects current filters (`?type=purchase&days=7`)
- [ ] **PAG-005:** Page change triggers server fetch, not client filter
- [ ] **PAG-006:** Query response time < 200ms for page 1
- [ ] **PAG-007:** "Showing X of Y" displays correct counts

### Phase 2: Insider Profile Pages

- [ ] **PROF-001:** `/insider/[id]` route exists and renders
- [ ] **PROF-002:** Profile shows insider name prominently
- [ ] **PROF-003:** Profile shows CIK if available
- [ ] **PROF-004:** Trade history table shows all transactions by this insider
- [ ] **PROF-005:** Summary stats show buys/sells for 30/90/365 days
- [ ] **PROF-006:** Net shares and net value calculated correctly
- [ ] **PROF-007:** Companies list shows all unique symbols
- [ ] **PROF-008:** Clicking insider name in main table navigates to profile
- [ ] **PROF-009:** "By Insider" search shows autocomplete results
- [ ] **PROF-010:** Selecting autocomplete result navigates to profile

### Phase 3: Stock Page Integration

- [ ] **STOCK-001:** `/stock/[symbol]` has "Insiders" tab
- [ ] **STOCK-002:** Tab shows recent insider trades for that symbol
- [ ] **STOCK-003:** Summary shows buy/sell totals for last 90 days
- [ ] **STOCK-004:** Symbol column hidden (redundant on stock page)

### Phase 4: SEC Backfill (Optional)

- [ ] **SEC-001:** Download script fetches SEC bulk ZIP files
- [ ] **SEC-002:** Parser extracts Form 3/4/5 data from TSV
- [ ] **SEC-003:** Backfill inserts records with `source='sec'`
- [ ] **SEC-004:** Dedupe prevents FMP+SEC duplicates
- [ ] **SEC-005:** Documentation explains field mapping differences

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| FMP API rate limits | Monitor usage; reduce fetch frequency if needed; add backoff |
| Supabase storage limits | Monitor growth; archive old data if needed; use Pro plan (8GB) |
| Ingestion failures | Retry logic; alerting via ingestion_logs; manual re-run option |
| Slow queries | Partial indexes; EXPLAIN ANALYZE; consider materialized views |
| Duplicate data | Unique constraint; idempotent upserts; source tracking |
| Schema changes | Migration files; backward-compatible changes; feature flags |

---

## 9. Cost Estimate

### Storage Reality Check

The SEC publishes **Insider Transactions Data Sets** as quarterly ZIPs in a pre-flattened, DB-ready format:

| Year | Q1 | Q2 | Q3 | Q4 | Total |
|------|----|----|----|----|-------|
| 2024 | 13.23 MB | 9.81 MB | 7.79 MB | 8.54 MB | **~39 MB** |

**This means:**
- ~40 MB/year compressed (entire market)
- ~150-200 MB/year in PostgreSQL (with indexes)
- Full history (2003-2025): ~3-4 GB

### Free Tier Strategy

| Service | Free Tier Limit | Our Usage | Fits? |
|---------|-----------------|-----------|-------|
| **Supabase Free** | 500 MB | ~200 MB (1 year) or ~400 MB (2 years) | Yes |
| **Vercel Hobby** | No crons | N/A | Use alternative |
| **GitHub Actions** | 2,000 min/mo | ~1 min/day = 30 min/mo | Yes |
| **FMP API** | Varies by plan | Minimal (live feed only) | Yes |

### Recommended Approach

1. **Primary source:** SEC quarterly ZIPs (free, comprehensive, DB-ready)
2. **Live feed:** FMP API for trades not yet in SEC data (last 1-2 days)
3. **Cron:** GitHub Actions (free) instead of Vercel Pro
4. **Retention:** 2-3 years in DB, archive older data if needed

### Cost Breakdown

| Item | Monthly Cost |
|------|--------------|
| Supabase Free | $0 |
| Vercel Hobby | $0 |
| GitHub Actions | $0 |
| FMP API (free tier or existing plan) | $0 |
| **Total** | **$0/month** |

**If you want full history (2003-present):**
- Supabase Pro ($25/mo) for 8GB storage
- Still use GitHub Actions for cron (free)
- **Total: $25/month**

### GitHub Actions Cron Setup

**No new workflow needed.** Add to existing `.github/workflows/daily-data-update.yml`:

```yaml
      # Add after existing steps:
      - name: Ingest insider trades
        run: npx tsx scripts/ingest-fmp-insiders.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          FMP_API_KEY: ${{ secrets.FMP_API_KEY }}
```

**Schedule:** Daily at 2am UTC (existing schedule)
**Manual trigger:** Use "Run workflow" button in GitHub Actions UI

---

## 10. Timeline Summary

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 0: Database Foundation | 2-3 days | None |
| Phase 1: Server-Side Pagination | 2 days | Phase 0 |
| Phase 2: Insider Profiles | 3-4 days | Phase 1 |
| Phase 3: Stock Page Integration | 2 days | Phase 1 |
| Phase 4: SEC Backfill | 3-5 days | Phase 0 (optional) |

**Total: 9-14 days** (excluding Phase 4)
