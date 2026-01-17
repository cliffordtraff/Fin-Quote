'use server'

import { createServerClient } from '@/lib/supabase/server'

export type Stock = {
  symbol: string
  name: string
  sector?: string
}

/**
 * Get all S&P 500 stocks from the database
 * Returns stocks sorted alphabetically by symbol
 */
export async function getAvailableStocks(): Promise<{
  data: Stock[] | null
  error: string | null
}> {
  try {
    const supabase = await createServerClient()

    const { data, error } = await supabase
      .from('sp500_constituents')
      .select('symbol, name, sector')
      .eq('is_active', true)
      .order('symbol', { ascending: true })

    if (error) {
      console.error('Error fetching stocks:', error)
      return { data: null, error: error.message }
    }

    return {
      data: (data ?? []).map((row) => ({
        symbol: row.symbol,
        name: row.name,
        sector: row.sector ?? undefined,
      })),
      error: null,
    }
  } catch (err) {
    console.error('Unexpected error in getAvailableStocks:', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}

