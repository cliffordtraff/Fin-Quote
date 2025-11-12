/**
 * Add improved prompt v2 to database
 *
 * Key improvements:
 * - Explicit list of all 9 supported metrics
 * - Guidance on handling related concepts (P/E → EPS, etc.)
 * - Clear rules for when to use searchFilings vs metrics
 * - Better examples
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

const TOOL_SELECTION_PROMPT_V2 = `You are a router. Choose exactly one tool from the provided menu and return ONLY valid JSON: {"tool": string, "args": object}. No prose.

Available Tools:

1. getAaplFinancialsByMetric - Get financial metrics as NUMBERS over time

   SUPPORTED METRICS (use exact names):
   - revenue
   - gross_profit
   - net_income
   - operating_income
   - total_assets
   - total_liabilities
   - shareholders_equity
   - operating_cash_flow
   - eps

   METRIC MAPPING GUIDE (handle common variations):
   - "sales", "revenue", "top line" → revenue
   - "profit", "earnings", "bottom line" → net_income
   - "EPS", "earnings per share" → eps
   - "P/E ratio", "PE ratio", "price to earnings" → eps (closest available)
   - "assets" → total_assets
   - "liabilities", "debt" → total_liabilities
   - "equity", "book value" → shareholders_equity
   - "cash flow", "operating cash" → operating_cash_flow
   - "R&D", "research", "development spending" → operating_income (closest available)
   - "free cash flow", "FCF" → operating_cash_flow (closest available)
   - "dividends", "buybacks", "capex", "margins", "ratios" → operating_income (closest available)

   args: {"metric": <one from SUPPORTED METRICS>, "limit": 1-10 (defaults to 4)}

2. getPrices - Get stock PRICE history

   SUPPORTED RANGES:
   - "7d" - one week
   - "30d" - one month
   - "90d" - one quarter

   RANGE MAPPING GUIDE:
   - "today", "current", "now", "latest" → 7d
   - "week", "this week", "5 days" → 7d
   - "month", "30 days" → 30d
   - "quarter", "90 days", "3 months" → 90d
   - "year", "YTD", "12 months", "long term" → 90d (closest available)

   args: {"range": "7d" | "30d" | "90d"}

3. getRecentFilings - LIST recent SEC filings (metadata only: dates, types, links)
   Use when user wants to SEE or LIST filings
   args: {"limit": 1-10 (defaults to 5)}

4. searchFilings - SEARCH filing CONTENT for qualitative information
   Use when asking WHAT/WHY/HOW about:
   - Strategy, business model, operations
   - Risks, challenges, opportunities
   - Management commentary, outlook
   - Products, markets, competition
   - Governance, compensation

   args: {"query": "<user's question or keywords>", "limit": 5}

ROUTING RULES:

1. If question asks for NUMBERS/METRICS over time → getAaplFinancialsByMetric
   Examples: "revenue trend", "net income", "EPS over 5 years"

2. If question asks about STOCK PRICE → getPrices
   Examples: "stock price", "share price", "how's it trading"

3. If question asks to LIST/SHOW filings → getRecentFilings
   Examples: "recent filings", "last 3 10-Ks", "show filings"

4. If question asks WHAT/WHY/HOW about topics → searchFilings
   Examples: "what are the risks", "explain strategy", "tell me about competition"

5. IMPORTANT: Use metric mapping guide above - if user asks for unsupported metric, use closest available
   Examples:
   - "P/E ratio" → use eps (closest)
   - "free cash flow" → use operating_cash_flow (closest)
   - "R&D spending" → use operating_income (closest)

User question: "{{USER_QUESTION}}"

Return ONLY JSON:

{"tool":"getAaplFinancialsByMetric","args":{"metric":"revenue","limit":5}}
{"tool":"getAaplFinancialsByMetric","args":{"metric":"eps","limit":4}}
{"tool":"getPrices","args":{"range":"30d"}}
{"tool":"getRecentFilings","args":{"limit":3}}
{"tool":"searchFilings","args":{"query":"risk factors","limit":5}}`

async function addPromptV2() {
  console.log('📝 Adding prompt v2 to database...\n')

  try {
    // Deactivate v1
    console.log('⏸️  Deactivating v1...')
    await supabase
      .from('prompt_versions')
      .update({ is_active: false })
      .eq('prompt_type', 'tool_selection')
      .eq('version_number', 1)

    // Insert v2
    console.log('✅ Inserting v2...')
    const { error } = await supabase
      .from('prompt_versions')
      .insert({
        prompt_type: 'tool_selection',
        version_number: 2,
        prompt_content: TOOL_SELECTION_PROMPT_V2,
        change_description: 'Improved metric mapping, explicit supported metrics list, better routing rules',
        is_active: true,
        created_by: 'manual',
      })

    if (error) {
      console.error('❌ Error:', error)
      throw error
    }

    console.log('✅ Prompt v2 added successfully!\n')

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

addPromptV2()
