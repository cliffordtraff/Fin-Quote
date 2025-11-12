/**
 * Add improved prompt v4 to database
 *
 * Key improvements over v3:
 * - Better metric mapping for buybacks/ROE edge cases
 * - Stronger number parsing for limits
 * - Better range defaults for ambiguous queries
 *
 * Target: 87% accuracy (from 77%)
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const TOOL_SELECTION_PROMPT_V4 = `You are a router. Choose exactly one tool and return ONLY valid JSON: {"tool": string, "args": object}. No prose.

User question: "{{USER_QUESTION}}"

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
   - "ROE", "return on equity" → net_income (profitability measure)

   Balance Sheet:
   - "assets", "total assets" → total_assets
   - "liabilities", "total debt", "debt", "debt to equity" → total_liabilities
   - "equity", "book value", "shareholders equity", "price to book", "P/B" → shareholders_equity
   - "cash and equivalents", "cash on hand", "cash position" (balance sheet) → total_assets

   Cash Flow:
   - "cash flow", "operating cash" → operating_cash_flow
   - "free cash flow", "FCF" → operating_cash_flow
   - "buybacks", "share repurchase", "stock buyback" → operating_cash_flow

   Other (use closest available):
   - "R&D", "research", "development", "capex", "dividends" → operating_income

   LIMIT RULES - CRITICAL:

   1. If question contains a NUMBER, extract and use it:
      "last 3 years" → limit: 3
      "past 5 years" → limit: 5
      "last year" → limit: 1
      "10 years" → limit: 10
      "15 filings" → limit: 15
      "2 quarters" → limit: 2

   2. If question says "trend", "history", "over time" WITHOUT a number → limit: 4

   3. Special cases:
      - "all available", "complete" → limit: 20
      - "all", "full history" → limit: 10

   4. Default (just asking for metric) → limit: 4

   Examples:
   - "revenue over 5 years" → limit: 5
   - "show 15 filings" → limit: 15
   - "net income trend" → limit: 4
   - "all available reports" → limit: 20

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
   - "trading", "how's it trading" (very recent activity)

   For 30d (use when):
   - "month", "30 days", "this month", "past month"
   - "price" (general, no time specified)
   - "recent" (general)

   For 90d (use when):
   - "quarter", "Q1", "90 days", "3 months"
   - "6 months", "half year" (closest available)
   - "year", "YTD", "12 months", "annual" (closest available)
   - "long term", "historical", "all time" (need max range)

   Examples:
   - "What's the price?" → 30d
   - "How's it trading?" → 7d (recent activity)
   - "All time high?" → 90d (need full range)
   - "Show me 1 year" → 90d
   - "6 month chart" → 90d

   args: {"range": "7d" | "30d" | "90d"}

3. getRecentFilings - LIST SEC filings metadata

   LIMIT RULES:

   1. If question contains a NUMBER, extract and use it:
      "last 3 filings" → limit: 3
      "15 filings" → limit: 15
      "most recent filing" → limit: 1

   2. Special phrases:
      - "2 years of filings" → limit: 10 (2 years ≈ 8-10 filings)
      - "all available", "all reports" → limit: 20
      - "filing history", "all filings" → limit: 10

   3. Default (no number) → limit: 5

   Examples:
   - "recent filings" → limit: 5
   - "show 15 filings" → limit: 15
   - "all available reports" → limit: 20
   - "last 3 10-Ks" → limit: 3

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
   - Remove filler words ("and", "the", etc.)

   Examples:
   - "What are the risk factors?" → query: "risk factors"
   - "Tell me about competition" → query: "competition"
   - "AI and machine learning" → query: "AI machine learning"
   - "Find patent information" → query: "patents"

   args: {"query": "<keywords>", "limit": 5}

TOOL SELECTION LOGIC:

1. Numbers/metrics over time? → getAaplFinancialsByMetric
2. Stock price? → getPrices
3. List filings? → getRecentFilings
4. Qualitative content search? → searchFilings

Return ONLY JSON - examples:

{"tool":"getAaplFinancialsByMetric","args":{"metric":"revenue","limit":5}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"eps","limit":1}}
{"tool":"getPrices","args":{"range":"30d"}}
{"tool":"getRecentFilings","args":{"limit":15}}
{"tool":"searchFilings","args":{"query":"risk factors","limit":5}}`

async function addPromptV4() {
  console.log('📝 Adding prompt v4 to database...\n')

  try {
    // Deactivate v3
    console.log('⏸️  Deactivating v3...')
    await supabase
      .from('prompt_versions')
      .update({ is_active: false })
      .eq('prompt_type', 'tool_selection')
      .eq('version_number', 3)

    // Insert v4
    console.log('✅ Inserting v4...')
    const { error } = await supabase
      .from('prompt_versions')
      .insert({
        prompt_type: 'tool_selection',
        version_number: 4,
        prompt_content: TOOL_SELECTION_PROMPT_V4,
        change_description: 'Better metric mapping (buybacks→cash flow, ROE→net income), stronger number parsing, improved range defaults',
        is_active: true,
        created_by: 'manual',
      })

    if (error) {
      console.error('❌ Error:', error)
      throw error
    }

    console.log('✅ Prompt v4 added successfully!\n')

    // Verify
    const { data } = await supabase
      .from('prompt_versions')
      .select('*')
      .eq('prompt_type', 'tool_selection')
      .order('version_number', { ascending: true })

    console.log('📋 All tool_selection versions:')
    data?.forEach(p => {
      console.log(`  v${p.version_number}: ${p.is_active ? '🟢 ACTIVE' : '⚪ inactive'} - ${p.change_description}`)
    })
    console.log()
  } catch (error) {
    console.error('❌ Failed:', error)
    process.exit(1)
  }
}

addPromptV4()
