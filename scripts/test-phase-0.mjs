/**
 * Phase 0 Test Script - Test Answer Validation Prompt Improvements
 *
 * Tests 5 critical queries to verify prompt improvements work:
 * 1. Net income 2020 (HIGH PRIORITY - previously failed)
 * 2. Net income context question (previously failed)
 * 3. User confusion follow-up (previously failed)
 * 4. Revenue 5 years (should still work)
 * 5. Number precision test (new validation rule)
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Inline prompts from lib/tools.ts (using the updated Phase 0 prompts)
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
{"tool":"searchFilings","args":{"query":"risk factors","limit":5}}`

const buildFinalAnswerPrompt = (userQuestion, factsJson) => `You are an analyst. Answer the user using ONLY the provided facts.

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

General Instructions:
- Be concise and clear.
- If the user asks for a SPECIFIC YEAR (e.g., "in 2020", "for 2018"), ONLY mention that specific year in your answer. Do not mention other years unless the user asks for a comparison or trend.
- If the user asks for multiple years or a trend, show all relevant years.
- FIRST, check if you have the specific data requested. If the requested year is not in the facts, say so clearly (e.g., "I don't have data for 2020.").
- THEN provide your analysis using the available data.
- If trend is relevant (and the user asked for it), describe it (e.g., increasing/decreasing/flat).
- Do not invent numbers or sources.

Examples:
- Question: "What was net income in 2020?" → Answer: "AAPL's net income in 2020 was $57.4 billion." (Only 2020, exact number)
- Question: "What's the revenue trend?" → Answer: "Revenue increased from $274.5B in 2020 to $383.3B in 2024." (Show trend, exact numbers)
- Question: "Revenue in 2020 vs 2024?" → Answer: "Revenue was $274.5B in 2020 and $383.3B in 2024, a 40% increase." (Compare as requested, exact numbers)`

// Test cases from PHASE_0_TEST_PLAN.md
const testCases = [
  {
    id: 1,
    name: 'Net Income 2020 (Critical)',
    question: "What was AAPL's net income in 2020?",
    expectedInAnswer: ['57.4', '2020', 'billion'],
    shouldNotContain: ["don't have", "do not have", "no data"],
    priority: 'HIGH',
    previouslyFailed: true,
  },
  {
    id: 2,
    name: 'Net Income Context',
    question: "what about net income",
    expectedInAnswer: ['net income'],
    shouldNotContain: ["don't have 2020", "not for 2020"],
    priority: 'MEDIUM',
    previouslyFailed: true,
    note: 'Follow-up question - depends on conversation context'
  },
  {
    id: 3,
    name: 'User Confusion Follow-up',
    question: "you don't have 2020?",
    expectedInAnswer: ['2020', '57.4'],
    shouldNotContain: ["do not have", "don't have data"],
    priority: 'MEDIUM',
    previouslyFailed: true,
    note: 'Error recovery test'
  },
  {
    id: 4,
    name: 'Revenue 5 Years (Regression Check)',
    question: "aapl revenue over last 5 years",
    expectedInAnswer: ['revenue', '2020', '2021', '2022', '2023', '2024'],
    shouldNotContain: ["don't have"],
    priority: 'HIGH',
    previouslyFailed: false,
  },
  {
    id: 5,
    name: 'Number Precision 2024',
    question: "What was Apple's revenue in 2024?",
    expectedInAnswer: ['383.3', '2024'],
    shouldNotContain: ['383.0', '380', 'around', 'approximately'],
    priority: 'HIGH',
    previouslyFailed: false,
    note: 'Should say $383.3B (precise), not $383B (rounded)'
  },
]

/**
 * Simplified version of askQuestion action for testing
 */
async function runQuery(question) {
  const startTime = Date.now()

  try {
    // Step 1: Tool selection
    const selectionPrompt = buildToolSelectionPrompt(question)
    const selectionResponse = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-nano',
      messages: [{ role: 'user', content: selectionPrompt }],
      max_completion_tokens: 150,
    })

    const selectionContent = selectionResponse.choices[0]?.message?.content
    if (!selectionContent) {
      throw new Error('Failed to select tool')
    }

    const toolSelection = JSON.parse(selectionContent.trim())

    // Step 2: Execute tool (simplified - only handle getAaplFinancialsByMetric for now)
    let factsJson = ''

    if (toolSelection.tool === 'getAaplFinancialsByMetric') {
      const metric = toolSelection.args.metric
      const limit = toolSelection.args.limit || 4

      // Query database directly (matching the actual implementation)
      const { data, error } = await supabase
        .from('financials_std')
        .select('year, revenue, gross_profit, net_income, operating_income, total_assets, total_liabilities, shareholders_equity, operating_cash_flow, eps')
        .eq('symbol', 'AAPL')
        .order('year', { ascending: false })
        .limit(limit)

      if (error) throw error

      // Map to the requested metric (matching the actual implementation)
      const mapped = (data ?? []).map((row) => ({
        year: row.year,
        value: row[metric],
        metric,
      }))

      factsJson = JSON.stringify(mapped, null, 2)
    } else {
      // For other tools, return placeholder
      factsJson = JSON.stringify({ note: 'Tool not implemented in test script' })
    }

    // Step 3: Generate answer using updated prompt
    const answerPrompt = buildFinalAnswerPrompt(question, factsJson)
    const answerResponse = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-nano',
      messages: [{ role: 'user', content: answerPrompt }],
      max_completion_tokens: 500,
    })

    const answer = answerResponse.choices[0]?.message?.content || ''
    const latency = Date.now() - startTime

    return {
      success: true,
      toolSelected: toolSelection.tool,
      toolArgs: toolSelection.args,
      dataReturned: JSON.parse(factsJson),
      answer: answer.trim(),
      latency,
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      latency: Date.now() - startTime,
    }
  }
}

/**
 * Check if answer meets expectations
 */
function checkAnswer(testCase, result) {
  if (!result.success) {
    return {
      pass: false,
      reason: `Query failed: ${result.error}`,
      details: [],
    }
  }

  const answer = result.answer.toLowerCase()
  const failures = []

  // Check expected content
  for (const expected of testCase.expectedInAnswer) {
    if (!answer.includes(expected.toLowerCase())) {
      failures.push(`Missing expected text: "${expected}"`)
    }
  }

  // Check should-not-contain
  for (const forbidden of testCase.shouldNotContain) {
    if (answer.includes(forbidden.toLowerCase())) {
      failures.push(`Contains forbidden text: "${forbidden}"`)
    }
  }

  return {
    pass: failures.length === 0,
    reason: failures.length === 0 ? 'All checks passed' : 'Some checks failed',
    details: failures,
  }
}

/**
 * Run all tests and generate report
 */
async function runTests() {
  console.log('=' .repeat(80))
  console.log('PHASE 0 TEST RESULTS - Answer Validation Prompt Improvements')
  console.log('=' .repeat(80))
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`)
  console.log(`Baseline: 67% thumbs up, 30% year-related issues`)
  console.log(`Target: 75% thumbs up, 15% year-related issues`)
  console.log('=' .repeat(80))
  console.log()

  const results = []
  let passCount = 0
  let failCount = 0

  for (const testCase of testCases) {
    console.log(`\n[${'='.repeat(76)}]`)
    console.log(`Test ${testCase.id}: ${testCase.name}`)
    console.log(`Priority: ${testCase.priority} | Previously Failed: ${testCase.previouslyFailed ? 'YES' : 'NO'}`)
    if (testCase.note) {
      console.log(`Note: ${testCase.note}`)
    }
    console.log('[' + '='.repeat(76) + ']')
    console.log(`\nQuestion: "${testCase.question}"`)
    console.log('\nRunning query...')

    const result = await runQuery(testCase.question)
    const check = checkAnswer(testCase, result)

    console.log('\n' + '-'.repeat(80))
    console.log('RESULT:')
    console.log('-'.repeat(80))

    if (result.success) {
      console.log(`Tool Selected: ${result.toolSelected}`)
      console.log(`Tool Args: ${JSON.stringify(result.toolArgs)}`)
      console.log(`Data Rows: ${result.dataReturned?.length || 0}`)
      if (result.dataReturned?.length > 0) {
        const years = result.dataReturned.map(d => d.year).sort()
        console.log(`Years in Data: ${years.join(', ')}`)
      }
      console.log(`\nAnswer: "${result.answer}"`)
      console.log(`\nLatency: ${result.latency}ms`)
    } else {
      console.log(`ERROR: ${result.error}`)
    }

    console.log('\n' + '-'.repeat(80))
    console.log('VALIDATION:')
    console.log('-'.repeat(80))
    console.log(`Status: ${check.pass ? '✅ PASS' : '❌ FAIL'}`)
    console.log(`Reason: ${check.reason}`)

    if (check.details.length > 0) {
      console.log('\nDetails:')
      check.details.forEach(detail => console.log(`  - ${detail}`))
    }

    if (check.pass) {
      passCount++
    } else {
      failCount++
    }

    results.push({
      testCase,
      result,
      check,
    })

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // Summary
  console.log('\n\n' + '='.repeat(80))
  console.log('TEST SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total Tests: ${testCases.length}`)
  console.log(`Passed: ${passCount} (${(passCount / testCases.length * 100).toFixed(1)}%)`)
  console.log(`Failed: ${failCount} (${(failCount / testCases.length * 100).toFixed(1)}%)`)
  console.log('='.repeat(80))

  // Detailed results table
  console.log('\nDETAILED RESULTS TABLE:')
  console.log('='.repeat(80))
  console.log('Test | Question | Expected | Result | Pass/Fail | Notes')
  console.log('-'.repeat(80))

  results.forEach(({ testCase, result, check }) => {
    const status = check.pass ? '✅ PASS' : '❌ FAIL'
    const question = testCase.question.substring(0, 20) + (testCase.question.length > 20 ? '...' : '')
    const expected = testCase.expectedInAnswer.slice(0, 2).join(', ')
    const resultText = result.success ? (result.answer.substring(0, 20) + '...') : 'ERROR'
    const notes = testCase.previouslyFailed ? 'Was failing' : 'Was working'

    console.log(`${testCase.id} | ${question} | ${expected} | ${resultText} | ${status} | ${notes}`)
  })

  console.log('='.repeat(80))

  // Analysis
  console.log('\nANALYSIS:')
  console.log('='.repeat(80))

  const previouslyFailingTests = results.filter(r => r.testCase.previouslyFailed)
  const previouslyFailingFixed = previouslyFailingTests.filter(r => r.check.pass).length

  console.log(`Previously Failing Tests: ${previouslyFailingTests.length}`)
  console.log(`Previously Failing Now Fixed: ${previouslyFailingFixed}`)
  console.log(`Fix Rate: ${(previouslyFailingFixed / previouslyFailingTests.length * 100).toFixed(1)}%`)

  // Success criteria check
  console.log('\n' + '-'.repeat(80))
  console.log('SUCCESS CRITERIA:')
  console.log('-'.repeat(80))
  console.log(`Target: 4 out of 5 tests pass (80%)`)
  console.log(`Actual: ${passCount} out of ${testCases.length} tests pass (${(passCount / testCases.length * 100).toFixed(1)}%)`)
  console.log(`Result: ${passCount >= 4 ? '✅ SUCCESS - Phase 0 goals met!' : '❌ BELOW TARGET - Need Phase 1 validators urgently'}`)

  // Expected impact
  console.log('\n' + '-'.repeat(80))
  console.log('EXPECTED IMPACT:')
  console.log('-'.repeat(80))

  if (passCount >= 4) {
    console.log('✅ Phase 0 prompt improvements are effective!')
    console.log('   - Year-related issues should drop from 30% to ~15%')
    console.log('   - Thumbs up rate should improve from 67% to ~75%')
    console.log('   - Proceed to Phase 1 to build validators for systematic checking')
  } else {
    console.log('⚠️  Phase 0 prompt improvements show minimal impact')
    console.log('   - Year-related issues likely still at ~30%')
    console.log('   - Thumbs up rate likely still at ~67%')
    console.log('   - URGENTLY need Phase 1 validators to catch tool argument errors')
  }

  console.log('\n' + '='.repeat(80))
  console.log('NEXT STEPS:')
  console.log('='.repeat(80))
  console.log('1. Review test results above')
  console.log('2. Document findings in PHASE_0_TEST_PLAN.md')
  console.log('3. Proceed to Phase 1: Build answer validators')
  console.log('   - Number validator (check exact values)')
  console.log('   - Year validator (check mentioned years exist in DB)')
  console.log('   - Filing validator (check citations are real)')
  console.log('4. Integrate validators into ask-question action')
  console.log('5. Add auto-correction with regeneration')
  console.log('='.repeat(80))
}

// Run tests
runTests().catch(error => {
  console.error('Test script failed:', error)
  process.exit(1)
})
