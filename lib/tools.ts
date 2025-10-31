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
      limit: 'integer 1–10 (defaults to 4)',
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

export const buildToolSelectionPrompt = (userQuestion: string) => `You are a router. Choose exactly one tool from the provided menu and return ONLY valid JSON: {"tool": string, "args": object}. No prose.

Available Tools:
1. getAaplFinancialsByMetric - Use for questions about financial NUMBERS from statements
   - Income Statement: revenue, gross_profit, net_income, operating_income
   - Balance Sheet: total_assets, total_liabilities, shareholders_equity
   - Cash Flow: operating_cash_flow
   - Per Share: eps
   - args: {"metric": <one of above>, "limit": 1-10}

2. getPrices - Use for questions about stock price, share price, or market price trends
   - args: {"range": "7d" | "30d" | "90d"}

3. getRecentFilings - Use to LIST recent filings (metadata: dates, types, links)
   - args: {"limit": 1-10}

4. searchFilings - Use to answer questions ABOUT filing content (risks, strategy, commentary, business description)
   - Keywords: "what risks", "what did", "describe", "explain", "strategy", "management said", "business model"
   - args: {"query": "<user question>", "limit": 5}

Rules:
- Ticker is fixed to AAPL (MVP)
- Choose the tool that best matches the question
- Use searchFilings for qualitative content questions, getRecentFilings for listing filings
- IMPORTANT: Look at conversation history to resolve references like "that", "it", "same period", etc.
- If user says "What about X?" and previously asked about metric Y over N years, use same N years for metric X
- If user asks for different timeframe without mentioning metric, use metric from previous question
- Return ONLY valid JSON, no explanation

Conversation Context Examples:
Previous: "AAPL revenue over 5 years"
Current: "What about net income?" → {"tool":"getAaplFinancialsByMetric","args":{"metric":"net_income","limit":5}}

Previous: "Stock price for 30 days"
Current: "What about 90 days?" → {"tool":"getPrices","args":{"range":"90d"}}

User question: "${userQuestion}"

Return ONLY JSON. Examples:
Financial metrics:
{"tool":"getAaplFinancialsByMetric","args":{"metric":"revenue","limit":4}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"eps"}}

Stock prices:
{"tool":"getPrices","args":{"range":"30d"}}
{"tool":"getPrices","args":{"range":"90d"}}

List filings (when asking for documents/metadata):
{"tool":"getRecentFilings","args":{"limit":5}}
{"tool":"getRecentFilings","args":{"limit":10}}

Search content (when asking WHAT/HOW/WHY about topics):
{"tool":"searchFilings","args":{"query":"risk factors","limit":5}}
{"tool":"searchFilings","args":{"query":"supply chain risks","limit":5}}
{"tool":"searchFilings","args":{"query":"competitive position","limit":5}}`

export const buildFinalAnswerPrompt = (
  userQuestion: string,
  factsJson: string
) => `You are an analyst. Answer the user using ONLY the provided facts.

User question: "${userQuestion}"

Facts (JSON rows):
${factsJson}

Instructions:
- Be concise and clear.
- FIRST, check if you have all the data requested. If not, START your answer by explaining what data you DO have (e.g., "I have data for the last 10 years (2015-2024), not 15 years as requested.").
- THEN provide your analysis using the available data.
- If trend is relevant, describe it (e.g., increasing/decreasing/flat).
- Do not invent numbers or sources.
- Only say "I don't know" if you have ZERO relevant data.`


