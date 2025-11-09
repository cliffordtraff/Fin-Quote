# Adding New Metrics - Complete Checklist

When you add new metrics from FMP API to Supabase, here's the complete pipeline of files to update:

---

## 📋 Quick Summary: 3 Files to Update

### **Files You Must Manually Update:**
1. ✏️ **`scripts/fetch-fmp-metrics.ts`** - Add endpoint, interface, and processing logic
2. ✏️ **`lib/metric-metadata.ts`** - Add descriptions and aliases for each new metric
3. ⚠️ **`lib/tools.ts`** - **CRITICAL!** Update tool prompt to mention new metrics (LLM won't route to them otherwise!)

### **Commands to Run (Automated):**
4. ▶️ `npx tsx scripts/fetch-fmp-metrics.ts` - Fetch from API
5. ▶️ `npm run ingest:metrics` - Insert into database
6. ▶️ `npm run generate:catalog` - Build catalog file

### **Files That Don't Need Changes:**
- ✅ Database schema (key-value table, no changes needed)
- ✅ `app/actions/get-financial-metric.ts` (generic query)
- ✅ Frontend components (metric-agnostic)
- ✅ `lib/metric-resolver.ts` (uses metadata automatically)

**⚠️ Important:** Don't skip step 3 (updating `lib/tools.ts`)! Without it, the LLM won't know the new metrics exist and will incorrectly tell users "I don't have that data" even though the data is in the database.

---

## Step-by-Step Process

### 1. **Update Fetch Script**
**File:** `scripts/fetch-fmp-metrics.ts`

**What to do:**
- Add new endpoint URL (e.g., `cashFlowStatement`)
- Add TypeScript interface for the response
- Add fetch call to Promise.all()
- Add processing logic to extract metrics
- Add metrics to CATEGORY_MAP

**Example:**
```typescript
// Add endpoint
cashFlowStatement: `https://financialmodelingprep.com/api/v3/cash-flow-statement/${SYMBOL}?period=annual&limit=20&apikey=${FMP_API_KEY}`

// Add interface
interface FMPCashFlow {
  date: string
  freeCashFlow: number
  capitalExpenditure: number
  // ... more fields
}

// Add to fetch
const [keyMetrics, ratios, growth, enterpriseValues, incomeStatements, cashFlows] = await Promise.all([...])

// Add to CATEGORY_MAP
freeCashFlow: 'Cash Flow',
capitalExpenditure: 'Cash Flow',
```

**Run:** `npx tsx scripts/fetch-fmp-metrics.ts`
- Creates/updates: `data/aapl-fmp-metrics.json`

---

### 2. **Update Metric Metadata**
**File:** `lib/metric-metadata.ts`

**What to do:**
- Add entry for each new metric in `METRIC_METADATA` object
- Include: description, unit, commonAliases

**Example:**
```typescript
freeCashFlow: {
  description: 'Free Cash Flow - Operating cash flow minus capital expenditures',
  unit: 'currency',
  commonAliases: ['FCF', 'free cash flow', 'free cash']
},

capitalExpenditure: {
  description: 'Capital Expenditures - Investments in property, plant, and equipment',
  unit: 'currency',
  commonAliases: ['capex', 'capital spending', 'capital expenditures', 'CapEx']
},
```

**Why:** This powers the `listMetrics` discovery tool and metric resolution.

---

### 3. **Ingest Data to Supabase**
**File:** `scripts/ingest-fmp-metrics.ts` (already configured)

**What to do:**
- Just run it - it reads from `data/aapl-fmp-metrics.json`
- Uses service role key to bypass RLS

**Run:** `npm run ingest:metrics`
- Inserts/updates data in `financial_metrics` table

**Note:** No code changes needed - it's generic!

---

### 4. **Regenerate Metrics Catalog**
**File:** `scripts/generate-metrics-catalog.ts` (already configured)

**What to do:**
- Just run it - it reads from database + metadata file
- Generates the catalog that powers `listMetrics` tool

**Run:** `npm run generate:catalog`
- Creates/updates: `data/metrics-catalog.json`

**Note:** No code changes needed - it's automatic!

---

### 5. **Update Tool Prompts** ⚠️ **REQUIRED**
**File:** `lib/tools.ts`

**What to do:**
- Update the `getFinancialMetric` tool description to mention new metrics
- Add examples if the metrics are commonly requested
- **This is critical** - without this, the LLM won't know to route questions about these metrics to the right tool!

**Example:**
```typescript
6. getFinancialMetric - GET advanced financial metrics

   Use for 50+ advanced metrics including:
   - Valuation: P/E ratio, P/B ratio, PEG ratio, EV/EBITDA, market cap
   - Profitability Margins: gross margin, operating margin, net margin, EBIT margin, EBITDA margin, pretax margin
   - Cash Flow: free cash flow, capex, operating cash flow per share  // <-- ADD THIS
   - Returns: ROE, ROA, ROIC, return on capital employed
   ...
```

**Why:** The LLM uses this prompt to decide which tool to call. If new metrics aren't mentioned here, the LLM won't know they exist and will say "I don't have that data" even though the data is in the database!

---

### 6. **Test the New Metrics**
**Files:** Create a test script (optional)

**What to do:**
- Query the new metrics from the database
- Test tool selection with sample questions
- Verify the answer generation works

**Example test:**
```typescript
// Test query
const { data } = await supabase
  .from('financial_metrics')
  .select('year, metric_value')
  .eq('symbol', 'AAPL')
  .eq('metric_name', 'freeCashFlow')
  .order('year', { ascending: false })
  .limit(5)

console.table(data)
```

---

## Files That DON'T Need Changes

### ✅ Already Generic/Automatic:
- `scripts/ingest-fmp-metrics.ts` - Reads from JSON, works for any metrics
- `scripts/generate-metrics-catalog.ts` - Queries DB + metadata, fully automatic
- `app/actions/get-financial-metric.ts` - Generic query by metric name
- `lib/metric-resolver.ts` - Uses metadata for alias resolution
- Database schema - `financial_metrics` table is key-value, no changes needed

### ✅ Frontend (No Changes):
- `app/ask/page.tsx` - UI is metric-agnostic
- `components/FinancialChart.tsx` - Works with any metric data
- `components/RecentQueries.tsx` - Generic query display

---

## Complete Workflow Example: Adding Free Cash Flow

### Step 1: Update fetch script
```typescript
// scripts/fetch-fmp-metrics.ts

// Add endpoint
const endpoints = {
  // ... existing endpoints
  cashFlowStatement: `https://financialmodelingprep.com/api/v3/cash-flow-statement/${SYMBOL}?period=annual&limit=20&apikey=${FMP_API_KEY}`,
}

// Add interface
interface FMPCashFlow {
  date: string
  symbol: string
  period: string
  freeCashFlow: number
  capitalExpenditure: number
  operatingCashFlow: number
  commonStockRepurchased: number
  dividendsPaid: number
  stockBasedCompensation: number
}

// Add to fetch
const [..., cashFlows] = await Promise.all([
  // ... existing fetches
  fetch(endpoints.cashFlowStatement).then((r) => r.json()) as Promise<FMPCashFlow[]>,
])

// Add to CATEGORY_MAP
const CATEGORY_MAP: Record<string, string> = {
  // ... existing mappings
  freeCashFlow: 'Cash Flow',
  capitalExpenditure: 'Cash Flow',
  commonStockRepurchased: 'Capital Returns & Share Data',
  dividendsPaid: 'Capital Returns & Share Data',
  stockBasedCompensation: 'Other',
}

// Add processing logic (after enterprise values section)
// Process Cash Flow Statements
cashFlows.forEach((item) => {
  const year = new Date(item.date).getFullYear()
  const cashFlowMetrics = {
    freeCashFlow: item.freeCashFlow,
    capitalExpenditure: Math.abs(item.capitalExpenditure), // Make positive
    commonStockRepurchased: Math.abs(item.commonStockRepurchased), // Make positive
    dividendsPaid: Math.abs(item.dividendsPaid), // Make positive
    stockBasedCompensation: item.stockBasedCompensation,
  }

  Object.entries(cashFlowMetrics).forEach(([key, value]) => {
    if (typeof value !== 'number' || value === null) return

    // Skip duplicates
    const isDuplicate = metrics.some(
      (m) => m.year === year && m.metric_name === key
    )
    if (isDuplicate) return

    metrics.push({
      symbol: SYMBOL,
      year,
      period: 'FY',
      metric_name: key,
      metric_value: value,
      metric_category: CATEGORY_MAP[key] || 'Cash Flow',
      data_source: 'FMP:cash-flow-statement',
    })
  })
})
```

### Step 2: Update metadata
```typescript
// lib/metric-metadata.ts

export const METRIC_METADATA: Record<string, MetricMetadata> = {
  // ... existing metrics

  freeCashFlow: {
    description: 'Free Cash Flow - Operating cash flow minus capital expenditures, representing cash available for distribution',
    unit: 'currency',
    commonAliases: ['FCF', 'free cash flow', 'free cash', 'unlevered free cash flow']
  },

  capitalExpenditure: {
    description: 'Capital Expenditures - Cash spent on acquiring or upgrading physical assets like property, plant, and equipment',
    unit: 'currency',
    commonAliases: ['capex', 'capital spending', 'capital expenditures', 'CapEx', 'PP&E spending']
  },

  commonStockRepurchased: {
    description: 'Stock Repurchases - Cash used to buy back company shares, a form of capital return to shareholders',
    unit: 'currency',
    commonAliases: ['buybacks', 'share buybacks', 'stock buybacks', 'share repurchases', 'treasury stock purchases']
  },

  dividendsPaid: {
    description: 'Dividends Paid - Total cash paid to shareholders as dividends',
    unit: 'currency',
    commonAliases: ['dividends', 'dividend payments', 'cash dividends']
  },

  stockBasedCompensation: {
    description: 'Stock-Based Compensation - Non-cash expense from employee equity compensation (stock options, RSUs)',
    unit: 'currency',
    commonAliases: ['SBC', 'stock comp', 'equity compensation', 'stock-based comp', 'RSU expense']
  },
}
```

### Step 3: Run the pipeline
```bash
# Fetch new data
npx tsx scripts/fetch-fmp-metrics.ts

# Ingest to database
npm run ingest:metrics

# Regenerate catalog
npm run generate:catalog
```

### Step 4: Update tool prompts (optional)
```typescript
// lib/tools.ts

6. getFinancialMetric - GET advanced financial metrics

   Use for 50+ advanced metrics including:
   - Valuation: P/E ratio, P/B ratio, PEG ratio, EV/EBITDA, market cap
   - Profitability Margins: gross margin, operating margin, net margin, EBIT margin, EBITDA margin
   - Cash Flow: free cash flow, capex, buybacks, dividends paid, stock-based compensation
   - Returns: ROE, ROA, ROIC
   ...
```

### Step 5: Test
```typescript
// scripts/test-new-metrics.mjs
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data } = await supabase
  .from('financial_metrics')
  .select('year, metric_value')
  .eq('symbol', 'AAPL')
  .eq('metric_name', 'freeCashFlow')
  .order('year', { ascending: false })
  .limit(5)

console.log('Free Cash Flow (last 5 years):')
console.table(data.map(d => ({
  year: d.year,
  'FCF': `$${(d.metric_value / 1e9).toFixed(1)}B`
})))
```

---

## Summary: Only 2 Files Need Manual Updates

1. **`scripts/fetch-fmp-metrics.ts`** - Add endpoint, interface, fetch call, processing logic
2. **`lib/metric-metadata.ts`** - Add descriptions and aliases

Everything else is automated!

---

## Common Gotchas

1. **Negative values in cash flow**: Capex, dividends, buybacks are negative in FMP API. Use `Math.abs()` to make them positive for user display.

2. **Duplicate metrics**: Always check for duplicates before adding to avoid conflicts (the fetch script does this).

3. **Service role key**: Make sure `ingest-fmp-metrics.ts` uses `SUPABASE_SERVICE_ROLE_KEY`, not the anon key (RLS blocks anon key inserts).

4. **Metric naming**: Use camelCase for consistency (`freeCashFlow`, not `free_cash_flow`).

5. **Category mapping**: Put similar metrics in the same category for better organization in the catalog.

---

## Data Flow Diagram

```
FMP API
   ↓
[fetch-fmp-metrics.ts] → data/aapl-fmp-metrics.json
   ↓
[ingest-fmp-metrics.ts] → Supabase financial_metrics table
   ↓
[generate-metrics-catalog.ts] + [metric-metadata.ts] → data/metrics-catalog.json
   ↓
[lib/tools.ts] (tool prompts)
   ↓
[app/actions/get-financial-metric.ts] (runtime queries)
   ↓
User gets answer!
```

---

## Quick Reference: All Commands

```bash
# 1. Fetch from API
npx tsx scripts/fetch-fmp-metrics.ts

# 2. Ingest to DB
npm run ingest:metrics

# 3. Regenerate catalog
npm run generate:catalog

# 4. Export to Excel (optional)
npx tsx scripts/export-all-metrics-simple.ts

# 5. Test (create your own test script)
node scripts/test-new-metrics.mjs
```
