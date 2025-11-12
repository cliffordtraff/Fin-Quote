/**
 * Evaluation Engine - Test prompts against golden test set
 *
 * Two modes:
 * - Fast: Routing-only (2-3 min for 100 questions)
 * - Full: End-to-end including answer generation (10+ min)
 *
 * Optional LLM-as-judge:
 * - Evaluates answer quality using GPT-4
 * - Only works with full mode
 *
 * Usage:
 *   npx tsx scripts/evaluate.ts --mode fast
 *   npx tsx scripts/evaluate.ts --mode full
 *   npx tsx scripts/evaluate.ts --mode full --llm-judge
 *   npx tsx scripts/evaluate.ts --mode fast --limit 10
 */

import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import dotenv from 'dotenv'
import { evaluateAnswerQuality, calculateQualityStats, type AnswerQualityScore } from '../lib/llm-judge'
import { buildToolSelectionPrompt as productionToolPrompt, buildFinalAnswerPrompt as productionAnswerPrompt } from '../lib/tools'

// Import production helper functions for Responses API
type SimpleMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const toResponseInputMessages = (messages: SimpleMessage[]) =>
  messages.map((msg, index) => ({
    id: `msg_${index}`,
    role: msg.role === 'assistant' ? 'assistant' : msg.role,
    content: [{ type: 'input_text', text: msg.content }],
    type: 'message',
  })) as any

const extractResponseText = (response: any): string | undefined => {
  if (response?.output_text) {
    return response.output_text
  }

  const messageOutput = (response?.output as any[])?.find(item => item.type === 'message')
  if (messageOutput?.content && Array.isArray(messageOutput.content)) {
    return messageOutput.content
      .map((part: any) => {
        if (part?.type === 'output_text' && typeof part?.text === 'string') return part.text
        if (typeof part?.text === 'string') return part.text
        if (typeof part === 'string') return part
        return ''
      })
      .join('')
      .trim()
  }

  return undefined
}

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
    strictness?: 'strict' | 'flexible'  // Layer 2: context-aware strictness
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
  args_match_semantic: boolean  // Layer 1+2: semantic matching
  overall_correct: boolean
  overall_correct_semantic: boolean  // Layer 1+2: semantic correctness
  routing_latency_ms: number
  error?: string
  // Full mode additions
  answer?: string
  answer_latency_ms?: number
  source_data?: any
  // LLM-as-judge additions
  quality_score?: AnswerQualityScore
}

type EvaluationResults = {
  mode: 'fast' | 'full'
  timestamp: string
  total_questions: number
  correct_tool: number
  correct_args: number
  correct_args_semantic: number  // Layer 1+2: semantic matching
  fully_correct: number
  fully_correct_semantic: number  // Layer 1+2: semantic correctness
  accuracy: {
    tool_selection: number
    args_selection: number
    args_selection_semantic: number  // Layer 1+2
    overall: number
    overall_semantic: number  // Layer 1+2
  }
  results: TestResult[]
  // LLM-as-judge stats (only present if --llm-judge flag used)
  quality_stats?: {
    avg_accuracy: number
    avg_relevance: number
    avg_completeness: number
    avg_insight: number
    avg_overall: number
    excellent_count: number
    good_count: number
    poor_count: number
  }
  llm_judge_enabled?: boolean
}

// NOTE: Now using production prompt from lib/tools.ts instead of maintaining a separate copy
// This ensures evaluation tests the SAME prompt that users see in production

// Metric alias equivalence groups (Layer 1: Handle synonyms)
const METRIC_EQUIVALENCE_GROUPS: Record<string, string[]> = {
  revenue: ['revenue', 'total_revenue', 'sales', 'net_sales', 'total sales'],
  net_income: ['net_income', 'net profit', 'earnings', 'net earnings', 'profit'],
  gross_profit: ['gross_profit', 'gross profit'],
  operating_income: ['operating_income', 'operating profit', 'EBIT'],
  eps: ['eps', 'earnings per share', 'earnings_per_share'],
  total_assets: ['total_assets', 'total assets', 'assets'],
  total_liabilities: ['total_liabilities', 'total liabilities', 'liabilities'],
  shareholders_equity: ['shareholders_equity', 'shareholders equity', 'equity', 'stockholders equity'],
  operating_cash_flow: ['operating_cash_flow', 'cash from operations', 'OCF'],
  capex: ['capex', 'capital expenditures', 'capital_expenditures', 'CapEx'],
  free_cash_flow: ['free cash flow', 'FCF', 'free_cash_flow'],
  debt: ['debt', 'total debt', 'total_debt'],
  cash: ['cash', 'cash and equivalents', 'cash_and_equivalents', 'cash and cash equivalents'],
  // Ratios
  gross_margin: ['gross margin', 'gross_margin', 'gross profit margin'],
  operating_margin: ['operating margin', 'operating_margin'],
  net_margin: ['net margin', 'net_margin', 'profit margin'],
  roe: ['ROE', 'return on equity', 'roe'],
  roa: ['ROA', 'return on assets', 'roa'],
  debt_to_equity: ['debt to equity', 'debt-to-equity', 'debt_to_equity', 'debt to equity ratio'],
  pe_ratio: ['P/E', 'P/E ratio', 'PE ratio', 'price to earnings', 'peRatio'],
  pb_ratio: ['P/B', 'P/B ratio', 'PB ratio', 'price to book', 'pbRatio'],
}

// Find if two metrics are equivalent
function metricsAreEquivalent(metric1: string, metric2: string): boolean {
  // Exact match
  if (metric1 === metric2) return true

  // Check equivalence groups
  for (const group of Object.values(METRIC_EQUIVALENCE_GROUPS)) {
    if (group.includes(metric1) && group.includes(metric2)) {
      return true
    }
  }

  // Case-insensitive fuzzy match as fallback
  return metric1.toLowerCase().replace(/[_\s-]/g, '') === metric2.toLowerCase().replace(/[_\s-]/g, '')
}

// Check if limit is within acceptable flexible range
function limitIsFlexible(limit: number, expected: number, strictness: string): boolean {
  if (strictness === 'strict') {
    return limit === expected
  }

  // Flexible: 3-10 years is acceptable for open-ended questions
  if (strictness === 'flexible') {
    return limit >= 3 && limit <= 10
  }

  return limit === expected
}

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

// Compare args with normalization - exact match
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

// Semantic args comparison (Layer 1 + 2: aliases + flexible limits)
function argsMatchSemantic(
  tool: string,
  expected: Record<string, any>,
  actual: Record<string, any>,
  strictness: string = 'flexible'
): boolean {
  const normalizedExpected = normalizeArgs(tool, expected)
  const normalizedActual = normalizeArgs(tool, actual)

  // For getAaplFinancialsByMetric - check metric equivalence
  if (tool === 'getAaplFinancialsByMetric') {
    const expectedMetric = normalizedExpected.metric
    const actualMetric = normalizedActual.metric

    if (!metricsAreEquivalent(expectedMetric, actualMetric)) {
      return false
    }

    // Check limit with flexibility
    const expectedLimit = normalizedExpected.limit || 4
    const actualLimit = normalizedActual.limit || 4

    return limitIsFlexible(actualLimit, expectedLimit, strictness)
  }

  // For getFinancialMetric - check all metrics are equivalent
  if (tool === 'getFinancialMetric') {
    const expectedMetrics = normalizedExpected.metricNames || []
    const actualMetrics = normalizedActual.metricNames || []

    // Must have same number of metrics
    if (expectedMetrics.length !== actualMetrics.length) {
      return false
    }

    // Check each metric is equivalent (order doesn't matter)
    for (const expectedMetric of expectedMetrics) {
      const hasEquivalent = actualMetrics.some((actualMetric: string) =>
        metricsAreEquivalent(expectedMetric, actualMetric)
      )
      if (!hasEquivalent) return false
    }

    // Check limit with flexibility
    const expectedLimit = normalizedExpected.limit || 5
    const actualLimit = normalizedActual.limit || 5

    return limitIsFlexible(actualLimit, expectedLimit, strictness)
  }

  // For getPrices - range must match exactly (no flexibility)
  if (tool === 'getPrices') {
    return normalizedExpected.range === normalizedActual.range
  }

  // For searchFilings and getRecentFilings - use JSON comparison
  return JSON.stringify(normalizedExpected) === JSON.stringify(normalizedActual)
}

// Generate mock answer (simulates calling the actual tool and generating answer)
async function generateAnswer(
  question: string,
  tool: string,
  args: Record<string, any>
): Promise<{ answer: string; sourceData: any; latency: number }> {
  const startTime = Date.now()

  // Mock source data based on tool (in real implementation, this would call the actual server action)
  let sourceData: any = {}

  if (tool === 'getAaplFinancialsByMetric') {
    // Mock financial data
    sourceData = {
      metric: args.metric,
      data: [
        { year: 2020, value: 274515000000 },
        { year: 2021, value: 365817000000 },
        { year: 2022, value: 394328000000 },
        { year: 2023, value: 383285000000 },
        { year: 2024, value: 391035000000 },
      ].slice(0, args.limit || 4),
    }
  } else if (tool === 'getPrices') {
    sourceData = { range: args.range, prices: 'mock price data' }
  } else if (tool === 'searchFilings') {
    sourceData = { query: args.query, results: 'mock filing search results' }
  } else if (tool === 'getRecentFilings') {
    sourceData = { filings: 'mock filings list' }
  }

  // Generate answer using production prompt and Responses API
  const answerPrompt = productionAnswerPrompt(question, sourceData, [])

  // Use Responses API (same as production)
  const answerMessages: SimpleMessage[] = [{ role: 'user', content: answerPrompt }]
  const answerInput = toResponseInputMessages(answerMessages)

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5-nano',
    input: answerInput,
    ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 }),
    max_output_tokens: process.env.OPENAI_MODEL?.includes('gpt-5') ? 20000 : 500,
    ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
  })

  const answer = extractResponseText(response) || 'No answer generated'
  const latency = Date.now() - startTime

  return { answer, sourceData, latency }
}

// Run routing test for a single question
async function testRouting(
  question: TestQuestion,
  mode: 'fast' | 'full',
  useLLMJudge: boolean
): Promise<TestResult> {
  const startTime = Date.now()

  try {
    // Use production prompt for accurate testing
    const prompt = productionToolPrompt(question.question)

    // Use Responses API (same as production) with system message
    const selectionMessages: SimpleMessage[] = [
      {
        role: 'system',
        content:
          'You are Fin Quote routing assistant. Your ONLY job is to pick exactly one tool and respond with valid JSON matching {"tool": string, "args": object}. Do not add explanations, comments, or Markdown.',
      },
      { role: 'user', content: prompt },
    ]
    const selectionInput = toResponseInputMessages(selectionMessages)

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-nano',
      input: selectionInput,
      ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? {} : { temperature: 0 }),
      max_output_tokens: process.env.OPENAI_MODEL?.includes('gpt-5') ? 20000 : 150,
      ...(process.env.OPENAI_MODEL?.includes('gpt-5') ? { reasoning: { effort: 'minimal' } } : {}),
      text: { format: { type: 'json_object' } },
    })

    const latency = Date.now() - startTime

    // Extract content from Responses API format
    const content = extractResponseText(response) || ''

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
        args_match_semantic: false,
        overall_correct: false,
        overall_correct_semantic: false,
        routing_latency_ms: latency,
        error: `JSON parse error: ${content}`,
      }
    }
    if (!parsed) {
      return {
        question_id: question.id,
        question: question.question,
        expected_tool: question.expected_output.tool,
        expected_args: question.expected_output.args,
        actual_tool: null,
        actual_args: null,
        tool_match: false,
        args_match: false,
        args_match_semantic: false,
        overall_correct: false,
        overall_correct_semantic: false,
        routing_latency_ms: latency,
        error: 'Empty routing result',
      }
    }

    const toolMatch = parsed.tool === question.expected_output.tool
    const argsMatchResult = argsMatch(
      question.expected_output.tool,
      question.expected_output.args,
      parsed.args
    )

    // Calculate semantic match (Layer 1+2)
    // If exact match is true, semantic must also be true (exact is subset of semantic)
    const strictness = question.metadata?.strictness || 'flexible'
    let argsMatchSemResult = argsMatchSemantic(
      question.expected_output.tool,
      question.expected_output.args,
      parsed.args,
      strictness
    )
    if (argsMatchResult && !argsMatchSemResult) {
      // Exact match implies semantic match
      argsMatchSemResult = true
    }

    const baseResult: TestResult = {
      question_id: question.id,
      question: question.question,
      expected_tool: question.expected_output.tool,
      expected_args: question.expected_output.args,
      actual_tool: parsed.tool,
      actual_args: parsed.args,
      tool_match: toolMatch,
      args_match: argsMatchResult,
      args_match_semantic: argsMatchSemResult,
      overall_correct: toolMatch && argsMatchResult,
      overall_correct_semantic: toolMatch && argsMatchSemResult,
      routing_latency_ms: latency,
    }

    // If full mode, generate answer
    if (mode === 'full' && toolMatch && argsMatchResult) {
      const { answer, sourceData, latency: answerLatency } = await generateAnswer(
        question.question,
        parsed.tool,
        parsed.args
      )

      baseResult.answer = answer
      baseResult.source_data = sourceData
      baseResult.answer_latency_ms = answerLatency

      // If LLM-judge enabled, evaluate answer quality
      if (useLLMJudge) {
        const qualityScore = await evaluateAnswerQuality(
          question.question,
          answer,
          sourceData,
          openai
        )
        baseResult.quality_score = qualityScore
      }
    }

    return baseResult
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
      args_match_semantic: false,
      overall_correct: false,
      overall_correct_semantic: false,
      routing_latency_ms: Date.now() - startTime,
      error: error.message,
    }
  }
}

// Main evaluation function
async function evaluate(mode: 'fast' | 'full', limit?: number, useLLMJudge = false) {
  // Validate flags
  if (useLLMJudge && mode === 'fast') {
    console.error('❌ Error: --llm-judge can only be used with --mode full')
    process.exit(1)
  }

  const judgeText = useLLMJudge ? ' (with LLM-as-judge)' : ''
  console.log(`🧪 Starting evaluation in ${mode} mode${judgeText}...\n`)

  if (useLLMJudge) {
    console.log('⚠️  LLM-as-judge enabled: This will be slower and more expensive')
    console.log('   Each answer will be graded by GPT-4 for quality\n')
  }

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
  let correctArgsSemantic = 0
  let fullyCorrect = 0
  let fullyCorrectSemantic = 0

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]
    process.stdout.write(
      `[${i + 1}/${questions.length}] Testing question ${question.id}... `
    )

    const result = await testRouting(question, mode, useLLMJudge)
    results.push(result)

    if (result.tool_match) correctTool++
    if (result.args_match) correctArgs++
    if (result.args_match_semantic) correctArgsSemantic++
    if (result.overall_correct) fullyCorrect++
    if (result.overall_correct_semantic) fullyCorrectSemantic++

    // Print result (show semantic status)
    if (result.overall_correct) {
      const qualityText = result.quality_score
        ? ` (quality: ${result.quality_score.overall.toFixed(1)}/10)`
        : ''
      console.log(`✅${qualityText}`)
    } else if (result.overall_correct_semantic) {
      // Semantically correct but not exact match
      console.log('✅ (semantic match)')
    } else if (result.tool_match) {
      console.log('⚠️  (wrong args)')
    } else {
      console.log('❌ (wrong tool)')
    }

    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, useLLMJudge ? 500 : 100))
  }

  // Calculate accuracy
  const total = questions.length
  const accuracy = {
    tool_selection: (correctTool / total) * 100,
    args_selection: (correctArgs / total) * 100,
    args_selection_semantic: (correctArgsSemantic / total) * 100,
    overall: (fullyCorrect / total) * 100,
    overall_semantic: (fullyCorrectSemantic / total) * 100,
  }

  // Calculate quality stats if LLM-judge was used
  let qualityStats: EvaluationResults['quality_stats'] | undefined
  if (useLLMJudge) {
    const scores = results
      .filter((r) => r.quality_score !== undefined)
      .map((r) => r.quality_score!)
    const stats = calculateQualityStats(scores)
    qualityStats = {
      avg_accuracy: stats.avgAccuracy,
      avg_relevance: stats.avgRelevance,
      avg_completeness: stats.avgCompleteness,
      avg_insight: stats.avgInsight,
      avg_overall: stats.avgOverall,
      excellent_count: stats.excellentCount,
      good_count: stats.goodCount,
      poor_count: stats.poorCount,
    }
  }

  // Build final results
  const evaluationResults: EvaluationResults = {
    mode,
    timestamp: new Date().toISOString(),
    total_questions: total,
    correct_tool: correctTool,
    correct_args: correctArgs,
    correct_args_semantic: correctArgsSemantic,
    fully_correct: fullyCorrect,
    fully_correct_semantic: fullyCorrectSemantic,
    accuracy,
    results,
    llm_judge_enabled: useLLMJudge,
    quality_stats: qualityStats,
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

  // Print summary with three-tier accuracy (Layer 3)
  console.log('\n' + '='.repeat(60))
  console.log('📊 EVALUATION SUMMARY')
  console.log('='.repeat(60))
  console.log(`Mode: ${mode}${useLLMJudge ? ' (with LLM-as-judge)' : ''}`)
  console.log(`Total Questions: ${total}`)
  console.log(`\n🎯 Tool Selection:`)
  console.log(`   ${correctTool}/${total} correct (${accuracy.tool_selection.toFixed(1)}%)`)
  console.log(`\n📊 Three-Tier Accuracy:`)
  console.log(`   1. Exact Match:      ${fullyCorrect}/${total} (${accuracy.overall.toFixed(1)}%)`)
  console.log(`   2. Semantic Match:   ${fullyCorrectSemantic}/${total} (${accuracy.overall_semantic.toFixed(1)}%) ✨`)
  console.log(`   3. Tool Only:        ${correctTool}/${total} (${accuracy.tool_selection.toFixed(1)}%)`)
  console.log(`\n💡 Semantic matching uses:`)
  console.log(`   • Metric alias equivalence (revenue = total_revenue = sales)`)
  console.log(`   • Flexible limit ranges (3-10 years for open-ended questions)`)

  // Print quality stats if available
  if (qualityStats) {
    console.log('='.repeat(60))
    console.log('📝 ANSWER QUALITY (GPT-4 Judge)')
    console.log('='.repeat(60))
    console.log(`Average Scores (out of 10):`)
    console.log(`  Accuracy:     ${qualityStats.avg_accuracy.toFixed(1)}/10`)
    console.log(`  Relevance:    ${qualityStats.avg_relevance.toFixed(1)}/10`)
    console.log(`  Completeness: ${qualityStats.avg_completeness.toFixed(1)}/10`)
    console.log(`  Insight:      ${qualityStats.avg_insight.toFixed(1)}/10`)
    console.log(`  OVERALL:      ${qualityStats.avg_overall.toFixed(1)}/10`)
    console.log('')
    console.log(`Distribution:`)
    console.log(`  Excellent (9-10):  ${qualityStats.excellent_count} answers`)
    console.log(`  Good (7-8):        ${qualityStats.good_count} answers`)
    console.log(`  Poor (<5):         ${qualityStats.poor_count} answers`)
  }

  console.log('='.repeat(60))
  console.log(`\n✅ Results saved to: ${resultsPath}`)

  // Suggest next steps
  if (useLLMJudge) {
    console.log(`\n💡 Next steps:`)
    console.log(`   1. Generate HTML report: npx tsx scripts/generate-html-report.ts ${resultsPath}`)
    console.log(`   2. Review low-scoring answers in the JSON file`)
    console.log(`   3. Improve prompts and re-run evaluation\n`)
  } else if (mode === 'fast') {
    console.log(`\n💡 For answer quality evaluation, run: npx tsx scripts/evaluate.ts --mode full --llm-judge\n`)
  }

  return evaluationResults
}

// CLI
const args = process.argv.slice(2)
const modeIndex = args.indexOf('--mode')
const limitIndex = args.indexOf('--limit')
const llmJudgeFlag = args.includes('--llm-judge')

const mode = modeIndex >= 0 ? (args[modeIndex + 1] as 'fast' | 'full') : 'fast'
const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1]) : undefined

if (!['fast', 'full'].includes(mode)) {
  console.error('❌ Invalid mode. Use --mode fast or --mode full')
  process.exit(1)
}

evaluate(mode, limit, llmJudgeFlag).catch((error) => {
  console.error('❌ Evaluation failed:', error)
  process.exit(1)
})
