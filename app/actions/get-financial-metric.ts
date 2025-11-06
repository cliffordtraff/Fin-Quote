'use server'

/**
 * Server action to fetch financial metrics from the new financial_metrics table
 * Supports 139 metrics including P/E, Market Cap, ROE, Debt-to-Equity, etc.
 */

import { createClient } from '@/lib/supabase/server'

export interface FinancialMetricParams {
  symbol: string
  metricName: string // e.g., 'peRatio', 'marketCap', 'roe'
  yearStart?: number
  yearEnd?: number
  limit?: number
}

export interface FinancialMetricResult {
  year: number
  metric_name: string
  metric_value: number | null
  metric_category: string | null
  data_source: string | null
}

export async function getFinancialMetric(
  params: FinancialMetricParams
): Promise<{
  data: FinancialMetricResult[] | null
  error: string | null
}> {
  try {
    const supabase = createClient()

    // Build query
    let query = supabase
      .from('financial_metrics')
      .select('year, metric_name, metric_value, metric_category, data_source')
      .eq('symbol', params.symbol)
      .eq('metric_name', params.metricName)
      .order('year', { ascending: false })

    // Apply year filters
    if (params.yearStart) {
      query = query.gte('year', params.yearStart)
    }
    if (params.yearEnd) {
      query = query.lte('year', params.yearEnd)
    }

    // Apply limit (default 10, max 20)
    const limit = Math.min(params.limit || 10, 20)
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
 * Get multiple metrics for a single year (useful for comparisons)
 */
export async function getFinancialMetrics(params: {
  symbol: string
  metricNames: string[] // Array of metric names
  year?: number
  yearStart?: number
  yearEnd?: number
}): Promise<{
  data: FinancialMetricResult[] | null
  error: string | null
}> {
  try {
    const supabase = createClient()

    let query = supabase
      .from('financial_metrics')
      .select('year, metric_name, metric_value, metric_category, data_source')
      .eq('symbol', params.symbol)
      .in('metric_name', params.metricNames)
      .order('year', { ascending: false })
      .order('metric_name', { ascending: true })

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

    // Limit to prevent too much data
    query = query.limit(100)

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
 * Search metrics by category (e.g., all "Valuation" metrics)
 */
export async function getMetricsByCategory(params: {
  symbol: string
  category: string // 'Valuation', 'Profitability & Returns', 'Growth', etc.
  year?: number
}): Promise<{
  data: FinancialMetricResult[] | null
  error: string | null
}> {
  try {
    const supabase = createClient()

    let query = supabase
      .from('financial_metrics')
      .select('year, metric_name, metric_value, metric_category, data_source')
      .eq('symbol', params.symbol)
      .eq('metric_category', params.category)
      .order('metric_name', { ascending: true })

    if (params.year) {
      query = query.eq('year', params.year)
    } else {
      // Get most recent year if not specified
      query = query.order('year', { ascending: false }).limit(50)
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
