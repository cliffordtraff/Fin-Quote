# Generated Routing Examples (Meta-Prompting Output)

Generated using meta-prompting to improve tool routing accuracy.

## All 20 Generated Examples

### getAaplFinancialsByMetric Examples (5)

**Q1: What was Apple's revenue last year?**
- Tool: `getAaplFinancialsByMetric`
- Args: `{"metric": "revenue"}`
- Why: Asking for a specific financial metric (revenue) from financial statements.

**Q5: How has Apple's net income changed over time?**
- Tool: `getAaplFinancialsByMetric`
- Args: `{"metric": "net_income"}`
- Why: Requesting a specific financial metric and its trend across years.

**Q9: What's the EPS trend?**
- Tool: `getAaplFinancialsByMetric`
- Args: `{"metric": "eps"}`
- Why: Short question asking for earnings per share metric data.

**Q13: What are Apple's total assets and liabilities?**
- Tool: `getAaplFinancialsByMetric`
- Args: `{"metric": "total_assets"}`
- Why: Requesting specific balance sheet metrics (would need two calls, but starting with assets).

**Q17: Operating cash flow trends**
- Tool: `getAaplFinancialsByMetric`
- Args: `{"metric": "operating_cash_flow"}`
- Why: Very short question asking for a specific cash flow statement metric.

---

### getPrices Examples (5)

**Q2: Show me the stock price for the last month**
- Tool: `getPrices`
- Args: `{"range": "30d"}`
- Why: Requesting stock price history over a 30-day period.

**Q6: What's the current share price trend over the past week?**
- Tool: `getPrices`
- Args: `{"range": "7d"}`
- Why: Asking for stock price data over a 7-day period.

**Q10: Has the stock gone up or down in the last 3 months?**
- Tool: `getPrices`
- Args: `{"range": "90d"}`
- Why: Asking about stock price movement over a 90-day period.

**Q14: What was the closing price yesterday compared to last week?**
- Tool: `getPrices`
- Args: `{"range": "7d"}`
- Why: Comparing recent prices requires price history data.

**Q18: Show me price movements for the past month**
- Tool: `getPrices`
- Args: `{"range": "30d"}`
- Why: Requesting stock price data over 30 days, "show" refers to price data.

---

### getRecentFilings Examples (5)

**Q4: List the most recent SEC filings**
- Tool: `getRecentFilings`
- Args: `{"limit": 5}`
- Why: Explicitly asking to list filing documents themselves, not their content.

**Q8: Get the latest 10-K and 10-Q filings**
- Tool: `getRecentFilings`
- Args: `{"limit": 10}`
- Why: Asking to retrieve the filing documents themselves, not search their content.

**Q12: Show me all filings from this year**
- Tool: `getRecentFilings`
- Args: `{"limit": 10}`
- Why: Asking to display the filing documents as a list, not search their content.

**Q16: List recent quarterly and annual reports**
- Tool: `getRecentFilings`
- Args: `{"limit": 8}`
- Why: Explicitly asking to list the report documents themselves.

**Q20: Get the filing dates for recent documents**
- Tool: `getRecentFilings`
- Args: `{"limit": 5}`
- Why: Asking for metadata about the filings themselves (dates), not their content.

---

### searchFilings Examples (5)

**Q3: What are the main risk factors Apple faces?**
- Tool: `searchFilings`
- Args: `{"query": "risk factors", "limit": 5}`
- Why: Asking for qualitative content about risks, requires searching inside filings.

**Q7: Show me Apple's business strategy**
- Tool: `searchFilings`
- Args: `{"query": "business strategy", "limit": 5}`
- Why: Requesting qualitative information about strategy from filing content.

**Q11: Show risks related to supply chain** ⭐ (Ambiguous - uses "show" but means content)
- Tool: `searchFilings`
- Args: `{"query": "supply chain risks", "limit": 5}`
- Why: Despite using "show", this asks for content about specific risks, requiring search.

**Q15: How does Apple describe its competitive position?**
- Tool: `searchFilings`
- Args: `{"query": "competitive position competition", "limit": 5}`
- Why: Asking for qualitative commentary about competition from filing content.

**Q19: What does Apple say about AI and machine learning in their filings?**
- Tool: `searchFilings`
- Args: `{"query": "artificial intelligence machine learning AI", "limit": 5}`
- Why: Asking for specific content/commentary from within the filings.

---

## Selected Best 10 Examples for Routing Prompt

These examples best demonstrate tool disambiguation and cover edge cases:

### 1. Financial Metrics (2 examples)
```json
{"tool":"getAaplFinancialsByMetric","args":{"metric":"revenue","limit":4}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"eps"}}
```

### 2. Stock Prices (2 examples)
```json
{"tool":"getPrices","args":{"range":"30d"}}
{"tool":"getPrices","args":{"range":"90d"}}
```

### 3. List Filings (3 examples - important for disambiguation)
```json
{"tool":"getRecentFilings","args":{"limit":5}}
{"tool":"getRecentFilings","args":{"limit":10}}
{"tool":"getRecentFilings","args":{"limit":8}}
```

### 4. Search Filing Content (3 examples - important for disambiguation)
```json
{"tool":"searchFilings","args":{"query":"risk factors","limit":5}}
{"tool":"searchFilings","args":{"query":"supply chain risks","limit":5}}
{"tool":"searchFilings","args":{"query":"competitive position competition","limit":5}}
```

---

## Key Insights from Generation

### Strong Disambiguators
- **getRecentFilings** = "list", "show", "get" + "filings/reports/documents" (the items themselves)
- **searchFilings** = "what", "how", "describe", "explain" + qualitative topics (risks, strategy, etc.)

### Ambiguous Cases Successfully Handled
- **Q11: "Show risks related to supply chain"** - Uses "show" but means search content, not list documents
- **Q12: "Show me all filings from this year"** - Uses "show" but means list documents, not search content
- The key distinction: Is the user asking about document content or document metadata?

### Patterns for Each Tool
1. **Financial metrics**: Specific metric names (revenue, EPS, assets) + trend/change/value questions
2. **Prices**: Stock/share/price + time periods (week, month, 3 months)
3. **getRecentFilings**: List/show/get + filings/reports + emphasis on "recent" or metadata
4. **searchFilings**: What/how/describe/explain + qualitative topics (risks, strategy, competition, commentary)
