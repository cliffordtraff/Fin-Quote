'use server'

import { createClient } from '@supabase/supabase-js'

export interface FinancialChartData {
  year: number
  eps: number | null
  revenue: number | null
  sharesOutstanding: number | null
}

export interface FinancialChartResult {
  data: FinancialChartData[]
  error?: string
}

/**
 * Fetches EPS, Revenue, and Shares Outstanding data for the last 9 years
 * for use in the stock page financial charts
 */
export async function getFinancialChartData(symbol: string): Promise<FinancialChartResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return { data: [], error: 'Missing Supabase configuration' }
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const { data, error } = await supabase
      .from('financials_std')
      .select('year, eps, revenue, shares_outstanding')
      .eq('symbol', symbol.toUpperCase())
      .eq('period_type', 'annual')
      .order('year', { ascending: false })
      .limit(8)

    if (error) {
      console.error('Error fetching financial chart data:', error)
      return { data: [], error: error.message }
    }

    if (!data || data.length === 0) {
      return { data: [], error: 'No financial data found for this symbol' }
    }

    // Map to chart data format and reverse to show oldest-to-newest (left-to-right)
    const chartData: FinancialChartData[] = data.map(row => ({
      year: row.year,
      eps: row.eps,
      revenue: row.revenue,
      sharesOutstanding: row.shares_outstanding,
    })).reverse()

    return { data: chartData }
  } catch (err) {
    console.error('Unexpected error fetching financial chart data:', err)
    return { data: [], error: 'Failed to fetch financial data' }
  }
}
