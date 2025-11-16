/**
 * Metric Resolver - Smart Alias Resolution for Financial Metrics
 *
 * This module resolves user input (natural language phrases, abbreviations, typos)
 * to canonical metric names that exist in the database.
 *
 * Resolution Strategy:
 * 1. Check if input is already canonical (exact match)
 * 2. Check alias map (common phrases → canonical names)
 * 3. Try fuzzy matching (handle typos, case variations)
 * 4. Return null if no match found
 *
 * All resolution attempts are logged for telemetry and alias map improvement.
 */

import { METRIC_METADATA } from './metric-metadata'
import { createServerClient } from './supabase/server'

// Generate canonical metrics list from metadata
export const CANONICAL_METRICS = Object.keys(METRIC_METADATA)

// Generate alias map from metadata
const generateAliasMap = (): Record<string, string> => {
  const aliasMap: Record<string, string> = {}

  Object.entries(METRIC_METADATA).forEach(([metricName, metadata]) => {
    // Add each alias pointing to the canonical name
    metadata.commonAliases.forEach(alias => {
      const normalizedAlias = alias.toLowerCase().trim()
      if (aliasMap[normalizedAlias] && aliasMap[normalizedAlias] !== metricName) {
        console.warn(`Alias conflict: "${alias}" maps to both ${aliasMap[normalizedAlias]} and ${metricName}`)
      }
      aliasMap[normalizedAlias] = metricName
    })

    // Also add the canonical name itself (lowercase) for case-insensitive matching
    aliasMap[metricName.toLowerCase()] = metricName
  })

  return aliasMap
}

export const METRIC_ALIASES = generateAliasMap()

/**
 * Resolution result
 */
export interface MetricResolution {
  canonical: string | null
  method: 'canonical' | 'alias' | 'fuzzy' | null
  confidence?: number
}

/**
 * Resolve a single metric name to its canonical form
 *
 * @param input - User input (e.g., "P/E", "price to earnings", "peRatio")
 * @param context - Optional context for logging (e.g., user's question)
 * @returns Resolution result with canonical name and method used
 *
 * @example
 * resolveMetricName("P/E") // { canonical: "peRatio", method: "alias" }
 * resolveMetricName("peRatio") // { canonical: "peRatio", method: "canonical" }
 * resolveMetricName("pRatio") // { canonical: "peRatio", method: "fuzzy", confidence: 0.85 }
 */
export async function resolveMetricName(
  input: string,
  context?: { question?: string }
): Promise<MetricResolution> {
  const normalized = input.toLowerCase().trim()

  // 1. Check if already canonical (exact match, case-sensitive)
  if (CANONICAL_METRICS.includes(input)) {
    await logMetricResolution({
      userPhrase: input,
      resolvedTo: input,
      method: 'canonical',
      fuzzyScore: null,
      userQuestion: context?.question
    })
    return { canonical: input, method: 'canonical' }
  }

  // 2. Check alias map (case-insensitive)
  if (METRIC_ALIASES[normalized]) {
    const resolved = METRIC_ALIASES[normalized]
    await logMetricResolution({
      userPhrase: input,
      resolvedTo: resolved,
      method: 'alias',
      fuzzyScore: null,
      userQuestion: context?.question
    })
    return { canonical: resolved, method: 'alias' }
  }

  // 3. Try fuzzy matching
  const fuzzyMatch = findMostSimilar(normalized, CANONICAL_METRICS)

  if (fuzzyMatch.similarity >= 0.8) {
    // 80% similarity threshold
    await logMetricResolution({
      userPhrase: input,
      resolvedTo: fuzzyMatch.metric,
      method: 'fuzzy',
      fuzzyScore: fuzzyMatch.similarity,
      userQuestion: context?.question
    })
    return {
      canonical: fuzzyMatch.metric,
      method: 'fuzzy',
      confidence: fuzzyMatch.similarity
    }
  }

  // 4. Failed to resolve
  await logMetricResolution({
    userPhrase: input,
    resolvedTo: null,
    method: null,
    fuzzyScore: fuzzyMatch.similarity,
    fuzzyMatch: fuzzyMatch.metric,
    userQuestion: context?.question
  })

  return { canonical: null, method: null }
}

/**
 * Resolve multiple metric names at once
 *
 * @param inputs - Array of user inputs
 * @param context - Optional context for logging
 * @returns Object with resolved and unresolved metric names
 *
 * @example
 * resolveMetricNames(["P/E", "ROE", "debt to equity"])
 * // { resolved: ["peRatio", "returnOnEquity", "debtEquityRatio"], unresolved: [] }
 */
export async function resolveMetricNames(
  inputs: string[],
  context?: { question?: string }
): Promise<{
  resolved: string[]
  unresolved: string[]
}> {
  const resolved: string[] = []
  const unresolved: string[] = []

  for (const input of inputs) {
    const result = await resolveMetricName(input, context)

    if (result.canonical) {
      // Dedupe - only add if not already in resolved list
      if (!resolved.includes(result.canonical)) {
        resolved.push(result.canonical)
      }
    } else {
      unresolved.push(input)
    }
  }

  return { resolved, unresolved }
}

/**
 * Find the most similar canonical metric using Levenshtein distance
 *
 * @param input - Normalized user input
 * @param candidates - List of canonical metric names
 * @returns Best match with similarity score (0-1)
 */
function findMostSimilar(
  input: string,
  candidates: string[]
): { metric: string; similarity: number } {
  let bestMatch = candidates[0]
  let bestScore = 0

  for (const candidate of candidates) {
    const score = stringSimilarity(input, candidate.toLowerCase())
    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate
    }
  }

  return { metric: bestMatch, similarity: bestScore }
}

/**
 * Calculate string similarity using Levenshtein distance
 * Returns a score between 0 (completely different) and 1 (identical)
 *
 * @param a - First string
 * @param b - Second string
 * @returns Similarity score (0-1)
 */
function stringSimilarity(a: string, b: string): number {
  const matrix: number[][] = []

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  const distance = matrix[b.length][a.length]
  const maxLength = Math.max(a.length, b.length)

  // Convert distance to similarity score (0-1)
  return maxLength === 0 ? 1 : 1 - distance / maxLength
}

/**
 * Log metric resolution attempt to Supabase for telemetry
 * This helps us improve the alias map over time
 *
 * @param params - Resolution details
 */
async function logMetricResolution(params: {
  userPhrase: string
  resolvedTo: string | null
  method: 'canonical' | 'alias' | 'fuzzy' | null
  fuzzyScore: number | null
  fuzzyMatch?: string
  userQuestion?: string
}) {
  try {
    const supabase = await createServerClient()

    await supabase.from('metric_resolutions').insert({
      user_phrase: params.userPhrase,
      resolved_to: params.resolvedTo,
      resolution_method: params.method,
      fuzzy_match_score: params.fuzzyScore,
      fuzzy_match_suggestion: params.fuzzyMatch || null,
      user_question: params.userQuestion || null,
      timestamp: new Date().toISOString()
    })

    // Don't throw errors - telemetry should never break the app
  } catch (err) {
    console.error('Failed to log metric resolution:', err)
    // Silently fail - telemetry is nice-to-have, not critical
  }
}

/**
 * Validate that a metric name is canonical
 *
 * @param metricName - Metric name to validate
 * @returns True if canonical, false otherwise
 */
export function isCanonicalMetric(metricName: string): boolean {
  return CANONICAL_METRICS.includes(metricName)
}

/**
 * Get metadata for a canonical metric
 *
 * @param canonicalName - Canonical metric name
 * @returns Metric metadata or null if not found
 */
export function getMetricMetadata(canonicalName: string) {
  return METRIC_METADATA[canonicalName] || null
}
