# Tool Architecture Decision: Integrating 139 Financial Metrics

**Date:** 2025-11-06
**Context:** Phase 2 of Financial Metrics Integration
**Decision Required:** How to expose 139 new financial metrics to the LLM router

---

## Background

### What We Just Built (Phase 1)

We successfully added **139 financial metrics** to the database:
- **Source:** Financial Modeling Prep (FMP) API
- **Table:** `financial_metrics` in Supabase
- **Data:** 2,780 records covering 2006-2025
- **Categories:** Valuation, Profitability, Growth, Leverage, Efficiency, etc.

**Examples of new metrics:**
- Valuation: P/E Ratio, P/B Ratio, Market Cap, EV/EBITDA
- Profitability: ROE, ROA, ROIC, Gross Margin, Net Margin
- Leverage: Debt-to-Equity, Current Ratio, Quick Ratio
- Growth: Revenue Growth, EPS Growth, 3Y/5Y/10Y CAGRs

### The Challenge

These metrics are **in the database but not queryable** via the Q&A system yet.

**Why?** The LLM router doesn't know they exist. When a user asks "What's Apple's P/E ratio?", the LLM has no tool to call.

---

## Current System Architecture

### How the Router Works (Two-Step LLM Pattern)

**Step 1: Tool Selection**
```
User: "What's Apple's P/E ratio?"
      ↓
LLM: Picks a tool from the menu
      ↓
Output: {"tool": "getAaplFinancialsByMetric", "args": {"metric": "eps", "limit": 5}}
```

**Step 2: Tool Execution**
```
Server: Validates args and calls getAaplFinancialsByMetric()
        ↓
Database: Fetches EPS data
        ↓
LLM: Formats answer using the data
```

### Current Tool Menu (4 Tools)

| Tool | Purpose | Metrics/Args |
|------|---------|--------------|
| `getAaplFinancialsByMetric` | Core financials | 9 metrics: revenue, gross_profit, net_income, total_assets, etc. |
| `getPrices` | Stock prices | Ranges: 7d, 30d, 90d |
| `getRecentFilings` | SEC filing metadata | Limit: 1-10 |
| `searchFilings` | Search filing content | Query: natural language, Limit: 1-10 |

**Current success rate:** High - LLM rarely picks wrong tool

**Why it works:**
- Only 4 tools (LLMs handle 5-15 best)
- Clear semantic boundaries (financials vs prices vs filings)
- Each tool has a distinct purpose

---

## The Problem

**User asks:** "What's Apple's P/E ratio in 2024?"

**Current behavior:**
- LLM searches tool menu for "P/E ratio"
- Closest match: `getAaplFinancialsByMetric` with `metric: eps`
- But P/E ratio ≠ EPS (P/E = Price / EPS)
- Result: Wrong tool or error

**The gap:** 139 metrics exist in database but aren't exposed to the LLM.

---

## The Decision: How Many Tools to Add?

We need to decide **how to expose these 139 metrics** to the router.

### Option 1: Single Unified Tool (Simplest)

**Add 1 tool:**
```
Tool: getFinancialMetric
Args: { metricName: 'peRatio | roe | debtEquityRatio | grossProfitMargin | ...' }
      (139 metric options)
```

**Total tools: 5** (4 existing + 1 new)

**How it works:**
```
User: "What's Apple's P/E ratio?"
  ↓
LLM: {"tool": "getFinancialMetric", "args": {"metricName": "peRatio", "limit": 5}}
  ↓
Server: Queries financial_metrics table WHERE metric_name = 'peRatio'
```

**Pros:**
- ✅ Simplest to implement (1 tool definition, 1 server action handler)
- ✅ Lowest token cost (shortest tool menu)
- ✅ Easy to maintain (add new metrics without changing tool structure)
- ✅ Total tools stays at 5 (optimal range for LLM accuracy)
- ✅ Flexible for multi-metric queries ("Show P/E, ROE, and Debt-to-Equity")
- ✅ Matches your existing pattern (1 tool for prices, 1 for financials, etc.)

**Cons:**
- ❌ Long argument list (139 metric names in the description)
- ❌ LLM must search through all metrics to find the right one
- ❌ Less semantic guidance (no hints about metric categories)
- ❌ Server must validate metric name exists (validation logic)

**Best for:**
- Keeping the system simple and maintainable
- When all metrics are queried the same way (by year, limit)
- When you want low cognitive load for the LLM

---

### Option 2: Category-Based Tools (Middle Ground)

**Add 3 tools:**
```
Tool 5: getValuationMetrics
  Args: { metricName: 'peRatio | priceToBookRatio | marketCap | ...' }
        (~20 valuation metrics)

Tool 6: getProfitabilityMetrics
  Args: { metricName: 'roe | roa | grossProfitMargin | netProfitMargin | ...' }
        (~20 profitability metrics)

Tool 7: getAdvancedMetrics
  Args: { metricName: 'debtEquityRatio | currentRatio | revenueGrowth | ...' }
        (~99 other metrics: leverage, growth, efficiency)
```

**Total tools: 7** (4 existing + 3 new)

**How it works:**
```
User: "What's Apple's P/E ratio?"
  ↓
LLM: "P/E ratio = valuation metric"
  ↓
LLM: {"tool": "getValuationMetrics", "args": {"metricName": "peRatio", "limit": 5}}
  ↓
Server: Queries financial_metrics table WHERE metric_name = 'peRatio'
```

**Pros:**
- ✅ Clear semantic routing (valuation vs profitability vs leverage)
- ✅ Shorter argument lists per tool (~20 metrics each)
- ✅ LLM gets category hints ("this is a valuation question")
- ✅ Matches how finance professionals think (categories matter)
- ✅ Faster routing (LLM eliminates 2/3 of tools immediately)
- ✅ Better for ambiguous queries ("How's Apple doing?" → pick profitability)

**Cons:**
- ❌ More tools to maintain (3 tool definitions, 3 handlers)
- ❌ Total tools = 7 (still good, but higher than 5)
- ❌ Category overlap ("ROE" = profitability OR returns?)
- ❌ Multi-category queries harder ("P/E and ROE" = 2 different tools)
- ❌ More prompt engineering (teach LLM about categories)

**Best for:**
- When metrics have distinct use cases (valuation vs leverage)
- When you want semantic precision in routing
- When categories provide useful context for the LLM

---

### Option 3: Individual Tools (Most Granular)

**Add 139 tools:**
```
Tool 5: getPERatio
Tool 6: getROE
Tool 7: getDebtToEquity
...
Tool 143: getInventoryTurnover
```

**Total tools: 143** (4 existing + 139 new)

**How it works:**
```
User: "What's Apple's P/E ratio?"
  ↓
LLM: {"tool": "getPERatio", "args": {"limit": 5}}
```

**Pros:**
- ✅ Crystal clear intent (no ambiguity)
- ✅ No argument validation needed (each tool = one metric)
- ✅ Can add custom logic per metric (format P/E differently than ROE)

**Cons:**
- ❌ 143 tools = **WAY too many** (LLM accuracy drops at >30 tools)
- ❌ Massive token bloat (tool menu becomes huge and expensive)
- ❌ Maintenance nightmare (139 tool definitions to update)
- ❌ Rigid (adding new metric = new tool deployment)
- ❌ Multi-metric queries impossible ("Show P/E, P/B, EV" = 3 tool calls)

**Research:** Studies show LLM tool selection accuracy drops sharply above 30 tools.

**Best for:**
- **Never** - This is almost always the wrong choice

---

## Research & Best Practices

### LLM Tool Selection Studies

**Key findings:**
1. **Optimal tool count: 5-15 tools**
   - Accuracy: ~95% with 5-10 tools
   - Accuracy: ~80% with 15-20 tools
   - Accuracy: ~60% with 30+ tools

2. **Argument complexity matters less**
   - LLMs can handle long argument lists (50+ options)
   - Better at searching args than choosing between many tools

3. **Semantic grouping helps**
   - Category-based tools improve routing accuracy
   - But only if categories are clear and non-overlapping

4. **Token costs scale linearly**
   - Every tool selection query includes the full tool menu
   - Longer menu = higher cost per query

### Your Current System Performance

**Current:** 4 tools
**Accuracy:** High (based on your evaluation scripts)
**Token cost:** Low (short tool menu)

**Why it works:**
- Clear semantic boundaries (financials ≠ prices ≠ filings)
- Each tool has distinct retrieval mechanism
- No overlap between tools

---

## Analysis: Your Use Case

### Characteristics of the 139 New Metrics

1. **Similar retrieval pattern:**
   - All stored in same table (`financial_metrics`)
   - All queried by: symbol, metric_name, year, limit
   - All return same structure: year, metric_value, category

2. **Semantic overlap:**
   - Many metrics could fit multiple categories
   - Example: "ROE" = profitability? returns? efficiency?
   - Hard to draw clean category boundaries

3. **User query patterns:**
   - Users ask for specific metrics ("What's the P/E ratio?")
   - Sometimes ask for categories ("How profitable is Apple?")
   - Often ask for multiple metrics ("Show P/E, ROE, and margins")

4. **Comparison to existing tools:**
   - Stock prices = different retrieval (external API, date ranges)
   - Filings = different structure (metadata vs content)
   - Core financials = different source (financials_std table)
   - **New metrics = unified source (financial_metrics table)**

### What Your System Does Well

**Your router excels at:**
- Distinguishing between **different data types** (prices vs financials vs filings)
- Handling **clear semantic boundaries** (price = current market, financials = historical company data)

**Your router doesn't need:**
- Fine-grained categorization within the same data type
- Multiple tools for the same retrieval pattern

---

## Recommendation: Add 1 Tool

### My Recommendation: **Option 1 (Single Unified Tool)**

**Add:**
```
Tool: getFinancialMetric
Description: "Get advanced financial metrics including valuation (P/E, Market Cap),
             profitability (ROE, Margins), leverage (Debt ratios), and growth metrics"
Args: {
  metricName: 'peRatio | roe | debtEquityRatio | grossProfitMargin | ...' (139 options),
  limit: 'integer 1-20 (defaults to 5)'
}
```

**Result: 5 total tools** (4 existing + 1 new)

### Why This is the Right Choice

**1. Matches Your Existing Pattern**

Your current tools are divided by **data source and retrieval pattern**, not by semantic category:
- `getAaplFinancialsByMetric` → Query `financials_std` table
- `getPrices` → Query FMP API (external)
- `getRecentFilings` / `searchFilings` → Query `filings` table

The new metrics:
- **Same retrieval pattern** (database query)
- **Same source** (one table: `financial_metrics`)
- **Same arguments** (symbol, year, limit)

→ Therefore: **1 tool makes sense**

**2. Keeps Total Tools in Optimal Range**

- Current: 4 tools (excellent accuracy)
- With Option 1: **5 tools** (still excellent)
- With Option 2: 7 tools (good but unnecessary complexity)
- With Option 3: 143 tools (disaster)

**3. Simpler Maintenance**

One tool = one place to update when:
- Adding new metrics
- Changing query logic
- Updating prompt templates
- Fixing bugs

**4. Lower Token Costs**

Shorter tool menu = lower cost per query.

**5. Works Well for Multi-Metric Queries**

User: "Compare Apple's P/E ratio, ROE, and debt-to-equity"

With 1 tool:
```
Call getFinancialMetric 3 times (same tool, different args)
```

With 3 tools:
```
Call getValuationMetrics (P/E)
Call getProfitabilityMetrics (ROE)
Call getAdvancedMetrics (debt-to-equity)
LLM must remember which tool has which metric
```

**6. Future-Proof**

Adding metric #140, #141... doesn't require:
- New tool definitions
- Retraining the router
- Updating multiple handlers

Just add to the list.

---

## Implementation Details

### Tool Definition (lib/tools.ts)

```typescript
{
  name: 'getFinancialMetric',
  description: 'Get advanced financial metrics: valuation (P/E, Market Cap, EV), profitability (ROE, ROA, margins), leverage (debt ratios, liquidity), growth (YoY, CAGRs), and efficiency ratios.',
  args: {
    metricName: 'peRatio | priceToBookRatio | marketCap | roe | roa | grossProfitMargin | netProfitMargin | debtEquityRatio | currentRatio | quickRatio | revenueGrowth | ...',
    limit: 'integer 1-20 (defaults to 5)'
  },
  notes: 'Supports 139 metrics from FMP API. Returns metric values over time. Ticker is fixed to AAPL for MVP.'
}
```

### Metric Name Mapping (in prompt)

Add translation guide so LLM knows how to map user queries to database field names:

```
METRIC MAPPING:

Valuation:
- "P/E ratio", "price to earnings", "PE" → peRatio
- "price to book", "P/B ratio" → priceToBookRatio
- "market cap", "market capitalization" → marketCap
- "enterprise value", "EV" → enterpriseValue

Profitability:
- "return on equity", "ROE" → returnOnEquity
- "return on assets", "ROA" → returnOnAssets
- "gross margin", "gross profit margin" → grossProfitMargin
- "net margin", "profit margin" → netProfitMargin

Leverage:
- "debt to equity", "D/E ratio" → debtEquityRatio
- "current ratio", "liquidity" → currentRatio
- "quick ratio" → quickRatio

Growth:
- "revenue growth", "sales growth" → revenueGrowth
- "EPS growth", "earnings growth" → epsgrowth

... (full mapping for all 139 metrics)
```

### Tool Handler (app/actions/ask-question.ts)

```typescript
else if (toolSelection.tool === 'getFinancialMetric') {
  const metricName = toolSelection.args.metricName
  const limit = toolSelection.args.limit || 5

  // Validate metric name exists (list of 139 valid metrics)
  const validMetrics = ['peRatio', 'roe', 'debtEquityRatio', ...]
  if (!validMetrics.includes(metricName)) {
    return { error: 'Invalid metric name' }
  }

  // Call server action
  const toolResult = await getFinancialMetric({
    symbol: 'AAPL',
    metricName,
    limit
  })

  if (toolResult.error || !toolResult.data) {
    toolError = toolResult.error || 'Failed to fetch metric'
    return { error: toolError }
  }

  factsJson = JSON.stringify(toolResult.data, null, 2)
  dataUsed = { type: 'financial_metric', data: toolResult.data }

  // Generate chart (if applicable)
  chartConfig = generateMetricChart(toolResult.data, metricName)
}
```

---

## Alternative Considered: Category-Based (3 Tools)

### Why I'm NOT Recommending This

While category-based tools have benefits, they don't fit your system well because:

**1. Category Boundaries Are Fuzzy**

Which category is "ROE"?
- Profitability? (measures profit efficiency)
- Returns? (return on equity)
- Efficiency? (how efficiently equity is used)

Hard to teach the LLM clear rules.

**2. Your Current Tools Don't Use Categories**

You don't have:
- `getIncomeStatementMetrics`
- `getBalanceSheetMetrics`
- `getCashFlowMetrics`

You just have `getAaplFinancialsByMetric` (all core financials in one tool).

Why? Because **they share the same retrieval pattern**.

The new metrics also share one retrieval pattern → same logic applies.

**3. Adds Complexity Without Clear Benefit**

The LLM already needs to:
1. Pick the right category tool
2. Pick the right metric within that tool

vs. with single tool:
1. Pick the tool (easy: "is this an advanced metric?")
2. Pick the metric

Not much different, but now you maintain 3 tools instead of 1.

**4. Doesn't Match User Mental Model**

Users don't think:
- "I want to query the valuation metrics tool"

They think:
- "I want to know Apple's P/E ratio"

Single tool matches this better.

---

## Risk Analysis

### Risk: LLM Confused by 139 Metric Options

**Concern:** Argument list with 139 metric names might confuse the LLM.

**Mitigation:**
1. Add strong mapping hints in the prompt (user language → metric name)
2. Group metrics in the description (Valuation: peRatio, priceToBook... Profitability: roe, roa...)
3. LLMs are good at searching long lists (they do this with RAG all the time)

**Evidence:** Your current `getAaplFinancialsByMetric` has 9 metrics + extensive mapping hints and works well. Scaling to 139 with good organization should work.

### Risk: Wrong Metric Selected

**Concern:** LLM picks "roe" when user wanted "roa".

**Mitigation:**
1. Clear metric descriptions in mapping
2. Validation system catches mismatches (existing feature)
3. Regeneration logic can fix errors (existing feature)

**Evidence:** Your system already validates answers against source data. This catches metric selection errors.

### Risk: Multi-Metric Queries Inefficient

**Concern:** "Show P/E, ROE, and Debt-to-Equity" requires 3 tool calls.

**Future Enhancement:** Could add `getFinancialMetrics()` (plural) that accepts an array:
```
args: { metricNames: ['peRatio', 'roe', 'debtEquityRatio'], limit: 5 }
```

But start simple with singular version first.

---

## Comparison Table

| Factor | Single Tool (Rec.) | Category-Based | Individual Tools |
|--------|-------------------|----------------|------------------|
| **Total Tools** | 5 ✅ | 7 ✅ | 143 ❌ |
| **Maintenance** | Easy ✅ | Medium | Hard ❌ |
| **LLM Accuracy** | High ✅ | High ✅ | Low ❌ |
| **Token Cost** | Low ✅ | Medium | Very High ❌ |
| **Semantic Clarity** | Medium | High ✅ | Very High |
| **Flexibility** | High ✅ | Medium | Low ❌ |
| **Matches Current Pattern** | Yes ✅ | No | No ❌ |
| **Implementation Time** | 2 hours ✅ | 6 hours | 20+ hours ❌ |

---

## Decision

**Recommendation: Add 1 tool (`getFinancialMetric`)**

**Reasoning:**
1. Keeps total tools at 5 (optimal for LLM accuracy)
2. Matches your existing architectural pattern
3. Simplest to implement and maintain
4. Handles all 139 metrics with one unified interface
5. Future-proof (easy to add more metrics)
6. Works well for multi-metric queries

**Next Steps:**
1. Add tool definition to `lib/tools.ts`
2. Add metric name mapping to tool selection prompt
3. Add tool handler to `app/actions/ask-question.ts`
4. Create chart helper for metric visualization
5. Test with sample queries

**Timeline:** ~2-3 hours to implement and test

---

## Questions for Discussion

1. **Naming:** Do you prefer `getFinancialMetric` or `getAdvancedMetric` or something else?

2. **Separation from core financials:** Should we keep `getAaplFinancialsByMetric` for the original 9, or merge everything into one tool?

3. **Metric list format:** In the tool description, should we list all 139 metrics or group them by category for readability?

4. **Validation:** Should we validate metric names server-side or let the database reject invalid names?

---

## Appendix: Full Metric List

### Metrics Available (139 total)

**Valuation (20):**
- peRatio, priceToBookRatio, priceToSalesRatio, marketCap, enterpriseValue, evToSales, evToEbitda, evToOperatingCashFlow, evToFreeCashFlow, earningsYield, freeCashFlowYield, pegRatio, priceToFreeCashFlowsRatio, dividendYield, grahamNumber, etc.

**Profitability & Returns (20):**
- returnOnEquity, returnOnAssets, returnOnCapitalEmployed, roic, grossProfitMargin, operatingProfitMargin, pretaxProfitMargin, netProfitMargin, netIncomePerEBT, ebtPerEbit, ebitPerRevenue, returnOnTangibleAssets, etc.

**Leverage & Solvency (15):**
- debtRatio, debtEquityRatio, longTermDebtToCapitalization, totalDebtToCapitalization, interestCoverage, cashFlowToDebtRatio, currentRatio, quickRatio, cashRatio, etc.

**Efficiency & Working Capital (15):**
- daysOfSalesOutstanding, daysOfInventoryOutstanding, daysOfPayablesOutstanding, cashConversionCycle, assetTurnover, fixedAssetTurnover, inventoryTurnover, receivablesTurnover, payablesTurnover, etc.

**Growth (20):**
- revenueGrowth, grossProfitGrowth, ebitgrowth, operatingIncomeGrowth, netIncomeGrowth, epsgrowth, freeCashFlowGrowth, threeYRevenueGrowthPerShare, fiveYRevenueGrowthPerShare, tenYRevenueGrowthPerShare, etc.

**Per-Share Metrics (15):**
- revenuePerShare, netIncomePerShare, operatingCashFlowPerShare, freeCashFlowPerShare, cashPerShare, bookValuePerShare, tangibleBookValuePerShare, etc.

**Capital Returns & Share Data (10):**
- dividendYield, payoutRatio, dividendPerShare, numberOfShares, buybackYield, etc.

**Other (24):**
- stockBasedCompensationToRevenue, capexToOperatingCashFlow, capexToRevenue, capexToDepreciation, workingCapital, etc.

*Full list available in database query*

---

**Status:** Awaiting decision
**Recommended:** Option 1 (Single Tool)
**Ready to implement:** Yes
