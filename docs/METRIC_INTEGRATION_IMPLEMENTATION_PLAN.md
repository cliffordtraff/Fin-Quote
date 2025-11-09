# Metric Integration Implementation Plan

**Date:** 2025-11-06
**Status:** Planning Phase
**Approach:** Two-Layer System (Discovery + Execution)

---

## Overview

Integrating 139 financial metrics into the Q&A system using a **two-layer architecture**:

1. **Discovery Layer** - Catalog tool for browsing available metrics
2. **Execution Layer** - Smart tool with alias resolution for fetching data

**Total tools after implementation: 6** (4 existing + 2 new)

---

## Architecture: Two-Layer System

### Why Two Layers?

**Problem with naive approach:**
- Adding 139 metric names to one tool's argument list overwhelms the LLM
- LLM can't memorize all metric names
- User phrases don't match database field names ("price to earnings" ≠ `peRatio`)

**Solution:**
1. **Discovery** - Let LLM browse the catalog when uncertain
2. **Execution** - Accept flexible input and resolve to canonical names

---

## Layer 1: Discovery Layer

### Purpose
Provide a read-only tool that returns the complete catalog of available metrics with metadata.

### Tool Definition

**Name:** `listMetrics`

**Description:**
```
Get a catalog of all available financial metrics. Use this when you need to:
- Discover what metrics are available
- Find the correct metric name for a user's question
- Browse metrics by category (Valuation, Profitability, Growth, etc.)
- Understand units, definitions, and data coverage
```

**Arguments:**
```typescript
{
  category?: string  // Optional filter: 'Valuation', 'Profitability & Returns', 'Growth', etc.
}
```

**Returns:**
```typescript
[
  {
    metric_name: 'peRatio',
    category: 'Valuation',
    description: 'Price-to-Earnings Ratio',
    unit: 'ratio',
    data_coverage: '2006-2025',
    common_aliases: ['P/E', 'price to earnings', 'PE ratio', 'earnings multiple']
  },
  {
    metric_name: 'returnOnEquity',
    category: 'Profitability & Returns',
    description: 'Return on Equity',
    unit: 'percentage',
    data_coverage: '2006-2025',
    common_aliases: ['ROE', 'return on equity']
  },
  // ... 137 more
]
```

### How LLM Uses It

**Scenario 1: User asks ambiguous question**
```
User: "What debt metrics do you have for Apple?"

LLM thinks:
- "debt metrics" is vague
- I should check what's available
- Tool: listMetrics with category filter

LLM calls: {"tool": "listMetrics", "args": {"category": "Leverage & Solvency"}}

LLM receives:
- debtEquityRatio
- currentRatio
- quickRatio
- debtRatio
- etc.

LLM responds:
"I have several debt metrics available: Debt-to-Equity Ratio, Current Ratio,
Quick Ratio, and Total Debt Ratio. Which would you like to see?"
```

**Scenario 2: User asks for specific metric, LLM uncertain of name**
```
User: "What's Apple's price to earnings ratio?"

LLM thinks:
- User wants P/E ratio
- Not sure if it's called 'peRatio' or 'priceToEarnings' or 'PE'
- Let me check the catalog

LLM calls: {"tool": "listMetrics", "args": {}}

LLM finds: metric_name = 'peRatio' with aliases ['P/E', 'price to earnings']

LLM calls: {"tool": "getFinancialMetric", "args": {"metricName": "peRatio", "limit": 5}}
```

### Implementation

**File 1:** `lib/metric-metadata.ts`

This is the **only manually-maintained file** for metric descriptions and units:

```typescript
export interface MetricMetadata {
  description: string
  unit: 'ratio' | 'percentage' | 'currency' | 'number' | 'days'
  commonAliases: string[]
}

/**
 * Metadata for all financial metrics
 * This is manually curated but only needs to be updated when new metrics are added
 */
export const METRIC_METADATA: Record<string, MetricMetadata> = {
  peRatio: {
    description: 'Price-to-Earnings Ratio - Market price per share divided by earnings per share',
    unit: 'ratio',
    commonAliases: ['P/E', 'PE', 'price to earnings', 'price-to-earnings', 'earnings multiple']
  },
  returnOnEquity: {
    description: 'Return on Equity - Net income divided by shareholders equity',
    unit: 'percentage',
    commonAliases: ['ROE', 'return on equity']
  },
  // ... 137 more entries
  // Written once, updated only when new metrics are added or aliases need refinement
}
```

**File 2:** `scripts/generate-metrics-catalog.ts`

This script **auto-generates** the catalog from the database + metadata:

```typescript
import { createClient } from '@supabase/supabase-js'
import { METRIC_METADATA } from '@/lib/metric-metadata'
import fs from 'fs'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function generateCatalog() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Query database for all unique metrics
  const { data, error } = await supabase
    .from('financial_metrics')
    .select('metric_name, metric_category')
    .eq('symbol', 'AAPL')
    .order('metric_category, metric_name')

  if (error) {
    console.error('Failed to fetch metrics:', error)
    process.exit(1)
  }

  // Get unique metrics (dedupe by metric_name)
  const uniqueMetrics = Array.from(
    new Map(data.map(m => [m.metric_name, m])).values()
  )

  // Get year range for data coverage
  const { data: yearData } = await supabase
    .from('financial_metrics')
    .select('year')
    .eq('symbol', 'AAPL')
    .order('year', { ascending: true })

  const minYear = yearData?.[0]?.year || 2006
  const maxYear = yearData?.[yearData.length - 1]?.year || 2025
  const dataCoverage = `${minYear}-${maxYear}`

  // Merge with metadata
  const catalog = uniqueMetrics.map(metric => {
    const metadata = METRIC_METADATA[metric.metric_name] || {
      description: metric.metric_name,
      unit: 'number',
      commonAliases: []
    }

    return {
      metric_name: metric.metric_name,
      category: metric.metric_category,
      description: metadata.description,
      unit: metadata.unit,
      data_coverage: dataCoverage,
      common_aliases: metadata.commonAliases
    }
  })

  // Write to JSON file
  fs.writeFileSync(
    'data/metrics-catalog.json',
    JSON.stringify(catalog, null, 2)
  )

  console.log(`✅ Generated catalog with ${catalog.length} metrics`)
  console.log(`📅 Data coverage: ${dataCoverage}`)
}

generateCatalog()
```

**File 3:** `data/metrics-catalog.json`

This file is **auto-generated** by the script above and should **not be manually edited**:

```json
[
  {
    "metric_name": "peRatio",
    "category": "Valuation",
    "description": "Price-to-Earnings Ratio - Market price per share divided by earnings per share",
    "unit": "ratio",
    "data_coverage": "2006-2025",
    "common_aliases": ["P/E", "PE", "price to earnings", "price-to-earnings", "earnings multiple"]
  },
  {
    "metric_name": "returnOnEquity",
    "category": "Profitability & Returns",
    "description": "Return on Equity - Net income divided by shareholders' equity",
    "unit": "percentage",
    "data_coverage": "2006-2025",
    "common_aliases": ["ROE", "return on equity"]
  }
  // ... 137 more entries (auto-generated)
]
```

**File 4:** `app/actions/list-metrics.ts`

This server action reads the **auto-generated** catalog file:

```typescript
'use server'

import catalogData from '@/data/metrics-catalog.json'

export interface MetricCatalogEntry {
  metric_name: string
  category: string
  description: string
  unit: string
  data_coverage: string
  common_aliases: string[]
}

export async function listMetrics(params?: {
  category?: string
}): Promise<{
  data: MetricCatalogEntry[] | null
  error: string | null
}> {
  try {
    let metrics = catalogData as MetricCatalogEntry[]

    // Filter by category if specified
    if (params?.category) {
      metrics = metrics.filter(m => m.category === params.category)
    }

    return { data: metrics, error: null }
  } catch (err) {
    return {
      data: null,
      error: 'Failed to load metrics catalog'
    }
  }
}
```

**Package.json script:**

```json
{
  "scripts": {
    "generate:catalog": "npx tsx scripts/generate-metrics-catalog.ts",
    "setup:metrics": "npm run fetch:metrics && npm run ingest:metrics && npm run generate:catalog"
  }
}
```

### Maintenance Workflow

**When metrics change (new API endpoint, new data source):**

1. Update `financial_metrics` table (via ingestion scripts)
2. Add metadata to `lib/metric-metadata.ts` (for new metrics only)
3. Run: `npm run generate:catalog`
4. Commit both `metric-metadata.ts` (if changed) and `metrics-catalog.json`

**Result:** The catalog stays in sync with the database automatically.

---

## Layer 2: Execution Layer

### Purpose
Execute metric queries with flexible input and smart alias resolution.

### Tool Definition

**Name:** `getFinancialMetric`

**Description:**
```
Get advanced financial metrics including valuation (P/E, Market Cap),
profitability (ROE, margins), leverage (debt ratios), and growth metrics.
Supports both exact metric names and common aliases.
```

**Arguments:**
```typescript
{
  metricName: string,        // Single metric: 'peRatio' or 'price to earnings'
  metricNames?: string[],    // OR multiple metrics: ['peRatio', 'roe', 'debtEquityRatio']
  limit?: number             // Number of years (1-20, default 5)
}
```

**Note:** Support both singular and plural for flexibility.

### Smart Alias Resolution

**Component:** Metric Resolver

**File:** `lib/metric-resolver.ts`

```typescript
// Canonical list of all valid metric names
const CANONICAL_METRICS = [
  'peRatio',
  'priceToBookRatio',
  'marketCap',
  'returnOnEquity',
  'returnOnAssets',
  // ... all 139
]

// Alias map: user input → canonical name
const METRIC_ALIASES: Record<string, string> = {
  // P/E variations
  'p/e': 'peRatio',
  'pe': 'peRatio',
  'price to earnings': 'peRatio',
  'price-to-earnings': 'peRatio',
  'price/earnings': 'peRatio',
  'earnings multiple': 'peRatio',

  // ROE variations
  'roe': 'returnOnEquity',
  'return on equity': 'returnOnEquity',

  // Debt-to-Equity variations
  'd/e': 'debtEquityRatio',
  'debt to equity': 'debtEquityRatio',
  'debt-to-equity': 'debtEquityRatio',
  'debt equity ratio': 'debtEquityRatio',
  'leverage ratio': 'debtEquityRatio',

  // ... 200+ aliases covering common phrases
}

/**
 * Resolve user input to canonical metric name
 * Logs all resolution attempts for telemetry and alias map improvement
 */
export async function resolveMetricName(
  input: string,
  context?: { question?: string }
): Promise<{
  canonical: string | null
  method: 'canonical' | 'alias' | 'fuzzy' | null
}> {
  // 1. Normalize input
  const normalized = input.toLowerCase().trim()

  // 2. Check if already canonical
  if (CANONICAL_METRICS.includes(input)) {
    await logMetricResolution({
      userPhrase: input,
      resolvedTo: input,
      method: 'canonical',
      fuzzyScore: null,
      userQuestion: context?.question
    })
    return { canonical: input, method: 'canonical' }
  }

  // 3. Check alias map
  if (METRIC_ALIASES[normalized]) {
    const resolved = METRIC_ALIASES[normalized]
    await logMetricResolution({
      userPhrase: input,
      resolvedTo: resolved,
      method: 'alias',
      fuzzyScore: null,
      userQuestion: context?.question
    })
    return { canonical: resolved, method: 'alias' }
  }

  // 4. Try case-insensitive canonical match
  const canonicalMatch = CANONICAL_METRICS.find(
    m => m.toLowerCase() === normalized
  )
  if (canonicalMatch) {
    await logMetricResolution({
      userPhrase: input,
      resolvedTo: canonicalMatch,
      method: 'canonical',
      fuzzyScore: null,
      userQuestion: context?.question
    })
    return { canonical: canonicalMatch, method: 'canonical' }
  }

  // 5. Fuzzy match (similarity fallback)
  const similar = findMostSimilar(normalized, CANONICAL_METRICS)
  if (similar.similarity > 0.8) {  // 80% similarity threshold
    await logMetricResolution({
      userPhrase: input,
      resolvedTo: similar.metric,
      method: 'fuzzy',
      fuzzyScore: similar.similarity,
      userQuestion: context?.question
    })
    return { canonical: similar.metric, method: 'fuzzy' }
  }

  // 6. Failed to resolve - LOG THIS!
  await logMetricResolution({
    userPhrase: input,
    resolvedTo: null,
    method: null,
    fuzzyScore: similar.similarity,  // Show how close we got
    fuzzyMatch: similar.metric,      // Show what we would have suggested
    userQuestion: context?.question
  })

  return { canonical: null, method: null }
}

/**
 * Log metric resolution attempt to Supabase for telemetry
 */
async function logMetricResolution(params: {
  userPhrase: string
  resolvedTo: string | null
  method: 'canonical' | 'alias' | 'fuzzy' | null
  fuzzyScore: number | null
  fuzzyMatch?: string
  userQuestion?: string
}) {
  const supabase = createClient()

  await supabase.from('metric_resolutions').insert({
    user_phrase: params.userPhrase,
    resolved_to: params.resolvedTo,
    resolution_method: params.method,
    fuzzy_match_score: params.fuzzyScore,
    fuzzy_match_suggestion: params.fuzzyMatch,
    user_question: params.userQuestion,
    timestamp: new Date().toISOString()
  })

  // Don't throw errors - telemetry should never break the app
}

/**
 * Resolve multiple metric names at once
 */
export function resolveMetricNames(inputs: string[]): {
  resolved: string[]
  unresolved: string[]
} {
  const resolved: string[] = []
  const unresolved: string[] = []

  for (const input of inputs) {
    const canonical = resolveMetricName(input)
    if (canonical) {
      // Dedupe
      if (!resolved.includes(canonical)) {
        resolved.push(canonical)
      }
    } else {
      unresolved.push(input)
    }
  }

  return { resolved, unresolved }
}

/**
 * Fuzzy string matching (Levenshtein or embeddings)
 */
function findMostSimilar(input: string, candidates: string[]): {
  metric: string
  similarity: number
} {
  // Simple approach: Levenshtein distance
  // Advanced approach: Embed input + candidates, find closest cosine similarity

  let bestMatch = candidates[0]
  let bestScore = 0

  for (const candidate of candidates) {
    const score = stringSimilarity(input, candidate.toLowerCase())
    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate
    }
  }

  return { metric: bestMatch, similarity: bestScore }
}

function stringSimilarity(a: string, b: string): number {
  // Levenshtein distance implementation
  // Returns 0-1 score (1 = perfect match)
}
```

### How It Works

**Example 1: Direct canonical name**
```
Input: 'peRatio'
Step 1: Is canonical? Yes
Output: 'peRatio'
```

**Example 2: Common alias**
```
Input: 'price to earnings'
Step 1: Is canonical? No
Step 2: In alias map? Yes → 'peRatio'
Output: 'peRatio'
```

**Example 3: Typo with fuzzy match**
```
Input: 'pRatio' (typo)
Step 1: Is canonical? No
Step 2: In alias map? No
Step 3: Fuzzy match → 'peRatio' (85% similar)
Output: 'peRatio'
```

**Example 4: Multiple metrics**
```
Input: ['P/E', 'return on equity', 'debt to equity']
Resolve: ['peRatio', 'returnOnEquity', 'debtEquityRatio']
Output: Single query fetching all 3 metrics
```

### Tool Handler

**File:** `app/actions/ask-question.ts`

```typescript
else if (toolSelection.tool === 'getFinancialMetric') {
  const { metricName, metricNames, limit = 5 } = toolSelection.args

  // Support both singular and plural
  const inputs = metricNames || [metricName]

  // Resolve all metric names
  const { resolved, unresolved } = resolveMetricNames(inputs)

  if (unresolved.length > 0) {
    return {
      error: `Could not resolve metrics: ${unresolved.join(', ')}.
              Use listMetrics to see available metrics.`
    }
  }

  // Query database with resolved canonical names
  const toolResult = await getFinancialMetrics({
    symbol: 'AAPL',
    metricNames: resolved,
    limit
  })

  if (toolResult.error || !toolResult.data) {
    toolError = toolResult.error || 'Failed to fetch metrics'
    return { error: toolError }
  }

  factsJson = JSON.stringify(toolResult.data, null, 2)
  dataUsed = { type: 'financial_metrics', data: toolResult.data }

  // Generate chart (if single metric)
  if (resolved.length === 1) {
    chartConfig = generateMetricChart(toolResult.data, resolved[0])
  }
}
```

---

## Complete Tool Flow Examples

### Example 1: Discovery → Execution

**User:** "What debt ratios do you have?"

**Step 1: Tool Selection (Discovery)**
```json
{
  "tool": "listMetrics",
  "args": {
    "category": "Leverage & Solvency"
  }
}
```

**Step 2: Tool Execution**
```
Returns:
- debtEquityRatio
- debtRatio
- currentRatio
- quickRatio
- interestCoverage
```

**Step 3: LLM Response**
```
"I have several debt-related metrics available:
- Debt-to-Equity Ratio
- Total Debt Ratio
- Current Ratio (liquidity)
- Quick Ratio (liquidity)
- Interest Coverage Ratio

Which would you like to see?"
```

**User:** "Show me debt-to-equity for the last 5 years"

**Step 4: Tool Selection (Execution)**
```json
{
  "tool": "getFinancialMetric",
  "args": {
    "metricName": "debtEquityRatio",
    "limit": 5
  }
}
```

**Step 5: Tool Execution**
- Resolve: 'debtEquityRatio' is canonical ✓
- Query database
- Return data

**Step 6: Answer Generation**
```
"Apple's Debt-to-Equity Ratio over the last 5 years:
- 2025: 0.11
- 2024: 1.97
- 2023: 1.76
..."
```

---

### Example 2: Direct Execution (No Discovery Needed)

**User:** "What's Apple's P/E ratio?"

**Step 1: Tool Selection**
```json
{
  "tool": "getFinancialMetric",
  "args": {
    "metricName": "price to earnings",
    "limit": 5
  }
}
```

**Step 2: Alias Resolution**
```
Input: 'price to earnings'
Alias map: 'price to earnings' → 'peRatio'
Output: 'peRatio'
```

**Step 3: Database Query**
```sql
SELECT year, metric_value
FROM financial_metrics
WHERE symbol = 'AAPL'
  AND metric_name = 'peRatio'
ORDER BY year DESC
LIMIT 5
```

**Step 4: Answer**
```
"Apple's P/E ratio is currently 34.09 (2025).
Over the past 5 years it ranged from 24.44 (2022) to 37.29 (2024)."
```

---

### Example 3: Multi-Metric Query

**User:** "Compare Apple's P/E ratio, ROE, and debt levels"

**Step 1: Tool Selection**
```json
{
  "tool": "getFinancialMetric",
  "args": {
    "metricNames": ["P/E", "ROE", "debt to equity"],
    "limit": 5
  }
}
```

**Step 2: Alias Resolution**
```
Inputs: ['P/E', 'ROE', 'debt to equity']
Resolved: ['peRatio', 'returnOnEquity', 'debtEquityRatio']
```

**Step 3: Database Query (Single)**
```sql
SELECT year, metric_name, metric_value
FROM financial_metrics
WHERE symbol = 'AAPL'
  AND metric_name IN ('peRatio', 'returnOnEquity', 'debtEquityRatio')
ORDER BY year DESC, metric_name
LIMIT 15  -- 5 years × 3 metrics
```

**Step 4: Answer**
```
"Here's a comparison of Apple's valuation, profitability, and leverage:

P/E Ratio (2025): 34.09
ROE (2025): 160.58%
Debt-to-Equity (2025): 0.11

The low debt-to-equity shows Apple uses minimal leverage, while the high ROE
indicates strong profitability relative to equity."
```

---

## Implementation Checklist

### Phase 1: Discovery Layer

**1.1 Create Metric Metadata (Manual, One-Time)**
- [ ] File: `lib/metric-metadata.ts`
- [ ] Create `MetricMetadata` interface
- [ ] Create `METRIC_METADATA` constant with 139 entries
- [ ] For each metric: description, unit, commonAliases
- [ ] **Note:** This is the ONLY manual step. Written once, updated only when new metrics are added.

**1.2 Create Catalog Generation Script (Auto-Generation)**
- [ ] File: `scripts/generate-metrics-catalog.ts`
- [ ] Query database for all unique metric_name + metric_category
- [ ] Merge with METRIC_METADATA
- [ ] Calculate data_coverage from min/max years in database
- [ ] Write to `data/metrics-catalog.json`
- [ ] Add `generate:catalog` script to package.json
- [ ] Update `setup:metrics` script to include catalog generation

**1.3 Generate Initial Catalog**
- [ ] Run: `npm run generate:catalog`
- [ ] Verify `data/metrics-catalog.json` contains all 139 metrics
- [ ] Verify each entry has: metric_name, category, description, unit, data_coverage, common_aliases

**1.4 Create listMetrics Server Action**
- [ ] File: `app/actions/list-metrics.ts`
- [ ] Import catalog from `data/metrics-catalog.json`
- [ ] Function: `listMetrics(params?: { category?: string })`
- [ ] Returns: Array of MetricCatalogEntry
- [ ] Support category filtering

**1.5 Add listMetrics Tool to Menu**
- [ ] File: `lib/tools.ts`
- [ ] Add tool definition with description
- [ ] Add to TOOL_MENU array
- [ ] Update ToolName type

**1.6 Add Tool Handler**
- [ ] File: `app/actions/ask-question.ts`
- [ ] Add `else if (toolSelection.tool === 'listMetrics')` branch
- [ ] Call listMetrics action
- [ ] Format response for LLM

---

### Phase 2: Execution Layer

**2.1 Create Metric Resolver**
- [ ] File: `lib/metric-resolver.ts`
- [ ] Constant: CANONICAL_METRICS (all 139 metric names)
- [ ] Constant: METRIC_ALIASES (start with 50+ common phrases, expand via telemetry)
- [ ] Function: resolveMetricName(input: string)
- [ ] Function: resolveMetricNames(inputs: string[])
- [ ] Function: findMostSimilar (fuzzy matching)
- [ ] Function: logUnresolvedMetric(input: string, context: object) - Log failed resolutions

**2.2 Update Server Action for Multi-Metric**
- [ ] File: `app/actions/get-financial-metric.ts`
- [ ] Rename: getFinancialMetrics (plural) as primary function
- [ ] Support: metricNames: string[] parameter
- [ ] Query: Use `IN` clause for multiple metrics
- [ ] Return: Group by year with all metrics

**2.3 Add getFinancialMetric Tool to Menu**
- [ ] File: `lib/tools.ts`
- [ ] Add tool definition
- [ ] Include note about alias support
- [ ] Add metric mapping hints in prompt
- [ ] Update ToolName type

**2.4 Add Tool Handler**
- [ ] File: `app/actions/ask-question.ts`
- [ ] Add `else if (toolSelection.tool === 'getFinancialMetric')` branch
- [ ] Call resolveMetricNames
- [ ] Handle unresolved metrics (suggest listMetrics)
- [ ] Call getFinancialMetrics with resolved names
- [ ] Format response for LLM

**2.5 Create Chart Helper**
- [ ] File: `lib/chart-helpers.ts`
- [ ] Function: generateMetricChart(data, metricName)
- [ ] Detect unit type (ratio, percentage, dollars)
- [ ] Format Y-axis appropriately
- [ ] Support multi-metric charts (comparison)

**2.6 Add Telemetry for Unresolved Metrics**
- [ ] Create migration: `metric_resolutions` table
  ```sql
  CREATE TABLE metric_resolutions (
    id BIGSERIAL PRIMARY KEY,
    user_phrase TEXT NOT NULL,
    resolved_to TEXT,  -- NULL if failed to resolve
    resolution_method TEXT,  -- 'canonical' | 'alias' | 'fuzzy' | NULL
    fuzzy_match_score NUMERIC,
    fuzzy_match_suggestion TEXT,  -- Best fuzzy match even if below threshold
    user_question TEXT,  -- Full user question for context
    timestamp TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX idx_metric_resolutions_phrase ON metric_resolutions(user_phrase);
  CREATE INDEX idx_metric_resolutions_method ON metric_resolutions(resolution_method);
  CREATE INDEX idx_metric_resolutions_timestamp ON metric_resolutions(timestamp);
  ```
- [ ] Enable RLS with public insert (anonymous users can log)
- [ ] Update `lib/metric-resolver.ts` to log every resolution attempt
- [ ] Log successful resolutions with method used (for analysis)
- [ ] Log failed resolutions with fuzzy match suggestion
- [ ] Create admin dashboard: `app/admin/metrics-telemetry/page.tsx`
  - [ ] Show top unresolved phrases (grouped, with counts)
  - [ ] Show successful resolutions breakdown (alias vs fuzzy vs canonical)
  - [ ] Show resolution success rate over time (chart)
  - [ ] Add "Add to Aliases" button for quick alias map expansion
  - [ ] Filter by date range (last 7 days, 30 days, all time)

---

### Phase 3: Testing

**3.1 Unit Tests**
- [ ] Test resolveMetricName with canonical names
- [ ] Test resolveMetricName with aliases
- [ ] Test resolveMetricName with typos
- [ ] Test resolveMetricNames with multiple inputs
- [ ] Test resolveMetricNames deduplication

**3.2 Integration Tests**
- [ ] Test listMetrics (all categories)
- [ ] Test listMetrics (filtered by category)
- [ ] Test getFinancialMetric (single metric, canonical)
- [ ] Test getFinancialMetric (single metric, alias)
- [ ] Test getFinancialMetric (multiple metrics)
- [ ] Test getFinancialMetric (unresolved metric)

**3.3 End-to-End Tests**
- [ ] "What metrics are available?" → listMetrics
- [ ] "What's Apple's P/E ratio?" → getFinancialMetric
- [ ] "Show me price to earnings" → alias resolution works
- [ ] "Compare P/E, ROE, and debt" → multi-metric works
- [ ] "What's the pRato?" → fuzzy match or error

---

## Tool Menu After Implementation

**Total: 6 tools**

1. ✅ `getAaplFinancialsByMetric` - Core financials (revenue, assets, etc.)
2. ✅ `getPrices` - Stock prices
3. ✅ `getRecentFilings` - SEC filing metadata
4. ✅ `searchFilings` - Search filing content
5. 🆕 `listMetrics` - Browse metric catalog
6. 🆕 `getFinancialMetric` - Fetch advanced metrics with alias support

---

## Benefits of This Approach

### 1. Discoverability
- LLM can explore metrics without guessing names
- Users can ask "What metrics do you have?" and get a real answer
- Clear organization by category

### 2. Reliability
- Alias map handles common phrases ("P/E" → peRatio)
- Fuzzy matching handles typos
- Clear error messages when metric not found

### 3. Efficiency
- Multi-metric support reduces round-trips
- Single database query for multiple metrics
- Lower token costs (one tool call vs many)

### 4. Maintainability
- Adding metrics = update catalog + aliases (no prompt changes)
- Centralized resolver logic
- Easy to test

### 5. Future-Proof
- Scales to 200, 300+ metrics without changing architecture
- Can add semantic search over metric descriptions later
- Can add AI-powered alias suggestions

### 6. Continuous Improvement via Telemetry
- Every metric resolution attempt is logged (successful and failed)
- Admin dashboard shows unresolved phrases in real-time
- Alias map expands systematically based on actual user behavior
- Track resolution method breakdown (canonical vs alias vs fuzzy)
- Identify edge cases and improve fuzzy matching threshold

**Example telemetry insights:**
```
Top Unresolved Phrases (Last 7 Days):
1. "earnings multiple" - 12 occurrences (fuzzy matched to: peRatio @ 0.65)
2. "leverage" - 8 occurrences (fuzzy matched to: debtEquityRatio @ 0.42)
3. "cash ratio" - 5 occurrences (fuzzy matched to: currentRatio @ 0.71)

Resolution Method Breakdown:
- Alias map: 78%
- Canonical match: 15%
- Fuzzy match: 5%
- Failed: 2%
```

**Action:** Add these 3 phrases to `METRIC_ALIASES` → failure rate drops from 2% to 0.5%

---

## Potential Issues & Solutions

### Issue 1: LLM Calls listMetrics Too Often

**Problem:** Every query starts with listMetrics (wasteful)

**Solution:**
- Add note in prompt: "Only use listMetrics when uncertain about available metrics"
- Cache catalog in system prompt (for models that support long contexts)
- Monitor usage and adjust prompt if needed

### Issue 2: Alias Map Incomplete

**Problem:** User phrase not in alias map ("earnings multiple")

**Solution:**
- Start with 200+ common aliases
- Monitor unresolved metrics in logs
- Iteratively add missing aliases
- Fuzzy matching catches most edge cases

### Issue 3: Multi-Metric Queries Too Complex

**Problem:** "Compare all profitability metrics" = 20 metrics = huge response

**Solution:**
- Add limit to multi-metric queries (max 5 metrics at once)
- Suggest using category filter + listMetrics for browsing
- LLM can pick top 3-5 most relevant metrics

### Issue 4: Fuzzy Matching False Positives

**Problem:** "pRato" matches "peRatio" but "profit" shouldn't match anything

**Solution:**
- Set similarity threshold (80% minimum)
- Prefer exact matches and aliases over fuzzy
- Log fuzzy matches for manual review

---

## Timeline Estimate

**Phase 1 (Discovery):** 2-3 hours
- Create catalog: 30 min
- Build listMetrics: 1 hour
- Integrate into router: 1 hour

**Phase 2 (Execution):** 3-4 hours
- Build resolver: 1.5 hours
- Update server action: 1 hour
- Integrate into router: 1 hour
- Chart helper: 30 min

**Phase 3 (Testing):** 2-3 hours
- Unit tests: 1 hour
- Integration tests: 1 hour
- E2E testing: 1 hour

**Total: 7-10 hours**

---

## Open Questions

1. **Alias map generation:** Should we generate aliases programmatically or manually curate?
   - **Recommendation:** Manual curation in `METRIC_METADATA`. More accurate, easier to maintain than auto-generation.

2. ~~**Catalog storage:** Static JSON file or query database on every listMetrics call?~~
   - **RESOLVED:** Auto-generate static JSON from database using `scripts/generate-metrics-catalog.ts`. Best of both worlds: stays in sync with DB, fast to read.

3. **Fuzzy matching library:** Use existing library (fuzzyset.js) or build custom?
   - **Recommendation:** Start with simple Levenshtein distance (fast-levenshtein npm package). Only add embeddings-based matching if needed.

4. **Multi-metric limit:** Max 5 metrics per query? Max 10?
   - **Recommendation:** Max 10 metrics. Covers most comparison questions without overwhelming response.

5. **Category standardization:** Use exact category names from database or normalize them?
   - **Recommendation:** Use exact category names from database. Already well-structured.

---

## Next Steps

1. **Review this plan** - Confirm approach and architecture
2. **Answer open questions** - Make decisions on implementation details
3. **Start Phase 1** - Build discovery layer (listMetrics)
4. **Test discovery** - Verify catalog and tool work correctly
5. **Build Phase 2** - Build execution layer with alias resolver
6. **Test execution** - Verify alias resolution and multi-metric support
7. **Integration testing** - End-to-end tests with real queries
8. **Deploy** - Commit and push to branch

---

**Status:** Ready for review and approval
**Estimated time:** 7-10 hours total implementation
**Risk level:** Low (well-defined scope, clear testing criteria)
