import OpenAI from 'openai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Copy of the buildToolSelectionPrompt function
const buildToolSelectionPrompt = (userQuestion) => `You are a router. Choose exactly one tool and return ONLY valid JSON: {"tool": string, "args": object}. No prose.

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
   - "operating profit", "EBIT" → operating_income
   - "gross profit", "gross margin" → gross_profit

   Balance Sheet:
   - "assets", "total assets" → total_assets
   - "liabilities", "total debt", "debt", "debt to equity" → total_liabilities
   - "equity", "book value", "shareholders equity", "ROE", "return on equity" → shareholders_equity
   - "cash and equivalents", "cash on hand", "cash position" (balance sheet) → total_assets

   Cash Flow:
   - "cash flow", "operating cash", "free cash flow", "FCF" → operating_cash_flow

   Other (use closest available):
   - "R&D", "research", "development", "capex", "buybacks", "dividends", "margins", "ratios" → operating_income

   LIMIT RULES - CRITICAL:

   1. If question asks for a SPECIFIC YEAR (2020, 2019, 2015, etc.) → limit: 10
      Why: We only have 10 years (2015-2024). To find any specific year, fetch all.
      Examples:
      - "net income in 2020" → limit: 10
      - "revenue for 2018" → limit: 10
      - "What was EPS in 2015?" → limit: 10

   2. If question specifies a NUMBER of years, use that EXACT number:
      "last 3 years" → limit: 3
      "past 5 years" → limit: 5
      "last year" or "most recent year" → limit: 1
      "10 years" → limit: 10
      "2 years" → limit: 2

   3. If question says "trend", "history", "over time" WITHOUT a number → limit: 4

   4. If question says "all", "complete", "full history" → limit: 10

   5. If question is just asking for the metric (no time context) → limit: 4

   Examples:
   - "net income in 2020" → limit: 10 (specific year)
   - "revenue over 5 years" → limit: 5 (number specified)
   - "show me net income trend" → limit: 4 (no number)
   - "EPS history" → limit: 4 (no number)
   - "gross profit" → limit: 4 (no number)
   - "all historical data" → limit: 10 (all data)

   args: {"metric": <exact name>, "limit": <number 1-10>}

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
{"tool":"searchFilings","args":{"query":"risk factors","limit":5}}`;

// Test the query
const userQuestion = "insights from AAPL's last 10k";
const prompt = buildToolSelectionPrompt(userQuestion);

console.log('Testing tool selection for:', userQuestion);
console.log('\nCalling OpenAI...\n');

const response = await openai.chat.completions.create({
  model: process.env.OPENAI_MODEL || 'gpt-5-nano',
  messages: [{ role: 'user', content: prompt }],
  max_completion_tokens: 150,
});

const result = response.choices[0]?.message?.content;
console.log('Raw response:', result);
console.log('\nParsed result:');
console.log(JSON.stringify(JSON.parse(result), null, 2));
