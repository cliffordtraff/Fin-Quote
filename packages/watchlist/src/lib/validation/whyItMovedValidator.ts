/**
 * Validation logic for "Why It Moved" AI Summary outputs
 *
 * Validates structured JSON responses against rules defined in
 * docs/WHY_IT_MOVED_RULES.md
 */

import { WhyItMovedData, ValidationResult } from '@watchlist/types/ai-summary'

/**
 * Validate WhyItMovedData structure and business rules
 */
export function validateWhyItMoved(
  data: unknown,
  ticker: string
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Type guard
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      errors: ['Response is not an object']
    }
  }

  const d = data as Partial<WhyItMovedData>

  // Required field checks
  if (!d.narrative || typeof d.narrative !== 'string') {
    errors.push('Missing or invalid narrative field')
  }

  if (!d.primaryDriver || typeof d.primaryDriver !== 'string') {
    errors.push('Missing or invalid primaryDriver field')
  }

  if (!d.sentiment || !['bullish', 'neutral', 'bearish'].includes(d.sentiment)) {
    errors.push('Missing or invalid sentiment field (must be bullish, neutral, or bearish)')
  }

  if (typeof d.score !== 'number') {
    errors.push('Missing or invalid score field (must be a number)')
  }

  if (typeof d.confidence !== 'number') {
    errors.push('Missing or invalid confidence field (must be a number)')
  }

  // If required fields are missing, return early
  if (errors.length > 0) {
    return { valid: false, errors, warnings }
  }

  // Range validation
  if (d.score! < -1 || d.score! > 1) {
    errors.push(`Score out of range: ${d.score} (must be -1 to 1)`)
  }

  if (d.confidence! < 0 || d.confidence! > 1) {
    errors.push(`Confidence out of range: ${d.confidence} (must be 0 to 1)`)
  }

  // Length validation
  if (d.narrative!.length < 100 || d.narrative!.length > 250) {
    errors.push(`Narrative length invalid: ${d.narrative!.length} chars (must be 100-250)`)
  }

  if (d.primaryDriver!.length < 20 || d.primaryDriver!.length > 80) {
    warnings.push(`Primary driver length unusual: ${d.primaryDriver!.length} chars (recommended 20-80)`)
  }

  // Narrative format validation
  const narrativeUpper = d.narrative!.toUpperCase()
  if (!narrativeUpper.startsWith(ticker.toUpperCase())) {
    errors.push(`Narrative must start with ticker symbol "${ticker}"`)
  }

  // Sentiment/score alignment validation
  const sentimentScoreValid = validateSentimentScoreAlignment(d.sentiment!, d.score!)
  if (!sentimentScoreValid.valid) {
    errors.push(sentimentScoreValid.error!)
  }

  // Optional field validation
  if (d.supportingFactors) {
    if (!Array.isArray(d.supportingFactors)) {
      errors.push('supportingFactors must be an array')
    } else if (d.supportingFactors.length > 3) {
      warnings.push(`Too many supporting factors: ${d.supportingFactors.length} (recommended max 3)`)
    }
  }

  if (d.priceContext) {
    if (typeof d.priceContext !== 'object') {
      errors.push('priceContext must be an object')
    } else {
      const ctx = d.priceContext
      if (ctx.volumeNote && typeof ctx.volumeNote !== 'string') {
        errors.push('priceContext.volumeNote must be a string')
      }
      if (ctx.rangeNote && typeof ctx.rangeNote !== 'string') {
        errors.push('priceContext.rangeNote must be a string')
      }
      if (ctx.alignmentNote && typeof ctx.alignmentNote !== 'string') {
        errors.push('priceContext.alignmentNote must be a string')
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined
  }
}

/**
 * Validate sentiment and score alignment
 */
function validateSentimentScoreAlignment(
  sentiment: string,
  score: number
): { valid: boolean; error?: string } {
  switch (sentiment) {
    case 'bullish':
      if (score < 0.3 || score > 1.0) {
        return {
          valid: false,
          error: `Sentiment "bullish" requires score 0.3-1.0, got ${score}`
        }
      }
      break

    case 'neutral':
      if (score < -0.2 || score > 0.2) {
        return {
          valid: false,
          error: `Sentiment "neutral" requires score -0.2-0.2, got ${score}`
        }
      }
      break

    case 'bearish':
      if (score < -1.0 || score > -0.3) {
        return {
          valid: false,
          error: `Sentiment "bearish" requires score -1.0 to -0.3, got ${score}`
        }
      }
      break

    default:
      return {
        valid: false,
        error: `Unknown sentiment: ${sentiment}`
      }
  }

  return { valid: true }
}

/**
 * Generate a fallback response when validation fails and retry exhausted
 */
export function generateFallback(
  ticker: string,
  priceChange: number,
  priceChangePercent: number,
  price: number
): WhyItMovedData {
  const direction = priceChange >= 0 ? 'up' : 'down'
  const absPercent = Math.abs(priceChangePercent)

  return {
    narrative: `${ticker} is ${direction} ${absPercent.toFixed(2)}% at $${price.toFixed(2)}. Unable to generate detailed summary due to validation errors.`,
    primaryDriver: 'Validation failed',
    sentiment: 'neutral',
    score: 0,
    confidence: 0.1
  }
}
