/**
 * TTM (Trailing Twelve Months) Calculator
 *
 * Calculates TTM values from quarterly data based on metric classification.
 * Supports:
 * - Sum: Add last 4 quarters (flow metrics like revenue, net income)
 * - Point-in-time: Use most recent quarter (balance sheet items)
 * - Average: Average of last 4 quarters (cycle metrics in days)
 * - Derived: Recalculate from TTM components (ratios like ROE, margins)
 */

import { TTMCalcType, getTTMConfig, supportsTTM } from './ttm-config'

export interface QuarterlyDataPoint {
  year: number
  fiscal_quarter: number | null
  fiscal_label: string | null
  metric_value: number | null
}

export interface TTMResult {
  metric_name: string
  ttm_value: number | null
  calculation_type: TTMCalcType
  quarters_used: number
  latest_quarter: string  // e.g., "2025-Q1"
  error?: string
}

/**
 * Calculate TTM value for a single metric from quarterly data
 *
 * @param metricName - The canonical metric name
 * @param quarterlyData - Array of quarterly data points, sorted newest first
 * @returns TTM calculation result
 */
export function calculateTTM(
  metricName: string,
  quarterlyData: QuarterlyDataPoint[]
): TTMResult {
  const config = getTTMConfig(metricName)

  // Check if metric supports TTM
  if (!config) {
    return {
      metric_name: metricName,
      ttm_value: null,
      calculation_type: 'not_applicable',
      quarters_used: 0,
      latest_quarter: '',
      error: `Unknown metric: ${metricName}`
    }
  }

  if (config.calcType === 'not_applicable') {
    return {
      metric_name: metricName,
      ttm_value: null,
      calculation_type: 'not_applicable',
      quarters_used: 0,
      latest_quarter: '',
      error: `TTM not applicable for ${metricName} (growth rate, price-based, or multi-year metric)`
    }
  }

  // Filter out null values and ensure we have quarterly data
  const validData = quarterlyData.filter(
    (d) => d.metric_value !== null && d.fiscal_quarter !== null
  )

  if (validData.length === 0) {
    return {
      metric_name: metricName,
      ttm_value: null,
      calculation_type: config.calcType,
      quarters_used: 0,
      latest_quarter: '',
      error: 'No valid quarterly data available'
    }
  }

  // Sort by year and quarter descending to get most recent first
  const sortedData = [...validData].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    return (b.fiscal_quarter ?? 0) - (a.fiscal_quarter ?? 0)
  })

  // Get the 4 most recent quarters
  const lastFourQuarters = sortedData.slice(0, 4)
  const latestQuarter =
    lastFourQuarters[0]?.fiscal_label ||
    `${lastFourQuarters[0]?.year}-Q${lastFourQuarters[0]?.fiscal_quarter}`

  // Calculate based on type
  let ttmValue: number | null = null
  let error: string | undefined

  switch (config.calcType) {
    case 'sum':
      // Sum the last 4 quarters
      if (lastFourQuarters.length < 4) {
        error = `Only ${lastFourQuarters.length} quarters available, need 4 for complete TTM`
      }
      ttmValue = lastFourQuarters.reduce(
        (sum, d) => sum + (d.metric_value ?? 0),
        0
      )
      break

    case 'point_in_time':
      // Use the most recent quarter value
      ttmValue = lastFourQuarters[0]?.metric_value ?? null
      break

    case 'average':
      // Average of available quarters (up to 4)
      if (lastFourQuarters.length > 0) {
        ttmValue =
          lastFourQuarters.reduce((sum, d) => sum + (d.metric_value ?? 0), 0) /
          lastFourQuarters.length
      }
      if (lastFourQuarters.length < 4) {
        error = `Average based on ${lastFourQuarters.length} quarters (4 preferred)`
      }
      break

    case 'derived':
      // For derived metrics, we need to fetch component metrics
      // This is handled separately in calculateDerivedTTM
      error = 'Derived metrics require component data - use calculateDerivedTTM'
      break
  }

  return {
    metric_name: metricName,
    ttm_value: ttmValue,
    calculation_type: config.calcType,
    quarters_used: lastFourQuarters.length,
    latest_quarter: latestQuarter,
    error
  }
}

/**
 * Calculate TTM for derived metrics using component TTM values
 *
 * @param metricName - The derived metric name
 * @param componentTTMs - Map of component metric names to their TTM values
 * @returns TTM calculation result
 */
export function calculateDerivedTTM(
  metricName: string,
  componentTTMs: Record<string, number | null>,
  latestQuarter: string
): TTMResult {
  const config = getTTMConfig(metricName)

  if (!config || config.calcType !== 'derived' || !config.derivedFrom) {
    return {
      metric_name: metricName,
      ttm_value: null,
      calculation_type: config?.calcType || 'not_applicable',
      quarters_used: 0,
      latest_quarter: latestQuarter,
      error: `${metricName} is not a derived metric or missing formula`
    }
  }

  const { numerator, denominator, operation, multiplier } = config.derivedFrom

  // Get numerator value (may be array of metrics to sum)
  let numValue: number | null = null
  if (Array.isArray(numerator)) {
    const values = numerator.map((m) => componentTTMs[m])
    if (values.some((v) => v === null || v === undefined)) {
      return {
        metric_name: metricName,
        ttm_value: null,
        calculation_type: 'derived',
        quarters_used: 0,
        latest_quarter: latestQuarter,
        error: `Missing numerator components: ${numerator.filter((m) => componentTTMs[m] === null || componentTTMs[m] === undefined).join(', ')}`
      }
    }
    numValue = values.reduce((sum, v) => sum! + v!, 0)
  } else {
    numValue = componentTTMs[numerator] ?? null
    if (numValue === null || numValue === undefined) {
      return {
        metric_name: metricName,
        ttm_value: null,
        calculation_type: 'derived',
        quarters_used: 0,
        latest_quarter: latestQuarter,
        error: `Missing numerator: ${numerator}`
      }
    }
  }

  // Get denominator value (may be array of metrics to sum)
  let denomValue: number | null = null
  if (Array.isArray(denominator)) {
    const values = denominator.map((m) => componentTTMs[m])
    if (values.some((v) => v === null || v === undefined)) {
      return {
        metric_name: metricName,
        ttm_value: null,
        calculation_type: 'derived',
        quarters_used: 0,
        latest_quarter: latestQuarter,
        error: `Missing denominator components: ${denominator.filter((m) => componentTTMs[m] === null || componentTTMs[m] === undefined).join(', ')}`
      }
    }
    denomValue = values.reduce((sum, v) => sum! + v!, 0)
  } else {
    denomValue = componentTTMs[denominator] ?? null
    if (denomValue === null || denomValue === undefined) {
      return {
        metric_name: metricName,
        ttm_value: null,
        calculation_type: 'derived',
        quarters_used: 0,
        latest_quarter: latestQuarter,
        error: `Missing denominator: ${denominator}`
      }
    }
  }

  // Avoid division by zero
  if (denomValue === 0) {
    return {
      metric_name: metricName,
      ttm_value: null,
      calculation_type: 'derived',
      quarters_used: 0,
      latest_quarter: latestQuarter,
      error: 'Division by zero (denominator is 0)'
    }
  }

  // Calculate result
  let result: number
  if (operation === 'divide') {
    result = numValue! / denomValue!
  } else {
    result = numValue! * denomValue!
  }

  // Apply multiplier if present (e.g., 100 for percentages)
  if (multiplier) {
    result *= multiplier
  }

  return {
    metric_name: metricName,
    ttm_value: result,
    calculation_type: 'derived',
    quarters_used: 4, // Assuming components were calculated from 4 quarters
    latest_quarter: latestQuarter
  }
}

/**
 * Batch calculate TTM for multiple metrics
 *
 * @param metricsData - Map of metric names to their quarterly data
 * @returns Map of metric names to TTM results
 */
export function calculateMultipleTTM(
  metricsData: Record<string, QuarterlyDataPoint[]>
): Record<string, TTMResult> {
  const results: Record<string, TTMResult> = {}

  // First pass: Calculate simple TTM values (sum, point_in_time, average)
  for (const [metricName, data] of Object.entries(metricsData)) {
    const config = getTTMConfig(metricName)
    if (config && config.calcType !== 'derived') {
      results[metricName] = calculateTTM(metricName, data)
    }
  }

  // Second pass: Calculate derived metrics using component TTM values
  for (const metricName of Object.keys(metricsData)) {
    const config = getTTMConfig(metricName)
    if (config && config.calcType === 'derived') {
      // Build component TTM map
      const componentTTMs: Record<string, number | null> = {}
      for (const [name, result] of Object.entries(results)) {
        componentTTMs[name] = result.ttm_value
      }

      // Get latest quarter from any existing result
      const latestQuarter =
        Object.values(results).find((r) => r.latest_quarter)?.latest_quarter ||
        ''

      results[metricName] = calculateDerivedTTM(
        metricName,
        componentTTMs,
        latestQuarter
      )
    }
  }

  return results
}

/**
 * Validate TTM result against expected value (for testing)
 *
 * @param calculated - Calculated TTM value
 * @param expected - Expected TTM value (e.g., from FMP API)
 * @param tolerance - Acceptable difference percentage (default 2%)
 * @returns Whether the values match within tolerance
 */
export function validateTTM(
  calculated: number | null,
  expected: number | null,
  tolerance: number = 0.02
): { isValid: boolean; difference: number | null } {
  if (calculated === null || expected === null) {
    return { isValid: calculated === expected, difference: null }
  }

  if (expected === 0) {
    return { isValid: Math.abs(calculated) < 0.001, difference: calculated }
  }

  const difference = Math.abs((calculated - expected) / expected)
  return {
    isValid: difference <= tolerance,
    difference
  }
}

/**
 * Format TTM result for display
 */
export function formatTTMResult(result: TTMResult): string {
  if (result.error) {
    return `${result.metric_name}: Error - ${result.error}`
  }

  if (result.ttm_value === null) {
    return `${result.metric_name}: N/A`
  }

  const value =
    Math.abs(result.ttm_value) >= 1e9
      ? `$${(result.ttm_value / 1e9).toFixed(2)}B`
      : Math.abs(result.ttm_value) >= 1e6
        ? `$${(result.ttm_value / 1e6).toFixed(2)}M`
        : result.ttm_value.toFixed(2)

  return `${result.metric_name} TTM: ${value} (${result.calculation_type}, ${result.quarters_used}Q, latest: ${result.latest_quarter})`
}
