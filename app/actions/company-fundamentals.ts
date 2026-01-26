'use server'

import { createServerClient } from '@/lib/supabase/server'

export interface FundamentalMetric {
  label: string
  annual: Record<number, number | null> // year -> value
  quarterly: Record<string, number | null> // "2024-Q1" -> value
}

export interface CompanyFundamentals {
  metrics: FundamentalMetric[]
  annualYears: number[] // sorted ascending
  quarterlyPeriods: { year: number; quarter: number; label: string }[] // sorted ascending
  error: string | null
}

// Map of metric labels to their database sources
const METRIC_CONFIG: {
  label: string
  stdField?: string // field from financials_std
  metricsField?: string // field from financial_metrics
  derive?: 'net_asset_value' | 'ebit' // special calculation
}[] = [
  { label: 'Revenue', stdField: 'revenue' },
  { label: 'EBITDA', metricsField: 'ebitda' },
  { label: 'EBIT', stdField: 'operating_income' },
  { label: 'Pretax', metricsField: 'incomeBeforeTax' },
  { label: 'Net Income', stdField: 'net_income' },
  { label: 'EPS', stdField: 'eps' },
  { label: 'Operating Cash Flow', stdField: 'operating_cash_flow' },
  { label: 'Capital Expenditure', metricsField: 'capitalExpenditure' },
  { label: 'Net Asset Value', derive: 'net_asset_value' },
]

export async function getCompanyFundamentals(symbol: string): Promise<CompanyFundamentals> {
  try {
    const supabase = await createServerClient()

    // Fetch annual data from financials_std (last 4 years)
    const { data: annualStdData, error: annualStdError } = await supabase
      .from('financials_std')
      .select('year, revenue, operating_income, net_income, eps, operating_cash_flow, total_assets, total_liabilities')
      .eq('symbol', symbol)
      .eq('period_type', 'annual')
      .order('year', { ascending: false })
      .limit(4)

    if (annualStdError) {
      console.error('Error fetching annual financials_std:', annualStdError)
      return { metrics: [], annualYears: [], quarterlyPeriods: [], error: annualStdError.message }
    }

    // Fetch quarterly data from financials_std (last 8 quarters)
    const { data: quarterlyStdData, error: quarterlyStdError } = await supabase
      .from('financials_std')
      .select('year, fiscal_quarter, revenue, operating_income, net_income, eps, operating_cash_flow, total_assets, total_liabilities')
      .eq('symbol', symbol)
      .eq('period_type', 'quarterly')
      .order('year', { ascending: false })
      .order('fiscal_quarter', { ascending: false })
      .limit(8)

    if (quarterlyStdError) {
      console.error('Error fetching quarterly financials_std:', quarterlyStdError)
    }

    // Fetch annual metrics from financial_metrics
    const metricsToFetch = ['ebitda', 'incomeBeforeTax', 'capitalExpenditure']
    const { data: annualMetricsData, error: annualMetricsError } = await supabase
      .from('financial_metrics')
      .select('year, metric_name, metric_value')
      .eq('symbol', symbol)
      .eq('period_type', 'annual')
      .in('metric_name', metricsToFetch)
      .order('year', { ascending: false })
      .limit(20) // 4 years * 5 metrics

    if (annualMetricsError) {
      console.error('Error fetching annual financial_metrics:', annualMetricsError)
    }

    // Fetch quarterly metrics from financial_metrics
    const { data: quarterlyMetricsData, error: quarterlyMetricsError } = await supabase
      .from('financial_metrics')
      .select('year, fiscal_quarter, metric_name, metric_value')
      .eq('symbol', symbol)
      .eq('period_type', 'quarterly')
      .in('metric_name', metricsToFetch)
      .order('year', { ascending: false })
      .order('fiscal_quarter', { ascending: false })
      .limit(40) // 8 quarters * 5 metrics

    if (quarterlyMetricsError) {
      console.error('Error fetching quarterly financial_metrics:', quarterlyMetricsError)
    }

    // Build lookup maps for annual data
    const annualStdMap: Record<number, Record<string, number | null>> = {}
    for (const row of annualStdData || []) {
      annualStdMap[row.year] = {
        revenue: row.revenue,
        operating_income: row.operating_income,
        net_income: row.net_income,
        eps: row.eps,
        operating_cash_flow: row.operating_cash_flow,
        total_assets: row.total_assets,
        total_liabilities: row.total_liabilities,
      }
    }

    const annualMetricsMap: Record<number, Record<string, number | null>> = {}
    for (const row of annualMetricsData || []) {
      if (!annualMetricsMap[row.year]) {
        annualMetricsMap[row.year] = {}
      }
      annualMetricsMap[row.year][row.metric_name] = row.metric_value
    }

    // Build lookup maps for quarterly data
    const quarterlyStdMap: Record<string, Record<string, number | null>> = {}
    for (const row of quarterlyStdData || []) {
      const key = `${row.year}-Q${row.fiscal_quarter}`
      quarterlyStdMap[key] = {
        revenue: row.revenue,
        operating_income: row.operating_income,
        net_income: row.net_income,
        eps: row.eps,
        operating_cash_flow: row.operating_cash_flow,
        total_assets: row.total_assets,
        total_liabilities: row.total_liabilities,
      }
    }

    const quarterlyMetricsMap: Record<string, Record<string, number | null>> = {}
    for (const row of quarterlyMetricsData || []) {
      const key = `${row.year}-Q${row.fiscal_quarter}`
      if (!quarterlyMetricsMap[key]) {
        quarterlyMetricsMap[key] = {}
      }
      quarterlyMetricsMap[key][row.metric_name] = row.metric_value
    }

    // Get sorted years and quarters
    const annualYears = [...new Set(annualStdData?.map(r => r.year) || [])].sort((a, b) => a - b)

    // Build quarterly periods list
    const quarterlyPeriods: { year: number; quarter: number; label: string }[] = []
    const quarterLabels = ['MAR', 'JUN', 'SEP', 'DEC']
    for (const row of quarterlyStdData || []) {
      const exists = quarterlyPeriods.find(p => p.year === row.year && p.quarter === row.fiscal_quarter)
      if (!exists && row.fiscal_quarter) {
        quarterlyPeriods.push({
          year: row.year,
          quarter: row.fiscal_quarter,
          label: `Q${row.fiscal_quarter} ${quarterLabels[row.fiscal_quarter - 1]}`,
        })
      }
    }
    // Sort by year then quarter ascending
    quarterlyPeriods.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year
      return a.quarter - b.quarter
    })

    // Build metrics array
    const metrics: FundamentalMetric[] = METRIC_CONFIG.map(config => {
      const metric: FundamentalMetric = {
        label: config.label,
        annual: {},
        quarterly: {},
      }

      // Populate annual values
      for (const year of annualYears) {
        let value: number | null = null

        if (config.stdField) {
          value = annualStdMap[year]?.[config.stdField] ?? null
        } else if (config.metricsField) {
          value = annualMetricsMap[year]?.[config.metricsField] ?? null
        } else if (config.derive === 'net_asset_value') {
          const assets = annualStdMap[year]?.total_assets
          const liabilities = annualStdMap[year]?.total_liabilities
          if (assets != null && liabilities != null) {
            value = assets - liabilities
          }
        }

        metric.annual[year] = value
      }

      // Populate quarterly values
      for (const period of quarterlyPeriods) {
        const key = `${period.year}-Q${period.quarter}`
        let value: number | null = null

        if (config.stdField) {
          value = quarterlyStdMap[key]?.[config.stdField] ?? null
        } else if (config.metricsField) {
          value = quarterlyMetricsMap[key]?.[config.metricsField] ?? null
        } else if (config.derive === 'net_asset_value') {
          const assets = quarterlyStdMap[key]?.total_assets
          const liabilities = quarterlyStdMap[key]?.total_liabilities
          if (assets != null && liabilities != null) {
            value = assets - liabilities
          }
        }

        metric.quarterly[key] = value
      }

      return metric
    })

    return {
      metrics,
      annualYears,
      quarterlyPeriods,
      error: null,
    }
  } catch (err) {
    console.error('Unexpected error in getCompanyFundamentals:', err)
    return {
      metrics: [],
      annualYears: [],
      quarterlyPeriods: [],
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
