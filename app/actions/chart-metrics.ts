'use server'

import { createServerClient } from '@/lib/supabase/server'
import { Financial } from '@/lib/database.types'

// Statement types for categorization
export type StatementType = 'income' | 'balance' | 'cashflow' | 'ratios'

// Source table for each metric
type MetricSource = 'financials_std' | 'financial_metrics'

// Metric configuration with labels, units, statement type, definitions, and source
const METRIC_CONFIG = {
  // === INCOME STATEMENT (from financials_std) ===
  revenue: { label: 'Revenue', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Total income generated from sales of goods and services before any expenses are deducted.', source: 'financials_std' as MetricSource },
  gross_profit: { label: 'Gross Profit', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Revenue minus cost of goods sold. Shows profitability before operating expenses.', source: 'financials_std' as MetricSource },
  net_income: { label: 'Net Income', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Total profit after all expenses, taxes, and costs have been deducted from revenue.', source: 'financials_std' as MetricSource },
  operating_income: { label: 'Operating Income', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Profit from core business operations, excluding interest and taxes.', source: 'financials_std' as MetricSource },
  eps: { label: 'Earnings Per Share (EPS)', unit: 'number' as const, statement: 'income' as StatementType, definition: 'Net income divided by outstanding shares. Shows profit allocated to each share.', source: 'financials_std' as MetricSource },
  // Extended income metrics (from financial_metrics)
  ebitda: { label: 'EBITDA', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Earnings before interest, taxes, depreciation, and amortization. Measures operating profitability.', source: 'financial_metrics' as MetricSource, dbMetricName: 'ebitda' },
  depreciation_amortization: { label: 'Depreciation & Amortization', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Non-cash expenses for asset value reduction over time.', source: 'financial_metrics' as MetricSource, dbMetricName: 'depreciationAndAmortization' },
  stock_based_comp: { label: 'Stock-Based Compensation', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Non-cash expense from employee equity compensation including stock options and RSUs.', source: 'financial_metrics' as MetricSource, dbMetricName: 'stockBasedCompensation' },

  // === BALANCE SHEET (from financials_std) ===
  total_assets: { label: 'Total Assets', unit: 'currency' as const, statement: 'balance' as StatementType, definition: 'Everything the company owns, including cash, inventory, property, and investments.', source: 'financials_std' as MetricSource },
  total_liabilities: { label: 'Total Liabilities', unit: 'currency' as const, statement: 'balance' as StatementType, definition: 'All debts and obligations the company owes to others.', source: 'financials_std' as MetricSource },
  shareholders_equity: { label: "Shareholders' Equity", unit: 'currency' as const, statement: 'balance' as StatementType, definition: 'Total assets minus total liabilities. Represents the owners\' stake in the company.', source: 'financials_std' as MetricSource },

  // === CASH FLOW (from financials_std) ===
  operating_cash_flow: { label: 'Operating Cash Flow', unit: 'currency' as const, statement: 'cashflow' as StatementType, definition: 'Cash generated from normal business operations, excluding investing and financing.', source: 'financials_std' as MetricSource },
  // Extended cash flow metrics (from financial_metrics)
  free_cash_flow: { label: 'Free Cash Flow', unit: 'currency' as const, statement: 'cashflow' as StatementType, definition: 'Operating cash flow minus capital expenditures. Cash available for distribution to investors.', source: 'financial_metrics' as MetricSource, dbMetricName: 'freeCashFlow' },
  capital_expenditure: { label: 'Capital Expenditure', unit: 'currency' as const, statement: 'cashflow' as StatementType, definition: 'Cash spent on acquiring or upgrading physical assets like property, plant, and equipment.', source: 'financial_metrics' as MetricSource, dbMetricName: 'capitalExpenditure' },
  dividends_paid: { label: 'Dividends Paid', unit: 'currency' as const, statement: 'cashflow' as StatementType, definition: 'Total cash distributed to shareholders as dividends during the period.', source: 'financial_metrics' as MetricSource, dbMetricName: 'dividendsPaid' },
  stock_buybacks: { label: 'Stock Buybacks', unit: 'currency' as const, statement: 'cashflow' as StatementType, definition: 'Cash used to repurchase company shares, returning capital to shareholders.', source: 'financial_metrics' as MetricSource, dbMetricName: 'commonStockRepurchased' },

  // === RATIOS (calculated or from financial_metrics) ===
  gross_margin: { label: 'Gross Margin', unit: 'percent' as const, statement: 'ratios' as StatementType, definition: 'Gross profit as a percentage of revenue. Measures production efficiency.', source: 'financials_std' as MetricSource },
  operating_margin: { label: 'Operating Margin', unit: 'percent' as const, statement: 'ratios' as StatementType, definition: 'Operating income as a percentage of revenue. Shows operational efficiency.', source: 'financials_std' as MetricSource },
  net_margin: { label: 'Net Margin', unit: 'percent' as const, statement: 'ratios' as StatementType, definition: 'Net income as a percentage of revenue. Measures overall profitability.', source: 'financials_std' as MetricSource },
  roe: { label: 'Return on Equity (ROE)', unit: 'percent' as const, statement: 'ratios' as StatementType, definition: 'Net income divided by shareholders\' equity. Shows return on shareholder investment.', source: 'financials_std' as MetricSource },
  roa: { label: 'Return on Assets (ROA)', unit: 'percent' as const, statement: 'ratios' as StatementType, definition: 'Net income divided by total assets. Measures how efficiently assets generate profit.', source: 'financials_std' as MetricSource },
  pe_ratio: { label: 'P/E Ratio', unit: 'number' as const, statement: 'ratios' as StatementType, definition: 'Stock price divided by earnings per share. Shows how much investors pay per dollar of earnings.', source: 'financial_metrics' as MetricSource, dbMetricName: 'peRatio' },
} as const

// Ratio metrics that need to be calculated
const CALCULATED_RATIOS: Record<string, (row: ChartFinancialRow) => number> = {
  gross_margin: (row) => row.revenue ? ((row.gross_profit ?? 0) / row.revenue) * 100 : 0,
  operating_margin: (row) => row.revenue ? ((row.operating_income ?? 0) / row.revenue) * 100 : 0,
  net_margin: (row) => row.revenue ? ((row.net_income ?? 0) / row.revenue) * 100 : 0,
  roe: (row) => row.shareholders_equity ? ((row.net_income ?? 0) / row.shareholders_equity) * 100 : 0,
  roa: (row) => row.total_assets ? ((row.net_income ?? 0) / row.total_assets) * 100 : 0,
}

export type MetricId = keyof typeof METRIC_CONFIG

export type MetricDataPoint = {
  year: number
  value: number
}

export type MetricData = {
  metric: MetricId
  label: string
  unit: 'currency' | 'number' | 'percent'
  data: MetricDataPoint[]
}

// Type for financial row data used in charts
type ChartFinancialRow = Pick<Financial, 'year' | 'revenue' | 'gross_profit' | 'net_income' | 'operating_income' | 'total_assets' | 'total_liabilities' | 'shareholders_equity' | 'operating_cash_flow' | 'eps'>

// Validate that requested metrics are in the whitelist
function validateMetrics(metrics: string[]): metrics is MetricId[] {
  const validMetrics = Object.keys(METRIC_CONFIG)
  return metrics.every((m) => validMetrics.includes(m))
}

// Check if a metric is a calculated ratio
function isCalculatedRatio(metricId: string): boolean {
  return metricId in CALCULATED_RATIOS
}

// Helper to check if a metric comes from financial_metrics table
function isExtendedMetric(metricId: string): boolean {
  const config = METRIC_CONFIG[metricId as MetricId]
  return config?.source === 'financial_metrics'
}

// Get the database metric name for extended metrics
function getDbMetricName(metricId: string): string | undefined {
  const config = METRIC_CONFIG[metricId as MetricId] as { dbMetricName?: string }
  return config?.dbMetricName
}

export async function getMultipleMetrics(params: {
  metrics: string[]
  limit?: number
  minYear?: number
  maxYear?: number
}): Promise<{
  data: MetricData[] | null
  error: string | null
  yearBounds?: { min: number; max: number }
}> {
  // Deduplicate metrics
  const metrics = [...new Set(params.metrics)]
  const hasCustomRange = typeof params.minYear === 'number' || typeof params.maxYear === 'number'
  const limit = hasCustomRange ? undefined : Math.min(Math.max(params.limit ?? 10, 1), 20) // Clamp between 1-20

  // Validate metrics
  if (!metrics || metrics.length === 0) {
    return { data: null, error: 'No metrics specified' }
  }

  if (!validateMetrics(metrics)) {
    return { data: null, error: 'Invalid metric specified' }
  }

  if (typeof params.minYear === 'number' && typeof params.maxYear === 'number' && params.minYear > params.maxYear) {
    return { data: null, error: 'Invalid year range' }
  }

  // Separate metrics by source
  const stdMetrics = metrics.filter((m) => !isExtendedMetric(m))
  const extendedMetrics = metrics.filter((m) => isExtendedMetric(m))

  try {
    const supabase = await createServerClient()

    // Fetch from financials_std if needed
    let stdRows: ChartFinancialRow[] = []
    if (stdMetrics.length > 0 || extendedMetrics.length > 0) {
      // Always fetch std data for year reference
      let query = supabase
        .from('financials_std')
        .select('year, revenue, gross_profit, net_income, operating_income, total_assets, total_liabilities, shareholders_equity, operating_cash_flow, eps')
        .eq('symbol', 'AAPL')
        .order('year', { ascending: false })

      if (typeof params.minYear === 'number') {
        query = query.gte('year', params.minYear)
      }
      if (typeof params.maxYear === 'number') {
        query = query.lte('year', params.maxYear)
      }
      if (limit) {
        query = query.limit(limit)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching metrics:', error)
        return { data: null, error: error.message }
      }

      stdRows = (data ?? []) as ChartFinancialRow[]
    }

    if (stdRows.length === 0) {
      return { data: null, error: 'No data found' }
    }

    // Sort by year ascending for chart display
    const sortedStdData = [...stdRows].sort((a, b) => a.year - b.year)
    const years = sortedStdData.map((row) => row.year)

    // Fetch extended metrics from financial_metrics if needed
    const extendedMetricData: Record<string, Record<number, number>> = {}
    if (extendedMetrics.length > 0) {
      const dbMetricNames = extendedMetrics.map((m) => getDbMetricName(m)).filter(Boolean) as string[]

      if (dbMetricNames.length > 0) {
        let extQuery = supabase
          .from('financial_metrics')
          .select('year, metric_name, metric_value')
          .eq('symbol', 'AAPL')
          .in('metric_name', dbMetricNames)
          .in('year', years)

        const { data: extData, error: extError } = await extQuery

        if (extError) {
          console.error('Error fetching extended metrics:', extError)
        } else if (extData) {
          // Organize extended metric data by metric name and year
          for (const row of extData) {
            if (!extendedMetricData[row.metric_name]) {
              extendedMetricData[row.metric_name] = {}
            }
            extendedMetricData[row.metric_name][row.year] = row.metric_value ?? 0
          }
        }
      }
    }

    // Build result for all metrics
    const result: MetricData[] = metrics.map((metricId) => {
      const config = METRIC_CONFIG[metricId as MetricId]

      if (isExtendedMetric(metricId)) {
        // Get data from financial_metrics
        const dbName = getDbMetricName(metricId)
        const metricYearData = dbName ? extendedMetricData[dbName] ?? {} : {}

        return {
          metric: metricId as MetricId,
          label: config.label,
          unit: config.unit,
          data: sortedStdData.map((row) => ({
            year: row.year,
            value: metricYearData[row.year] ?? 0,
          })),
        }
      } else {
        // Get data from financials_std
        return {
          metric: metricId as MetricId,
          label: config.label,
          unit: config.unit,
          data: sortedStdData.map((row) => ({
            year: row.year,
            value: isCalculatedRatio(metricId)
              ? CALCULATED_RATIOS[metricId](row)
              : (row[metricId as keyof ChartFinancialRow] as number | null) ?? 0,
          })),
        }
      }
    })

    const { data: boundsData, error: boundsError } = await supabase
      .from('financials_std')
      .select('year')
      .eq('symbol', 'AAPL')
      .order('year', { ascending: true })

    let yearBounds: { min: number; max: number } | undefined
    if (!boundsError && boundsData && boundsData.length > 0) {
      yearBounds = {
        min: boundsData[0].year,
        max: boundsData[boundsData.length - 1].year,
      }
    }

    if (boundsError) {
      console.error('Error fetching year bounds:', boundsError)
    }

    return { data: result, error: null, yearBounds }
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
    statement: config.statement,
    definition: config.definition,
  }))
}
