/**
 * Eval Runner for "Why It Moved" AI Summaries
 *
 * Tests the metaprompt + validation system against golden set
 * to measure quality before deployment.
 */

import { WhyItMovedData, EvalTestCase, EvalResult, EvalSummary } from '@watchlist/types/ai-summary'
import { getCachedPrompt } from '../prompts/whyItMovedPromptCache'
import { validateWhyItMoved } from '../validation/whyItMovedValidator'
import OpenAI from 'openai'

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
}) : null

/**
 * Run a single eval test case
 */
export async function runEvalTestCase(testCase: EvalTestCase): Promise<EvalResult> {
  if (!openai) {
    throw new Error('OpenAI API key required for evals')
  }

  const failures: string[] = []

  try {
    // Get metaprompt
    const prompt = getCachedPrompt()

    // Build user prompt
    const volumeRatio = testCase.quote.volume / testCase.quote.avgVolume

    const userPrompt = `Ticker: ${testCase.ticker}

Price Data (as of ${testCase.headlines[0].date.toISOString()}):
- Current Price: $${testCase.quote.price.toFixed(2)}
- Change: ${testCase.quote.change >= 0 ? '+' : ''}$${testCase.quote.change.toFixed(2)} (${testCase.quote.change >= 0 ? '+' : ''}${testCase.quote.changePercent.toFixed(2)}%)
- Day Range: $${testCase.quote.dayLow.toFixed(2)} - $${testCase.quote.dayHigh.toFixed(2)}
- Volume: ${testCase.quote.volume.toLocaleString()} (${volumeRatio.toFixed(2)}x average)
- Previous Close: $${testCase.quote.previousClose.toFixed(2)}

Recent Headlines (ranked by source quality and recency):
${testCase.headlines.map((h, i) => {
  const hoursAgo = Math.round((Date.now() - h.date.getTime()) / (1000 * 60 * 60))
  return `${i + 1}. "${h.title}" - ${h.source} (${hoursAgo} hours ago)`
}).join('\n')}

Return a JSON object with the required fields as specified in your instructions.`

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500
    })

    const responseText = completion.choices[0]?.message?.content?.trim()
    if (!responseText) {
      failures.push('Empty response from OpenAI')
      return {
        testCase,
        actual: {} as WhyItMovedData,
        passed: false,
        failures,
        timestamp: Date.now()
      }
    }

    // Parse and validate
    const actual = JSON.parse(responseText) as WhyItMovedData
    const validationResult = validateWhyItMoved(actual, testCase.ticker)

    if (!validationResult.valid) {
      failures.push(...validationResult.errors.map(e => `Validation: ${e}`))
    }

    // Check expected values
    const expected = testCase.expected

    // Sentiment check
    if (actual.sentiment !== expected.sentiment) {
      failures.push(`Sentiment mismatch: expected ${expected.sentiment}, got ${actual.sentiment}`)
    }

    // Score range check
    if (actual.score < expected.scoreRange[0] || actual.score > expected.scoreRange[1]) {
      failures.push(`Score out of range: expected ${expected.scoreRange[0]}-${expected.scoreRange[1]}, got ${actual.score}`)
    }

    // Confidence range check
    if (actual.confidence < expected.confidenceRange[0] || actual.confidence > expected.confidenceRange[1]) {
      failures.push(`Confidence out of range: expected ${expected.confidenceRange[0]}-${expected.confidenceRange[1]}, got ${actual.confidence}`)
    }

    // Primary driver content check
    if (expected.primaryDriverContains) {
      const driverLower = actual.primaryDriver.toLowerCase()
      const expectedLower = expected.primaryDriverContains.toLowerCase()
      if (!driverLower.includes(expectedLower)) {
        failures.push(`Primary driver missing "${expected.primaryDriverContains}": got "${actual.primaryDriver}"`)
      }
    }

    // Narrative must include check
    if (expected.narrativeMustInclude) {
      for (const phrase of expected.narrativeMustInclude) {
        if (!actual.narrative.includes(phrase)) {
          failures.push(`Narrative missing required phrase "${phrase}"`)
        }
      }
    }

    return {
      testCase,
      actual,
      passed: failures.length === 0,
      failures,
      timestamp: Date.now()
    }

  } catch (error) {
    failures.push(`Error: ${error instanceof Error ? error.message : String(error)}`)
    return {
      testCase,
      actual: {} as WhyItMovedData,
      passed: false,
      failures,
      timestamp: Date.now()
    }
  }
}

/**
 * Run all eval test cases
 */
export async function runAllEvals(testCases: EvalTestCase[]): Promise<EvalSummary> {
  console.log(`[Evals] Running ${testCases.length} test cases...`)

  const results: EvalResult[] = []

  for (const testCase of testCases) {
    console.log(`[Evals] Running: ${testCase.name}`)
    const result = await runEvalTestCase(testCase)
    results.push(result)

    if (result.passed) {
      console.log(`  ✅ PASSED`)
    } else {
      console.log(`  ❌ FAILED`)
      result.failures.forEach(f => console.log(`     - ${f}`))
    }
  }

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const passRate = (passed / results.length) * 100

  const prompt = getCachedPrompt()

  const summary: EvalSummary = {
    totalTests: results.length,
    passed,
    failed,
    passRate,
    runDate: Date.now(),
    promptVersion: prompt.metadata.version,
    failures: results
      .filter(r => !r.passed)
      .map(r => ({
        testId: r.testCase.id,
        testName: r.testCase.name,
        reasons: r.failures
      }))
  }

  console.log('\n' + '='.repeat(60))
  console.log('[Evals] Summary')
  console.log('='.repeat(60))
  console.log(`Total Tests: ${summary.totalTests}`)
  console.log(`Passed: ${summary.passed}`)
  console.log(`Failed: ${summary.failed}`)
  console.log(`Pass Rate: ${summary.passRate.toFixed(1)}%`)
  console.log(`Prompt Version: ${summary.promptVersion}`)
  console.log('='.repeat(60))

  if (summary.passRate >= 80) {
    console.log('✅ DEPLOYMENT GATE PASSED (≥80%)')
  } else {
    console.log('❌ DEPLOYMENT GATE FAILED (<80%)')
    console.log('\nFailed tests:')
    summary.failures.forEach(f => {
      console.log(`\n  ${f.testName} (${f.testId}):`)
      f.reasons.forEach(r => console.log(`    - ${r}`))
    })
  }

  return summary
}

/**
 * Run evals and check deployment gate
 */
export async function checkDeploymentGate(testCases: EvalTestCase[]): Promise<boolean> {
  const summary = await runAllEvals(testCases)
  return summary.passRate >= 80
}
