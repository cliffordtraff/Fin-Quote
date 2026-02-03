# Segment Data Expansion Plan

## Overview

Expand business segment and geographic segment revenue data from 2 stocks (AAPL, GOOGL) to all US stocks with available data.

**Current State:**
- Only AAPL and GOOGL have segment data
- Data stored in `company_metrics` table
- UI components already built (`SegmentChart.tsx`, `CompanySegmentsCard.tsx`)

**Goal:**
- Segment data for all stocks where FMP has data
- Both product/business segments AND geographic segments
- Historical data (5-10 years where available)

---

## Data Source

**FMP API Endpoints:**
```
GET /api/v4/revenue-product-segmentation?symbol={symbol}&structure=flat
GET /api/v4/revenue-geographic-segmentation?symbol={symbol}&structure=flat
```

**Response Format:**
```json
[
  {
    "2024-12-31": {
      "Segment A": 50000000000,
      "Segment B": 30000000000
    }
  },
  {
    "2023-12-31": { ... }
  }
]
```

**Coverage (tested):**
| Stock | Product Segments | Geographic Segments |
|-------|------------------|---------------------|
| AAPL | Yes (5 segments) | Yes (5 regions) |
| MSFT | Yes (10 segments) | Yes |
| NVDA | Yes (5 segments) | Yes |
| TSLA | Yes (3 segments) | Yes |
| AMZN | Yes (7 segments) | Yes |
| GOOGL | Yes (6 segments) | Yes |
| META | Yes (2 segments) | Yes |

---

## Database Schema

**Table: `company_metrics`** (already exists)
```sql
CREATE TABLE company_metrics (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  year INTEGER NOT NULL,
  period TEXT NOT NULL,           -- 'FY', 'Q1', 'Q2', 'Q3', 'Q4'
  metric_name TEXT NOT NULL,      -- 'segment_revenue'
  dimension_type TEXT NOT NULL,   -- 'product' or 'geographic'
  dimension_value TEXT NOT NULL,  -- e.g., 'iPhone', 'Americas'
  metric_value NUMERIC NOT NULL,
  data_source TEXT,               -- 'fmp_api'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(symbol, year, period, metric_name, dimension_type, dimension_value)
);
```

**New: Add tracking to `us_stocks` table**
```sql
ALTER TABLE us_stocks ADD COLUMN segment_status TEXT DEFAULT 'pending';
-- Values: 'pending', 'complete', 'no_data', 'error'

ALTER TABLE us_stocks ADD COLUMN segment_updated_at TIMESTAMP;
```

---

## Implementation Phases

### Phase 1: Large Caps (Market Cap > $50B)
- **Estimated stocks:** ~150
- **Priority:** Highest - most investor interest
- **Expected coverage:** 80%+ will have segment data

### Phase 2: Mid-Large Caps (Market Cap > $10B)
- **Estimated stocks:** ~400 additional
- **Priority:** High
- **Expected coverage:** 60-70% will have segment data

### Phase 3: Mid Caps (Market Cap > $1B)
- **Estimated stocks:** ~2,500 additional
- **Priority:** Medium
- **Expected coverage:** 30-40% will have segment data

### Phase 4: Small Caps (Remaining)
- **Estimated stocks:** ~6,500 additional
- **Priority:** Low
- **Expected coverage:** <10% will have segment data (most small caps don't report segments)

---

## Script Design

### New Script: `scripts/ingest-segment-data-all.ts`

**Features:**
1. Read from `us_stocks` table (not just S&P 500)
2. Filter by market cap threshold
3. Skip already processed stocks (`segment_status = 'complete'` or `'no_data'`)
4. Rate limiting (500ms between requests)
5. Progress tracking and resume capability
6. Detailed logging and summary

**Usage:**
```bash
# Phase 1: Large caps
npx tsx scripts/ingest-segment-data-all.ts --min-market-cap 50000000000

# Phase 2: Mid-large caps
npx tsx scripts/ingest-segment-data-all.ts --min-market-cap 10000000000

# Resume failed/pending
npx tsx scripts/ingest-segment-data-all.ts --resume

# Single stock test
npx tsx scripts/ingest-segment-data-all.ts --symbol NVDA

# Dry run (no writes)
npx tsx scripts/ingest-segment-data-all.ts --dry-run --limit 10
```

**Algorithm:**
```
1. Query us_stocks WHERE market_cap >= threshold AND segment_status IN ('pending', 'error')
2. For each stock:
   a. Fetch product segments from FMP
   b. Fetch geographic segments from FMP
   c. If data exists:
      - Upsert to company_metrics
      - Update us_stocks.segment_status = 'complete'
   d. If no data:
      - Update us_stocks.segment_status = 'no_data'
   e. If error:
      - Update us_stocks.segment_status = 'error'
      - Log error for retry
3. Print summary
```

---

## Execution Timeline

| Phase | Stocks | API Calls | Est. Time | Command |
|-------|--------|-----------|-----------|---------|
| 1 | ~150 | ~300 | ~3 min | `--min-market-cap 50000000000` |
| 2 | ~400 | ~800 | ~7 min | `--min-market-cap 10000000000` |
| 3 | ~2,500 | ~5,000 | ~45 min | `--min-market-cap 1000000000` |
| 4 | ~6,500 | ~13,000 | ~2 hrs | (no filter) |

**Note:** Times assume 500ms rate limit. Many stocks will return empty (no segment data), which is fast.

---

## Validation

After each phase, verify data with:

```sql
-- Count stocks with segment data
SELECT segment_status, COUNT(*)
FROM us_stocks
GROUP BY segment_status;

-- Count segment records by type
SELECT dimension_type, COUNT(*)
FROM company_metrics
WHERE metric_name = 'segment_revenue'
GROUP BY dimension_type;

-- Sample data for a stock
SELECT * FROM company_metrics
WHERE symbol = 'NVDA'
ORDER BY year DESC, dimension_type;
```

---

## UI Impact

**No changes needed** - existing components will automatically work:
- `SegmentChart.tsx` - already queries by symbol
- `CompanySegmentsCard.tsx` - already queries by symbol
- Stock pages - already render segment components if data exists

---

## Rollback Plan

If issues arise:
```sql
-- Remove all FMP segment data
DELETE FROM company_metrics WHERE data_source = 'fmp_api';

-- Reset status
UPDATE us_stocks SET segment_status = 'pending', segment_updated_at = NULL;
```

---

## Success Criteria

- [ ] Phase 1 complete: 100+ stocks with segment data
- [ ] Phase 2 complete: 300+ stocks with segment data
- [ ] Both product AND geographic segments loaded
- [ ] UI displays correctly on stock pages
- [ ] No API rate limit errors
- [ ] Resume works for failed stocks

---

## Next Steps

1. Add `segment_status` column to `us_stocks` table
2. Create `scripts/ingest-segment-data-all.ts`
3. Run Phase 1 (large caps)
4. Verify data and UI
5. Continue with Phase 2-4
