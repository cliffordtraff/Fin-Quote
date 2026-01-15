'use server'

/**
 * Server action to fetch financial metrics from the financial_metrics table
 * Supports 130+ metrics including P/E, Market Cap, ROE, Debt-to-Equity, etc.
 *
 * Features:
 * - Alias resolution: "P/E" → "peRatio", "ROE" → "returnOnEquity"
 * - Multi-metric queries: fetch multiple metrics in one call
 * - Flexible filtering by year range
 * - Annual, quarterly, and TTM data support
 */

import { createServerClient } from '@/lib/supabase/server'
import { resolveMetricNames } from '@/lib/metric-resolver'
import { calculateTTM, TTMResult, QuarterlyDataPoint } from '@/lib/ttm-calculator'
import { supportsTTM, getTTMConfig } from '@/lib/ttm-config'

// Period type for annual vs quarterly vs TTM data
export type PeriodType = 'annual' | 'quarterly' | 'ttm'

export interface FinancialMetricParams {
  symbol: string
  metricName: string // e.g., 'peRatio', 'marketCap', 'roe'
  yearStart?: number
  yearEnd?: number
  limit?: number
  period?: PeriodType // 'annual' (default), 'quarterly', or 'ttm'
  quarters?: number[] // optional filter for specific quarters [1-4], only valid when period='quarterly'
}

export interface FinancialMetricResult {
  year: number
  metric_name: string
  metric_value: number | null
  metric_category: string | null
  data_source: string | null
  // Quarterly support fields
  period_type?: string | null
  fiscal_quarter?: number | null
  fiscal_label?: string | null
  // TTM support fields
  is_ttm?: boolean
  ttm_quarters_used?: number
  ttm_calculation_type?: string
}

// TTM-specific result interface
export interface TTMMetricResult {
  metric_name: string
  ttm_value: number | null
  calculation_type: string
  quarters_used: number
  latest_quarter: string
  error?: string
}

export async function getFinancialMetric(
  params: FinancialMetricParams
): Promise<{
  data: FinancialMetricResult[] | null
  error: string | null
  ttm?: TTMMetricResult | null
}> {
  const period = params.period ?? 'annual'
  const quarters = params.quarters

  // Parameter validation
  if (period === 'annual' && quarters && quarters.length > 0) {
    return { data: null, error: "Invalid parameters: 'quarters' can only be specified when period='quarterly'" }
  }
  if (period === 'ttm' && quarters && quarters.length > 0) {
    return { data: null, error: "Invalid parameters: 'quarters' cannot be specified when period='ttm'" }
  }
  if (quarters && quarters.some(q => q < 1 || q > 4)) {
    return { data: null, error: "Invalid parameters: 'quarters' must be between 1 and 4" }
  }

  // Handle TTM calculation
  if (period === 'ttm') {
    return await calculateTTMForMetric(params.symbol, params.metricName)
  }

  try {
    const supabase = await createServerClient()

    // Build query with quarterly fields
    let query = supabase
      .from('financial_metrics')
      .select('year, metric_name, metric_value, metric_category, data_source, period_type, fiscal_quarter, fiscal_label')
      .eq('symbol', params.symbol)
      .eq('metric_name', params.metricName)
      .eq('period_type', period)
      .order('year', { ascending: false })
      .order('fiscal_quarter', { ascending: false, nullsFirst: false })

    // Apply quarter filter for quarterly data
    if (period === 'quarterly' && quarters && quarters.length > 0) {
      query = query.in('fiscal_quarter', quarters)
    }

    // Apply year filters
    if (params.yearStart) {
      query = query.gte('year', params.yearStart)
    }
    if (params.yearEnd) {
      query = query.lte('year', params.yearEnd)
    }

    // Apply limit (default: 10 years or 12 quarters, max: 20 years or 40 quarters)
    const defaultLimit = period === 'quarterly' ? 12 : 10
    const maxLimit = period === 'quarterly' ? 40 : 20
    const limit = Math.min(params.limit || defaultLimit, maxLimit)
    query = query.limit(limit)

    const { data, error } = await query

    if (error) {
      console.error('[getFinancialMetric] Error:', error)
      return { data: null, error: error.message }
    }

    return { data, error: null }
  } catch (err: any) {
    console.error('[getFinancialMetric] Exception:', err)
    return { data: null, error: err.message }
  }
}

/**
 * Calculate TTM value for a single metric
 * Fetches last 4 quarters and calculates based on metric type
 */
async function calculateTTMForMetric(
  symbol: string,
  metricName: string
): Promise<{
  data: FinancialMetricResult[] | null
  error: string | null
  ttm?: TTMMetricResult | null
}> {
  // Check if metric supports TTM
  if (!supportsTTM(metricName)) {
    const config = getTTMConfig(metricName)
    return {
      data: null,
      error: `TTM not supported for ${metricName}. ${config ? 'This is a ' + config.calcType + ' metric.' : 'Unknown metric.'}`,
      ttm: null
    }
  }

  try {
    const supabase = await createServerClient()

    // Fetch last 8 quarters to ensure we have at least 4 complete ones
    const { data: quarterlyData, error } = await supabase
      .from('financial_metrics')
      .select('year, metric_name, metric_value, metric_category, data_source, period_type, fiscal_quarter, fiscal_label')
      .eq('symbol', symbol)
      .eq('metric_name', metricName)
      .eq('period_type', 'quarterly')
      .order('year', { ascending: false })
      .order('fiscal_quarter', { ascending: false, nullsFirst: false })
      .limit(8)

    if (error) {
      console.error('[calculateTTMForMetric] Error:', error)
      return { data: null, error: error.message }
    }

    if (!quarterlyData || quarterlyData.length === 0) {
      return {
        data: null,
        error: `No quarterly data available for ${metricName}`,
        ttm: null
      }
    }

    // Convert to QuarterlyDataPoint format
    const dataPoints: QuarterlyDataPoint[] = quarterlyData.map(d => ({
      year: d.year,
      fiscal_quarter: d.fiscal_quarter,
      fiscal_label: d.fiscal_label,
      metric_value: d.metric_value
    }))

    // Calculate TTM
    const ttmResult = calculateTTM(metricName, dataPoints)

    // Create a result that looks like regular data but with TTM info
    const ttmData: FinancialMetricResult[] = ttmResult.ttm_value !== null ? [{
      year: new Date().getFullYear(),
      metric_name: metricName,
      metric_value: ttmResult.ttm_value,
      metric_category: quarterlyData[0]?.metric_category || null,
      data_source: 'calculated_ttm',
      period_type: 'ttm',
      fiscal_quarter: null,
      fiscal_label: `TTM (${ttmResult.latest_quarter})`,
      is_ttm: true,
      ttm_quarters_used: ttmResult.quarters_used,
      ttm_calculation_type: ttmResult.calculation_type
    }] : null

    return {
      data: ttmData,
      error: ttmResult.error || null,
      ttm: {
        metric_name: ttmResult.metric_name,
        ttm_value: ttmResult.ttm_value,
        calculation_type: ttmResult.calculation_type,
        quarters_used: ttmResult.quarters_used,
        latest_quarter: ttmResult.latest_quarter,
        error: ttmResult.error
      }
    }
  } catch (err: any) {
    console.error('[calculateTTMForMetric] Exception:', err)
    return { data: null, error: err.message }
  }
}

/**
 * Get multiple metrics for a single year (useful for comparisons)
 * NOW WITH ALIAS SUPPORT - accepts flexible metric names
 * Supports annual, quarterly, and TTM data
 *
 * @example
 * getFinancialMetrics({
 *   symbol: 'AAPL',
 *   metricNames: ['P/E', 'ROE', 'debt to equity'], // Aliases work!
 *   limit: 5,
 *   period: 'quarterly' // optional, defaults to 'annual'
 * })
 */
export async function getFinancialMetrics(params: {
  symbol: string
  metricNames: string[] // Array of metric names (canonical OR aliases)
  year?: number
  yearStart?: number
  yearEnd?: number
  limit?: number // Number of years/quarters per metric (default: 5 years or 12 quarters, max: 20/40)
  period?: PeriodType // 'annual' (default), 'quarterly', or 'ttm'
  quarters?: number[] // optional filter for specific quarters [1-4], only valid when period='quarterly'
}): Promise<{
  data: FinancialMetricResult[] | null
  error: string | null
  unresolved?: string[] // Metrics that couldn't be resolved
  ttmResults?: TTMMetricResult[] // TTM results when period='ttm'
}> {
  const period = params.period ?? 'annual'
  const quarters = params.quarters

  // Parameter validation
  if (period === 'annual' && quarters && quarters.length > 0) {
    return { data: null, error: "Invalid parameters: 'quarters' can only be specified when period='quarterly'", unresolved: [] }
  }
  if (period === 'ttm' && quarters && quarters.length > 0) {
    return { data: null, error: "Invalid parameters: 'quarters' cannot be specified when period='ttm'", unresolved: [] }
  }
  if (quarters && quarters.some(q => q < 1 || q > 4)) {
    return { data: null, error: "Invalid parameters: 'quarters' must be between 1 and 4", unresolved: [] }
  }

  try {
    // 1. Resolve all metric names (aliases → canonical)
    const { resolved, unresolved } = await resolveMetricNames(params.metricNames)

    // 2. If any metrics couldn't be resolved, return error with suggestions
    if (unresolved.length > 0) {
      return {
        data: null,
        error: `Could not resolve these metrics: ${unresolved.join(', ')}. Use listMetrics to see available metrics.`,
        unresolved
      }
    }

    // Handle TTM calculation for multiple metrics
    if (period === 'ttm') {
      return await calculateTTMForMultipleMetrics(params.symbol, resolved)
    }

    // 3. Query database with resolved canonical names
    const supabase = await createServerClient()

    let query = supabase
      .from('financial_metrics')
      .select('year, metric_name, metric_value, metric_category, data_source, period_type, fiscal_quarter, fiscal_label')
      .eq('symbol', params.symbol)
      .in('metric_name', resolved) // Use resolved canonical names
      .eq('period_type', period)
      .order('year', { ascending: false })
      .order('fiscal_quarter', { ascending: false, nullsFirst: false })
      .order('metric_name', { ascending: true })

    // Apply quarter filter for quarterly data
    if (period === 'quarterly' && quarters && quarters.length > 0) {
      query = query.in('fiscal_quarter', quarters)
    }

    // 4. Apply year filters
    if (params.year) {
      query = query.eq('year', params.year)
    } else {
      if (params.yearStart) {
        query = query.gte('year', params.yearStart)
      }
      if (params.yearEnd) {
        query = query.lte('year', params.yearEnd)
      }
    }

    // 5. Apply limit (default: 5 years or 12 quarters per metric, max: 20/40)
    const defaultLimit = period === 'quarterly' ? 12 : 5
    const maxLimit = period === 'quarterly' ? 40 : 20
    const limit = Math.min(params.limit || defaultLimit, maxLimit)
    query = query.limit(limit * resolved.length)

    const { data, error } = await query

    if (error) {
      console.error('[getFinancialMetrics] Error:', error)
      return { data: null, error: error.message }
    }

    return { data, error: null }
  } catch (err: any) {
    console.error('[getFinancialMetrics] Exception:', err)
    return { data: null, error: err.message }
  }
}

/**
 * Calculate TTM values for multiple metrics
 * Fetches quarterly data for all metrics and calculates TTM for each
 */
async function calculateTTMForMultipleMetrics(
  symbol: string,
  metricNames: string[]
): Promise<{
  data: FinancialMetricResult[] | null
  error: string | null
  unresolved?: string[]
  ttmResults?: TTMMetricResult[]
}> {
  // Filter to only metrics that support TTM
  const supportedMetrics: string[] = []
  const unsupportedMetrics: string[] = []

  for (const metric of metricNames) {
    if (supportsTTM(metric)) {
      supportedMetrics.push(metric)
    } else {
      unsupportedMetrics.push(metric)
    }
  }

  if (supportedMetrics.length === 0) {
    return {
      data: null,
      error: `None of the requested metrics support TTM calculation: ${unsupportedMetrics.join(', ')}`,
      unresolved: unsupportedMetrics
    }
  }

  try {
    const supabase = await createServerClient()

    // Fetch quarterly data for all supported metrics
    const { data: quarterlyData, error } = await supabase
      .from('financial_metrics')
      .select('year, metric_name, metric_value, metric_category, data_source, period_type, fiscal_quarter, fiscal_label')
      .eq('symbol', symbol)
      .in('metric_name', supportedMetrics)
      .eq('period_type', 'quarterly')
      .order('year', { ascending: false })
      .order('fiscal_quarter', { ascending: false, nullsFirst: false })
      .limit(8 * supportedMetrics.length) // 8 quarters per metric to ensure we have enough

    if (error) {
      console.error('[calculateTTMForMultipleMetrics] Error:', error)
      return { data: null, error: error.message }
    }

    if (!quarterlyData || quarterlyData.length === 0) {
      return {
        data: null,
        error: 'No quarterly data available for TTM calculation',
        unresolved: unsupportedMetrics.length > 0 ? unsupportedMetrics : undefined
      }
    }

    // Group data by metric
    const dataByMetric: Record<string, QuarterlyDataPoint[]> = {}
    for (const d of quarterlyData) {
      if (!dataByMetric[d.metric_name]) {
        dataByMetric[d.metric_name] = []
      }
      dataByMetric[d.metric_name].push({
        year: d.year,
        fiscal_quarter: d.fiscal_quarter,
        fiscal_label: d.fiscal_label,
        metric_value: d.metric_value
      })
    }

    // Calculate TTM for each metric
    const ttmResults: TTMMetricResult[] = []
    const ttmData: FinancialMetricResult[] = []

    for (const metricName of supportedMetrics) {
      const metricData = dataByMetric[metricName] || []
      const ttmResult = calculateTTM(metricName, metricData)

      ttmResults.push({
        metric_name: ttmResult.metric_name,
        ttm_value: ttmResult.ttm_value,
        calculation_type: ttmResult.calculation_type,
        quarters_used: ttmResult.quarters_used,
        latest_quarter: ttmResult.latest_quarter,
        error: ttmResult.error
      })

      if (ttmResult.ttm_value !== null) {
        // Find category from original data
        const category = quarterlyData.find(d => d.metric_name === metricName)?.metric_category || null

        ttmData.push({
          year: new Date().getFullYear(),
          metric_name: metricName,
          metric_value: ttmResult.ttm_value,
          metric_category: category,
          data_source: 'calculated_ttm',
          period_type: 'ttm',
          fiscal_quarter: null,
          fiscal_label: `TTM (${ttmResult.latest_quarter})`,
          is_ttm: true,
          ttm_quarters_used: ttmResult.quarters_used,
          ttm_calculation_type: ttmResult.calculation_type
        })
      }
    }

    return {
      data: ttmData.length > 0 ? ttmData : null,
      error: unsupportedMetrics.length > 0
        ? `Some metrics don't support TTM: ${unsupportedMetrics.join(', ')}`
        : null,
      unresolved: unsupportedMetrics.length > 0 ? unsupportedMetrics : undefined,
      ttmResults
    }
  } catch (err: any) {
    console.error('[calculateTTMForMultipleMetrics] Exception:', err)
    return { data: null, error: err.message }
  }
}

/**
 * Search metrics by category (e.g., all "Valuation" metrics)
 * Supports annual, quarterly, and TTM data
 */
export async function getMetricsByCategory(params: {
  symbol: string
  category: string // 'Valuation', 'Profitability & Returns', 'Growth', etc.
  year?: number
  period?: PeriodType // 'annual' (default), 'quarterly', or 'ttm'
  quarters?: number[] // optional filter for specific quarters [1-4]
}): Promise<{
  data: FinancialMetricResult[] | null
  error: string | null
  ttmResults?: TTMMetricResult[]
}> {
  const period = params.period ?? 'annual'
  const quarters = params.quarters

  // Parameter validation
  if (period === 'annual' && quarters && quarters.length > 0) {
    return { data: null, error: "Invalid parameters: 'quarters' can only be specified when period='quarterly'" }
  }
  if (period === 'ttm' && quarters && quarters.length > 0) {
    return { data: null, error: "Invalid parameters: 'quarters' cannot be specified when period='ttm'" }
  }

  try {
    const supabase = await createServerClient()

    // For TTM, first get the metrics in the category, then calculate TTM for each
    if (period === 'ttm') {
      // First, get unique metric names in this category
      const { data: metricsInCategory, error: categoryError } = await supabase
        .from('financial_metrics')
        .select('metric_name')
        .eq('symbol', params.symbol)
        .eq('metric_category', params.category)
        .eq('period_type', 'quarterly')

      if (categoryError) {
        console.error('[getMetricsByCategory] Error getting category metrics:', categoryError)
        return { data: null, error: categoryError.message }
      }

      if (!metricsInCategory || metricsInCategory.length === 0) {
        return { data: null, error: `No metrics found in category: ${params.category}` }
      }

      // Get unique metric names
      const uniqueMetrics = [...new Set(metricsInCategory.map(m => m.metric_name))]

      // Calculate TTM for these metrics
      return await calculateTTMForMultipleMetrics(params.symbol, uniqueMetrics)
    }

    let query = supabase
      .from('financial_metrics')
      .select('year, metric_name, metric_value, metric_category, data_source, period_type, fiscal_quarter, fiscal_label')
      .eq('symbol', params.symbol)
      .eq('metric_category', params.category)
      .eq('period_type', period)
      .order('metric_name', { ascending: true })

    // Apply quarter filter for quarterly data
    if (period === 'quarterly' && quarters && quarters.length > 0) {
      query = query.in('fiscal_quarter', quarters)
    }

    if (params.year) {
      query = query.eq('year', params.year)
    } else {
      // Get most recent periods if not specified
      const limit = period === 'quarterly' ? 200 : 50
      query = query.order('year', { ascending: false }).limit(limit)
    }

    const { data, error } = await query

    if (error) {
      console.error('[getMetricsByCategory] Error:', error)
      return { data: null, error: error.message }
    }

    return { data, error: null }
  } catch (err: any) {
    console.error('[getMetricsByCategory] Exception:', err)
    return { data: null, error: err.message }
  }
}
