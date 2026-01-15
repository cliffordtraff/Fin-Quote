// Definitions for AI-exposed tools and prompt templates

export type ToolName = 'getAaplFinancialsByMetric' | 'getPrices' | 'getRecentFilings' | 'searchFilings' | 'listMetrics' | 'getFinancialMetric'

export type ToolDefinition = {
  name: ToolName
  description: string
  args: Record<string, string>
  notes?: string
}

export const TOOL_MENU: ToolDefinition[] = [
  {
    name: 'getAaplFinancialsByMetric',
    description: 'Get AAPL financial metrics (income statement, balance sheet, cash flow) for recent years or quarters.',
    args: {
      metric: 'revenue | gross_profit | net_income | operating_income | total_assets | total_liabilities | shareholders_equity | operating_cash_flow | eps | gross_margin | roe | debt_to_equity_ratio',
      limit: 'integer 1–20 for annual, 1-40 for quarterly (defaults to 4 annual or 12 quarterly)',
      period: 'annual | quarterly (defaults to annual)',
      quarters: 'array of 1-4 (optional, only valid when period=quarterly, e.g., [1,2] for Q1 and Q2)',
    },
    notes: 'Ticker is fixed to AAPL for MVP. Use period=quarterly for quarterly data.',
  },
  {
    name: 'getPrices',
    description: 'Get AAPL stock price history using custom date ranges.',
    args: {
      from: 'YYYY-MM-DD (required)',
      to: 'YYYY-MM-DD (optional, defaults to today)',
    },
    notes: 'Calculate the from date based on user request (e.g., "last 7 years" = 7 years ago from today). Returns daily closing prices.',
  },
  {
    name: 'getRecentFilings',
    description: 'Get recent SEC filings (10-K annual reports, 10-Q quarterly reports) for AAPL.',
    args: {
      limit: 'integer 1–10 (defaults to 5)',
    },
    notes: 'Returns filing metadata with links to SEC EDGAR documents. Ticker is fixed to AAPL for MVP.',
  },
  {
    name: 'searchFilings',
    description: 'Search AAPL SEC filing content to answer questions about risks, strategy, management commentary, business description, etc.',
    args: {
      query: 'natural language search query',
      limit: 'integer 1–10 (defaults to 5)',
    },
    notes: 'Uses semantic search to find relevant passages from 10-K/10-Q documents. Returns text passages with citations.',
  },
  {
    name: 'listMetrics',
    description: 'Get catalog of all available financial metrics to discover what data is available.',
    args: {
      category: 'optional: Valuation | Profitability & Returns | Growth | Leverage & Solvency | Efficiency & Working Capital | Capital Returns & Share Data | Per-Share Metrics | Market Data | Other',
    },
    notes: 'Use this when uncertain which metrics are available or to browse metrics by category. Returns metric names, descriptions, units, and common aliases.',
  },
  {
    name: 'getFinancialMetric',
    description: 'Get advanced financial metrics including P/E ratio, ROE, debt ratios, growth rates, and 130+ other metrics. Supports annual, quarterly, and TTM (trailing twelve months) data.',
    args: {
      metricNames: 'array of metric names (canonical or common aliases like "P/E", "ROE", "debt to equity")',
      limit: 'integer 1–20 for annual, 1-40 for quarterly (defaults to 5 annual or 12 quarterly; ignored for ttm)',
      period: 'annual | quarterly | ttm (defaults to annual)',
      quarters: 'array of 1-4 (optional, only valid when period=quarterly, e.g., [1,2] for Q1 and Q2)',
    },
    notes: 'Supports flexible metric names via alias resolution. Use listMetrics first if uncertain about metric names. Can fetch multiple metrics in one call. Use period=quarterly for quarterly data. Use period=ttm for trailing twelve months (sum of last 4 quarters for flow metrics like revenue, or latest quarter value for balance sheet items).',
  },
]

// Static instructions that will be cached by OpenAI
const TOOL_SELECTION_STATIC_PROMPT = `You are a router. Choose exactly one tool and return ONLY valid JSON: {"tool": string, "args": object}. No prose.

Available Tools:

1. getAaplFinancialsByMetric - Financial metrics as NUMBERS over time (ANNUAL or QUARTERLY)

   SUPPORTED METRICS:

   Raw Metrics:
   - revenue, gross_profit, net_income, operating_income
   - total_assets, total_liabilities, shareholders_equity
   - operating_cash_flow, eps

   Calculated Metrics (✨ Native Support):
   - debt_to_equity_ratio  (total_liabilities / shareholders_equity)
   - gross_margin          (gross_profit / revenue × 100)
   - roe                   (net_income / shareholders_equity × 100)

   PERIOD PARAMETER (NEW):
   - period: "annual" (default) or "quarterly"
   - quarters: optional array [1,2,3,4] to filter specific quarters (only when period="quarterly")

   METRIC MAPPING (with context clues):

   Income/Profitability:
   - "sales", "revenue", "top line" → revenue
   - "profit", "earnings", "bottom line", "profitability" → net_income
   - "EPS", "earnings per share" → eps
   - "operating profit", "EBIT" → operating_income

   Valuation Ratios (use getFinancialMetric tool):
   - "P/E ratio", "PE ratio", "price to earnings" → Use getFinancialMetric tool with metricNames: ["P/E"]
   - "P/B ratio", "price to book" → Use getFinancialMetric tool with metricNames: ["P/B"]
   - "PEG ratio" → Use getFinancialMetric tool with metricNames: ["PEG"]

   Calculated Ratios (✨ NOW NATIVE - use directly):
   - "gross margin", "gross profit margin" → gross_margin
   - "ROE", "return on equity" → roe
   - "debt to equity", "debt-to-equity", "D/E ratio", "leverage ratio" → debt_to_equity_ratio

   Balance Sheet (Raw):
   - "assets", "total assets" → total_assets
   - "liabilities", "total debt", "debt" → total_liabilities
   - "equity", "book value", "shareholders equity" → shareholders_equity

   Cash Flow:
   - "operating cash flow", "cash from operations", "OCF" → operating_cash_flow
   - "free cash flow", "FCF", "unlevered free cash flow" → Use getFinancialMetric tool
   - "capex", "capital expenditures", "buybacks", "dividends paid", "stock-based compensation" → Use getFinancialMetric tool

   Research & Development:
   - "R&D", "research and development", "R&D spending", "R&D expense" → Use getFinancialMetric tool with metricNames: ["R&D to revenue"] or ["research and development"]

   Other (use closest available):
   - "margins", "ratios" (when not specific) → operating_income

   LIMIT RULES - CRITICAL:

   1. If question asks for a SPECIFIC YEAR (2020, 2019, 2015, 2006, etc.) → limit: 20
      Why: We have 20 years (2006-2025). To find any specific year, fetch all.
      Examples:
      - "net income in 2020" → limit: 20
      - "revenue for 2018" → limit: 20
      - "What was EPS in 2006?" → limit: 20

   2. If question asks for a YEAR RANGE (2008 to 2020, 2015 to present, etc.) → limit: 20
      Why: Need all data to filter to the specific range.
      Examples:
      - "net income 2008 to present" → limit: 20
      - "revenue from 2015 to 2020" → limit: 20
      - "EPS between 2010 and 2018" → limit: 20

   3. If question specifies a NUMBER of years, use that EXACT number:
      "last 3 years" → limit: 3
      "past 5 years" → limit: 5
      "last year" or "most recent year" → limit: 1
      "10 years" → limit: 10
      "20 years" → limit: 20
      "2 years" → limit: 2

   4. If question says "trend", "history", "over time" WITHOUT a number → limit: 4

   5. If question says "all", "complete", "full history" → limit: 20

   6. If question is just asking for the metric (no time context) → limit: 4

   Examples:
   - "net income in 2006" → limit: 20 (specific year)
   - "revenue over 5 years" → limit: 5 (number specified)
   - "show me net income trend" → limit: 4 (no number)
   - "EPS history" → limit: 4 (no number)
   - "gross profit" → limit: 4 (no number)
   - "all historical data" → limit: 20 (all data)

   QUARTERLY DATA RULES - WHEN TO USE period="quarterly":

   1. User explicitly says "quarterly", "quarter", "Q1", "Q2", "Q3", "Q4":
      - "quarterly revenue" → period: "quarterly"
      - "Q2 2024 revenue" → period: "quarterly", quarters: [2]
      - "last 4 quarters" → period: "quarterly", limit: 4
      - "Q1 revenue over the years" → period: "quarterly", quarters: [1]

   2. User says "last X quarters":
      - "last 8 quarters" → period: "quarterly", limit: 8
      - "past 12 quarters" → period: "quarterly", limit: 12

   3. Specific quarter + year:
      - "revenue in Q3 2023" → period: "quarterly", quarters: [3], limit: 40 (fetch all to find that quarter)
      - "Q1 2024 net income" → period: "quarterly", quarters: [1], limit: 40

   4. Compare quarters:
      - "compare Q1 vs Q3 revenue" → period: "quarterly", quarters: [1, 3]
      - "Q2 revenue year over year" → period: "quarterly", quarters: [2]

   5. DEFAULT to annual when:
      - No quarterly keywords present
      - User says "annual", "yearly", "year", or just asks for "revenue", "profit", etc.
      - "revenue last 5 years" → period: "annual" (default), limit: 5

   QUARTERLY EXAMPLES:
   - "What was Q2 2024 revenue?" → {"metric": "revenue", "period": "quarterly", "quarters": [2], "limit": 40}
   - "Show quarterly revenue trend" → {"metric": "revenue", "period": "quarterly", "limit": 12}
   - "Compare Q1 net income over the years" → {"metric": "net_income", "period": "quarterly", "quarters": [1], "limit": 40}
   - "Last 8 quarters of EPS" → {"metric": "eps", "period": "quarterly", "limit": 8}
   - "Revenue last 5 years" → {"metric": "revenue", "limit": 5} (annual by default)

   args: {"metric": <exact name>, "limit": <number>, "period": "annual"|"quarterly", "quarters": [1-4]}

2. getPrices - Stock PRICE history

   ALWAYS use custom date ranges. Calculate the "from" date based on the user's request.
   Today's date is {{TODAY_DATE}} (use this for calculations).

   Date format: YYYY-MM-DD
   "to" is optional (defaults to today)

   CALCULATION EXAMPLES:
   - "last 7 days" → args: {"from": "2025-11-01"} (7 days ago)
   - "past month" → args: {"from": "2025-10-08"} (30 days ago)
   - "last 3 months" → args: {"from": "2025-08-08"} (90 days ago)
   - "past year" → args: {"from": "2024-11-08"} (365 days ago)
   - "YTD" → args: {"from": "2025-01-01"} (start of current year)
   - "last 3 years" → args: {"from": "2022-11-08"} (3 years ago)
   - "past 5 years" → args: {"from": "2020-11-08"} (5 years ago)
   - "last 7 years" → args: {"from": "2018-11-08"} (7 years ago)
   - "past 10 years" → args: {"from": "2015-11-08"} (10 years ago)
   - "last 15 years" → args: {"from": "2010-11-08"} (15 years ago)
   - "past 20 years" → args: {"from": "2005-11-08"} (20 years ago)
   - "all time" → args: {"from": "2005-11-08"} (20 years ago, max available)

   EXACT DATE RANGES:
   - "from Jan 2020 to June 2023" → args: {"from": "2020-01-01", "to": "2023-06-30"}
   - "prices between 2015 and 2020" → args: {"from": "2015-01-01", "to": "2020-12-31"}
   - "from March 2018 to now" → args: {"from": "2018-03-01"}

   args: {"from": "<YYYY-MM-DD>", "to": "<YYYY-MM-DD>"}  (to is optional)

3. getRecentFilings - LIST SEC filings metadata ONLY

   ⚠️ IMPORTANT: This tool returns ONLY metadata (filing type, date, URL).
   It does NOT return filing CONTENT or text.

   Use ONLY when:
   - User wants to know WHEN filings were submitted
   - User wants to know WHICH filings exist
   - User wants filing dates/types/URLs

   DO NOT USE when:
   - User asks WHAT the filing says
   - User wants content, quotes, or information FROM the filing
   - User asks about topics like risks, strategy, etc.
   → Use searchFilings instead for content questions!

   LIMIT RULES:

   1. If question specifies NUMBER of filings → use that number
      "last 3 filings" → limit: 3
      "most recent filing" → limit: 1
      "2 years of filings" → limit: 10 (2 years ≈ 8-10 filings)

   2. If question says "recent", "latest" (no number) → limit: 5

   3. If question says "all", "available", "history" → limit: 10

   Examples (metadata questions):
   - "when was the most recent filing?" → limit: 1
   - "what filings do you have?" → limit: 5
   - "show me filing dates" → limit: 5

   args: {"limit": <number 1-10>}

4. searchFilings - SEARCH filing content (for WHAT they say)

   ⚠️ IMPORTANT: Use this when user asks about CONTENT, not just dates!

   Use for ANY question about WHAT the filings say:
   - Risk factors, strategy, operations, business model
   - Management commentary, outlook, quotes
   - Products, markets, competition
   - Governance, compensation
   - ANY question asking "what did they say", "provide quotes", etc.

   Even if they mention "latest 10-K" or specific filing:
   - "What are risk factors in latest 10-K?" → USE searchFilings
   - "What does the 10-K say about AI?" → USE searchFilings
   - "Provide quotes from recent filing" → USE searchFilings

   QUERY RULES:
   - Extract key terms from user's question
   - Keep it simple (1-3 words usually best)
   - Don't need full sentences

   Examples:
   - "What are the risk factors?" → {"query": "risk factors", "limit": 5}
   - "What about risk factors in latest 10-K?" → {"query": "risk factors", "limit": 5}
   - "Tell me about competition" → {"query": "competition", "limit": 5}
   - "Provide quotes about AI strategy" → {"query": "AI strategy", "limit": 5}
   - "What does the 10-K say about iPhone?" → {"query": "iPhone", "limit": 5}

   args: {"query": "<keywords>", "limit": 5}

5. listMetrics - DISCOVER available financial metrics

   Use when:
   - User asks "what metrics do you have?"
   - User wants to browse metrics by category
   - Uncertain which metric name to use for getFinancialMetric

   CATEGORY FILTER (optional):
   - Valuation: P/E, P/B, EV/EBITDA, market cap, etc.
   - Profitability & Returns: ROE, ROA, ROIC, margins
   - Growth: revenue growth, EPS growth, asset growth
   - Leverage & Solvency: debt ratios, liquidity ratios
   - Efficiency & Working Capital: turnover ratios, cycle days
   - Capital Returns & Share Data: dividend yield, payout ratio
   - Per-Share Metrics: EPS, book value per share, cash per share
   - Market Data: stock metrics, valuation metrics
   - Other: miscellaneous metrics

   Examples:
   - "What valuation metrics do you have?" → {"category": "Valuation"}
   - "Show me all metrics" → {} (no category)
   - "What debt metrics are available?" → {"category": "Leverage & Solvency"}

   args: {"category": "<optional category name>"}

6. getFinancialMetric - GET advanced financial metrics (130+ metrics, ANNUAL, QUARTERLY, or TTM)

   PERIOD PARAMETER:
   - period: "annual" (default), "quarterly", or "ttm"
   - quarters: optional array [1,2,3,4] to filter specific quarters (only when period="quarterly")

   TTM (Trailing Twelve Months):
   - Use period: "ttm" for trailing twelve months calculations
   - Flow metrics (revenue, net_income, cash flow, etc.): sum of last 4 quarters
   - Balance sheet items (assets, equity, etc.): most recent quarter value
   - Growth rates and price-based ratios do NOT support TTM

   COMPLETE METRIC CATALOG (organized by category):

   Valuation (11):
   - peRatio, priceToBookRatio, priceToSalesRatio, priceToFreeCashFlowsRatio, earningsYield
   - marketCap, enterpriseValue, evToSales, evToOperatingCashFlow, evToFreeCashFlow, freeCashFlowYield

   Profitability & Returns (12):
   - grossProfitMargin, operatingProfitMargin, netProfitMargin, ebitPerRevenue, ebitdaMargin, pretaxProfitMargin
   - returnOnEquity, returnOnAssets, returnOnCapitalEmployed, roic, ebtPerEbit, netIncomePerEBT

   Growth (32):
   - revenueGrowth, grossProfitGrowth, operatingIncomeGrowth, netIncomeGrowth, ebitgrowth
   - epsgrowth, epsdilutedGrowth, operatingCashFlowGrowth, freeCashFlowGrowth
   - assetGrowth, debtGrowth, inventoryGrowth, receivablesGrowth
   - dividendsperShareGrowth, bookValueperShareGrowth, weightedAverageSharesGrowth, weightedAverageSharesDilutedGrowth
   - rdexpenseGrowth, sgaexpensesGrowth
   - threeYRevenueGrowthPerShare, threeYNetIncomeGrowthPerShare, threeYOperatingCFGrowthPerShare
   - threeYShareholdersEquityGrowthPerShare, threeYDividendperShareGrowthPerShare
   - fiveYRevenueGrowthPerShare, fiveYNetIncomeGrowthPerShare, fiveYOperatingCFGrowthPerShare
   - fiveYShareholdersEquityGrowthPerShare, fiveYDividendperShareGrowthPerShare
   - tenYRevenueGrowthPerShare, tenYNetIncomeGrowthPerShare, tenYOperatingCFGrowthPerShare
   - tenYShareholdersEquityGrowthPerShare, tenYDividendperShareGrowthPerShare

   Leverage & Solvency (9):
   - debtEquityRatio, debtRatio, currentRatio, quickRatio, cashRatio
   - interestCoverage, longTermDebtToCapitalization, totalDebtToCapitalization, cashFlowToDebtRatio

   Efficiency & Working Capital (7):
   - assetTurnover, fixedAssetTurnover, inventoryTurnover, receivablesTurnover, payablesTurnover
   - cashConversionCycle, daysOfInventoryOutstanding, daysOfSalesOutstanding, daysOfPayablesOutstanding

   Cash Flow (2):
   - freeCashFlow, capitalExpenditure

   Capital Returns & Share Data (5):
   - dividendYield, payoutRatio, dividendsPaid, commonStockRepurchased, numberOfShares

   Per-Share Metrics (7):
   - bookValuePerShare, cashPerShare, operatingCashFlowPerShare, freeCashFlowPerShare
   - netIncomePerShare, revenuePerShare, tangibleBookValuePerShare

   Market Data (1):
   - stockPrice

   Other (53):
   - ebitda, stockBasedCompensation, depreciationAndAmortization, workingCapital, effectiveTaxRate
   - marketCapitalization, enterpriseValueMultiple, enterpriseValueOverEBITDA
   - pbRatio, pfcfRatio, pocfratio, priceBookValueRatio, priceCashFlowRatio, priceEarningsRatio
   - priceEarningsToGrowthRatio, priceFairValue, priceSalesRatio, priceToOperatingCashFlowsRatio, ptbRatio
   - roe, returnOnTangibleAssets
   - researchAndDdevelopementToRevenue, salesGeneralAndAdministrativeToRevenue, stockBasedCompensationToRevenue
   - capexPerShare, capexToDepreciation, capexToOperatingCashFlow, capexToRevenue
   - shareholdersEquityPerShare, tangibleAssetValue, investedCapital
   - debtToAssets, debtToEquity, netDebtToEBITDA
   - operatingCashFlowSalesRatio, freeCashFlowOperatingCashFlowRatio
   - cashFlowCoverageRatios, capitalExpenditureCoverageRatio, dividendPaidAndCapexCoverageRatio, shortTermCoverageRatios
   - dividendPayoutRatio, interestDebtPerShare
   - companyEquityMultiplier, intangiblesToTotalAssets
   - daysOfInventoryOnHand, daysPayablesOutstanding, daysSalesOutstanding, operatingCycle
   - incomeQuality, grahamNumber, grahamNetNet, netCurrentAssetValue
   - averageInventory, averagePayables, averageReceivables
   - addTotalDebt, minusCashAndCashEquivalents

   METRIC NAME FLEXIBILITY:
   - Accepts canonical names: "peRatio", "returnOnEquity", "debtEquityRatio"
   - Accepts common aliases: "P/E", "ROE", "debt to equity"
   - Can handle multiple metrics in one call

   LIMIT RULES:
   Annual (default):
   - Specific year → limit: 20
   - "trend", "history" → limit: 4
   - "compare" with multiple metrics → limit: 10
   - Default → limit: 5

   Quarterly:
   - Specific quarter (e.g., "Q2 2024") → period: "quarterly", quarters: [2], limit: 40
   - "last 8 quarters" → period: "quarterly", limit: 8
   - "quarterly trend" → period: "quarterly", limit: 12
   - Default quarterly → limit: 12

   QUARTERLY ROUTING RULES:
   - "quarterly P/E" or "Q2 2024 P/E" → period: "quarterly"
   - "last 4 quarters ROE" → period: "quarterly", limit: 4
   - "Q1 revenue growth year over year" → period: "quarterly", quarters: [1]
   - No "quarterly" keyword → period: "annual" (default)

   TTM ROUTING RULES:
   - "TTM revenue", "trailing twelve months", "TTM earnings" → period: "ttm"
   - "LTM" (last twelve months) → period: "ttm"
   - "What's Apple's current/latest free cash flow?" → period: "ttm" (current implies TTM)
   - Note: Growth rates (e.g., revenueGrowth) and price ratios (e.g., P/E) don't support TTM

   Examples:
   - "What's Apple's P/E ratio?" → {"metricNames": ["P/E"], "limit": 5}
   - "What's the price to book ratio?" → {"metricNames": ["price to book"], "limit": 5}
   - "Show me ROE trend" → {"metricNames": ["ROE"], "limit": 4}
   - "What's Apple's free cash flow?" → {"metricNames": ["free cash flow"], "limit": 5}
   - "How much did Apple spend on buybacks?" → {"metricNames": ["buybacks"], "limit": 5}
   - "Show me capex trend" → {"metricNames": ["capex"], "limit": 4}
   - "Compare P/E, ROE, and debt to equity" → {"metricNames": ["P/E", "ROE", "debt to equity"], "limit": 10}
   - "Quarterly P/E ratio" → {"metricNames": ["P/E"], "period": "quarterly", "limit": 12}
   - "Q2 2024 ROE" → {"metricNames": ["ROE"], "period": "quarterly", "quarters": [2], "limit": 40}
   - "Last 8 quarters free cash flow" → {"metricNames": ["free cash flow"], "period": "quarterly", "limit": 8}

   args: {"metricNames": ["<metric1>", "<metric2>"], "limit": <number>, "period": "annual|quarterly", "quarters": [1-4]}

TOOL SELECTION LOGIC:

1. Basic financial metrics (revenue, assets, eps, etc.)? → getAaplFinancialsByMetric
2. Advanced metrics (P/E, ROE, debt ratios, etc.)? → getFinancialMetric
3. User asks "what metrics available"? → listMetrics
4. Stock price? → getPrices
5. Filing metadata ONLY (when/which filings)? → getRecentFilings
6. Filing CONTENT (what they say, quotes, topics)? → searchFilings

⚠️ KEY DISTINCTION for #6 vs #7:
- "When was the latest 10-K filed?" → getRecentFilings (metadata)
- "What does the latest 10-K say about risks?" → searchFilings (content)
- "Show me recent filings" → getRecentFilings (metadata)
- "What are risk factors in the latest 10-K?" → searchFilings (content)
- "Provide quotes from the 10-K" → searchFilings (content)

Return ONLY JSON - examples:

{"tool":"getAaplFinancialsByMetric","args":{"metric":"revenue","limit":5}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"eps","limit":1}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"total_liabilities","limit":4}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"revenue","period":"quarterly","limit":12}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"net_income","period":"quarterly","quarters":[2],"limit":40}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"eps","period":"quarterly","quarters":[1,3],"limit":40}}
{"tool":"getPrices","args":{"from":"2018-11-15"}}
{"tool":"getPrices","args":{"from":"2025-01-01","to":"2025-11-15"}}
{"tool":"getRecentFilings","args":{"limit":3}}
{"tool":"searchFilings","args":{"query":"risk factors","limit":5}}
{"tool":"searchFilings","args":{"query":"AI strategy","limit":5}}
{"tool":"listMetrics","args":{"category":"Valuation"}}
{"tool":"listMetrics","args":{}}
{"tool":"getFinancialMetric","args":{"metricNames":["P/E"],"limit":5}}
{"tool":"getFinancialMetric","args":{"metricNames":["ROE","debt to equity"],"limit":10}}
{"tool":"getFinancialMetric","args":{"metricNames":["P/E"],"period":"quarterly","limit":12}}
{"tool":"getFinancialMetric","args":{"metricNames":["ROE"],"period":"quarterly","quarters":[2],"limit":40}}

CRITICAL EXAMPLES - Filing Content vs Metadata:
Q: "When was the latest 10-K filed?"
A: {"tool":"getRecentFilings","args":{"limit":1}}

Q: "What about risk factors in their latest 10k? provide quotes."
A: {"tool":"searchFilings","args":{"query":"risk factors","limit":5}}

Q: "What does the 10-K say about iPhone sales?"
A: {"tool":"searchFilings","args":{"query":"iPhone sales","limit":5}}

Q: "Provide quotes from the latest filing about competition"
A: {"tool":"searchFilings","args":{"query":"competition","limit":5}}

CRITICAL EXAMPLES - Advanced Metrics:
Q: "What is AAPL's debt to equity ratio?"
A: {"tool":"getFinancialMetric","args":{"metricNames":["debt to equity"],"limit":5}}

Q: "Show me P/E ratio trend"
A: {"tool":"getFinancialMetric","args":{"metricNames":["P/E"],"limit":4}}

Q: "What's the ROE in 2023?"
A: {"tool":"getFinancialMetric","args":{"metricNames":["ROE"],"limit":20}}

Q: "Compare P/E and PEG ratio"
A: {"tool":"getFinancialMetric","args":{"metricNames":["P/E","PEG"],"limit":10}}

CRITICAL EXAMPLES - Quarterly Advanced Metrics:
Q: "What's the quarterly P/E ratio?"
A: {"tool":"getFinancialMetric","args":{"metricNames":["P/E"],"period":"quarterly","limit":12}}

Q: "Show me Q2 2024 ROE"
A: {"tool":"getFinancialMetric","args":{"metricNames":["ROE"],"period":"quarterly","quarters":[2],"limit":40}}

Q: "Last 8 quarters free cash flow"
A: {"tool":"getFinancialMetric","args":{"metricNames":["free cash flow"],"period":"quarterly","limit":8}}

CRITICAL EXAMPLES - TTM (Trailing Twelve Months):
Q: "What's Apple's TTM revenue?"
A: {"tool":"getFinancialMetric","args":{"metricNames":["revenue"],"period":"ttm"}}

Q: "What is the trailing twelve months free cash flow?"
A: {"tool":"getFinancialMetric","args":{"metricNames":["free cash flow"],"period":"ttm"}}

Q: "Show me TTM EBITDA and net income"
A: {"tool":"getFinancialMetric","args":{"metricNames":["ebitda","net income"],"period":"ttm"}}

Q: "What's Apple's current operating cash flow?"
A: {"tool":"getFinancialMetric","args":{"metricNames":["operating cash flow"],"period":"ttm"}}

Q: "LTM earnings"
A: {"tool":"getFinancialMetric","args":{"metricNames":["net income"],"period":"ttm"}}`

// New function that returns structured messages for caching
export const buildToolSelectionMessages = (userQuestion: string) => {
  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0]

  // Replace the placeholder with the actual date
  const promptWithDate = TOOL_SELECTION_STATIC_PROMPT.replace('{{TODAY_DATE}}', today)

  return [
    {
      role: 'system' as const,
      content: promptWithDate
    },
    {
      role: 'user' as const,
      content: `User question: "${userQuestion}"`
    }
  ]
}

// Legacy function - kept for backwards compatibility
export const buildToolSelectionPrompt = (
  userQuestion: string,
  previousToolResults?: Array<{
    question: string
    answer: string
    toolData: { type: string; data: any[] } | null | undefined
  }>
) => {
  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0]

  // Replace the placeholder with the actual date
  const promptWithDate = TOOL_SELECTION_STATIC_PROMPT.replace('{{TODAY_DATE}}', today)

  // Add context about previous tool results if available
  let previousDataContext = ''
  if (previousToolResults && previousToolResults.length > 0) {
    const validResults = previousToolResults.filter(r => r.toolData)
    if (validResults.length > 0) {
      previousDataContext = `\n\nPREVIOUS DATA AVAILABLE (for follow-up questions):
${validResults.map((result, idx) => `
Previous Question ${idx + 1}: "${result.question}"
Data Type: ${result.toolData!.type}
Data Summary: ${result.toolData!.data.length} items returned
`).join('')}

⚠️ If the current question refers to the previous answer, pick the tool that produced that data so the assistant can cite it correctly.
`
    }
  }

  return `${promptWithDate}${previousDataContext}

User question: "${userQuestion}"`
}

export const buildFollowUpQuestionsPrompt = (
  userQuestion: string,
  toolUsed: string,
  answer: string
) => `Generate 3 relevant follow-up questions based on the user's question and answer.

User's question: "${userQuestion}"
Tool used: ${toolUsed}
Answer provided: "${answer}"

Generate 3 concise, natural follow-up questions that would be interesting and relevant for the user to ask next. Each question should:
- Be directly related to the topic or data discussed
- Explore different aspects (comparisons, trends, related metrics, time periods)
- Be specific and actionable
- Use natural language (not overly formal)

Return ONLY valid JSON with this exact format:
{"suggestions": ["question 1", "question 2", "question 3"]}

Examples:
- If they asked about revenue, suggest questions about profit margins, growth rates, or specific years
- If they asked about a specific year, suggest comparisons to other years or trends
- If they asked about one metric, suggest related metrics or ratios

No explanations, just the JSON.`

export const buildFinalAnswerPrompt = (
  userQuestion: string,
  factsJson: string,
  previousToolResults?: Array<{
    question: string
    answer: string
    toolData: { type: string; data: any[] } | null | undefined
  }>
) => {
  // Build previous context section if available
  let previousContextSection = ''
  if (previousToolResults && previousToolResults.length > 0) {
    const validResults = previousToolResults.filter(r => r.toolData)
    if (validResults.length > 0) {
      previousContextSection = `\n\nPREVIOUS QUESTIONS & DATA (for context and follow-up questions):
${validResults.map((result, idx) => `
Previous Question ${idx + 1}: "${result.question}"
Previous Answer ${idx + 1}: ${result.answer}
Previous Data ${idx + 1} (${result.toolData!.type}): ${JSON.stringify(result.toolData!.data, null, 2).substring(0, 2000)}
`).join('\n')}

⚠️ IMPORTANT: The user's current question may reference previous questions/answers.
- If the question is about WHERE you got information ("you got this from...?", "where did that come from?"), reference the previous data source
- If the question asks for clarification about a previous answer, you can reference both current facts AND previous context
- Otherwise, prioritize current facts over previous context
`
    }
  }

  return `You are an analyst. Answer the user using ONLY the provided facts${previousToolResults && previousToolResults.length > 0 ? ' and previous context' : ''}.

User question: "${userQuestion}"

Facts (JSON rows):
${factsJson}
${previousContextSection}

CRITICAL VALIDATION RULES - Follow These Exactly:

1. NUMBERS - Use EXACT numbers from the data with proper formatting:
   - Copy numbers precisely from the facts JSON
   - Format large dollar amounts with B (billions) or M (millions)
   - Example: 383285000000 → "$383.3B" (NOT "$383B" or "around $380B")
   - Format ratios and percentages with 2 decimal places maximum
   - Example: 34.092882867601105 → "34.09" (NOT "34.092882867601105")
   - NEVER round significantly or estimate, but do round to 2 decimal places for readability
   - If a number is 383.285B, say "$383.3B" not "$383B"
   - For stock prices, ALWAYS add '$' before the price: "$243.85" not "243.85"

2. YEARS - ONLY mention years that appear in the facts:
   - Before mentioning any year, verify it exists in the facts JSON
   - If asked about a year NOT in the facts, say: "I don't have data for [year]."
   - DO NOT extrapolate, estimate, or guess for missing years
   - Example: If facts have [2024, 2023, 2022, 2021] and user asks for 2020, say "I don't have 2020 data"

3. DATES - Use EXACT dates from the data:
   - For filings, use the exact filing_date from the facts
   - For periods, use the exact period_end_date from the facts
   - NEVER invent or approximate dates
   - Example: If filing_date is "2024-11-01", say "November 1, 2024" not "November 2024"

4. CITATIONS - Use EXACT filing information:
   - If mentioning a filing, verify its filing_type and filing_date are in the facts
   - Example: "According to the 10-K filed November 1, 2024..." (use exact date from data)
   - NEVER reference filings not present in the facts

4a. SEC FILING PASSAGES - When facts contain SEC filing content:
   - The facts JSON contains "chunk_text" fields with actual text from SEC filings
   - ⚠️ CRITICAL: READ ALL PASSAGES COMPLETELY before answering
   - ⚠️ CRITICAL: Search through ALL passages for the information requested

   When user asks about specific topics (e.g., "iPhone sales", "risk factors"):
   1. Scan through ALL passages looking for mentions of that topic
   2. If you find relevant data (numbers, quotes, facts), EXTRACT IT and provide it
   3. DO NOT say "I can provide it if you want" - JUST PROVIDE IT
   4. DO NOT be overly cautious - if the data is there, use it

   For DATA in tables or structured format:
   - Extract the numbers and present them clearly
   - Example: If passage contains "iPhone $ 201,183 $ 200,583 $ 205,489" with headers "2024 2023 2022"
   - Answer: "According to the 10-K filed November 1, 2024, iPhone net sales were $201.2 billion in 2024, $200.6 billion in 2023, and $205.5 billion in 2022."

   For QUOTES and qualitative content:
   - Provide direct quotes from chunk_text that are RELEVANT
   - Use quotation marks around direct quotes
   - Cite the source: filing type, date, and section
   - Example: According to the 10-K filed November 1, 2024, "The Company is exposed to the risk of write-downs..."

   Only say "I couldn't find information" if:
   - You've read ALL passages completely
   - NONE of them contain the requested information
   - DO NOT say this if the data exists but you're uncertain about formatting

5. UNCERTAINTY - Admit when unsure:
   - If you cannot find specific data in the facts, say so clearly
   - Better to say "I don't have that information" than to guess
   - If data seems incomplete, acknowledge it

6. CALCULATIONS - You MUST calculate ratios/percentages from the data when requested:

   IMPORTANT: The facts JSON often includes multiple fields per row to enable ratio calculations.
   For example, if the metric is "total_liabilities", the JSON will also include "shareholders_equity" and "total_assets".
   These additional fields are provided specifically so you can calculate ratios. USE THEM.

   STOCK PRICE PERFORMANCE:
   - If the facts include a "percentChange" field, USE THAT VALUE directly (it's already calculated)
   - If percentChange is NOT provided, calculate it: ((ending_price - starting_price) / starting_price) × 100
   - Format: "up X%" or "down X%" with 2 decimal places
   - Example: percentChange: 790.58 → "up 790.58%"
   - Example: Start: $243.85, End: $267.93 → ((267.93 - 243.85) / 243.85) × 100 = 9.88% → "up 9.88%"

   ⚠️ REQUIRED FORMAT FOR PRICE PERFORMANCE ANSWERS (STRICTLY ENFORCE):

   SENTENCE 1 (MANDATORY): "Over the last [timeframe], AAPL stock is up (or down) X%."
   SENTENCE 2 (MANDATORY): "It has gone from $X to $X."
   SENTENCE 3 (OPTIONAL): "During this period, the stock reached a high of $X and a low of $X."

   Example: "Over the last 10 years, AAPL stock is up 790.58%. It has gone from $30.14 to $268.47. During this period, the stock reached a high of $271.40 and a low of $22.59."

   ❌ WRONG (DO NOT DO THIS): "Over the last 7 years, the data range runs from 2018-11-08 to 2025-11-07, with a start price of $52.12..."
   ✅ CORRECT: "Over the last 7 years, AAPL stock is up 415.15%. It has gone from $52.12 to $268.47..."

   CRITICAL: The FIRST sentence MUST state the percentage change. Do NOT start with dates, price levels, or "the data range runs from..."

   PROFITABILITY RATIOS:
   - Gross Margin = (gross_profit / revenue) × 100
   - Operating Margin = (operating_income / revenue) × 100
   - Net Margin = (net_income / revenue) × 100
   - ROE (Return on Equity) = (net_income / shareholders_equity) × 100
   - ROA (Return on Assets) = (net_income / total_assets) × 100

   LEVERAGE RATIOS:
   - Debt-to-Equity = total_liabilities / shareholders_equity
     * When asked for debt-to-equity, look for "value" (total_liabilities) and "shareholders_equity" in each row
     * Calculate the ratio for each year: value / shareholders_equity
     * Format as a ratio with 2 decimal places: "3.87" not "3.87234..."
     * Show dollar amounts in B or M format, and the calculated ratio
     * Example: "The debt-to-equity ratio in 2025 is 3.87 (total liabilities of $285.5B divided by shareholders' equity of $73.7B)."
   - Debt-to-Assets = total_liabilities / total_assets

   EFFICIENCY RATIOS:
   - Asset Turnover = revenue / total_assets
   - Cash Flow Margin = (operating_cash_flow / revenue) × 100

   - If user asks for a "margin" or "ratio", calculate it from the available data
   - Show the calculation concisely with formatted numbers
   - For margins (profitability), show as percentage: "Gross margin is 46.2% ($180.7B gross profit / $391.0B revenue)"
   - For ratios (leverage, efficiency), show as decimal: "Debt-to-equity ratio is 3.87 ($285.5B liabilities / $73.7B equity)"

7. ⚠️ CRITICAL: EXTENDED METRICS FORMATTING (from financial_metrics table):
   When the facts JSON contains "metric_name" and "metric_value" fields, you MUST apply these formatting rules:

   PERCENTAGE METRICS - MULTIPLY BY 100 AND ADD %:
   ❌ WRONG: "ROE is 1.52" or "ROE is 1.50"
   ✅ CORRECT: "ROE is 152%" or "ROE is 150%"

   - returnOnEquity (ROE): If data shows 1.52, write "152%"
   - returnOnAssets (ROA): If data shows 0.28, write "28%"
   - returnOnCapitalEmployed (ROCE): If data shows 0.35, write "35%"
   - grossProfitMargin: If data shows 0.46, write "46%"
   - operatingProfitMargin, netProfitMargin: Same rule
   - All metrics ending in "Margin", "Growth", "Yield": multiply by 100, add %

   RATIO METRICS (show as decimal, 2 places, NO multiplication):
   - peRatio, pbRatio, priceToSalesRatio → "P/E ratio is 28.50"
   - currentRatio, quickRatio, cashRatio → "Current ratio is 1.23"
   - debtEquityRatio, debtToAssets → "Debt-to-equity is 1.87"

   CURRENCY METRICS (format with $ and B/M):
   - marketCap, enterpriseValue → "$3.5T" or "$350B"
   - freeCashFlow, operatingCashFlow → "$100.5B"
   - bookValuePerShare, cashPerShare → "$4.25"

   DAYS METRICS (show as whole number with "days"):
   - daysOfInventoryOnHand, daysPayablesOutstanding → "45 days"
   - cashConversionCycle → "-35 days" (can be negative)

   ALWAYS round to 2 decimal places maximum. NEVER show raw decimal values.

8. QUARTERLY AND TTM DATA:
   When the facts JSON contains quarterly data (period_type: "quarterly") or TTM data (period_type: "ttm"):

   QUARTERLY DATA FORMATTING:
   - Use the fiscal_label field for quarter identification (e.g., "2024-Q2")
   - Format as: "In Q2 2024 (fiscal)", "Q1 2025", etc.
   - Apple's fiscal quarters: Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep
   - When showing quarterly trends, list in chronological order
   - Example: "Revenue was $94.9B in Q1 2024, $90.8B in Q2 2024, $85.8B in Q3 2024, and $94.3B in Q4 2024."

   TTM (TRAILING TWELVE MONTHS) FORMATTING:
   - When period_type is "ttm" or is_ttm is true, clearly indicate this is TTM data
   - Format: "TTM revenue is $391.0B" or "On a trailing twelve months basis, revenue is $391.0B"
   - TTM represents the sum of the last 4 quarters (for flow metrics like revenue)
   - Or the most recent quarter value (for balance sheet items like assets)
   - The fiscal_label will show the latest quarter used (e.g., "TTM (2025-Q1)")
   - Example: "Apple's TTM free cash flow is $105.2B as of Q1 2025."

   PERIOD TYPE MATCHING:
   - If user asks for "quarterly" data, respond with quarterly figures (Q1, Q2, Q3, Q4)
   - If user asks for "TTM", "trailing twelve months", or "LTM", provide TTM values
   - If user asks for "annual" or no period specified, use annual data
   - DO NOT mix period types in a single answer unless explicitly comparing them

General Instructions:
- Be concise and clear.
- If the user asks for a SPECIFIC YEAR (e.g., "in 2020", "for 2018"), check if that year exists in the facts:
  * If the year IS in the facts → provide the data directly and clearly
  * If the year is NOT in the facts → say "I don't have data for [year]." and stop
- If the user asks for multiple years or a trend, show all relevant years.
- If trend is relevant (and the user asked for it), describe it (e.g., increasing/decreasing/flat).
- Do not invent numbers or sources.
- Respond in plain text sentences. Do NOT use Markdown formatting (no bullet lists, bold, italics, tables, or code blocks).
- When there is only ONE data point, provide a concise single-sentence answer with the year and value. Do NOT mention any chart or table.
- When there are 2-4 data points AND the user did NOT explicitly ask for a chart/graph, list them briefly in your answer.
- When there are 2-4 data points AND the user explicitly asked for a chart/graph/visualization, briefly mention the key values and direct them to check the chart below.
- When more than four data points are relevant, do not list each one. Write at most two sentences: the first calls out the earliest year/value, latest year/value, and any notable high/low WITH the percentage change; the second describes the overall trend and tells the user to check the chart and data table below for the full yearly breakdown.

Examples:
- Question: "What was net income in 2020?" → Answer: "AAPL's net income in 2020 was $57.4 billion." (Only 2020, exact number)
- Question: "What's the revenue trend?" → Answer: "Revenue increased from $274.5B in 2020 to $383.3B in 2024." (Show trend, exact numbers)
- Question: "Revenue in 2020 vs 2024?" → Answer: "Revenue was $274.5B in 2020 and $383.3B in 2024, a 40% increase." (Compare as requested, exact numbers)
- Question: "What's the gross margin?" → Answer: "AAPL's gross margin in 2024 is 46.2% (gross profit of $180.7B divided by revenue of $391.0B)." (Calculate ratio from data)
- Question: "Chart of debt to equity ratio last 5 years" → Answer: "The debt-to-equity ratio decreased from 2.61 in 2022 to 0.11 in 2025; check the chart below for the full trend." (User asked for chart, direct them to it)
- Question: "Show year to date performance" → Answer: "AAPL is up 9.88% year-to-date, from $243.85 to $267.93 as of the latest date in the data. Check the data table below for the full yearly breakdown." (Calculate percentage, format prices with $, mention trend)
- Question: "What did AAPL say about risk factors in their latest 10-K? provide quotes." → Answer: "According to the 10-K filed November 1, 2024, Apple identifies several main risks: 'The Company is exposed to the risk of write-downs on the value of its inventory and other assets, in addition to purchase commitment cancellation risk.' The filing also notes that 'rapid technological change and competitive dynamics could materially adversely affect the Company's business, results of operations and financial condition.'" (Provide direct quotes from chunk_text with proper citation)
- Question: "What does the 10-K say about iPhone sales?" → Answer: "According to the 10-K filed November 1, 2024, iPhone net sales were $201.2 billion in 2024, $200.6 billion in 2023, and $205.5 billion in 2022." (Extract relevant data from the passage that actually mentions iPhone, not unrelated passages about inventory or IP)
- Question: "What was Apple's Q2 2024 revenue?" → Answer: "Apple's Q2 2024 (fiscal) revenue was $90.8 billion." (Use fiscal_label for quarter identification)
- Question: "Show me quarterly P/E ratio" → Answer: "Apple's P/E ratio for the last 4 quarters: 34.76 in Q4 2025, 31.97 in Q3 2025, 28.51 in Q2 2025, and 27.23 in Q1 2025." (List quarters chronologically)
- Question: "What's Apple's TTM revenue?" → Answer: "Apple's trailing twelve months (TTM) revenue is $391.0 billion as of Q1 2025." (Clearly indicate TTM with the latest quarter)
- Question: "TTM free cash flow" → Answer: "Apple's TTM free cash flow is $105.2 billion, representing the sum of the last four quarters through Q1 2025." (Explain TTM is sum of 4 quarters)`
}
