---
name: financial-tool-selection
description: Select the correct financial data tool based on user questions. Use when implementing chatbot features, adding new tools, debugging tool selection logic, or when the user asks about tool routing.
---

# Financial Tool Selection Guide

## Quick Reference

Your codebase has 6 tools defined in `lib/tools.ts`. This skill helps select the right one.

## Tool Selection Rules

### `getFinancialsByMetric` - Core Financials

**Use when:**
- User asks for basic financial statements: revenue, net income, assets, liabilities, equity
- User wants income statement, balance sheet, or cash flow data
- User asks for calculated ratios: gross margin, ROE, debt-to-equity
- User mentions: "revenue", "profit", "assets", "liabilities", "equity", "cash flow", "EPS"

**Required args:**
- `symbol`: Stock ticker (e.g., "AAPL", "MSFT", "GOOGL")
- `metric`: One of: `revenue`, `gross_profit`, `net_income`, `operating_income`, `total_assets`, `total_liabilities`, `shareholders_equity`, `operating_cash_flow`, `eps`, `gross_margin`, `roe`, `debt_to_equity_ratio`
- `limit`: 1-20 for annual, 1-40 for quarterly (defaults to 4 annual or 12 quarterly)
- `period`: `annual` (default) or `quarterly`

**Example questions:**
- "What was Apple's revenue in 2023?" → `getFinancialsByMetric` with `symbol: "AAPL"`, `metric: "revenue"`
- "Show me Microsoft's net income for the last 5 years" → `getFinancialsByMetric` with `symbol: "MSFT"`, `metric: "net_income"`, `limit: 5`

---

### `getFinancialMetric` - Advanced Metrics

**Use when:**
- User asks for valuation metrics: P/E ratio, P/B ratio, EV/EBITDA
- User wants profitability ratios: ROE, ROA, profit margins
- User asks for growth rates, efficiency metrics, or leverage ratios
- User mentions any of the 139 extended metrics from `financial_metrics` table
- User asks for multiple metrics at once

**Required args:**
- `symbol`: Stock ticker
- `metricNames`: Array of metric names (supports aliases like "P/E" → `peRatio`)
- `limit`: 1-20 for annual, 1-40 for quarterly (defaults to 5 annual or 12 quarterly)
- `period`: `annual`, `quarterly`, or `ttm` (defaults to annual)

**Example questions:**
- "What's Apple's P/E ratio?" → `getFinancialMetric` with `symbol: "AAPL"`, `metricNames: ["peRatio"]`
- "Show me Microsoft's ROE and debt-to-equity" → `getFinancialMetric` with `symbol: "MSFT"`, `metricNames: ["returnOnEquity", "debtToEquity"]`

**Metric aliases:**
- "P/E" or "price to earnings" → `peRatio`
- "return on equity" or "ROE" → `returnOnEquity`
- "debt to equity" → `debtToEquity`
- See `lib/metric-resolver.ts` for complete alias mapping

---

### `getPrices` - Stock Price History

**Use when:**
- User asks about stock price history
- User wants price charts or price trends
- User mentions: "price", "stock price", "share price", "trading price", "closing price"

**Required args:**
- `symbol`: Stock ticker
- `from`: YYYY-MM-DD (required) - calculate from user request
- `to`: YYYY-MM-DD (optional, defaults to today)

**Date calculation:**
- "last 7 years" → `from: "2017-01-23"` (7 years ago from today)
- "since 2020" → `from: "2020-01-01"`
- "from 2018 to 2023" → `from: "2018-01-01"`, `to: "2023-12-31"`

**Example questions:**
- "What was Apple's stock price in 2023?" → `getPrices` with `symbol: "AAPL"`, `from: "2023-01-01"`, `to: "2023-12-31"`
- "Show me Microsoft's price over the last 5 years" → `getPrices` with `symbol: "MSFT"`, `from: "2019-01-23"`

---

### `listMetrics` - Metric Discovery

**Use when:**
- User asks "what metrics are available?"
- User wants to browse available data
- Uncertain which metric name to use
- User asks "what can I ask about?"

**Args:**
- `category`: Optional filter: "Valuation", "Profitability & Returns", "Growth", "Leverage & Solvency", "Efficiency & Working Capital", "Capital Returns & Share Data", "Per-Share Metrics", "Market Data", "Other"

**Example questions:**
- "What metrics are available?" → `listMetrics`
- "Show me all valuation metrics" → `listMetrics` with `category: "Valuation"`

---

### `getRecentFilings` - SEC Filing Metadata

**Use when:**
- User asks about SEC filings, 10-K, 10-Q reports
- User wants filing dates, types, or links
- User asks "when was the last 10-K filed?"

**Args:**
- `limit`: 1-10 (defaults to 5)

**Note:** Currently only supports AAPL. Returns filing metadata (date, type, URL), not content.

**Example questions:**
- "When was Apple's last 10-K filed?" → `getRecentFilings` with `limit: 1`
- "Show me the last 5 filings" → `getRecentFilings` with `limit: 5`

---

### `searchFilings` - Filing Content Search

**Status:** ⚠️ **DISABLED** - Do not use this tool.

If user asks about filing content, use `getRecentFilings` instead and explain that content search is unavailable.

---

## Symbol Extraction

**CRITICAL:** All financial tools require a `symbol` parameter. Extract from user question:

**Common mappings:**
- "Apple" or "AAPL" → `"AAPL"`
- "Microsoft" or "MSFT" → `"MSFT"`
- "Google" or "Alphabet" → `"GOOGL"`
- "Amazon" or "AMZN" → `"AMZN"`
- "Tesla" or "TSLA" → `"TSLA"`
- "Nvidia" or "NVDA" → `"NVDA"`

See `lib/tools.ts` lines 85-100 for complete symbol mapping.

**Pattern:** Look for company names or ticker symbols in the question. If missing, you cannot proceed - ask user for clarification.

---

## Period Selection

- **Default**: `annual` (yearly data)
- **Use `quarterly`**: When user asks for quarterly data, specific quarters (Q1, Q2, etc.), or "quarterly" explicitly
- **Use `ttm`**: For trailing twelve months (sum of last 4 quarters for flow metrics)

---

## Decision Tree

```
User question about financial data?
├─ Mentions "price" or "stock price"?
│  └─ Use: getPrices
├─ Asks "what metrics available?" or "what can I ask?"
│  └─ Use: listMetrics
├─ Asks about SEC filings (dates/types)?
│  └─ Use: getRecentFilings
├─ Asks about filing content?
│  └─ Use: getRecentFilings (searchFilings is disabled)
├─ Asks for P/E, ROE, or other advanced ratios?
│  └─ Use: getFinancialMetric
└─ Asks for revenue, profit, assets, or basic financials?
   └─ Use: getFinancialsByMetric
```

---

## Implementation Files

- Tool definitions: `lib/tools.ts`
- Tool selection prompt: `lib/tools.ts:buildToolSelectionPrompt()`
- Metric aliases: `lib/metric-resolver.ts`
- Server actions: `app/actions/` (financials.ts, prices.ts, filings.ts)

---

## Common Mistakes to Avoid

1. **Missing symbol**: Always extract symbol from question
2. **Wrong tool**: Don't use `getFinancialsByMetric` for P/E ratio (use `getFinancialMetric`)
3. **Date calculation**: Convert "last N years" to actual YYYY-MM-DD dates
4. **Using searchFilings**: This tool is disabled - use `getRecentFilings` instead
5. **Metric name**: Use canonical names (e.g., `peRatio` not `P/E`) or rely on alias resolution
