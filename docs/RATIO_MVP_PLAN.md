# Financial Ratio MVP - Quick Win Implementation

## Goal
Support the top 10 most requested financial ratios using our existing architecture (no new tools required).

## Strategy
**Leverage what's working**: Our system already calculates gross margin by fetching `gross_profit` + `revenue` and letting GPT-4o-mini do the math. Extend this pattern for other ratios.

## Phase 1: Core Ratios (This Week)

### Already Working ✅
1. **Gross Margin** - (gross_profit / revenue) × 100

### Easy Additions (Same Day)
2. **Operating Margin** - (operating_income / revenue) × 100
3. **Net Profit Margin** - (net_income / revenue) × 100
4. **ROE (Return on Equity)** - (net_income / shareholders_equity) × 100
5. **ROA (Return on Assets)** - (net_income / total_assets) × 100

### Requires Balance Sheet Data (1-2 Days)
6. **Debt-to-Equity** - total_liabilities / shareholders_equity
7. **Current Ratio** - current_assets / current_liabilities
8. **Quick Ratio** - (current_assets - inventory) / current_liabilities

### Requires Cash Flow Data (If Available)
9. **FCF Margin** - free_cash_flow / revenue
10. **OCF Ratio** - operating_cash_flow / revenue

---

## Implementation Checklist

### Step 1: Check Data Availability (30 min)
```sql
-- Run in Supabase SQL Editor
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'financials_std'
ORDER BY ordinal_position;
```

Check if you have:
- ✅ `revenue`, `gross_profit`, `net_income`, `operating_income` (confirmed)
- ❓ `current_assets`, `current_liabilities`
- ❓ `inventory`
- ❓ `free_cash_flow`, `operating_cash_flow`

### Step 2: Update Types (5 min)
```typescript
// app/actions/financials.ts - NO CHANGES NEEDED!
// Your existing type already works:
export type FinancialMetric =
  | 'revenue'
  | 'gross_profit'
  | 'net_income'
  | 'operating_income'
  | 'total_assets'
  | 'total_liabilities'
  | 'shareholders_equity'
  | 'operating_cash_flow'
  | 'eps'
```

These 9 metrics support **15+ ratios** already!

### Step 3: Update Prompt (10 min)
```typescript
// lib/tools.ts - Extend CALCULATIONS section
6. CALCULATIONS - You MAY calculate ratios/percentages from the data:
   PROFITABILITY:
   - Gross Margin = (gross_profit / revenue) × 100
   - Operating Margin = (operating_income / revenue) × 100
   - Net Margin = (net_income / revenue) × 100
   - ROE = (net_income / shareholders_equity) × 100
   - ROA = (net_income / total_assets) × 100

   LEVERAGE:
   - Debt-to-Equity = total_liabilities / shareholders_equity
   - Debt-to-Assets = total_liabilities / total_assets

   EFFICIENCY:
   - Asset Turnover = revenue / total_assets
   - Cash Flow Margin = operating_cash_flow / revenue
```

### Step 4: Update Chart Helpers (15 min)
```typescript
// lib/chart-helpers.ts - Add new ratio detection
const isROACalculation = data[0]?.total_assets && metric === 'net_income'
const isDebtRatio = data[0]?.total_liabilities &&
                    (metric === 'shareholders_equity' || metric === 'total_assets')

if (isROACalculation) {
  values = validData.map((d: any) => {
    const roa = (d.value / d.total_assets) * 100
    return parseFloat(roa.toFixed(1))
  })
  metricName = 'Return on Assets (ROA)'
  yAxisLabel = 'ROA (%)'
}
```

### Step 5: Extend Validation (20 min)
```typescript
// lib/validators.ts - Already handles ratio validation!
// Your existing code in calculateRatios() just needs these additions:

// ROA calculation
if (primaryMetric === 'net_income' && 'total_assets' in row) {
  const roa = (row.value / row.total_assets) * 100
  ratios.push(parseFloat(roa.toFixed(1)))
}

// Operating margin calculation
if (primaryMetric === 'operating_income' && row.revenue) {
  const operatingMargin = (row.value / row.revenue) * 100
  ratios.push(parseFloat(operatingMargin.toFixed(1)))
}
```

### Step 6: Update financials.ts (10 min)
```typescript
// app/actions/financials.ts - Extend the mapped data
const mapped = (data ?? []).map((row) => {
  const result: any = {
    year: row.year,
    value: row[metric] as number,
    metric,
  }

  // Include revenue for margin calculations
  if (['gross_profit', 'operating_income', 'net_income', 'operating_cash_flow'].includes(metric)) {
    result.revenue = row.revenue
  }

  // Include total_assets for ROA
  if (metric === 'net_income') {
    result.shareholders_equity = row.shareholders_equity
    result.total_assets = row.total_assets  // ← Add this
  }

  // Include shareholders_equity for debt ratios
  if (metric === 'total_liabilities') {
    result.shareholders_equity = row.shareholders_equity
    result.total_assets = row.total_assets
  }

  return result
})
```

---

## Testing Script

```typescript
// Test all 10 ratios
const testQueries = [
  "AAPL gross margin",           // ✅ Working
  "AAPL operating margin",       // New
  "AAPL net profit margin",      // New
  "AAPL return on equity",       // New
  "AAPL return on assets",       // New
  "AAPL debt to equity ratio",   // New
  "AAPL asset turnover",         // New
  "AAPL cash flow margin",       // New
]

// Run each and verify:
// 1. Correct calculation
// 2. Validation passes
// 3. Chart displays correctly
```

---

## Expected Results

**Time Investment**: 1-2 hours
**Ratios Supported**: 8-10 (from 1)
**Architecture Changes**: Minimal (just extend existing pattern)
**Cost Impact**: None (same number of tool calls)
**User Impact**: Huge (8x more capabilities)

---

## What This Unlocks

With these 10 ratios, users can ask:
- ✅ "Compare AAPL's profitability over 5 years"
- ✅ "Is AAPL's debt healthy?"
- ✅ "How efficient is AAPL at using assets?"
- ✅ "Show me AAPL's return on equity"

All with **zero new tools**, **zero new data sources**, and **zero cost increase**.

---

## Next Phase (After User Validation)

Once you confirm these 10 ratios are being used:

**Phase 2: Add 5-10 more** (requires balance sheet details)
- Current Ratio
- Quick Ratio
- Inventory Turnover
- Interest Coverage

**Phase 3: Valuation Ratios** (requires market data)
- P/E Ratio
- EV/EBITDA
- Price-to-Book

**Phase 4: Advanced Metrics** (based on demand)
- ROIC
- CROIC
- Quality of Earnings

---

## Why This Approach Wins

1. **Fast**: Ship in days, not months
2. **Cheap**: No additional API costs
3. **Proven**: Uses architecture that's already working
4. **Measurable**: Track usage with existing query logs
5. **Scalable**: Easy to add more ratios when needed

---

## Success Metrics

After 2 weeks:
- [ ] 8+ ratios supported
- [ ] <5% validation failure rate for ratios
- [ ] User feedback: "love the new ratios"
- [ ] Cost per query: unchanged
- [ ] Query logs show ratio questions increasing

Then decide: keep extending, or pivot based on user requests.
