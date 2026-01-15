'use server'

import { createServerClient } from '@/lib/supabase/server'
import { CompanyWithFinancials, Company, Financial } from '@/lib/database.types'

export async function getCompaniesWithFinancials(): Promise<{
  data: CompanyWithFinancials[] | null
  error: string | null
}> {
  try {
    const supabase = await createServerClient()

    // Fetch all companies
    const { data: companies, error: companiesError } = await supabase
      .from('company')
      .select('*')
      .order('name', { ascending: true })

    if (companiesError) {
      console.error('Error fetching companies:', companiesError)
      return { data: null, error: companiesError.message }
    }

    if (!companies || companies.length === 0) {
      return { data: [], error: null }
    }

    const companyRows: Company[] = companies as Company[]

    // Fetch all financials
    const { data: financials, error: financialsError } = await supabase
      .from('financials_std')
      .select('*')
      .order('year', { ascending: false })

    if (financialsError) {
      console.error('Error fetching financials:', financialsError)
      return { data: null, error: financialsError.message }
    }

    const financialRows: Financial[] = (financials ?? []) as Financial[]

    // Manually join the data by symbol
    const companiesWithFinancials: CompanyWithFinancials[] = companyRows.map((company) => ({
      ...company,
      financials_std: financialRows.filter((f) => f.symbol === company.symbol),
    }))

    return { data: companiesWithFinancials, error: null }
  } catch (err) {
    console.error('Unexpected error:', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}

// Safe, purpose-built tool for fetching a specific financial metric for AAPL only (v2)
// This is designed to be called by server code (e.g., an LLM routing step) and returns
// a minimal, predictable shape for easy prompting and display.

// Raw metrics stored directly in the database
export type RawFinancialMetric =
  | 'revenue'
  | 'gross_profit'
  | 'net_income'
  | 'operating_income'
  | 'total_assets'
  | 'total_liabilities'
  | 'shareholders_equity'
  | 'operating_cash_flow'
  | 'eps'

// Calculated metrics computed from raw data
export type CalculatedFinancialMetric =
  | 'debt_to_equity_ratio'  // total_liabilities / shareholders_equity
  | 'gross_margin'          // (gross_profit / revenue) × 100
  | 'roe'                   // (net_income / shareholders_equity) × 100

// Combined type for all supported metrics
export type FinancialMetric = RawFinancialMetric | CalculatedFinancialMetric

// Period type for annual vs quarterly data
export type PeriodType = 'annual' | 'quarterly'

export type FinancialMetricDataPoint = {
  year: number
  value: number
  metric: FinancialMetric
  period_type?: PeriodType
  fiscal_quarter?: number | null
  fiscal_label?: string | null
  revenue?: number | null
  shareholders_equity?: number | null
  total_assets?: number | null
  total_liabilities?: number | null
}

// Helper to check if a metric is calculated (internal use only)
function isCalculatedMetric(metric: FinancialMetric): metric is CalculatedFinancialMetric {
  const calculatedMetrics: CalculatedFinancialMetric[] = [
    'debt_to_equity_ratio',
    'gross_margin',
    'roe',
  ]
  return calculatedMetrics.includes(metric as CalculatedFinancialMetric)
}

export async function getAaplFinancialsByMetric(params: {
  metric: FinancialMetric
  limit?: number // number of most recent periods to fetch
  period?: PeriodType // 'annual' (default) or 'quarterly'
  quarters?: number[] // optional filter for specific quarters (1-4), only valid when period='quarterly'
}): Promise<{
  data: FinancialMetricDataPoint[] | null
  error: string | null
}> {
  const { metric } = params
  const period = params.period ?? 'annual'
  const quarters = params.quarters
  const requestedLimit = params.limit ?? (period === 'quarterly' ? 12 : 4) // Default 12 quarters or 4 years
  const maxLimit = period === 'quarterly' ? 40 : 20
  const safeLimit = Math.min(Math.max(requestedLimit, 1), maxLimit)

  // Parameter validation
  if (period === 'annual' && quarters && quarters.length > 0) {
    return { data: null, error: "Invalid parameters: 'quarters' can only be specified when period='quarterly'" }
  }
  if (quarters && quarters.some(q => q < 1 || q > 4)) {
    return { data: null, error: "Invalid parameters: 'quarters' must be between 1 and 4" }
  }

  try {
    const supabase = await createServerClient()

    // ===============================================
    // HANDLE CALCULATED METRICS
    // ===============================================

    if (metric === 'debt_to_equity_ratio') {
      let query = supabase
        .from('financials_std')
        .select('year, total_liabilities, shareholders_equity, period_type, fiscal_quarter, fiscal_label')
        .eq('symbol', 'AAPL')
        .eq('period_type', period)

      if (period === 'quarterly' && quarters && quarters.length > 0) {
        query = query.in('fiscal_quarter', quarters)
      }

      const { data, error } = await query
        .order('year', { ascending: false })
        .order('fiscal_quarter', { ascending: false, nullsFirst: false })
        .limit(safeLimit)

      if (error) {
        console.error('Error fetching data for debt_to_equity_ratio:', error)
        return { data: null, error: error.message }
      }

      type DebtToEquityRow = Pick<Financial, 'year' | 'total_liabilities' | 'shareholders_equity'> & {
        period_type: PeriodType
        fiscal_quarter: number | null
        fiscal_label: string | null
      }
      const rows: DebtToEquityRow[] = (data ?? []) as DebtToEquityRow[]

      const calculated = rows.map((row) => ({
        year: row.year,
        value:
          row.shareholders_equity && row.shareholders_equity !== 0
            ? (row.total_liabilities ?? 0) / row.shareholders_equity
            : 0,
        metric: 'debt_to_equity_ratio' as const,
        period_type: row.period_type,
        fiscal_quarter: row.fiscal_quarter,
        fiscal_label: row.fiscal_label,
      }))

      return { data: calculated, error: null }
    }

    if (metric === 'gross_margin') {
      let query = supabase
        .from('financials_std')
        .select('year, gross_profit, revenue, period_type, fiscal_quarter, fiscal_label')
        .eq('symbol', 'AAPL')
        .eq('period_type', period)

      if (period === 'quarterly' && quarters && quarters.length > 0) {
        query = query.in('fiscal_quarter', quarters)
      }

      const { data, error } = await query
        .order('year', { ascending: false })
        .order('fiscal_quarter', { ascending: false, nullsFirst: false })
        .limit(safeLimit)

      if (error) {
        console.error('Error fetching data for gross_margin:', error)
        return { data: null, error: error.message }
      }

      type GrossMarginRow = Pick<Financial, 'year' | 'gross_profit' | 'revenue'> & {
        period_type: PeriodType
        fiscal_quarter: number | null
        fiscal_label: string | null
      }
      const rows: GrossMarginRow[] = (data ?? []) as GrossMarginRow[]

      const calculated = rows.map((row) => ({
        year: row.year,
        value:
          row.revenue && row.revenue !== 0
            ? ((row.gross_profit ?? 0) / row.revenue) * 100
            : 0,
        metric: 'gross_margin' as const,
        period_type: row.period_type,
        fiscal_quarter: row.fiscal_quarter,
        fiscal_label: row.fiscal_label,
      }))

      return { data: calculated, error: null }
    }

    if (metric === 'roe') {
      let query = supabase
        .from('financials_std')
        .select('year, net_income, shareholders_equity, period_type, fiscal_quarter, fiscal_label')
        .eq('symbol', 'AAPL')
        .eq('period_type', period)

      if (period === 'quarterly' && quarters && quarters.length > 0) {
        query = query.in('fiscal_quarter', quarters)
      }

      const { data, error } = await query
        .order('year', { ascending: false })
        .order('fiscal_quarter', { ascending: false, nullsFirst: false })
        .limit(safeLimit)

      if (error) {
        console.error('Error fetching data for ROE:', error)
        return { data: null, error: error.message }
      }

      type RoeRow = Pick<Financial, 'year' | 'net_income' | 'shareholders_equity'> & {
        period_type: PeriodType
        fiscal_quarter: number | null
        fiscal_label: string | null
      }
      const rows: RoeRow[] = (data ?? []) as RoeRow[]

      const calculated = rows.map((row) => ({
        year: row.year,
        value:
          row.shareholders_equity && row.shareholders_equity !== 0
            ? ((row.net_income ?? 0) / row.shareholders_equity) * 100
            : 0,
        metric: 'roe' as const,
        period_type: row.period_type,
        fiscal_quarter: row.fiscal_quarter,
        fiscal_label: row.fiscal_label,
      }))

      return { data: calculated, error: null }
    }

    // ===============================================
    // HANDLE RAW METRICS
    // ===============================================

    const allowedRawMetrics: RawFinancialMetric[] = [
      'revenue',
      'gross_profit',
      'net_income',
      'operating_income',
      'total_assets',
      'total_liabilities',
      'shareholders_equity',
      'operating_cash_flow',
      'eps',
    ]
    if (!allowedRawMetrics.includes(metric as RawFinancialMetric)) {
      return { data: null, error: 'Unsupported metric' }
    }

    let query = supabase
      .from('financials_std')
      .select(
        'year, revenue, gross_profit, net_income, operating_income, total_assets, total_liabilities, shareholders_equity, operating_cash_flow, eps, period_type, fiscal_quarter, fiscal_label'
      )
      .eq('symbol', 'AAPL')
      .eq('period_type', period)

    if (period === 'quarterly' && quarters && quarters.length > 0) {
      query = query.in('fiscal_quarter', quarters)
    }

    const { data, error } = await query
      .order('year', { ascending: false })
      .order('fiscal_quarter', { ascending: false, nullsFirst: false })
      .limit(safeLimit)

    if (error) {
      console.error('Error fetching AAPL financials by metric:', error)
      return { data: null, error: error.message }
    }

    // For margin/ratio calculations, include related metrics
    type RawRow = Pick<
      Financial,
      | 'year'
      | 'revenue'
      | 'gross_profit'
      | 'net_income'
      | 'operating_income'
      | 'total_assets'
      | 'total_liabilities'
      | 'shareholders_equity'
      | 'operating_cash_flow'
      | 'eps'
    > & {
      period_type: PeriodType
      fiscal_quarter: number | null
      fiscal_label: string | null
    }

    const rows: RawRow[] = (data ?? []) as RawRow[]

    const mapped: FinancialMetricDataPoint[] = rows.map((row) => {
      const metricValue = (row as Record<string, number | null>)[metric] ?? 0
      const result: FinancialMetricDataPoint = {
        year: row.year,
        value: typeof metricValue === 'number' ? metricValue : Number(metricValue ?? 0),
        metric,
        period_type: row.period_type,
        fiscal_quarter: row.fiscal_quarter,
        fiscal_label: row.fiscal_label,
      }

      // Include revenue for margin calculations
      if (['gross_profit', 'operating_income', 'net_income', 'operating_cash_flow'].includes(metric)) {
        result.revenue = row.revenue ?? null
      }

      // Include shareholders_equity and total_assets for ROE and ROA calculations
      if (metric === 'net_income') {
        result.shareholders_equity = row.shareholders_equity ?? null
        result.total_assets = row.total_assets ?? null
      }

      // Include shareholders_equity and total_assets for debt-to-equity and debt-to-assets calculations
      if (metric === 'total_liabilities') {
        result.shareholders_equity = row.shareholders_equity ?? null
        result.total_assets = row.total_assets ?? null
      }

      // Include total_liabilities and total_assets for debt-to-equity calculations
      if (metric === 'shareholders_equity') {
        result.total_liabilities = row.total_liabilities ?? null
        result.total_assets = row.total_assets ?? null
      }

      // Include revenue for asset turnover calculation
      if (metric === 'total_assets') {
        result.revenue = row.revenue ?? null
        result.total_liabilities = row.total_liabilities ?? null
        result.shareholders_equity = row.shareholders_equity ?? null
      }

      return result
    })

    return { data: mapped, error: null }
  } catch (err) {
    console.error('Unexpected error (getAaplFinancialsByMetric):', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
