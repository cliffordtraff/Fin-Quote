// Definitions for AI-exposed tools and prompt templates

export type ToolName = 'getAaplFinancialsByMetric' | 'getPrices' | 'getRecentFilings' | 'searchFilings'

export type ToolDefinition = {
  name: ToolName
  description: string
  args: Record<string, string>
  notes?: string
}

export const TOOL_MENU: ToolDefinition[] = [
  {
    name: 'getAaplFinancialsByMetric',
    description: 'Get AAPL financial metrics (income statement, balance sheet, cash flow) for recent years.',
    args: {
      metric: 'revenue | gross_profit | net_income | operating_income | total_assets | total_liabilities | shareholders_equity | operating_cash_flow | eps',
      limit: 'integer 1–20 (defaults to 4)',
    },
    notes: 'Ticker is fixed to AAPL for MVP.',
  },
  {
    name: 'getPrices',
    description: 'Get AAPL stock price history for recent periods.',
    args: {
      range: '7d | 30d | 90d',
    },
    notes: 'Returns daily closing prices. Ticker is fixed to AAPL for MVP.',
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
]

export const buildToolSelectionPrompt = (userQuestion: string) => `You are a router. Choose exactly one tool and return ONLY valid JSON: {"tool": string, "args": object}. No prose.

Available Tools:

1. getAaplFinancialsByMetric - Financial metrics as NUMBERS over time

   SUPPORTED METRICS:
   - revenue
   - gross_profit
   - net_income
   - operating_income
   - total_assets
   - total_liabilities
   - shareholders_equity
   - operating_cash_flow
   - eps

   METRIC MAPPING (with context clues):

   Income/Profitability:
   - "sales", "revenue", "top line" → revenue
   - "profit", "earnings", "bottom line", "profitability" → net_income
   - "EPS", "earnings per share", "P/E ratio", "PE" → eps
   - "operating profit", "EBIT", "operating margin" → operating_income
   - "gross profit", "gross margin" → gross_profit
   - "net margin", "net profit margin", "profit margin" → net_income
   - "ROE", "return on equity" → net_income (will calculate: net_income / shareholders_equity)
   - "ROA", "return on assets" → net_income (will calculate: net_income / total_assets)

   Balance Sheet:
   - "assets", "total assets", "asset turnover" → total_assets
   - "liabilities", "total debt", "debt", "debt to equity", "debt to assets", "leverage" → total_liabilities
   - "equity", "book value", "shareholders equity" → shareholders_equity
   - "cash and equivalents", "cash on hand", "cash position" (balance sheet) → total_assets

   Cash Flow:
   - "cash flow", "operating cash", "free cash flow", "FCF", "cash flow margin" → operating_cash_flow

   Other (use closest available):
   - "R&D", "research", "development", "capex", "buybacks", "dividends", "margins", "ratios" → operating_income

   LIMIT RULES - CRITICAL:

   1. If question asks for a SPECIFIC YEAR (2020, 2019, 2015, 2006, etc.) → limit: 20
      Why: We have 20 years (2006-2025). To find any specific year, fetch all.
      Examples:
      - "net income in 2020" → limit: 20
      - "revenue for 2018" → limit: 20
      - "What was EPS in 2006?" → limit: 20

   2. If question specifies a NUMBER of years, use that EXACT number:
      "last 3 years" → limit: 3
      "past 5 years" → limit: 5
      "last year" or "most recent year" → limit: 1
      "10 years" → limit: 10
      "20 years" → limit: 20
      "2 years" → limit: 2

   3. If question says "trend", "history", "over time" WITHOUT a number → limit: 4

   4. If question says "all", "complete", "full history" → limit: 20

   5. If question is just asking for the metric (no time context) → limit: 4

   Examples:
   - "net income in 2006" → limit: 20 (specific year)
   - "revenue over 5 years" → limit: 5 (number specified)
   - "show me net income trend" → limit: 4 (no number)
   - "EPS history" → limit: 4 (no number)
   - "gross profit" → limit: 4 (no number)
   - "all historical data" → limit: 20 (all data)

   args: {"metric": <exact name>, "limit": <number 1-20>}

2. getPrices - Stock PRICE history

   SUPPORTED RANGES:
   - 7d (one week)
   - 30d (one month)
   - 90d (one quarter)

   RANGE MAPPING - CRITICAL:

   For 7d (use when):
   - "today", "current price", "now", "latest"
   - "this week", "past week", "5 days"
   - "recent" or "recently" (without other context)

   For 30d (use when):
   - "month", "30 days", "this month", "past month"
   - "price" (ambiguous, default to 30d)
   - "how's the stock doing" (ambiguous, default to 30d)

   For 90d (use when):
   - "quarter", "Q1", "90 days", "3 months"
   - "6 months", "half year" (closest available)
   - "year", "YTD", "12 months", "annual" (closest available)
   - "long term", "historical"

   Examples:
   - "What's the price?" → 30d (ambiguous defaults to month)
   - "How's the stock doing?" → 30d
   - "Price today" → 7d
   - "Show me 1 year performance" → 90d
   - "6 month chart" → 90d

   args: {"range": "7d" | "30d" | "90d"}

3. getRecentFilings - LIST SEC filings metadata

   LIMIT RULES:

   1. If question specifies NUMBER of filings → use that number
      "last 3 filings" → limit: 3
      "most recent filing" → limit: 1
      "2 years of filings" → limit: 10 (2 years ≈ 8-10 filings)

   2. If question says "recent", "latest" (no number) → limit: 5

   3. If question says "all", "available", "history" → limit: 10

   Examples:
   - "recent filings" → limit: 5
   - "last 3 10-Ks" → limit: 3
   - "most recent filing" → limit: 1
   - "all available reports" → limit: 10
   - "filing history" → limit: 10

   args: {"limit": <number 1-10>}

4. searchFilings - SEARCH filing content

   Use for qualitative questions about:
   - Risks, strategy, operations, business model
   - Management commentary, outlook
   - Products, markets, competition
   - Governance, compensation

   QUERY RULES:
   - Extract key terms from user's question
   - Keep it simple (1-3 words usually best)
   - Don't need full sentences

   Examples:
   - "What are the risk factors?" → query: "risk factors"
   - "Tell me about competition" → query: "competition"
   - "Search for AI mentions" → query: "AI"

   args: {"query": "<keywords>", "limit": 5}

TOOL SELECTION LOGIC:

1. Numbers/metrics over time? → getAaplFinancialsByMetric
2. Stock price? → getPrices
3. List filings? → getRecentFilings
4. Qualitative content search? → searchFilings

User question: "${userQuestion}"

Return ONLY JSON - examples:

{"tool":"getAaplFinancialsByMetric","args":{"metric":"revenue","limit":5}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"eps","limit":1}}
{"tool":"getPrices","args":{"range":"30d"}}
{"tool":"getRecentFilings","args":{"limit":3}}
{"tool":"searchFilings","args":{"query":"risk factors","limit":5}}`

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
  factsJson: string
) => `You are an analyst. Answer the user using ONLY the provided facts.

User question: "${userQuestion}"

Facts (JSON rows):
${factsJson}

CRITICAL VALIDATION RULES - Follow These Exactly:

1. NUMBERS - Use EXACT numbers from the data:
   - Copy numbers precisely from the facts JSON
   - Format large numbers with B (billions) or M (millions)
   - Example: 383285000000 → "$383.3B" (NOT "$383B" or "around $380B")
   - NEVER round significantly or estimate
   - If a number is 383.285B, say "$383.3B" not "$383B"

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

5. UNCERTAINTY - Admit when unsure:
   - If you cannot find specific data in the facts, say so clearly
   - Better to say "I don't have that information" than to guess
   - If data seems incomplete, acknowledge it

6. CALCULATIONS - You MUST calculate ratios/percentages from the data when requested:

   IMPORTANT: The facts JSON often includes multiple fields per row to enable ratio calculations.
   For example, if the metric is "total_liabilities", the JSON will also include "shareholders_equity" and "total_assets".
   These additional fields are provided specifically so you can calculate ratios. USE THEM.

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
   - Debt-to-Assets = total_liabilities / total_assets

   EFFICIENCY RATIOS:
   - Asset Turnover = revenue / total_assets
   - Cash Flow Margin = (operating_cash_flow / revenue) × 100

   - If user asks for a "margin" or "ratio", calculate it from the available data
   - Show the calculation briefly: "Gross margin is 46.2% ($180.7B gross profit / $391.0B revenue)"
   - For leverage ratios like debt-to-equity, show it as a ratio: "Debt-to-equity ratio is 2.1 (total liabilities of $290B / shareholders equity of $138B)"

General Instructions:
- Be concise and clear.
- If the user asks for a SPECIFIC YEAR (e.g., "in 2020", "for 2018"), check if that year exists in the facts:
  * If the year IS in the facts → provide the data directly and clearly
  * If the year is NOT in the facts → say "I don't have data for [year]." and stop
- If the user asks for multiple years or a trend, show all relevant years.
- If trend is relevant (and the user asked for it), describe it (e.g., increasing/decreasing/flat).
- Do not invent numbers or sources.
- Respond in plain text sentences. Do NOT use Markdown formatting (no bullet lists, bold, italics, tables, or code blocks).
- When more than four data points are relevant, do not list each one. Write at most two sentences: the first calls out the earliest year/value, latest year/value, and any notable high/low; the second describes the overall trend and tells the user to check the data table below for the full yearly breakdown.

Examples:
- Question: "What was net income in 2020?" → Answer: "AAPL's net income in 2020 was $57.4 billion." (Only 2020, exact number)
- Question: "What's the revenue trend?" → Answer: "Revenue increased from $274.5B in 2020 to $383.3B in 2024." (Show trend, exact numbers)
- Question: "Revenue in 2020 vs 2024?" → Answer: "Revenue was $274.5B in 2020 and $383.3B in 2024, a 40% increase." (Compare as requested, exact numbers)
- Question: "What's the gross margin?" → Answer: "AAPL's gross margin in 2024 is 46.2% (gross profit of $180.7B divided by revenue of $391.0B)." (Calculate ratio from data)`
