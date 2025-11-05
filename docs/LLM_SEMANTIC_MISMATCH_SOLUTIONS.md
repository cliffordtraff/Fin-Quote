# Solving Semantic Impedance Mismatch in LLM Applications

## Table of Contents
1. [Introduction](#introduction)
2. [The Problem: Semantic Impedance Mismatch](#the-problem-semantic-impedance-mismatch)
3. [Why This Happens](#why-this-happens)
4. [Solution 1: Normalization Layer](#solution-1-normalization-layer-correction-mapping)
5. [Solution 2: Schema Evolution](#solution-2-schema-evolution-support-calculated-metrics-natively)
6. [Solution 3: Structured Function Calling](#solution-3-structured-function-calling-brief)
7. [General Principles for LLM Integration](#general-principles-for-llm-integration)
8. [Decision Framework](#decision-framework)
9. [Lessons Learned](#lessons-learned)

---

## Introduction

This document explores a fundamental challenge when building LLM-powered applications: **the semantic impedance mismatch between user language, LLM outputs, and database schemas**.

### Our Specific Case

In our financial Q&A system, users ask questions like:
- "What's Apple's debt to equity ratio?"
- "Show me the gross margin trend"
- "How's their ROE over time?"

These are perfectly natural business questions. However, our database doesn't store "debt to equity ratio" or "gross margin" - it stores raw primitives like `total_liabilities`, `shareholders_equity`, `gross_profit`, and `revenue`.

**The issue:** When we ask an LLM to select which database metric to query, it naturally wants to output `debt_to_equity` (matching the user's language), but our validation layer rejects it because that's not a valid database column.

This is not a bug - **it's a fundamental architectural challenge in LLM system design**.

---

## The Problem: Semantic Impedance Mismatch

### The Three "Languages" That Must Align

#### 1. User Language (Natural, Domain-Specific)
Users think in terms of **business concepts and derived metrics**:

```
"What's the debt to equity ratio?"
"Show me gross margin"
"How's ROE trending?"
"What's the current ratio?"
```

These terms are:
- **Domain-specific** - they mean something specific in finance
- **Calculated** - they're formulas combining multiple raw values
- **Natural** - this is how analysts actually talk

#### 2. Database Schema (Raw, Normalized)
Databases store **atomic facts**, not calculations:

```sql
-- What we STORE:
total_liabilities: 285508000000
shareholders_equity: 73733000000
gross_profit: 180685000000
revenue: 391035000000

-- What we DON'T store:
debt_to_equity_ratio  ❌ (calculated on demand)
gross_margin          ❌ (calculated on demand)
```

This is good database design because:
- **Single source of truth** - each fact stored once
- **Normalization** - no redundant calculated values
- **Flexibility** - can calculate any ratio from raw data
- **Accuracy** - calculations always use latest formulas

#### 3. LLM Output (Semantic Alignment)
When users ask "What's the debt to equity ratio?", the LLM sees this pattern:

```
Input:  "What's Apple's DEBT TO EQUITY RATIO?"
        ↓
        (LLM's internal reasoning)
        ↓
        "User wants: debt_to_equity_ratio"
        "Tool parameter is called: metric"
        "Therefore output: {"metric": "debt_to_equity_ratio"}"
        ↓
Output: {"metric": "debt_to_equity_ratio"}
```

**This is actually intelligent behavior!** The LLM is:
- Preserving semantic meaning
- Using consistent naming (snake_case)
- Matching the domain terminology
- Doing what seems most helpful

### The Conflict Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  USER                                                       │
│  "What's Apple's debt to equity ratio?"                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  LLM (Tool Selection)                                       │
│  Thinks: "User wants debt_to_equity_ratio"                 │
│  Outputs: {"metric": "debt_to_equity_ratio"}               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  VALIDATION LAYER                                           │
│  Valid metrics: [revenue, gross_profit, net_income,        │
│                  total_liabilities, shareholders_equity]   │
│  Check: Is "debt_to_equity_ratio" in list?                 │
│  Result: ❌ NO!                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  ERROR                                                      │
│  "Invalid metric: debt_to_equity_ratio"                    │
└─────────────────────────────────────────────────────────────┘
```

### Why Prompt Engineering Alone Doesn't Scale

Our first instinct was to fix this with prompts:

```typescript
// Add to prompt:
"When user asks for debt-to-equity, use metric: total_liabilities"
```

This works... until users ask for:
- "D/E ratio"
- "debt/equity"
- "leverage ratio"
- "debt-equity"
- "DE ratio"
- etc.

Then we add more examples:

```typescript
// Add more examples:
Q: "What is debt to equity?"
A: {"metric": "total_liabilities"}

Q: "Show me D/E ratio"
A: {"metric": "total_liabilities"}

Q: "What's the leverage?"
A: {"metric": "total_liabilities"}
```

**The problem:** This doesn't scale. We'd need:
- Hundreds of examples for all ratio variations
- Examples for every possible phrasing
- Constant updates as users discover new ways to ask
- Massive prompt bloat (slower, more expensive)

This is a signal that **we're solving an architectural problem with prompt engineering**, which is the wrong layer.

---

## Why This Happens

### LLMs Are Semantic Machines

LLMs are trained on vast amounts of text where:
- "debt to equity ratio" means the same as "debt_to_equity_ratio"
- Preserving semantic meaning is rewarded
- Matching domain terminology is correct behavior

When we ask the LLM to "pick a metric," it's trying to be helpful by outputting the most semantically accurate term.

### The Fundamental Tension

There's an inherent conflict between:

1. **Semantic Correctness** (what the LLM wants)
   - Output should match user's meaning
   - "debt_to_equity_ratio" is semantically correct

2. **Schema Correctness** (what our code requires)
   - Output must match database schema
   - Only "total_liabilities" is valid

**You can't solve this with prompts alone** because you're asking the LLM to fight its training. It's like asking someone to translate "car" into French but requiring they output "vehicle with four wheels powered by an engine" instead of "voiture."

### The Lesson

When you find yourself adding dozens of examples to make an LLM output unnatural strings, that's a code smell. You're working against the LLM's nature instead of with it.

---

## Solution 1: Normalization Layer (Correction/Mapping)

### Core Idea

**Accept what the LLM naturally outputs, then translate it to what your system needs.**

Instead of fighting the LLM, add a translation layer:

```
LLM outputs natural language
         ↓
Normalization layer translates
         ↓
System validates and executes
```

### Implementation

#### Step 1: Create the Normalization Function

```typescript
// /lib/metric-normalizer.ts

import { FinancialMetric } from '@/app/actions/financials'

/**
 * Normalizes user-friendly metric names to database primitives.
 *
 * Why this exists:
 * - Users ask for "debt to equity ratio" (calculated metric)
 * - LLMs output "debt_to_equity_ratio" (semantic match)
 * - Database only has "total_liabilities" (raw data)
 *
 * This function bridges the gap by mapping calculated metrics
 * back to the raw data needed to compute them.
 */
export function normalizeMetric(metric: string): FinancialMetric {
  // Convert to lowercase for case-insensitive matching
  const normalized = metric.toLowerCase().replace(/[^a-z0-9_]/g, '_')

  // Mapping of calculated metrics to their underlying raw data
  const ratioMappings: Record<string, FinancialMetric> = {
    // Leverage Ratios
    'debt_to_equity': 'total_liabilities',
    'debt_to_equity_ratio': 'total_liabilities',
    'de_ratio': 'total_liabilities',
    'd_e': 'total_liabilities',
    'debt_equity': 'total_liabilities',
    'leverage_ratio': 'total_liabilities',
    'debt_to_assets': 'total_liabilities',
    'debt_to_assets_ratio': 'total_liabilities',

    // Profitability Ratios
    'roe': 'net_income',
    'return_on_equity': 'net_income',
    'roa': 'net_income',
    'return_on_assets': 'net_income',
    'return_on_investment': 'net_income',
    'roi': 'net_income',

    // Margin Calculations
    'gross_margin': 'gross_profit',
    'gross_profit_margin': 'gross_profit',
    'net_margin': 'net_income',
    'net_profit_margin': 'net_income',
    'profit_margin': 'net_income',
    'operating_margin': 'operating_income',
    'operating_profit_margin': 'operating_income',

    // Efficiency Ratios
    'asset_turnover': 'total_assets',
    'asset_turnover_ratio': 'total_assets',
  }

  // Check if this is a ratio that needs normalization
  const mappedMetric = ratioMappings[normalized]

  if (mappedMetric) {
    console.log(`📊 Normalized "${metric}" → "${mappedMetric}"`)
    return mappedMetric
  }

  // If not in mapping, assume it's already a valid raw metric
  // (e.g., "revenue", "net_income", etc.)
  return metric as FinancialMetric
}
```

#### Step 2: Use It in Your Route Handler

```typescript
// /app/api/ask/route.ts

import { normalizeMetric } from '@/lib/metric-normalizer'

// ... inside your request handler ...

// After parsing tool selection
let toolSelection: { tool: string; args: any }
try {
  toolSelection = JSON.parse(selectionContent.trim())
} catch (parseError) {
  sendEvent('error', { message: 'Failed to parse tool selection' })
  controller.close()
  return
}

// Execute the selected tool
if (toolSelection.tool === 'getAaplFinancialsByMetric') {
  // ✨ NORMALIZE THE METRIC HERE
  const rawMetric = toolSelection.args.metric
  const metric = normalizeMetric(rawMetric) as FinancialMetric

  // Log the translation for debugging
  if (rawMetric !== metric) {
    console.log(`🔄 Metric translation: ${rawMetric} → ${metric}`)
  }

  const validMetrics: FinancialMetric[] = [
    'revenue', 'gross_profit', 'net_income', 'operating_income',
    'total_assets', 'total_liabilities', 'shareholders_equity',
    'operating_cash_flow', 'eps',
  ]

  if (!validMetrics.includes(metric)) {
    console.error('❌ Invalid metric:', metric)
    sendEvent('error', { message: `Invalid metric: ${metric}` })
    controller.close()
    return
  }

  // Continue with normalized metric...
  const toolResult = await getAaplFinancialsByMetric({
    metric,
    limit: toolSelection.args.limit || 4,
  })

  // ... rest of handler ...
}
```

### How It Works in Practice

#### Example 1: Debt to Equity
```
User asks: "What's Apple's debt to equity ratio?"
         ↓
LLM outputs: {"metric": "debt_to_equity_ratio"}
         ↓
Normalization: normalizeMetric("debt_to_equity_ratio") → "total_liabilities"
         ↓
Validation: ✅ "total_liabilities" is valid
         ↓
Fetch: Get total_liabilities + shareholders_equity
         ↓
LLM calculates: total_liabilities / shareholders_equity
         ↓
Answer: "The debt-to-equity ratio is 3.87"
```

#### Example 2: Gross Margin
```
User asks: "Show me gross margin trend"
         ↓
LLM outputs: {"metric": "gross_margin"}
         ↓
Normalization: normalizeMetric("gross_margin") → "gross_profit"
         ↓
Validation: ✅ "gross_profit" is valid
         ↓
Fetch: Get gross_profit + revenue
         ↓
LLM calculates: (gross_profit / revenue) × 100
         ↓
Answer: "Gross margin is 46.2%"
```

### Advantages

#### 1. Works With LLM Nature
```typescript
// Instead of fighting the LLM:
// ❌ "Don't output debt_to_equity, output total_liabilities!"

// Work with it:
// ✅ "Output whatever makes semantic sense, we'll translate"
```

The LLM can focus on understanding user intent, not memorizing arbitrary mappings.

#### 2. Minimal Code Changes
You only need to:
- Add one normalization function
- Call it in one place (before validation)
- No changes to database, types, or prompts

#### 3. Explicit and Debuggable
```typescript
// You can see exactly what's happening:
console.log(`🔄 Metric translation: ${rawMetric} → ${metric}`)

// Logs:
// 🔄 Metric translation: debt_to_equity_ratio → total_liabilities
// 🔄 Metric translation: gross_margin → gross_profit
// 🔄 Metric translation: roe → net_income
```

This makes debugging easy and builds institutional knowledge about what users actually ask for.

#### 4. Gradual Migration Path
You can keep adding mappings as you discover new user patterns:

```typescript
// Week 1: Discover users ask for "leverage"
'leverage': 'total_liabilities',

// Week 2: Discover "debt ratio"
'debt_ratio': 'total_liabilities',

// Week 3: Discover "D/E"
'd_e': 'total_liabilities',
```

Each mapping is a decision you made based on real user data.

### Disadvantages

#### 1. Band-Aid Solution
This doesn't fix the root architectural issue - it just patches over it. You still have:
- A semantic gap between user language and schema
- Calculations happening in two places (LLM prompts + this mapping)
- Knowledge duplicated across prompt and code

#### 2. Maintenance Burden
As you add more metrics, the mapping grows:

```typescript
const ratioMappings: Record<string, FinancialMetric> = {
  // 5 mappings
  // ... then 10 ...
  // ... then 20 ...
  // ... then 50 ...
  // When does it stop?
}
```

#### 3. Doesn't Scale to Complex Cases
What if a user asks for a metric that needs THREE inputs?

```typescript
// "Free Cash Flow" = Operating Cash Flow - Capital Expenditures
// But we don't have capex in our schema!
// Can't map to a single raw metric
'free_cash_flow': '???',  // ❌ No single mapping works
```

#### 4. Loses Type Safety
TypeScript can't help you here:

```typescript
// These are all strings at runtime
const mapping: Record<string, FinancialMetric> = {
  'debt_to_equity': 'total_liabilities',  // Could have typo
  'roe': 'net_incom',  // ❌ Typo! Won't catch until runtime
}
```

### When to Use This Solution

✅ **Good for:**
- **Quick fixes** - need to ship today
- **Validation** - proving the concept before bigger refactor
- **Learning** - discovering what users actually ask for
- **Transition** - buying time to plan proper solution

❌ **Bad for:**
- **Long-term architecture** - doesn't address root cause
- **Complex calculations** - only works for 1-to-1 mappings
- **Type-safe systems** - loses compile-time checking

### Real-World Example

Our actual implementation:

```typescript
// Before normalization:
User: "debt to equity ratio"
LLM: {"metric": "debt_to_equity_ratio"}
System: ❌ Error: Invalid metric

// After normalization:
User: "debt to equity ratio"
LLM: {"metric": "debt_to_equity_ratio"}
Normalizer: debt_to_equity_ratio → total_liabilities
System: ✅ Fetches total_liabilities + shareholders_equity
```

**The result:** Users can ask naturally, system works reliably, and we learned that users ask for D/E ratio in 7 different ways we never anticipated.

---

## Solution 2: Schema Evolution (Support Calculated Metrics Natively)

### Core Idea

**Make your API speak the same language as your users.**

Instead of forcing translation, expand your schema to support calculated metrics as first-class citizens:

```typescript
// BEFORE: Schema only has raw data
type FinancialMetric = 'revenue' | 'total_liabilities' | ...

// AFTER: Schema includes calculated metrics
type FinancialMetric =
  | 'revenue'              // Raw
  | 'total_liabilities'    // Raw
  | 'debt_to_equity_ratio' // Calculated ✨
  | 'gross_margin'         // Calculated ✨
  | 'roe'                  // Calculated ✨
```

### Implementation

#### Step 1: Expand the Type System

```typescript
// /app/actions/financials.ts

// Separate raw metrics from calculated metrics for clarity
export type RawFinancialMetric =
  | 'revenue'
  | 'gross_profit'
  | 'net_income'
  | 'operating_income'
  | 'total_assets'
  | 'total_liabilities'
  | 'shareholders_equity'
  | 'operating_cash_flow'
  | 'eps'

export type CalculatedFinancialMetric =
  // Leverage Ratios
  | 'debt_to_equity_ratio'
  | 'debt_to_assets_ratio'

  // Profitability Ratios
  | 'roe'  // Return on Equity
  | 'roa'  // Return on Assets

  // Margin Metrics
  | 'gross_margin'
  | 'operating_margin'
  | 'net_margin'

  // Efficiency Ratios
  | 'asset_turnover'

// Combined type for all supported metrics
export type FinancialMetric = RawFinancialMetric | CalculatedFinancialMetric

// Helper to check if a metric is calculated
export function isCalculatedMetric(metric: FinancialMetric): metric is CalculatedFinancialMetric {
  const calculatedMetrics: CalculatedFinancialMetric[] = [
    'debt_to_equity_ratio', 'debt_to_assets_ratio',
    'roe', 'roa',
    'gross_margin', 'operating_margin', 'net_margin',
    'asset_turnover',
  ]
  return calculatedMetrics.includes(metric as CalculatedFinancialMetric)
}
```

#### Step 2: Implement Calculation Logic

```typescript
// /app/actions/financials.ts

export async function getAaplFinancialsByMetric(params: {
  metric: FinancialMetric
  limit?: number
}): Promise<{
  data: Array<{ year: number; value: number; metric: FinancialMetric }> | null
  error: string | null
}> {
  const { metric } = params
  const requestedLimit = params.limit ?? 4
  const safeLimit = Math.min(Math.max(requestedLimit, 1), 20)

  try {
    const supabase = createServerClient()

    // ===============================================
    // HANDLE CALCULATED METRICS
    // ===============================================

    if (metric === 'debt_to_equity_ratio') {
      // Fetch the raw data needed for calculation
      const { data, error } = await supabase
        .from('financials_std')
        .select('year, total_liabilities, shareholders_equity')
        .eq('symbol', 'AAPL')
        .order('year', { ascending: false })
        .limit(safeLimit)

      if (error) {
        console.error('Error fetching data for debt_to_equity_ratio:', error)
        return { data: null, error: error.message }
      }

      // Calculate the ratio server-side
      const calculated = (data ?? []).map((row) => ({
        year: row.year,
        value: row.total_liabilities / row.shareholders_equity,
        metric: 'debt_to_equity_ratio' as const,
        // Include source data for transparency/debugging
        source: {
          total_liabilities: row.total_liabilities,
          shareholders_equity: row.shareholders_equity,
        },
      }))

      return { data: calculated, error: null }
    }

    if (metric === 'gross_margin') {
      const { data, error } = await supabase
        .from('financials_std')
        .select('year, gross_profit, revenue')
        .eq('symbol', 'AAPL')
        .order('year', { ascending: false })
        .limit(safeLimit)

      if (error) {
        console.error('Error fetching data for gross_margin:', error)
        return { data: null, error: error.message }
      }

      // Calculate margin as percentage
      const calculated = (data ?? []).map((row) => ({
        year: row.year,
        value: (row.gross_profit / row.revenue) * 100,
        metric: 'gross_margin' as const,
        source: {
          gross_profit: row.gross_profit,
          revenue: row.revenue,
        },
      }))

      return { data: calculated, error: null }
    }

    if (metric === 'roe') {
      const { data, error } = await supabase
        .from('financials_std')
        .select('year, net_income, shareholders_equity')
        .eq('symbol', 'AAPL')
        .order('year', { ascending: false })
        .limit(safeLimit)

      if (error) {
        console.error('Error fetching data for ROE:', error)
        return { data: null, error: error.message }
      }

      // ROE = (Net Income / Shareholders' Equity) × 100
      const calculated = (data ?? []).map((row) => ({
        year: row.year,
        value: (row.net_income / row.shareholders_equity) * 100,
        metric: 'roe' as const,
        source: {
          net_income: row.net_income,
          shareholders_equity: row.shareholders_equity,
        },
      }))

      return { data: calculated, error: null }
    }

    // Add more calculated metrics here...

    // ===============================================
    // HANDLE RAW METRICS (existing code)
    // ===============================================

    const allowedMetrics: RawFinancialMetric[] = [
      'revenue', 'gross_profit', 'net_income', 'operating_income',
      'total_assets', 'total_liabilities', 'shareholders_equity',
      'operating_cash_flow', 'eps',
    ]

    if (!allowedMetrics.includes(metric as RawFinancialMetric)) {
      return { data: null, error: 'Unsupported metric' }
    }

    const { data, error } = await supabase
      .from('financials_std')
      .select('year, revenue, gross_profit, net_income, operating_income, total_assets, total_liabilities, shareholders_equity, operating_cash_flow, eps')
      .eq('symbol', 'AAPL')
      .order('year', { ascending: false })
      .limit(safeLimit)

    if (error) {
      console.error('Error fetching AAPL financials by metric:', error)
      return { data: null, error: error.message }
    }

    // Map to requested metric
    const mapped = (data ?? []).map((row) => {
      const result: any = {
        year: row.year,
        value: row[metric as RawFinancialMetric] as number,
        metric,
      }

      // Include related metrics for ratio calculations in prompts
      // (This is for backward compatibility with prompt-based calculations)
      if (['gross_profit', 'operating_income', 'net_income', 'operating_cash_flow'].includes(metric)) {
        result.revenue = row.revenue
      }

      if (metric === 'net_income') {
        result.shareholders_equity = row.shareholders_equity
        result.total_assets = row.total_assets
      }

      if (metric === 'total_liabilities') {
        result.shareholders_equity = row.shareholders_equity
        result.total_assets = row.total_assets
      }

      return result
    })

    return { data: mapped, error: null }
  } catch (err) {
    console.error('Unexpected error (getAaplFinancialsByMetric):', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
```

#### Step 3: Update Prompts to Be Simpler

```typescript
// /lib/tools.ts

export const buildToolSelectionPrompt = (userQuestion: string) => `
You are a router. Choose exactly one tool and return ONLY valid JSON: {"tool": string, "args": object}.

Available Tools:

1. getAaplFinancialsByMetric - Financial metrics and ratios

   SUPPORTED METRICS:

   Raw Metrics:
   - revenue, gross_profit, net_income, operating_income
   - total_assets, total_liabilities, shareholders_equity
   - operating_cash_flow, eps

   Calculated Ratios (now supported directly!):
   - debt_to_equity_ratio - Leverage ratio
   - gross_margin - Profitability as percentage
   - roe - Return on equity as percentage
   - roa - Return on assets as percentage

   METRIC MAPPING:
   - "debt to equity" → debt_to_equity_ratio (✨ now native!)
   - "gross margin" → gross_margin (✨ now native!)
   - "ROE" → roe (✨ now native!)
   - "sales", "revenue" → revenue
   - "profit" → net_income

   args: {"metric": string, "limit": number}

[... rest of prompt ...]

Examples:
{"tool":"getAaplFinancialsByMetric","args":{"metric":"debt_to_equity_ratio","limit":4}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"gross_margin","limit":5}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"roe","limit":10}}
`
```

#### Step 4: Update Chart Generation

```typescript
// /lib/chart-helpers.ts

export function generateFinancialChart(
  data: Array<{ year: number; value: number; metric: FinancialMetric }>,
  metric: FinancialMetric,
  userQuestion: string
): ChartConfig {
  // ... existing code ...

  // Handle calculated metrics
  if (metric === 'debt_to_equity_ratio') {
    return {
      type: 'line',
      title: 'AAPL Debt-to-Equity Ratio',
      yAxisLabel: 'Ratio',
      categories: data.map(d => String(d.year)),
      data: data.map(d => Number(d.value.toFixed(2))),
      color: '#EF4444', // Red for leverage
    }
  }

  if (metric === 'gross_margin') {
    return {
      type: 'line',
      title: 'AAPL Gross Margin',
      yAxisLabel: 'Margin (%)',
      categories: data.map(d => String(d.year)),
      data: data.map(d => Number(d.value.toFixed(1))),
      color: '#10B981', // Green for profitability
    }
  }

  // ... existing raw metric handling ...
}
```

### How It Works in Practice

#### Example: Debt to Equity Ratio

**Before (with normalization):**
```
User: "debt to equity ratio"
  ↓
LLM: {"metric": "debt_to_equity_ratio"}
  ↓
Normalizer: debt_to_equity_ratio → total_liabilities
  ↓
Fetch: total_liabilities + shareholders_equity (raw data)
  ↓
LLM prompt: Calculate ratio from these two fields
  ↓
Answer: "3.87"
```

**After (with schema evolution):**
```
User: "debt to equity ratio"
  ↓
LLM: {"metric": "debt_to_equity_ratio"}
  ↓
Validate: ✅ debt_to_equity_ratio is a valid FinancialMetric
  ↓
Server: Fetch + calculate automatically
  ↓
Return: [{year: 2025, value: 3.87, metric: "debt_to_equity_ratio"}]
  ↓
Answer: "3.87" (already calculated!)
```

### Advantages

#### 1. Semantic Correctness
Your API now speaks the user's language:

```typescript
// Users think:        "debt to equity ratio"
// LLM outputs:        {"metric": "debt_to_equity_ratio"}
// Your API supports:  ✅ "debt_to_equity_ratio"
// No translation needed!
```

#### 2. Single Source of Truth
Calculations live in exactly one place (the server):

```typescript
// ❌ BEFORE: Calculations in multiple places
// - Prompt tells LLM how to calculate
// - LLM does calculation in answer generation
// - If formula changes, update prompt

// ✅ AFTER: One canonical calculation
function calculateDebtToEquity(liabilities, equity) {
  return liabilities / equity
}
// If formula changes, update once
```

#### 3. Type Safety
TypeScript knows about all metrics:

```typescript
// ✅ Compile-time checking
type FinancialMetric = 'revenue' | 'debt_to_equity_ratio' | ...

function getMetric(metric: FinancialMetric) {
  if (metric === 'debt_to_equity_rati') {  // ❌ Typo caught at compile time!
    //                            ^
    // TypeScript Error: "debt_to_equity_rati" is not assignable to FinancialMetric
  }
}
```

#### 4. Better Developer Experience
Adding a new metric is straightforward:

```typescript
// 1. Add to type
type CalculatedFinancialMetric =
  | 'debt_to_equity_ratio'
  | 'current_ratio'  // ✨ New!

// 2. Implement calculation
if (metric === 'current_ratio') {
  const data = await fetchCurrentAssetsAndLiabilities()
  return data.map(row => ({
    year: row.year,
    value: row.current_assets / row.current_liabilities,
    metric: 'current_ratio',
  }))
}

// 3. Done! TypeScript ensures you handle it everywhere
```

#### 5. Consistent Formatting
Data always comes back in the same shape:

```typescript
// Whether raw or calculated, same interface:
{
  year: 2025,
  value: 3.87,
  metric: 'debt_to_equity_ratio',
  source: {  // Optional: show how it was calculated
    total_liabilities: 285508000000,
    shareholders_equity: 73733000000,
  }
}
```

#### 6. Easier Testing
You can test calculations directly:

```typescript
// Test the calculation function
test('debt_to_equity_ratio calculates correctly', async () => {
  const result = await getAaplFinancialsByMetric({
    metric: 'debt_to_equity_ratio',
    limit: 1,
  })

  expect(result.data[0].value).toBeCloseTo(3.87, 2)
  expect(result.data[0].source.total_liabilities).toBe(285508000000)
})
```

### Disadvantages

#### 1. More Code to Write
Every calculated metric needs implementation:

```typescript
// Need to write handlers for each one
if (metric === 'debt_to_equity_ratio') { ... }
if (metric === 'gross_margin') { ... }
if (metric === 'roe') { ... }
if (metric === 'current_ratio') { ... }
// ... 20 more ratios? 50?
```

#### 2. Code Duplication (Initially)
If you already have LLM calculating in prompts, you're duplicating logic:

```typescript
// In prompt:
// "Calculate debt-to-equity: total_liabilities / shareholders_equity"

// In server:
value: row.total_liabilities / row.shareholders_equity

// Same calculation, two places (temporarily)
```

#### 3. Database Queries Might Be Less Efficient
Calculated metrics might fetch more data than needed:

```typescript
// Before: Fetch one metric, include related fields
SELECT year, total_liabilities, shareholders_equity FROM financials_std

// After: Fetch specific fields for each calculated metric
// (Though this is actually the SAME query, just organized differently)
```

#### 4. Larger Refactor
This touches multiple parts of the system:
- Type definitions
- Server actions
- Chart helpers
- Possibly frontend display logic
- Test files

### When to Use This Solution

✅ **Good for:**
- **Long-term architecture** - the "right" way to do it
- **Type-safe systems** - get compile-time checking
- **Complex calculations** - can implement any formula
- **Consistency** - calculations done the same way everywhere
- **Testing** - easy to unit test each calculation

❌ **Bad for:**
- **Quick prototypes** - too much upfront work
- **Uncertain requirements** - don't know which metrics users want yet
- **Resource constraints** - team too small to maintain

### Migration Strategy

Don't do this all at once. Migrate incrementally:

#### Phase 1: Keep Both Systems
```typescript
// Support BOTH normalized metrics AND native calculated metrics
const rawMetric = toolSelection.args.metric
const metric = normalizeMetric(rawMetric)  // Still normalizing

// But ALSO check if it's a calculated metric
if (isCalculatedMetric(metric)) {
  // Use new calculation system
  return await getCalculatedMetric(metric, limit)
} else {
  // Use old system
  return await getRawMetric(metric, limit)
}
```

#### Phase 2: Migrate Most Common Metrics
Use your logs from Phase 1 to see which metrics users ask for most:

```
Most requested calculated metrics:
1. debt_to_equity_ratio - 450 requests
2. gross_margin - 320 requests
3. roe - 180 requests
4. operating_margin - 95 requests
5. roa - 60 requests
```

Implement native support for top 5, keep normalization for the rest.

#### Phase 3: Gradually Expand
Add 2-3 calculated metrics per sprint until you've covered the long tail.

#### Phase 4: Remove Normalization
Once all common patterns are covered, remove the normalization layer.

### Real-World Example

Let's say you implement `debt_to_equity_ratio` natively:

**User experience is identical:**
```
User: "What's the D/E ratio?"
Answer: "The debt-to-equity ratio in 2025 is 3.87"
```

**But under the hood:**
```typescript
// BEFORE:
LLM selects → Normalizer translates → Fetch raw → LLM calculates in prompt

// AFTER:
LLM selects → Server validates → Server fetches + calculates → Return ready data
```

**Benefits:**
- Faster (no LLM calculation step)
- More reliable (formula is code, not prompt)
- Cheaper (fewer tokens in answer generation)
- Easier to debug (calculation is deterministic)

---

## Solution 3: Structured Function Calling (Brief)

### Core Idea

Use OpenAI's native `functions` or `tools` parameter with strict JSON schemas instead of asking the LLM to generate free-form JSON.

### How It Works

```typescript
const tools = [{
  type: "function",
  function: {
    name: "getAaplFinancialsByMetric",
    strict: true,  // Enforce schema
    description: "Get AAPL financial metrics",
    parameters: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: [  // LLM MUST pick from this list
            "revenue",
            "gross_profit",
            "net_income",
            "total_liabilities",
            // ... only valid metrics
          ],
          description: "The financial metric to retrieve"
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: 20,
        }
      },
      required: ["metric"]
    }
  }
}]

const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{role: "user", content: "What's the debt to equity ratio?"}],
  tools: tools,
  tool_choice: "auto",
})
```

### Why We Didn't Emphasize This

1. **Doesn't solve the semantic problem** - still need to map "debt to equity" → "total_liabilities" somewhere
2. **You're using Responses API** - different pattern than Chat Completions + tools
3. **Migration complexity** - would require rewriting your existing tool selection flow
4. **Still need mapping** - the enum just enforces it more strictly

### When It's Useful

✅ Use structured function calling when:
- You want the LLM to ONLY select from valid options (strict enforcement)
- You're using Chat Completions API
- You need complex parameter validation (nested objects, specific formats)
- You want the LLM to call multiple tools in sequence

❌ Not helpful for:
- Solving semantic mismatches (still need mapping)
- Responses API workflows (different pattern)
- Quick fixes (requires more setup)

---

## General Principles for LLM Integration

### 1. Don't Fight the LLM's Nature

LLMs are trained to:
- Preserve semantic meaning
- Use natural language
- Match domain terminology

When you find yourself writing prompts like:
```
"Don't output what the user said, output this arbitrary code instead"
```

That's a sign you're working against the LLM.

**Better approach:** Let the LLM do what it's good at (understanding semantics), then translate in code.

### 2. The Prompt vs. Code Decision

Use this framework:

| Task | Prompt | Code |
|------|--------|------|
| Understanding user intent | ✅ | ❌ |
| Generating natural language | ✅ | ❌ |
| Calculations | ⚠️ | ✅ |
| Schema validation | ❌ | ✅ |
| Business logic | ❌ | ✅ |
| Data transformation | ❌ | ✅ |

**Rule of thumb:**
- Prompts for semantics
- Code for mechanics

### 3. The "Dozens of Examples" Smell

If you're adding dozens of examples to make something work:

```typescript
// 🚨 CODE SMELL
const prompt = `
Examples:
Q: "debt to equity" → {"metric": "total_liabilities"}
Q: "D/E ratio" → {"metric": "total_liabilities"}
Q: "debt-to-equity" → {"metric": "total_liabilities"}
Q: "leverage ratio" → {"metric": "total_liabilities"}
Q: "debt equity" → {"metric": "total_liabilities"}
... 20 more examples ...
`
```

This means:
1. You're solving an architectural problem with prompts
2. You're working against the LLM's nature
3. There's probably a better solution in code

### 4. Semantic Layers Pattern

Structure your application in semantic layers:

```
┌─────────────────────────────────────┐
│  User Layer (Natural Language)      │
│  "Show me debt to equity ratio"     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  LLM Layer (Semantic Understanding) │
│  Intent: calculate_ratio            │
│  Entities: {metric: D/E, company}   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Translation Layer (Your Code)      │
│  D/E ratio → fetch(liabilities,     │
│              equity)                 │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Data Layer (Database Schema)       │
│  SELECT total_liabilities,          │
│         shareholders_equity          │
└─────────────────────────────────────┘
```

Each layer speaks its own language. Translation happens between layers, not within them.

### 5. Logging for Learning

Always log the transformations:

```typescript
console.log('📥 User question:', userQuestion)
console.log('🤖 LLM output:', llmOutput)
console.log('🔄 After translation:', translated)
console.log('✅ Final metric:', finalMetric)
```

This builds institutional knowledge:
- Which metrics do users actually ask for?
- How do they phrase questions?
- Where is translation needed?
- What edge cases exist?

Use this data to:
- Prioritize which calculated metrics to implement natively
- Improve your normalization mappings
- Update training documentation
- Make data-driven architecture decisions

### 6. The Progressive Enhancement Strategy

Start simple, make it better over time:

```
Week 1: Prompts only
        ↓
        "Works but fragile"
        ↓
Week 2: Add normalization layer
        ↓
        "Robust, logs show patterns"
        ↓
Week 4: Implement top 5 calculated metrics natively
        ↓
        "Fast and type-safe for common cases"
        ↓
Month 3: Migrate long tail
        ↓
        "Fully native, remove normalization"
```

Don't try to build the perfect system upfront. Ship, learn, improve.

---

## Decision Framework

### When to Use Each Solution

```
┌─────────────────────────────────────────────────────────┐
│  START HERE                                             │
│  Do you need to ship a fix TODAY?                      │
└────────────┬───────────────────────────────────┬────────┘
             │                                   │
            YES                                 NO
             │                                   │
             ▼                                   ▼
┌─────────────────────────┐    ┌──────────────────────────┐
│  SOLUTION 1             │    │  Do you have < 5         │
│  Normalization Layer    │    │  calculated metrics?     │
│                         │    └──────┬──────────────┬────┘
│  • 10 minute fix        │          YES            NO
│  • Works immediately    │           │              │
│  • Buys you time        │           ▼              ▼
└─────────────────────────┘    ┌─────────────┐  ┌─────────┐
                               │  SOLUTION 1 │  │ SOL 2   │
                               │  + Plan v2  │  │ Native  │
                               └─────────────┘  └─────────┘
```

### Decision Criteria

#### Choose Normalization (Solution 1) if:
- ⏰ Need to fix today
- 🔬 Validating the concept
- 📊 Want to learn user patterns first
- 👥 Small team, limited resources
- 🎯 Uncertain about requirements

#### Choose Schema Evolution (Solution 2) if:
- 🏗️ Building for long-term
- ✅ Clear requirements (know which metrics needed)
- 👨‍💻 Have dev resources
- 🔒 Type safety is important
- 📈 Many calculated metrics needed
- 🧪 Want easy testing

#### Do BOTH (Recommended) if:
- Phase 1: Normalization (ship fast)
- Phase 2: Native implementation (do it right)
- This gives you:
  - ✅ Immediate fix
  - 📊 Learning data
  - 🎯 Informed decisions
  - 🏗️ Solid foundation

---

## Recommended Implementation Plan

### Recommended Solution

- Keep Solution 1 (normalization layer) in place as the immediate fix so the LLM can return semantic metric names while the backend adapts them to the raw schema.
- Use normalization logs to understand real user phrasing and prioritize which calculated metrics deserve native support.
- Incrementally adopt Solution 2 by introducing typed, server-side calculators for the most common ratios, aligning the API surface with user language.

### Concrete Changes

- Add `/lib/metric-normalizer.ts` with resilient cleanup plus the alias map drawn from observed questions.
- Invoke `normalizeMetric` before validation in the tool handler, and emit structured logs for every translation.
- Extend `/app/actions/financials.ts` with `RawFinancialMetric`/`CalculatedFinancialMetric` unions and deterministic calculators for the top ratios (`debt_to_equity_ratio`, `gross_margin`, `roe`, etc.).
- Refresh prompt/tool documentation (`/lib/tools.ts`, onboarding docs) to advertise newly supported calculated metrics instead of discouraging them.
- Back the new calculators and the normalization helper with unit tests to lock in formulas and catch breaking changes.

### Step-by-Step Timeline

1. **Day 0–1:** Implement and deploy the normalization helper with verbose logging.
2. **Week 1:** Review logs, cluster aliases, and pad the mapping with any obvious gaps.
3. **Week 2–3:** Promote the top 3–5 ratios into native, typed calculators while keeping normalization for the long tail.
4. **Week 4+:** Iterate—migrate additional ratios, trim redundant prompt guidance, and start surfacing warnings for metrics that should be native.
5. **Quarterly:** When normalization hits become rare, deprecate the mapping, require `FinancialMetric` enums end-to-end, and archive the playbook for future metrics.

### Success Criteria

- LLM outputs that use natural finance terminology pass validation without manual prompt hacks.
- Calculated metrics return deterministic, tested values suitable for downstream charts and analytics.
- Normalization logs show a declining hit rate as the schema evolves toward user semantics.

---

## Lessons Learned

### 1. Prompts Are Not a Programming Language

When you find yourself writing complex logic in prompts:

```typescript
// 🚨 This is code masquerading as a prompt
const prompt = `
IF user says "debt to equity" THEN
  IF they mention a specific year THEN
    SET limit = 20
  ELSE
    SET limit = 4
  END IF
  RETURN {"metric": "total_liabilities", "limit": limit}
ELSE IF user says "gross margin" THEN
  ...
`
```

This should be code, not a prompt.

**The lesson:** Prompts for semantics, code for logic.

### 2. LLMs Want to Help (Too Much)

LLMs are trained to be helpful, which sometimes means:
- Filling in what they think you want
- Matching the user's language
- Making assumptions to avoid saying "I don't know"

This "helpfulness" can work against strict schemas.

**The lesson:** Design systems that work WITH the LLM's helpful nature, not against it.

### 3. The 80/20 Rule Applies

In our case:
- 80% of requests use 5 calculated metrics
- 20% of requests use the long tail

**The lesson:** Optimize for the common case, handle the long tail pragmatically.

### 4. Logging Is Product Research

Every translation you log is a data point:

```typescript
// Logs reveal user behavior:
"debt_to_equity" → total_liabilities (x450)
"de_ratio" → total_liabilities (x120)
"leverage" → total_liabilities (x80)
```

**The lesson:** Your production logs tell you what to build next.

### 5. Type Safety Catches Bugs

When we moved from normalization (strings) to native metrics (types):

```typescript
// Found 3 typos that would have been runtime bugs:
'net_incom' → ❌ TypeScript error!
'shareholders_equty' → ❌ TypeScript error!
'debt_to_equity_ration' → ❌ TypeScript error!
```

**The lesson:** If data flows through your system, put it in the type system.

### 6. Users Don't Care About Your Schema

Users ask for:
- "debt to equity ratio"
- "D/E"
- "leverage"
- "debt-to-equity"

They don't care that you store `total_liabilities`. That's an implementation detail.

**The lesson:** Your API should speak user language, not database language.

### 7. Perfect Is the Enemy of Shipped

We could have spent weeks building the perfect system upfront. Instead:

```
Day 1: Ship normalization (users happy)
Week 2: Analyze logs (learned patterns)
Week 4: Implement top metrics (better performance)
Month 2: Full migration (production-ready)
```

**The lesson:** Progressive enhancement beats big-bang rewrites.

---

## Conclusion

The semantic impedance mismatch between user language, LLM outputs, and database schemas is a fundamental challenge in LLM application development.

**The three solutions:**

1. **Normalization Layer** - Quick, pragmatic, learn from production
2. **Schema Evolution** - Correct, type-safe, maintainable long-term
3. **Structured Functions** - Strict enforcement, different use case

**The recommended path:**

```
Start → Normalization → Learn → Native Implementation → Production
```

**The key insight:**

Don't fight the LLM's nature. Design your system to work with how LLMs actually behave, not how you wish they would behave.

**The ultimate lesson:**

LLM integration is architecture, not just prompting. When prompts get complex, the problem is usually architectural.

---

## Additional Resources

### Related Patterns

- **Adapter Pattern**: Normalization is a classic adapter pattern
- **Facade Pattern**: Schema evolution creates a domain-appropriate facade
- **Command Pattern**: Structured function calling is the command pattern

### Further Reading

- [Semantic Web](https://en.wikipedia.org/wiki/Semantic_Web) - The broader problem of semantic interoperability
- [Domain-Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html) - Building systems that match domain language
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) - Ports and adapters pattern

### Questions to Ask Your System

1. Are we solving architectural problems with prompts?
2. Do our types match our domain language?
3. Can users ask questions naturally?
4. Are we fighting the LLM or working with it?
5. What do our logs tell us users actually want?

---

**Document Version:** 1.0
**Last Updated:** 2025-01-04
**Authors:** Claude Code Session
**Status:** Living Document
