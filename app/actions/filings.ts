'use server'

import { createServerClient } from '@/lib/supabase/server'

// Safe, purpose-built tool for fetching recent SEC filings for AAPL only
// This is designed to be called by server code (e.g., an LLM routing step) and returns
// a minimal, predictable shape for easy prompting and display.
export async function getRecentFilings(params: {
  ticker?: string // AAPL only for MVP
  limit?: number // number of most recent filings to fetch
}): Promise<{
  data: Array<{
    filing_type: string
    filing_date: string
    period_end_date: string
    fiscal_year: number
    fiscal_quarter: number | null
    document_url: string
  }> | null
  error: string | null
}> {
  const ticker = params.ticker ?? 'AAPL'
  const requestedLimit = params.limit ?? 5

  // Enforce AAPL-only for MVP
  if (ticker !== 'AAPL') {
    return { data: null, error: 'Only AAPL ticker is supported in MVP' }
  }

  // Limit rows to a small, safe window (1..10)
  const safeLimit = Math.min(Math.max(requestedLimit, 1), 10)

  try {
    const supabase = await createServerClient()

    const { data, error } = await supabase
      .from('filings')
      .select('filing_type, filing_date, period_end_date, fiscal_year, fiscal_quarter, document_url')
      .eq('ticker', ticker)
      .order('filing_date', { ascending: false })
      .limit(safeLimit)

    if (error) {
      console.error('Error fetching filings:', error)
      return { data: null, error: error.message }
    }

    return { data: data ?? [], error: null }
  } catch (err) {
    console.error('Unexpected error (getRecentFilings):', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
