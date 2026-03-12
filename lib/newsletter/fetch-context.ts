import { createClient } from '@supabase/supabase-js'
import type { NewsletterContext } from './types'

/**
 * Create a direct Supabase client (not the Next.js SSR adapter).
 * Works in both CLI scripts and server contexts.
 */
function createDirectClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }
  return createClient(url, key)
}

/**
 * Fetch financial data for the LLM to reason about when selecting
 * newsletter templates and generating copy.
 *
 * Queries Supabase directly (not through Next.js server actions) so this
 * works in both CLI scripts and API routes.
 *
 * Fetches 7 years of key metrics, then computes highlight numbers
 * (YoY growth, latest values) so the LLM doesn't have to do math.
 */
export async function fetchNewsletterContext(
  ticker: string,
): Promise<NewsletterContext> {
  const symbol = ticker.toUpperCase()
  const supabase = createDirectClient()

  // Fetch core metrics from financials_std (7 most recent annual rows)
  const { data: stdRows, error: stdError } = await supabase
    .from('financials_std')
    .select(
      'year, revenue, gross_profit, net_income, operating_income, operating_cash_flow, eps',
    )
    .eq('symbol', symbol)
    .eq('period_type', 'annual')
    .order('year', { ascending: false })
    .limit(7)

  if (stdError) {
    throw new Error(
      `Failed to fetch financials for ${symbol}: ${stdError.message}`,
    )
  }
  if (!stdRows || stdRows.length === 0) {
    throw new Error(`No financial data found for ${symbol}`)
  }

  // Sort ascending by year
  const sorted = [...stdRows].sort((a, b) => a.year - b.year)
  const years = sorted.map((r) => r.year)

  // Fetch free cash flow from financial_metrics table
  const { data: fcfRows } = await supabase
    .from('financial_metrics')
    .select('year, metric_value')
    .eq('symbol', symbol)
    .eq('metric_name', 'freeCashFlow')
    .eq('period', 'FY')
    .in('year', years)
    .order('year', { ascending: true })

  const fcfByYear = new Map<number, number>()
  if (fcfRows) {
    for (const row of fcfRows) {
      fcfByYear.set(row.year, row.metric_value ?? 0)
    }
  }

  // Build per-year financial rows
  const financials = sorted.map((row) => {
    const revenue = row.revenue ?? 0
    const grossProfit = row.gross_profit ?? 0
    const operatingIncome = row.operating_income ?? 0

    return {
      year: row.year,
      revenue,
      netIncome: row.net_income ?? 0,
      grossMargin: revenue ? round2((grossProfit / revenue) * 100) : 0,
      operatingMargin: revenue
        ? round2((operatingIncome / revenue) * 100)
        : 0,
      freeCashFlow: fcfByYear.get(row.year) ?? 0,
      eps: round2(row.eps ?? 0),
    }
  })

  // Compute highlights from the most recent two years
  const latest = financials[financials.length - 1]
  const prior =
    financials.length >= 2 ? financials[financials.length - 2] : null

  const highlights = {
    revenueGrowthYoY: computeGrowth(latest?.revenue, prior?.revenue),
    netIncomeGrowthYoY: computeGrowth(latest?.netIncome, prior?.netIncome),
    grossMarginLatest: latest?.grossMargin ?? null,
    operatingMarginLatest: latest?.operatingMargin ?? null,
    fcfLatest: latest?.freeCashFlow ?? null,
  }

  return { ticker: symbol, financials, highlights }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function computeGrowth(
  current: number | undefined,
  prior: number | undefined,
): number | null {
  if (current == null || prior == null || prior === 0) return null
  return round2(((current - prior) / Math.abs(prior)) * 100)
}
