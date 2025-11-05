'use server'

import { createServerClient } from '@/lib/supabase/server'
import { CompanyWithFinancials } from '@/lib/database.types'

export async function getCompaniesWithFinancials(): Promise<{
  data: CompanyWithFinancials[] | null
  error: string | null
}> {
  try {
    const supabase = createServerClient()

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

    // Fetch all financials
    const { data: financials, error: financialsError } = await supabase
      .from('financials_std')
      .select('*')
      .order('year', { ascending: false })

    if (financialsError) {
      console.error('Error fetching financials:', financialsError)
      return { data: null, error: financialsError.message }
    }

    // Manually join the data by symbol
    const companiesWithFinancials: CompanyWithFinancials[] = companies.map((company) => ({
      ...company,
      financials_std: financials?.filter((f) => f.symbol === company.symbol) || [],
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
  limit?: number // number of most recent years to fetch
}): Promise<{
  data: Array<{ year: number; value: number; metric: FinancialMetric }> | null
  error: string | null
}> {
  const { metric } = params
  const requestedLimit = params.limit ?? 4
  const safeLimit = Math.min(Math.max(requestedLimit, 1), 20)

  try {
    const supabase = createServerClient()

    // ===============================================
    // HANDLE CALCULATED METRICS
    // ===============================================

    if (metric === 'debt_to_equity_ratio') {
      const { data, error } = await supabase
        .from('financials_std')
        .select('year, total_liabilities, shareholders_equity')
        .eq('symbol', 'AAPL')
        .order('year', { ascending: false })
        .limit(safeLimit)

      if (error) {
        console.error('Error fetching data for debt_to_equity_ratio:', error)
        return { data: null, error: error.message }
      }

      const calculated = (data ?? []).map((row) => ({
        year: row.year,
        value: row.total_liabilities / row.shareholders_equity,
        metric: 'debt_to_equity_ratio' as const,
      }))

      return { data: calculated, error: null }
    }

    if (metric === 'gross_margin') {
      const { data, error } = await supabase
        .from('financials_std')
        .select('year, gross_profit, revenue')
        .eq('symbol', 'AAPL')
        .order('year', { ascending: false })
        .limit(safeLimit)

      if (error) {
        console.error('Error fetching data for gross_margin:', error)
        return { data: null, error: error.message }
      }

      const calculated = (data ?? []).map((row) => ({
        year: row.year,
        value: (row.gross_profit / row.revenue) * 100,
        metric: 'gross_margin' as const,
      }))

      return { data: calculated, error: null }
    }

    if (metric === 'roe') {
      const { data, error } = await supabase
        .from('financials_std')
        .select('year, net_income, shareholders_equity')
        .eq('symbol', 'AAPL')
        .order('year', { ascending: false })
        .limit(safeLimit)

      if (error) {
        console.error('Error fetching data for ROE:', error)
        return { data: null, error: error.message }
      }

      const calculated = (data ?? []).map((row) => ({
        year: row.year,
        value: (row.net_income / row.shareholders_equity) * 100,
        metric: 'roe' as const,
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

    const { data, error } = await supabase
      .from('financials_std')
      .select('year, revenue, gross_profit, net_income, operating_income, total_assets, total_liabilities, shareholders_equity, operating_cash_flow, eps')
      .eq('symbol', 'AAPL')
      .order('year', { ascending: false })
      .limit(safeLimit)

    if (error) {
      console.error('Error fetching AAPL financials by metric:', error)
      return { data: null, error: error.message }
    }

    // For margin/ratio calculations, include related metrics
    const mapped = (data ?? []).map((row) => {
      const result: any = {
        year: row.year,
        value: row[metric] as number,
        metric,
      }

      // Include revenue for margin calculations
      if (['gross_profit', 'operating_income', 'net_income', 'operating_cash_flow'].includes(metric)) {
        result.revenue = row.revenue
      }

      // Include shareholders_equity and total_assets for ROE and ROA calculations
      if (metric === 'net_income') {
        result.shareholders_equity = row.shareholders_equity
        result.total_assets = row.total_assets
      }

      // Include shareholders_equity and total_assets for debt-to-equity and debt-to-assets calculations
      if (metric === 'total_liabilities') {
        result.shareholders_equity = row.shareholders_equity
        result.total_assets = row.total_assets
      }

      // Include total_liabilities and total_assets for debt-to-equity calculations
      if (metric === 'shareholders_equity') {
        result.total_liabilities = row.total_liabilities
        result.total_assets = row.total_assets
      }

      // Include revenue for asset turnover calculation
      if (metric === 'total_assets') {
        result.revenue = row.revenue
        result.total_liabilities = row.total_liabilities
        result.shareholders_equity = row.shareholders_equity
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
