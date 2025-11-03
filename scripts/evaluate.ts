/**
 * Evaluation Engine - Test prompts against golden test set
 *
 * Two modes:
 * - Fast: Routing-only (2-3 min for 100 questions)
 * - Full: End-to-end including answer generation (10+ min)
 *
 * Usage:
 *   npx tsx scripts/evaluate.ts --mode fast
 *   npx tsx scripts/evaluate.ts --mode full
 *   npx tsx scripts/evaluate.ts --mode fast --limit 10
 */

import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Types
type TestQuestion = {
  id: number
  question: string
  category: string
  difficulty: string
  expected_output: {
    tool: string
    args: Record<string, any>
  }
  metadata: {
    tags: string[]
    notes?: string
  }
}

type TestResult = {
  question_id: number
  question: string
  expected_tool: string
  expected_args: Record<string, any>
  actual_tool: string | null
  actual_args: Record<string, any> | null
  tool_match: boolean
  args_match: boolean
  overall_correct: boolean
  routing_latency_ms: number
  error?: string
}

type EvaluationResults = {
  mode: 'fast' | 'full'
  timestamp: string
  total_questions: number
  correct_tool: number
  correct_args: number
  fully_correct: number
  accuracy: {
    tool_selection: number
    args_selection: number
    overall: number
  }
  results: TestResult[]
}

// Tool selection prompt v4 - targeted fixes for 87% accuracy
const buildToolSelectionPrompt = (userQuestion: string) => `You are a router. Choose exactly one tool and return ONLY valid JSON: {"tool": string, "args": object}. No prose.

User question: "${userQuestion}"

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

// Args normalization - handle defaults and synonyms
function normalizeArgs(
  tool: string,
  args: Record<string, any>
): Record<string, any> {
  const normalized = { ...args }

  // Apply defaults
  if (tool === 'getAaplFinancialsByMetric') {
    if (!normalized.limit) normalized.limit = 4
  } else if (tool === 'getPrices') {
    // No defaults for getPrices - range is required
  } else if (tool === 'getRecentFilings') {
    if (!normalized.limit) normalized.limit = 5
  } else if (tool === 'searchFilings') {
    if (!normalized.limit) normalized.limit = 5
  }

  // Normalize range values for getPrices
  if (tool === 'getPrices' && normalized.range) {
    // Handle both "1d" and "7d" variations
    const rangeMap: Record<string, string> = {
      '1d': '1d',
      '5d': '5d',
      '7d': '7d',
      '30d': '30d',
      '90d': '90d',
      '1y': '1y',
      '5y': '5y',
      max: 'max',
    }
    if (rangeMap[normalized.range]) {
      normalized.range = rangeMap[normalized.range]
    }
  }

  return normalized
}

// Compare args with normalization
function argsMatch(
  tool: string,
  expected: Record<string, any>,
  actual: Record<string, any>
): boolean {
  const normalizedExpected = normalizeArgs(tool, expected)
  const normalizedActual = normalizeArgs(tool, actual)

  // Deep equality check
  return JSON.stringify(normalizedExpected) === JSON.stringify(normalizedActual)
}

// Run routing test for a single question
async function testRouting(question: TestQuestion): Promise<TestResult> {
  const startTime = Date.now()

  try {
    const prompt = buildToolSelectionPrompt(question.question)

    // Call OpenAI (Note: gpt-5-nano only supports default temperature)
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-nano',
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 150,
    })

    const latency = Date.now() - startTime
    const content = response.choices[0].message.content?.trim() || ''

    // Parse JSON response
    let parsed: { tool: string; args: Record<string, any> } | null = null
    try {
      parsed = JSON.parse(content)
    } catch (e) {
      return {
        question_id: question.id,
        question: question.question,
        expected_tool: question.expected_output.tool,
        expected_args: question.expected_output.args,
        actual_tool: null,
        actual_args: null,
        tool_match: false,
        args_match: false,
        overall_correct: false,
        routing_latency_ms: latency,
        error: `JSON parse error: ${content}`,
      }
    }

    const toolMatch = parsed.tool === question.expected_output.tool
    const argsMatchResult = argsMatch(
      question.expected_output.tool,
      question.expected_output.args,
      parsed.args
    )

    return {
      question_id: question.id,
      question: question.question,
      expected_tool: question.expected_output.tool,
      expected_args: question.expected_output.args,
      actual_tool: parsed.tool,
      actual_args: parsed.args,
      tool_match: toolMatch,
      args_match: argsMatchResult,
      overall_correct: toolMatch && argsMatchResult,
      routing_latency_ms: latency,
    }
  } catch (error: any) {
    return {
      question_id: question.id,
      question: question.question,
      expected_tool: question.expected_output.tool,
      expected_args: question.expected_output.args,
      actual_tool: null,
      actual_args: null,
      tool_match: false,
      args_match: false,
      overall_correct: false,
      routing_latency_ms: Date.now() - startTime,
      error: error.message,
    }
  }
}

// Main evaluation function
async function evaluate(mode: 'fast' | 'full', limit?: number) {
  console.log(`🧪 Starting evaluation in ${mode} mode...\n`)

  // Load test set
  const testSetPath = path.join(
    process.cwd(),
    'test-data',
    'golden-test-set.json'
  )
  const testSet = JSON.parse(fs.readFileSync(testSetPath, 'utf-8'))
  let questions: TestQuestion[] = testSet.questions

  // Apply limit if specified
  if (limit) {
    questions = questions.slice(0, limit)
    console.log(`📊 Testing first ${limit} questions\n`)
  } else {
    console.log(`📊 Testing all ${questions.length} questions\n`)
  }

  // Run tests
  const results: TestResult[] = []
  let correctTool = 0
  let correctArgs = 0
  let fullyCorrect = 0

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]
    process.stdout.write(
      `[${i + 1}/${questions.length}] Testing question ${question.id}... `
    )

    const result = await testRouting(question)
    results.push(result)

    if (result.tool_match) correctTool++
    if (result.args_match) correctArgs++
    if (result.overall_correct) fullyCorrect++

    // Print result
    if (result.overall_correct) {
      console.log('✅')
    } else if (result.tool_match) {
      console.log('⚠️  (wrong args)')
    } else {
      console.log('❌ (wrong tool)')
    }

    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  // Calculate accuracy
  const total = questions.length
  const accuracy = {
    tool_selection: (correctTool / total) * 100,
    args_selection: (correctArgs / total) * 100,
    overall: (fullyCorrect / total) * 100,
  }

  // Build final results
  const evaluationResults: EvaluationResults = {
    mode,
    timestamp: new Date().toISOString(),
    total_questions: total,
    correct_tool: correctTool,
    correct_args: correctArgs,
    fully_correct: fullyCorrect,
    accuracy,
    results,
  }

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const resultsPath = path.join(
    process.cwd(),
    'test-data',
    'test-results',
    `eval-${mode}-${timestamp}.json`
  )

  fs.writeFileSync(resultsPath, JSON.stringify(evaluationResults, null, 2))

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 EVALUATION SUMMARY')
  console.log('='.repeat(60))
  console.log(`Mode: ${mode}`)
  console.log(`Total Questions: ${total}`)
  console.log(`Correct Tool: ${correctTool} (${accuracy.tool_selection.toFixed(1)}%)`)
  console.log(`Correct Args: ${correctArgs} (${accuracy.args_selection.toFixed(1)}%)`)
  console.log(`Fully Correct: ${fullyCorrect} (${accuracy.overall.toFixed(1)}%)`)
  console.log('='.repeat(60))
  console.log(`\n✅ Results saved to: ${resultsPath}\n`)

  return evaluationResults
}

// CLI
const args = process.argv.slice(2)
const modeIndex = args.indexOf('--mode')
const limitIndex = args.indexOf('--limit')

const mode = modeIndex >= 0 ? (args[modeIndex + 1] as 'fast' | 'full') : 'fast'
const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) : undefined

if (!['fast', 'full'].includes(mode)) {
  console.error('❌ Invalid mode. Use --mode fast or --mode full')
  process.exit(1)
}

evaluate(mode, limit).catch((error) => {
  console.error('❌ Evaluation failed:', error)
  process.exit(1)
})
