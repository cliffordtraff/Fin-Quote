/**
 * Seed initial prompt versions into the database
 *
 * This script extracts the current prompts from the codebase and inserts them
 * as version 1 into the prompt_versions table, marking them as active.
 *
 * Usage: npx tsx scripts/seed-prompts.ts
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables:')
  console.error('- NEXT_PUBLIC_SUPABASE_URL')
  console.error('- SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Tool Selection Prompt (from lib/tools.ts buildToolSelectionPrompt)
const TOOL_SELECTION_PROMPT_V1 = `You are a router. Choose exactly one tool from the provided menu and return ONLY valid JSON: {"tool": string, "args": object}. No prose.

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

User question: "{{USER_QUESTION}}"

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

// Answer Generation Prompt (from lib/tools.ts buildFinalAnswerPrompt)
const ANSWER_GENERATION_PROMPT_V1 = `You are an analyst. Answer the user using ONLY the provided facts.

User question: "{{USER_QUESTION}}"

Facts (JSON rows):
{{FACTS_JSON}}

Instructions:
- Be concise and clear.
- FIRST, check if you have all the data requested. If not, START your answer by explaining what data you DO have (e.g., "I have data for the last 10 years (2015-2024), not 15 years as requested.").
- THEN provide your analysis using the available data.
- If trend is relevant, describe it (e.g., increasing/decreasing/flat).
- Do not invent numbers or sources.
- Only say "I don't know" if you have ZERO relevant data.`

async function seedPrompts() {
  console.log('🌱 Seeding prompt versions...\n')

  try {
    // Check if prompts already exist
    const { data: existingPrompts } = await supabase
      .from('prompt_versions')
      .select('prompt_type, version_number')
      .order('version_number', { ascending: false })

    if (existingPrompts && existingPrompts.length > 0) {
      console.log('⚠️  Existing prompts found:')
      existingPrompts.forEach((p) => {
        console.log(`  - ${p.prompt_type} v${p.version_number}`)
      })
      console.log('\nSkipping seed to avoid duplicates.')
      console.log('If you want to re-seed, delete existing prompts first.\n')
      return
    }

    // Insert tool selection prompt v1
    console.log('📝 Inserting tool_selection prompt v1...')
    const { error: toolError } = await supabase
      .from('prompt_versions')
      .insert({
        prompt_type: 'tool_selection',
        version_number: 1,
        prompt_content: TOOL_SELECTION_PROMPT_V1,
        change_description: 'Initial prompt version from codebase at project start',
        is_active: true,
        created_by: 'seed-script',
      })

    if (toolError) {
      console.error('❌ Error inserting tool_selection prompt:', toolError)
      throw toolError
    }
    console.log('✅ Tool selection prompt v1 inserted\n')

    // Insert answer generation prompt v1
    console.log('📝 Inserting answer_generation prompt v1...')
    const { error: answerError } = await supabase
      .from('prompt_versions')
      .insert({
        prompt_type: 'answer_generation',
        version_number: 1,
        prompt_content: ANSWER_GENERATION_PROMPT_V1,
        change_description: 'Initial prompt version from codebase at project start',
        is_active: true,
        created_by: 'seed-script',
      })

    if (answerError) {
      console.error('❌ Error inserting answer_generation prompt:', answerError)
      throw answerError
    }
    console.log('✅ Answer generation prompt v1 inserted\n')

    // Verify insertion
    const { data: verifyData, error: verifyError } = await supabase
      .from('prompt_versions')
      .select('*')
      .order('prompt_type', { ascending: true })

    if (verifyError) {
      console.error('❌ Error verifying prompts:', verifyError)
      throw verifyError
    }

    console.log('✨ Seed complete! Inserted prompts:\n')
    verifyData?.forEach((p) => {
      console.log(`📋 ${p.prompt_type} v${p.version_number}`)
      console.log(`   Active: ${p.is_active}`)
      console.log(`   Created: ${p.created_at}`)
      console.log(`   Description: ${p.change_description}`)
      console.log()
    })

    console.log('✅ Done!\n')
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

// Run the seed function
seedPrompts()
