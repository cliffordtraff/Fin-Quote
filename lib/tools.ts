// Definitions for AI-exposed tools and prompt templates

export type ToolName = 'getAaplFinancialsByMetric' | 'getPrices'

export type ToolDefinition = {
  name: ToolName
  description: string
  args: Record<string, string>
  notes?: string
}

export const TOOL_MENU: ToolDefinition[] = [
  {
    name: 'getAaplFinancialsByMetric',
    description: 'Get AAPL revenue or gross_profit for the most recent years.',
    args: {
      metric: 'revenue | gross_profit',
      limit: 'integer 1–8 (defaults to 4)',
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
]

export const buildToolSelectionPrompt = (userQuestion: string) => `You are a router. Choose exactly one tool from the provided menu and return ONLY valid JSON: {"tool": string, "args": object}. No prose.

Available Tools:
1. getAaplFinancialsByMetric - Use for questions about revenue, gross profit, or financial statement metrics
   - args: {"metric": "revenue" | "gross_profit", "limit": 1-8}

2. getPrices - Use for questions about stock price, share price, or market price trends
   - args: {"range": "7d" | "30d" | "90d"}

Rules:
- Ticker is fixed to AAPL (MVP)
- Choose the tool that best matches the question
- Return ONLY valid JSON, no explanation

User question: "${userQuestion}"

Return ONLY JSON. Examples:
{"tool":"getAaplFinancialsByMetric","args":{"metric":"revenue","limit":4}}
{"tool":"getPrices","args":{"range":"30d"}}`

export const buildFinalAnswerPrompt = (
  userQuestion: string,
  factsJson: string
) => `You are an analyst. Answer the user using ONLY the provided facts. If the facts are missing or insufficient, say you don’t know.

User question: "${userQuestion}"

Facts (JSON rows):
${factsJson}

Instructions:
- Be concise and clear.
- If trend is relevant, describe it (e.g., increasing/decreasing/flat).
- Do not invent numbers or sources.
- If unsure or data missing, say you don’t know.`


