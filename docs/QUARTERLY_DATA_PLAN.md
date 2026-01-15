# Quarterly Data Implementation Plan

This document outlines the plan to add quarterly financial data alongside existing annual data.

---

## 1. Database Schema Changes

### Modify `financials_std` table

Add columns:
- `period_type` (text, not null, default 'annual') — 'annual' | 'quarterly'
- `fiscal_quarter` (integer, nullable) — 1, 2, 3, or 4 (null for annual)
- `fiscal_label` (text, nullable) — e.g., "2024-Q2" for quarterly, null for annual (simplifies chart x-axis)
- `period_end_date` (date, nullable) — actual date the period ended

Add constraint:
```sql
ALTER TABLE financials_std
ADD CONSTRAINT chk_period_type CHECK (period_type IN ('annual', 'quarterly'));
```

Add index:
```sql
CREATE INDEX idx_financials_std_period
ON financials_std (symbol, period_type, fiscal_year, fiscal_quarter);
```

### Modify `financial_metrics` table

Same changes:
- `period_type` (text, not null, default 'annual')
- `fiscal_quarter` (integer, nullable)
- `fiscal_label` (text, nullable)
- `period_end_date` (date, nullable)

Add constraint:
```sql
ALTER TABLE financial_metrics
ADD CONSTRAINT chk_period_type CHECK (period_type IN ('annual', 'quarterly'));
```

Add index:
```sql
CREATE INDEX idx_financial_metrics_period
ON financial_metrics (symbol, period_type, fiscal_year, fiscal_quarter);
```

### Migration Notes

- Existing rows get `period_type = 'annual'`, `fiscal_quarter = NULL`, `fiscal_label = NULL`
- No data loss, backward compatible
- Existing queries continue to work (filter by `period_type = 'annual'` to maintain current behavior)

---

## 2. Data Ingestion

### FMP API

Both endpoints support quarterly data:
- Income statement: `?period=quarter`
- Balance sheet: `?period=quarter`
- Cash flow: `?period=quarter`
- Key metrics: `?period=quarter`

### Script Changes

**`scripts/fetch-aapl-data.ts`**
- Add `period` parameter ('annual' | 'quarter')
- Fetch both periods in sequence or parallel
- Store raw responses with period metadata

**`scripts/ingest-financials.ts`**
- Parse period type from data
- Extract fiscal quarter from `period` field (e.g., "Q1", "Q2")
- Generate `fiscal_label` as `${fiscal_year}-Q${fiscal_quarter}`
- Map `period_end_date` from FMP's `date` field
- Upsert with composite key including `period_type` and `fiscal_quarter`

**`scripts/fetch-metrics.ts` / `scripts/ingest-metrics.ts`**
- Same changes as above

### Completeness Validation

Before ingestion, run a per-symbol/year completeness check:
- Log any missing quarters (e.g., "AAPL 2023: Q1, Q2, Q3 present; Q4 missing")
- Continue ingestion but flag incomplete years
- Keep ingest idempotent with the expanded composite key

### Apple Fiscal Calendar

Apple's fiscal year ends in September. Quarters:
- Q1: Oct-Dec (ends late December)
- Q2: Jan-Mar (ends late March)
- Q3: Apr-Jun (ends late June)
- Q4: Jul-Sep (ends late September)

FMP provides the correct fiscal quarter mapping.

---

## 3. Tool Changes

### `getAaplFinancialsByMetric`

Add parameters:
```typescript
period?: 'annual' | 'quarterly' | 'ttm'  // default: 'annual'
quarters?: number[]                       // optional filter, e.g., [1, 2]
```

Query logic:
- `annual`: `WHERE period_type = 'annual'`
- `quarterly`: `WHERE period_type = 'quarterly'` (optionally filter by `quarters`)
- `ttm`: Calculate sum of last 4 quarters on-the-fly

### `getFinancialMetric`

Same parameter additions as above.

### Parameter Validation

Server-side validation before DB queries:
- Reject `period='annual'` with `quarters` specified (invalid combination)
- Reject `period='ttm'` with `quarters` specified (TTM doesn't filter by quarter)
- `quarters` parameter only valid when `period='quarterly'`
- Return clear error messages for invalid combinations

### `lib/tools.ts` - Prompt Updates

Update `buildToolSelectionPrompt` to guide LLM:
- "quarterly revenue" → `period: 'quarterly'`
- "Q2 2024 earnings" → `period: 'quarterly', quarters: [2], minYear: 2024`
- "last 4 quarters" → `period: 'quarterly', limit: 4`
- "trailing twelve months" → `period: 'ttm'`
- "annual revenue" or just "revenue" → `period: 'annual'` (default)

Include explicit examples contrasting annual vs quarterly vs TTM to reduce LLM confusion.

---

## 4. Chart Updates

### MetricSelector / Charts Page

Add period toggle:
- Segmented control: Annual | Quarterly
- Stored in component state, passed to data fetching
- Preserve selected metrics when switching period type

### Default Ranges

- Annual: 2018-present (current behavior)
- Quarterly: Last 12 quarters (~3 years)

### X-Axis Labels

- Annual: "2020", "2021", "2022"
- Quarterly: "Q1 '22", "Q2 '22", "Q3 '22" (use `fiscal_label` column)

### Data Density

Quarterly charts have 4x more points. Mitigations:
- Narrower bars
- Hide data labels by default when >20 points
- Default to shorter date range (12 quarters vs 20 years)

---

## 5. TTM (Trailing Twelve Months)

### Calculation

**Summable metrics** (flow metrics from income/cash flow statements):
- Revenue, net income, operating income, gross profit, EPS, operating cash flow
- TTM = sum of last 4 quarters

**Derived metrics** (ratios, percentages):
- Gross margin, ROE, ROA, net margin, etc.
- TTM = recalculate from underlying TTM values
- Example: TTM gross margin = TTM gross profit / TTM revenue
- Do NOT sum 4 quarters of percentages

**Point-in-time metrics** (balance sheet items):
- Total assets, total liabilities, shareholders equity
- TTM = most recent quarter value (not summed)

### Metric Classification

Maintain a mapping of metrics to their TTM calculation type:
```typescript
const TTM_CALC_TYPE: Record<string, 'sum' | 'derived' | 'point_in_time'> = {
  revenue: 'sum',
  net_income: 'sum',
  gross_margin: 'derived',
  total_assets: 'point_in_time',
  // ...
}
```

### Implementation

Calculate on-the-fly (Option A):
- Pros: Always current, no extra storage
- Cons: Slightly more complex queries
- Unit tests comparing against FMP's TTM values for validation

### Edge Cases

- Incomplete quarters (current quarter in progress) — use most recent 4 complete quarters
- Missing historical quarters — return error or partial data with warning
- Metrics that don't sum (ratios, averages) — recalculate from components

---

## 6. Implementation Order

### Phase 1: Database & Core Ingestion
1. Run migration to add new columns to both tables (including CHECK constraints)
2. Update `fetch-aapl-data.ts` to pull quarterly data for core metrics
3. Update `ingest-financials.ts` to handle period metadata and completeness logging
4. Backfill quarterly data for 9 core metrics (`financials_std`)

### Phase 2: Backend Tools (Core Metrics)
1. Update `getAaplFinancialsByMetric` with period parameter
2. Add parameter validation (reject invalid combinations)
3. Update tool selection prompt with quarterly routing rules
4. Test with sample queries using core metrics

### Phase 3: Chart UI
1. Add period toggle to charts page
2. Update x-axis formatting for quarters (use `fiscal_label`)
3. Adjust default date ranges per period type
4. Hide data labels when >20 points
5. Test data density and readability

### Phase 4: Extended Metrics Ingestion
1. Update `fetch-metrics.ts` to pull quarterly data for extended metrics
2. Update `ingest-metrics.ts` to handle period metadata
3. Backfill quarterly data for 139 extended metrics (`financial_metrics`)

### Phase 5: Backend Tools (Extended Metrics)
1. Update `getFinancialMetric` with period parameter
2. Test with sample queries using extended metrics

### Phase 6: TTM
1. Define metric classification (sum vs derived vs point-in-time)
2. Implement TTM calculation logic with proper handling per type
3. Add 'ttm' as period option
4. Unit tests comparing against FMP TTM values
5. Update prompts for TTM queries

### Phase 7: Chatbot Integration
1. Update answer generation prompts for quarterly context
2. Add validation rules for period type matching (reject annual result for quarterly question)
3. Test end-to-end Q&A with quarterly questions

---

## 7. Sample Queries After Implementation

**User**: "What was Apple's Q2 2024 revenue?"
**Tool call**: `getAaplFinancialsByMetric({ metric: 'revenue', period: 'quarterly', quarters: [2], minYear: 2024, maxYear: 2024 })`

**User**: "Show quarterly revenue for the last 2 years"
**Tool call**: `getAaplFinancialsByMetric({ metric: 'revenue', period: 'quarterly', minYear: 2023 })`

**User**: "Compare Q1 revenue year over year"
**Tool call**: `getAaplFinancialsByMetric({ metric: 'revenue', period: 'quarterly', quarters: [1] })`

**User**: "What's Apple's TTM revenue?"
**Tool call**: `getAaplFinancialsByMetric({ metric: 'revenue', period: 'ttm' })`

**User**: "What was Apple's revenue in 2024?"
**Tool call**: `getAaplFinancialsByMetric({ metric: 'revenue', period: 'annual', minYear: 2024, maxYear: 2024 })`
(Default to annual when no period specified)

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Quarterly data gaps in FMP | Completeness check before ingestion; log missing periods; continue with available data |
| Chart performance with many points | Limit default range to 12 quarters; hide labels when dense; consider Highcharts data grouping if needed |
| LLM confusion between annual/quarterly | Clear prompt examples contrasting all three types; explicit defaults |
| LLM returns wrong period type | Validation rule: reject annual result when user asked for quarterly (and vice versa) |
| TTM calculation errors for ratios | Classify metrics by TTM type; recalculate derived metrics from components; unit tests against FMP values |
| Invalid parameter combinations | Server-side validation rejecting mismatched period/quarters combos |

---

## 9. Future Considerations

- **Multi-company support**: Schema already supports via `symbol` column
- **Monthly data**: Some metrics available monthly (e.g., estimates)
- **Real-time updates**: Webhook or polling for new quarterly releases
- **Comparison views**: Side-by-side annual vs quarterly charts
- **Stored TTM**: If on-the-fly calculation becomes slow, consider storing TTM as third period_type
