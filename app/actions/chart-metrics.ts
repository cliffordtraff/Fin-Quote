'use server'

import { createServerClient } from '@/lib/supabase/server'
import { Financial } from '@/lib/database.types'

// Metric configuration with labels and units
const METRIC_CONFIG = {
  revenue: { label: 'Revenue', unit: 'currency' as const },
  gross_profit: { label: 'Gross Profit', unit: 'currency' as const },
  net_income: { label: 'Net Income', unit: 'currency' as const },
  operating_income: { label: 'Operating Income', unit: 'currency' as const },
  total_assets: { label: 'Total Assets', unit: 'currency' as const },
  total_liabilities: { label: 'Total Liabilities', unit: 'currency' as const },
  shareholders_equity: { label: "Shareholders' Equity", unit: 'currency' as const },
  operating_cash_flow: { label: 'Operating Cash Flow', unit: 'currency' as const },
  eps: { label: 'Earnings Per Share (EPS)', unit: 'number' as const },
} as const

export type MetricId = keyof typeof METRIC_CONFIG

export type MetricDataPoint = {
  year: number
  value: number
}

export type MetricData = {
  metric: MetricId
  label: string
  unit: 'currency' | 'number'
  data: MetricDataPoint[]
}

// Type for financial row data used in charts
type ChartFinancialRow = Pick<Financial, 'year' | 'revenue' | 'gross_profit' | 'net_income' | 'operating_income' | 'total_assets' | 'total_liabilities' | 'shareholders_equity' | 'operating_cash_flow' | 'eps'>

// Validate that requested metrics are in the whitelist
function validateMetrics(metrics: string[]): metrics is MetricId[] {
  const validMetrics = Object.keys(METRIC_CONFIG)
  return metrics.every((m) => validMetrics.includes(m))
}

export async function getMultipleMetrics(params: {
  metrics: string[]
  limit?: number
}): Promise<{
  data: MetricData[] | null
  error: string | null
}> {
  const { metrics } = params
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 20) // Clamp between 1-20

  // Validate metrics
  if (!metrics || metrics.length === 0) {
    return { data: null, error: 'No metrics specified' }
  }

  if (!validateMetrics(metrics)) {
    return { data: null, error: 'Invalid metric specified' }
  }

  try {
    const supabase = await createServerClient()

    // Fetch all financial columns (Supabase types work better with explicit column list)
    const { data, error } = await supabase
      .from('financials_std')
      .select('year, revenue, gross_profit, net_income, operating_income, total_assets, total_liabilities, shareholders_equity, operating_cash_flow, eps')
      .eq('symbol', 'AAPL')
      .order('year', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error fetching metrics:', error)
      return { data: null, error: error.message }
    }

    if (!data || data.length === 0) {
      return { data: null, error: 'No data found' }
    }

    // Cast to proper type
    const rows = (data ?? []) as ChartFinancialRow[]

    // Transform rows into per-metric arrays
    // Sort by year ascending for chart display
    const sortedData = [...rows].sort((a, b) => a.year - b.year)

    const result: MetricData[] = metrics.map((metricId) => {
      const config = METRIC_CONFIG[metricId as MetricId]
      return {
        metric: metricId as MetricId,
        label: config.label,
        unit: config.unit,
        data: sortedData.map((row) => ({
          year: row.year,
          value: (row[metricId as keyof ChartFinancialRow] as number | null) ?? 0,
        })),
      }
    })

    return { data: result, error: null }
  } catch (err) {
    console.error('Unexpected error in getMultipleMetrics:', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}

// Export metric config for use in other components
export async function getMetricConfig() {
  return METRIC_CONFIG
}

export async function getAvailableMetrics() {
  return Object.entries(METRIC_CONFIG).map(([id, config]) => ({
    id: id as MetricId,
    label: config.label,
    unit: config.unit,
  }))
}
