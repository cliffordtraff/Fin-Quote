# Quarterly Segment Data Implementation Plan

## Overview

This document outlines the implementation plan for extracting **quarterly segment metrics** from Apple's 10-Q SEC filings using the existing iXBRL parsing infrastructure. This extends the current annual (10-K) segment data extraction to support quarterly granularity.

**Goal:** Enable quarterly charts for "Stock Specific" metrics in the charting tab:
- Revenue by Product (iPhone, Mac, iPad, Services, Wearables)
- Revenue by Region (Americas, Europe, Greater China, Japan, Rest of Asia Pacific)
- Operating Income by Region
- Cost of Sales (Products vs Services)
- Revenue by Country (US, China, Other)
- Long-Lived Assets by Country

---

## Current State Analysis

### Existing Infrastructure

| Component | File | Current Capability |
|-----------|------|-------------------|
| iXBRL Parser | `scripts/parse-ixbrl-segments.ts` | Parses 10-K files only |
| XBRL Mappings | `lib/ixbrl-mappings/aapl.ts` | 5 metrics defined, works for any filing |
| Validation | `scripts/validate-ixbrl-segments.ts` | Compares parsed vs stored data |
| Storage | `company_metrics` table | Supports quarterly via `period` column |
| Server Action | `app/actions/segment-data.ts` | Queries annual data only |
| Filing Metadata | `data/aapl-filings.json` | 27 10-Q filings cataloged |

### What Currently Works

1. **10-K Parsing:** Annual segment data successfully extracted and stored
2. **XBRL Mappings:** Apple-specific mappings handle product/geographic axes
3. **Database Schema:** `company_metrics.period` already supports `'Q1'`, `'Q2'`, `'Q3'`, `'Q4'`
4. **Filing Downloads:** Infrastructure exists for downloading SEC HTML files

### What Needs to Change

| Component | Current | Required Change |
|-----------|---------|-----------------|
| Parser file filter | `10-k` only (line 320) | Add `10-q` support |
| Period determination | Hardcoded `'FY'` | Calculate fiscal quarter |
| Context filtering | All duration contexts | Filter for single-quarter only |
| Server action | No period parameter | Add `period` filter option |
| Chart UI | Annual only | Add quarterly toggle |

---

## Apple Fiscal Calendar Reference

Apple's fiscal year ends in late September. Understanding this is critical for mapping 10-Q periods to fiscal quarters.

| Fiscal Quarter | Calendar Months | Period End Example | 10-Q Filed |
|----------------|-----------------|-------------------|------------|
| Q1 | Oct - Dec | Dec 28, 2024 | ~Feb 1 |
| Q2 | Jan - Mar | Mar 29, 2025 | ~May 2 |
| Q3 | Apr - Jun | Jun 28, 2025 | ~Aug 1 |
| Q4 | Jul - Sep | Sep 27, 2025 | N/A (10-K) |

**Important:** Q4 data is NOT filed in a 10-Q. It's included in the annual 10-K. To get Q4, calculate: `Q4 = FY - Q1 - Q2 - Q3`.

---

## Available 10-Q Filings

From `data/aapl-filings.json`, the following 10-Q filings are available:

| Fiscal Year | Q1 (Oct-Dec) | Q2 (Jan-Mar) | Q3 (Apr-Jun) |
|-------------|--------------|--------------|--------------|
| FY2025 | 2024-12-28 ✓ | 2025-03-29 ✓ | 2025-06-28 ✓ |
| FY2024 | 2023-12-30 ✓ | 2024-03-30 ✓ | 2024-06-29 ✓ |
| FY2023 | 2022-12-31 ✓ | 2023-04-01 ✓ | 2023-07-01 ✓ |
| FY2022 | 2021-12-25 ✓ | 2022-03-26 ✓ | 2022-06-25 ✓ |
| FY2021 | 2020-12-26 ✓ | 2021-03-27 ✓ | 2021-06-26 ✓ |
| FY2020 | 2019-12-28 ✓ | 2020-03-28 ✓ | 2020-06-27 ✓ |
| FY2019 | 2018-12-29 ✓ | 2019-03-30 ✓ | 2019-06-29 ✓ |
| FY2018 | 2017-12-30 ✓ | 2018-03-31 ✓ | 2018-06-30 ✓ |
| FY2017 | 2016-12-31 ✓ | 2017-04-01 ✓ | 2017-07-01 ✓ |
| FY2016 | 2015-12-26 ✓ | 2016-03-26 ✓ | 2016-06-25 ✓ |

**Total:** 30 quarters of potential data (10 years × 3 quarters per 10-Q)

---

## Implementation Phases

### Phase 1: Storage Verification

**Objective:** Determine which 10-Q HTML files are already downloaded to Supabase Storage.

**Tasks:**

1.1. **List Storage Contents**
```bash
# Create script: scripts/check-10q-storage.ts
# Query Supabase Storage for files matching aapl-10-q-*.html
```

1.2. **Compare Against Metadata**
- Cross-reference with `data/aapl-filings.json`
- Identify missing files

1.3. **Output**
- List of available 10-Q files
- List of 10-Q files needing download

**Estimated Output:**
```
Available 10-Q files in storage: X
Missing 10-Q files: Y
```

---

### Phase 2: Download Missing 10-Q Files

**Objective:** Ensure all 10-Q HTML files are available in Supabase Storage.

**Tasks:**

2.1. **Extend Download Script**
- Modify `scripts/download-filings.ts` or create `scripts/download-10q-filings.ts`
- Filter for `filing_type = '10-Q'`
- Use existing download logic

2.2. **File Naming Convention**
```
filings/html/aapl-10-q-{fiscal_year}-q{quarter}.html

Examples:
- aapl-10-q-2024-q1.html (period ending Dec 2023)
- aapl-10-q-2024-q2.html (period ending Mar 2024)
- aapl-10-q-2024-q3.html (period ending Jun 2024)
```

2.3. **Download Execution**
```bash
npx tsx scripts/download-10q-filings.ts --ticker AAPL
```

**Dependencies:** Phase 1 complete

---

### Phase 3: Fiscal Quarter Calculation Logic

**Objective:** Add helper functions to determine fiscal quarter from XBRL period dates.

**Location:** `lib/ixbrl-mappings/aapl.ts`

**Tasks:**

3.1. **Add `getFiscalQuarterFromPeriodEnd()` Function**

```typescript
/**
 * Calculate Apple fiscal quarter from period end date
 *
 * Apple Fiscal Calendar:
 * - Q1: Oct 1 - Dec 31 (ends late Dec)
 * - Q2: Jan 1 - Mar 31 (ends late Mar)
 * - Q3: Apr 1 - Jun 30 (ends late Jun)
 * - Q4: Jul 1 - Sep 30 (ends late Sep) - covered by 10-K
 */
export function getFiscalQuarterFromPeriodEnd(periodEnd: string): {
  fiscalYear: number
  fiscalQuarter: 1 | 2 | 3 | 4
} {
  const date = new Date(periodEnd)
  const month = date.getMonth() + 1 // 1-indexed
  const year = date.getFullYear()

  // Map calendar month to fiscal quarter
  if (month >= 10 && month <= 12) {
    // Oct-Dec = Q1 of NEXT fiscal year
    return { fiscalYear: year + 1, fiscalQuarter: 1 }
  } else if (month >= 1 && month <= 3) {
    // Jan-Mar = Q2 of current fiscal year
    return { fiscalYear: year, fiscalQuarter: 2 }
  } else if (month >= 4 && month <= 6) {
    // Apr-Jun = Q3 of current fiscal year
    return { fiscalYear: year, fiscalQuarter: 3 }
  } else {
    // Jul-Sep = Q4 of current fiscal year (10-K period)
    return { fiscalYear: year, fiscalQuarter: 4 }
  }
}
```

3.2. **Add `isQuarterlyDuration()` Function**

10-Q filings contain multiple periods:
- **Single quarter** (~91 days): This is what we want
- **YTD 6 months** (~182 days): Q1+Q2 cumulative - skip
- **YTD 9 months** (~273 days): Q1+Q2+Q3 cumulative - skip
- **Prior year comparative** - skip

```typescript
/**
 * Check if a duration represents a single quarter (~13 weeks / ~91 days)
 */
export function isQuarterlyDuration(startDate: string, endDate: string): boolean {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)

  // Single quarter is approximately 84-98 days (allowing for calendar variation)
  return days >= 84 && days <= 98
}
```

3.3. **Export Functions**
- Add to `lib/ixbrl-mappings/index.ts` exports

**Dependencies:** None (can be done in parallel with Phases 1-2)

---

### Phase 4: Update Parser for 10-Q Support

**Objective:** Modify `scripts/parse-ixbrl-segments.ts` to handle 10-Q filings.

**Tasks:**

4.1. **Add CLI Flag for Filing Type**

```typescript
// Add --filing-type argument
let filingType: '10-k' | '10-q' = '10-k' // default

for (let i = 0; i < args.length; i++) {
  // ... existing args ...
  if (args[i] === '--filing-type' && args[i + 1]) {
    filingType = args[i + 1].toLowerCase() as '10-k' | '10-q'
    i++
  }
}
```

4.2. **Update `listFilings()` Function**

Current (line 317-324):
```typescript
// Filter for this ticker's 10-K files (annual reports have segment data)
const tickerLower = ticker.toLowerCase()
return files
  .filter((f) => f.name.startsWith(`${tickerLower}-10-k`))
  .map((f) => f.name)
```

Updated:
```typescript
function listFilings(
  supabase: ReturnType<typeof getSupabaseClient>,
  ticker: string,
  filingType: '10-k' | '10-q' = '10-k'
): Promise<string[]> {
  // ...
  const tickerLower = ticker.toLowerCase()
  const prefix = filingType === '10-q'
    ? `${tickerLower}-10-q`
    : `${tickerLower}-10-k`

  return files
    .filter((f) => f.name.startsWith(prefix))
    .map((f) => f.name)
    .sort()
    .reverse()
}
```

4.3. **Update Context Filtering for Quarterly Data**

In `extractSegmentRevenue()` function, add quarterly duration filter:

```typescript
function extractSegmentRevenue(
  contexts: Map<string, XBRLContext>,
  facts: XBRLFact[],
  mappings: ReturnType<typeof getMappingsForTicker>,
  filingType: '10-k' | '10-q' = '10-k'
): SegmentRevenue[] {
  // ...

  for (const fact of facts) {
    const context = contexts.get(fact.contextId)
    if (!context || context.dimensions.length === 0) continue

    // For 10-Q, only include single-quarter durations
    if (filingType === '10-q' && context.period?.type === 'duration') {
      const { start, end } = context.period
      if (start && end && !isQuarterlyDuration(start, end)) {
        continue // Skip YTD periods
      }
    }

    // ... rest of extraction logic ...
  }
}
```

4.4. **Update Period Calculation**

In the segment extraction, determine period string:

```typescript
// Current: hardcoded 'FY'
// New: calculate based on filing type and period dates

if (filingType === '10-k') {
  period = 'FY'
} else {
  const { fiscalQuarter } = getFiscalQuarterFromPeriodEnd(periodEnd)
  period = `Q${fiscalQuarter}` // 'Q1', 'Q2', 'Q3'
}
```

4.5. **Update SegmentRevenue Interface**

```typescript
interface SegmentRevenue {
  fiscalYear: number
  fiscalQuarter?: 1 | 2 | 3  // NEW: for quarterly data
  period: 'FY' | 'Q1' | 'Q2' | 'Q3' | 'Q4'  // NEW
  segmentType: SegmentType
  segmentName: string
  value: number
  periodStart?: string
  periodEnd?: string
  xbrlMember: string
  xbrlContextId: string
}
```

**Dependencies:** Phase 3 complete

---

### Phase 5: Update Ingestion Logic

**Objective:** Modify database ingestion to store quarterly data correctly.

**Tasks:**

5.1. **Update `ingestToDatabase()` Function**

Current (line 339-350):
```typescript
const rows = segments.map((seg) => ({
  symbol: ticker.toUpperCase(),
  year: seg.fiscalYear,
  period: 'FY',  // HARDCODED
  metric_name: 'segment_revenue',
  // ...
}))
```

Updated:
```typescript
const rows = segments.map((seg) => ({
  symbol: ticker.toUpperCase(),
  year: seg.fiscalYear,
  period: seg.period,  // USE FROM SEGMENT DATA
  metric_name: 'segment_revenue',
  metric_category: 'segment_reporting',
  metric_value: seg.value,
  unit: 'currency',
  dimension_type: seg.segmentType,
  dimension_value: seg.segmentName,
  data_source: 'SEC-XBRL',
}))
```

5.2. **Handle All 5 Metrics**

The current parser only extracts `segment_revenue`. For complete implementation:

| Metric | XBRL Fact | Axes |
|--------|-----------|------|
| `segment_revenue` | `RevenueFromContractWithCustomerExcludingAssessedTax` | Product, Geographic |
| `segment_operating_income` | `OperatingIncomeLoss` | Geographic |
| `cost_of_sales` | `CostOfGoodsAndServicesSold` | Product |
| `revenue_by_country` | `RevenueFromContractWithCustomerExcludingAssessedTax` | Country |
| `long_lived_assets` | `NoncurrentAssets` | Country |

**Note:** This may require extending the parser to handle multiple metrics. Consider deferring to a follow-up phase if scope is too large.

**Dependencies:** Phase 4 complete

---

### Phase 6: Execute Quarterly Parsing

**Objective:** Run the parser on all 10-Q filings and ingest data.

**Tasks:**

6.1. **Dry Run (Parse Only)**
```bash
npx tsx scripts/parse-ixbrl-segments.ts --ticker AAPL --filing-type 10-q
```

6.2. **Verify Output**
- Check that each 10-Q produces ~3 quarters of data (current + 2 comparative)
- Verify fiscal quarter mapping is correct
- Check for duplicate/missing segments

6.3. **Ingest to Database**
```bash
npx tsx scripts/parse-ixbrl-segments.ts --ticker AAPL --filing-type 10-q --ingest
```

6.4. **Verify Database**
```sql
SELECT year, period, dimension_type, dimension_value, metric_value
FROM company_metrics
WHERE symbol = 'AAPL'
  AND metric_name = 'segment_revenue'
  AND period LIKE 'Q%'
ORDER BY year DESC, period;
```

**Dependencies:** Phases 2, 5 complete

---

### Phase 7: Calculate Q4 Data

**Objective:** Compute Q4 values since they're not in 10-Q filings.

**Approach:** Q4 = FY - Q1 - Q2 - Q3

**Tasks:**

7.1. **Create Calculation Script**

```typescript
// scripts/calculate-q4-segments.ts

async function calculateQ4() {
  // For each fiscal year and segment:
  // 1. Get FY total
  // 2. Get Q1 + Q2 + Q3 sum
  // 3. Calculate Q4 = FY - (Q1 + Q2 + Q3)
  // 4. Insert Q4 with data_source = 'Calculated'
}
```

7.2. **Validation**
- Verify Q1+Q2+Q3+Q4 = FY (within rounding tolerance)
- Flag any significant discrepancies

**Dependencies:** Phase 6 complete

---

### Phase 8: Update Server Action

**Objective:** Modify `app/actions/segment-data.ts` to support quarterly queries.

**Tasks:**

8.1. **Add Period Parameter**

Current signature:
```typescript
export async function getSegmentData(params: {
  segmentType: SegmentType
  segments?: string[]
  minYear?: number
  maxYear?: number
}): Promise<SegmentResult>
```

Updated signature:
```typescript
export async function getSegmentData(params: {
  segmentType: SegmentType
  segments?: string[]
  minYear?: number
  maxYear?: number
  periodType?: 'annual' | 'quarterly' | 'all'  // NEW
  quarters?: (1 | 2 | 3 | 4)[]  // NEW: filter specific quarters
}): Promise<SegmentResult>
```

8.2. **Update Query Logic**

```typescript
// Add period filtering
if (periodType === 'annual') {
  query = query.eq('period', 'FY')
} else if (periodType === 'quarterly') {
  query = query.in('period', ['Q1', 'Q2', 'Q3', 'Q4'])
  if (quarters && quarters.length > 0) {
    query = query.in('period', quarters.map(q => `Q${q}`))
  }
}
// 'all' = no period filter
```

8.3. **Update Response Type**

```typescript
export type SegmentDataPoint = {
  year: number
  quarter?: 1 | 2 | 3 | 4  // NEW
  period: 'FY' | 'Q1' | 'Q2' | 'Q3' | 'Q4'  // NEW
  value: number
}
```

**Dependencies:** Phase 6 complete

---

### Phase 9: Update Chart UI

**Objective:** Enable quarterly segment charts in the charting tab.

**Tasks:**

9.1. **Add Period Toggle**
- Location: Charting tab, segment chart section
- Options: "Annual" | "Quarterly"
- Default: "Annual" (current behavior)

9.2. **Update Chart Data Fetching**
- When "Quarterly" selected, call `getSegmentData({ periodType: 'quarterly' })`
- Handle 4x more data points per year

9.3. **Update Chart Visualization**
- X-axis: Show quarters (e.g., "2024 Q1", "2024 Q2", ...)
- Consider grouped bar chart or stacked area for quarterly view
- Handle legend for 5+ segments × 4 quarters

9.4. **Performance Consideration**
- Quarterly = 4x data points
- Consider pagination or year range limits
- Lazy loading for older quarters

**Dependencies:** Phase 8 complete

---

### Phase 10: Validation & Testing

**Objective:** Verify data accuracy and system reliability.

**Tasks:**

10.1. **Manual Spot Checks**
- Compare 3 random quarters against Apple's 10-Q PDF
- Verify values match within rounding tolerance

10.2. **Automated Validation**
```bash
# Update validation script for quarterly
npx tsx scripts/validate-ixbrl-segments.ts --ticker AAPL --filing-type 10-q
```

10.3. **Cross-Check Totals**
```sql
-- Q1+Q2+Q3+Q4 should equal FY
SELECT
  year,
  dimension_value,
  SUM(CASE WHEN period LIKE 'Q%' THEN metric_value ELSE 0 END) as quarterly_sum,
  MAX(CASE WHEN period = 'FY' THEN metric_value ELSE 0 END) as annual_total,
  ABS(SUM(CASE WHEN period LIKE 'Q%' THEN metric_value ELSE 0 END) -
      MAX(CASE WHEN period = 'FY' THEN metric_value ELSE 0 END)) as difference
FROM company_metrics
WHERE symbol = 'AAPL' AND metric_name = 'segment_revenue'
GROUP BY year, dimension_value
HAVING difference > 1000000  -- Flag differences > $1M
ORDER BY year DESC;
```

10.4. **UI Testing**
- Test quarterly chart toggle
- Verify chart renders correctly
- Test year range filters

**Dependencies:** Phases 7, 9 complete

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SEC EDGAR                                   │
│                    (10-Q HTML Files)                                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Supabase Storage                                  │
│              filings/html/aapl-10-q-*.html                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│              parse-ixbrl-segments.ts --filing-type 10-q             │
│                                                                     │
│  1. Download HTML from storage                                      │
│  2. Parse <ix:header> contexts                                      │
│  3. Filter for single-quarter durations (84-98 days)                │
│  4. Parse <ix:nonFraction> revenue facts                            │
│  5. Map XBRL members → display names                                │
│  6. Calculate fiscal year + quarter from period dates               │
│  7. Deduplicate by year/quarter/segment                             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     company_metrics table                           │
│                                                                     │
│  symbol | year | period | metric_name     | dimension_type | ...    │
│  -------|------|--------|-----------------|----------------|-----   │
│  AAPL   | 2024 | Q1     | segment_revenue | product        | ...    │
│  AAPL   | 2024 | Q2     | segment_revenue | product        | ...    │
│  AAPL   | 2024 | Q3     | segment_revenue | product        | ...    │
│  AAPL   | 2024 | Q4     | segment_revenue | product        | ... *  │
│  AAPL   | 2024 | FY     | segment_revenue | product        | ...    │
│                                                                     │
│  * Q4 calculated as FY - Q1 - Q2 - Q3                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  getSegmentData() Server Action                     │
│                                                                     │
│  Input: { segmentType, periodType: 'quarterly' }                    │
│  Output: [{ segment: 'iPhone', data: [{year, quarter, value}...] }] │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Charting Tab UI                                │
│                                                                     │
│  [Annual ▼] [Quarterly]  ← Toggle                                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Revenue by Product (Quarterly)                              │   │
│  │  ████ iPhone  ████ Services  ████ Mac  ████ iPad  ████ WHoA │   │
│  │  Q1   Q2   Q3   Q4   Q1   Q2   Q3   Q4   Q1   Q2   Q3   Q4  │   │
│  │  └───── 2023 ─────┘  └───── 2024 ─────┘  └───── 2025 ─────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| XBRL structure differs between 10-K and 10-Q | Medium | High | Explore sample 10-Q first; add defensive parsing |
| YTD vs quarterly context confusion | High | High | Strict duration filtering (84-98 days) |
| Missing 10-Q files in storage | Medium | Medium | Download script in Phase 2 |
| Q4 calculation errors | Low | Medium | Cross-validate Q1+Q2+Q3+Q4=FY |
| Older filings (pre-2018) incompatible | Medium | Low | Start with recent filings; add fallbacks |
| Performance with 4x data points | Low | Medium | Pagination, year range limits |
| Segment names differ quarterly vs annual | Low | High | Use consistent mapping; validate names |

---

## Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| Quarterly data extracted | ≥90% of available 10-Q filings parsed successfully |
| Data accuracy | Spot-checked values within 0.1% of source filings |
| Q4 calculation | Quarterly sum matches annual within 0.5% |
| Chart functionality | Quarterly toggle works; charts render <2s |
| No regressions | Annual segment data unchanged |

---

## Timeline Estimate

| Phase | Description | Complexity | Order |
|-------|-------------|------------|-------|
| 1 | Storage verification | Low | Can start immediately |
| 2 | Download 10-Q files | Low | After Phase 1 |
| 3 | Fiscal quarter helpers | Low | Parallel with 1-2 |
| 4 | Update parser | Medium | After Phase 3 |
| 5 | Update ingestion | Low | After Phase 4 |
| 6 | Execute parsing | Low | After Phase 5 |
| 7 | Calculate Q4 | Medium | After Phase 6 |
| 8 | Update server action | Low | After Phase 6 |
| 9 | Update chart UI | Medium | After Phase 8 |
| 10 | Validation & testing | Medium | After all phases |

**Critical Path:** 1 → 2 → 4 → 5 → 6 → 7 → 8 → 9 → 10

---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `scripts/check-10q-storage.ts` | Verify which 10-Q files exist in storage |
| `scripts/download-10q-filings.ts` | Download missing 10-Q files |
| `scripts/calculate-q4-segments.ts` | Calculate Q4 from FY - Q1 - Q2 - Q3 |

### Modified Files

| File | Changes |
|------|---------|
| `lib/ixbrl-mappings/aapl.ts` | Add `getFiscalQuarterFromPeriodEnd()`, `isQuarterlyDuration()` |
| `lib/ixbrl-mappings/index.ts` | Export new functions |
| `scripts/parse-ixbrl-segments.ts` | Add `--filing-type` flag, quarterly filtering, period calculation |
| `scripts/validate-ixbrl-segments.ts` | Add quarterly validation support |
| `app/actions/segment-data.ts` | Add `periodType` and `quarters` parameters |
| `components/charts/SegmentChart.tsx` | Add quarterly toggle, update x-axis |

---

## Appendix: Sample 10-Q XBRL Structure

Before implementing, explore a sample 10-Q to verify XBRL structure:

```bash
# Download and examine a sample 10-Q
npx tsx scripts/explore-ixbrl.mjs aapl-10-q-2024-q3.html
```

Expected findings:
- Context IDs for quarterly vs YTD periods
- Member names (should match 10-K)
- Axis names (should match 10-K)
- Numeric fact formats

---

## References

- [IXBRL_PARSER.md](./IXBRL_PARSER.md) - Existing parser documentation
- [METRIC_TAXONOMY.md](./METRIC_TAXONOMY.md) - Metric classification system
- [Apple Investor Relations](https://investor.apple.com/sec-filings/) - Source filings
- SEC EDGAR - [Apple 10-Q filings](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=10-Q)
