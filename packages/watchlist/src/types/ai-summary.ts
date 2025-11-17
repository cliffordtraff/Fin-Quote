/**
 * Type definitions for "Why It Moved" AI Summary feature
 * Supporting metaprompting and structured output
 */

import { EarningsContext } from './earnings'

export interface WhyItMovedData {
  narrative: string
  primaryDriver: string
  sentiment: 'bullish' | 'neutral' | 'bearish'
  score: number  // -1 to 1
  confidence: number  // 0 to 1
  supportingFactors?: string[]
  priceContext?: {
    volumeNote?: string
    rangeNote?: string
    alignmentNote?: string
  }
}

export interface WhyItMovedResponse {
  data: WhyItMovedData
  summary: string  // Formatted narrative for backward compatibility
  meta: {
    promptVersion: string
    cached: boolean
    timestamp: number
    model: string
    earningsContextIncluded?: boolean  // Track if earnings context was in prompt
  }
  sources?: Array<{
    title: string
    source: string
    link: string
    time: string
  }>
  earningsContext?: EarningsContext  // Only included if confidence > 30%
  mock?: boolean  // Indicates fallback when no OpenAI key
}

export interface WhyItMovedError {
  error: string
  fallback?: WhyItMovedData
  details?: string
}

/**
 * Metaprompt structure
 */
export interface MetapromptData {
  systemPrompt: string
  metadata: {
    version: string
    rulesVersion: string
    generatedAt: number
    model: string
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings?: string[]
}

/**
 * Eval test case structure
 */
export interface EvalTestCase {
  id: string
  name: string
  ticker: string
  quote: {
    price: number
    change: number
    changePercent: number
    volume: number
    avgVolume: number
    dayLow: number
    dayHigh: number
    previousClose: number
  }
  headlines: Array<{
    title: string
    source: string
    date: Date
  }>
  expected: {
    sentiment: 'bullish' | 'neutral' | 'bearish'
    scoreRange: [number, number]
    confidenceRange: [number, number]
    primaryDriverContains?: string
    narrativeMustInclude?: string[]
  }
  description: string
}

/**
 * Eval results
 */
export interface EvalResult {
  testCase: EvalTestCase
  actual: WhyItMovedData
  passed: boolean
  failures: string[]
  timestamp: number
}

export interface EvalSummary {
  totalTests: number
  passed: number
  failed: number
  passRate: number
  runDate: number
  promptVersion: string
  failures: Array<{
    testId: string
    testName: string
    reasons: string[]
  }>
}
