import { createClient } from '@supabase/supabase-js'
import { getProvider } from '@/lib/providers'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  filterToSP500,
  getSP500Constituent,
  isSP500,
  normalizeSP500Symbol,
  SP500_SYMBOLS,
} from '@/lib/sp500'
import type {
  NewsletterContext,
  NewsletterFinancialPoint,
  NewsletterHighlights,
  MarketContext,
  StockCandidate,
  StockNewsItem,
  TodayQuote,
  EarningsCandidate,
  RecentPick,
  StockPickerResult,
} from './types'

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

async function fetchNewsletterPriceContext(
  symbol: string,
): Promise<NewsletterContext['priceContext'] | undefined> {
  const provider = getProvider()
  const from = new Date()
  from.setFullYear(from.getFullYear() - 2)

  try {
    const candles = await provider.getHistoricalDaily(
      symbol,
      from.toISOString().slice(0, 10),
    )
    const sorted = [...candles]
      .filter((candle) => Number.isFinite(candle.timestampMs) && Number.isFinite(candle.close))
      .sort((a, b) => a.timestampMs - b.timestampMs)

    if (sorted.length === 0) return undefined

    const latest = sorted[sorted.length - 1]
    const last252 = sorted.slice(-252)
    const latestClose = latest?.close ?? null
    const high52Week =
      last252.length > 0 ? Math.max(...last252.map((candle) => candle.high)) : null
    const low52Week =
      last252.length > 0 ? Math.min(...last252.map((candle) => candle.low)) : null
    const sma50 = averageClose(sorted.slice(-50))
    const sma200 = averageClose(sorted.slice(-200))

    return {
      latestClose: latestClose == null ? null : round2(latestClose),
      latestDate: latest?.date?.slice(0, 10) ?? null,
      return1m: computeTrailingReturn(sorted, 21),
      return3m: computeTrailingReturn(sorted, 63),
      return6m: computeTrailingReturn(sorted, 126),
      return1y: computeTrailingReturn(sorted, 252),
      high52Week: high52Week == null ? null : round2(high52Week),
      low52Week: low52Week == null ? null : round2(low52Week),
      distanceTo52WeekHigh:
        latestClose == null || high52Week == null
          ? null
          : round2(((latestClose - high52Week) / high52Week) * 100),
      distanceTo52WeekLow:
        latestClose == null || low52Week == null
          ? null
          : round2(((latestClose - low52Week) / low52Week) * 100),
      sma50,
      sma200,
      above50DaySma:
        latestClose == null || sma50 == null ? null : latestClose >= sma50,
      above200DaySma:
        latestClose == null || sma200 == null ? null : latestClose >= sma200,
    }
  } catch {
    return undefined
  }
}

interface FinancialStatementRow {
  year: number
  revenue: number | null
  gross_profit: number | null
  net_income: number | null
  operating_income: number | null
  eps: number | null
  fiscal_quarter?: number | null
  fiscal_label?: string | null
}

interface FinancialMetricRow {
  year: number
  period: string
  metric_value: number | null
}

function sortFinancialRows(
  a: Pick<FinancialStatementRow, 'year' | 'fiscal_quarter'>,
  b: Pick<FinancialStatementRow, 'year' | 'fiscal_quarter'>,
): number {
  if (a.year !== b.year) return a.year - b.year
  return (a.fiscal_quarter ?? 0) - (b.fiscal_quarter ?? 0)
}

function buildPeriodLabel(
  row: Pick<FinancialStatementRow, 'year' | 'fiscal_quarter' | 'fiscal_label'>,
  periodType: 'annual' | 'quarterly',
): string {
  if (periodType === 'quarterly') {
    if (row.fiscal_label && row.fiscal_label.trim()) return row.fiscal_label.trim()
    if (row.fiscal_quarter) return `FY${row.year} Q${row.fiscal_quarter}`
  }
  return `FY${row.year}`
}

export function buildFinancialPoints(
  rows: FinancialStatementRow[],
  freeCashFlowLookup: Map<string, number>,
  periodType: 'annual' | 'quarterly',
): NewsletterFinancialPoint[] {
  return rows.map((row) => {
    const revenue = row.revenue ?? 0
    const grossProfit = row.gross_profit ?? 0
    const operatingIncome = row.operating_income ?? 0
    const periodKey =
      periodType === 'quarterly'
        ? `${row.year}-Q${row.fiscal_quarter ?? 0}`
        : `${row.year}-FY`

    return {
      year: row.year,
      periodLabel: buildPeriodLabel(row, periodType),
      revenue,
      netIncome: row.net_income ?? 0,
      grossMargin: revenue ? round2((grossProfit / revenue) * 100) : 0,
      operatingMargin: revenue
        ? round2((operatingIncome / revenue) * 100)
        : 0,
      freeCashFlow: freeCashFlowLookup.has(periodKey)
        ? (freeCashFlowLookup.get(periodKey) ?? null)
        : null,
      eps: round2(row.eps ?? 0),
      fiscalQuarter: row.fiscal_quarter ?? null,
      fiscalLabel: row.fiscal_label ?? null,
    }
  })
}

function buildAnnualHighlights(
  points: NewsletterFinancialPoint[],
): NewsletterHighlights {
  const latest = points[points.length - 1]
  const prior = points.length >= 2 ? points[points.length - 2] : null

  return {
    revenueGrowthYoY: computeGrowth(latest?.revenue, prior?.revenue),
    netIncomeGrowthYoY: computeGrowth(latest?.netIncome, prior?.netIncome),
    grossMarginLatest: latest?.grossMargin ?? null,
    operatingMarginLatest: latest?.operatingMargin ?? null,
    fcfLatest: latest?.freeCashFlow ?? null,
  }
}

function buildQuarterlyHighlights(
  points: NewsletterFinancialPoint[],
): NewsletterContext['quarterlyHighlights'] {
  const latest = points[points.length - 1]
  const priorYearMatch = latest
    ? [...points]
        .reverse()
        .find((point) =>
          point !== latest &&
          point.fiscalQuarter != null &&
          point.fiscalQuarter === latest.fiscalQuarter &&
          point.year < latest.year,
        ) ?? null
    : null
  const fallbackPrior = points.length >= 2 ? points[points.length - 2] : null
  const comparison = priorYearMatch ?? fallbackPrior

  return {
    revenueGrowthYoY: computeGrowth(latest?.revenue, comparison?.revenue),
    netIncomeGrowthYoY: computeGrowth(latest?.netIncome, comparison?.netIncome),
    grossMarginLatest: latest?.grossMargin ?? null,
    operatingMarginLatest: latest?.operatingMargin ?? null,
    fcfLatest: latest?.freeCashFlow ?? null,
    latestPeriodLabel: latest?.periodLabel ?? null,
  }
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
  const priceContextPromise = fetchNewsletterPriceContext(symbol)

  const [
    annualStdResult,
    quarterlyStdResult,
    annualFcfResult,
    quarterlyFcfResult,
  ] = await Promise.all([
    supabase
      .from('financials_std')
      .select(
        'year, revenue, gross_profit, net_income, operating_income, eps, fiscal_quarter, fiscal_label',
      )
      .eq('symbol', symbol)
      .eq('period_type', 'annual')
      .order('year', { ascending: false })
      .limit(7),
    supabase
      .from('financials_std')
      .select(
        'year, revenue, gross_profit, net_income, operating_income, eps, fiscal_quarter, fiscal_label',
      )
      .eq('symbol', symbol)
      .eq('period_type', 'quarterly')
      .order('year', { ascending: false })
      .order('fiscal_quarter', { ascending: false, nullsFirst: false })
      .limit(12),
    supabase
      .from('financial_metrics')
      .select('year, period, metric_value')
      .eq('symbol', symbol)
      .eq('metric_name', 'freeCashFlow')
      .eq('period', 'FY')
      .order('year', { ascending: false })
      .limit(7),
    supabase
      .from('financial_metrics')
      .select('year, period, metric_value')
      .eq('symbol', symbol)
      .eq('metric_name', 'freeCashFlow')
      .in('period', ['Q1', 'Q2', 'Q3', 'Q4'])
      .order('year', { ascending: false })
      .limit(12),
  ])

  if (annualStdResult.error) {
    throw new Error(
      `Failed to fetch annual financials for ${symbol}: ${annualStdResult.error.message}`,
    )
  }
  if (quarterlyStdResult.error) {
    throw new Error(
      `Failed to fetch quarterly financials for ${symbol}: ${quarterlyStdResult.error.message}`,
    )
  }

  const annualRows = [...((annualStdResult.data ?? []) as FinancialStatementRow[])]
    .sort(sortFinancialRows)
  const quarterlyRows = [...((quarterlyStdResult.data ?? []) as FinancialStatementRow[])]
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year
      return (b.fiscal_quarter ?? 0) - (a.fiscal_quarter ?? 0)
    })
    .slice(0, 8)
    .sort(sortFinancialRows)

  if (annualRows.length === 0 && quarterlyRows.length === 0) {
    throw new Error(`No financial data found for ${symbol}`)
  }

  const annualFcfLookup = new Map<string, number>()
  for (const row of (annualFcfResult.data ?? []) as FinancialMetricRow[]) {
    annualFcfLookup.set(`${row.year}-FY`, row.metric_value ?? 0)
  }

  const quarterlyFcfLookup = new Map<string, number>()
  for (const row of (quarterlyFcfResult.data ?? []) as FinancialMetricRow[]) {
    if (/^Q[1-4]$/.test(row.period)) {
      quarterlyFcfLookup.set(`${row.year}-${row.period}`, row.metric_value ?? 0)
    }
  }

  const financials = buildFinancialPoints(annualRows, annualFcfLookup, 'annual')
  const quarterlyFinancials = buildFinancialPoints(
    quarterlyRows,
    quarterlyFcfLookup,
    'quarterly',
  )
  const highlights = buildAnnualHighlights(financials)
  const quarterlyHighlights = buildQuarterlyHighlights(quarterlyFinancials)

  const priceContext = await priceContextPromise

  return {
    ticker: symbol,
    financials,
    quarterlyFinancials,
    highlights,
    quarterlyHighlights,
    priceContext,
  }
}

// ---------------------------------------------------------------------------
// Earnings calendar fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch recent earnings reports from FMP's earnings calendar.
 * Looks 2 days back + today + 1 day forward, filters to S&P 500.
 */
export async function fetchEarningsContext(): Promise<EarningsCandidate[]> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) return []

  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - 2)
  const to = new Date(now)
  to.setDate(to.getDate() + 1)

  const fromStr = from.toISOString().slice(0, 10)
  const toStr = to.toISOString().slice(0, 10)

  const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${fromStr}&to=${toStr}&apikey=${apiKey}`

  try {
    const res = await fetch(url)
    if (!res.ok) return []

    const data = await res.json()
    if (!Array.isArray(data)) return []

    return data
      .filter((e: any) => isSP500(e.symbol))
      .map((e: any) => {
        const reportDate = new Date(e.date)
        const hoursAgo = (now.getTime() - reportDate.getTime()) / (1000 * 60 * 60)
        const symbol = normalizeSP500Symbol(e.symbol) ?? String(e.symbol).toUpperCase()

        return {
          symbol,
          date: e.date,
          time: e.time || 'unknown',
          eps: e.eps ?? null,
          epsEstimated: e.epsEstimated ?? null,
          revenue: e.revenue ?? null,
          revenueEstimated: e.revenueEstimated ?? null,
          hoursAgo: Math.round(hoursAgo),
        }
      })
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Gainers / losers fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch today's biggest gainers and losers from FMP, filtered to S&P 500.
 */
export async function fetchGainersLosers(): Promise<StockCandidate[]> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) return []

  try {
    const [gainersRes, losersRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${apiKey}`),
      fetch(`https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${apiKey}`),
    ])

    const gainersData = gainersRes.ok ? await gainersRes.json() : []
    const losersData = losersRes.ok ? await losersRes.json() : []

    const all = [...(Array.isArray(gainersData) ? gainersData : []), ...(Array.isArray(losersData) ? losersData : [])]

    return filterToSP500(all)
      .filter((s: any) => s.price > 0)
      .sort((a: any, b: any) => Math.abs(b.changesPercentage) - Math.abs(a.changesPercentage))
      .map((s: any) => ({
        symbol: normalizeSP500Symbol(s.symbol) ?? s.symbol,
        name: s.name,
        price: s.price,
        change: s.change,
        changesPercentage: s.changesPercentage,
      }))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Recent picks (Supabase)
// ---------------------------------------------------------------------------

/**
 * Fetch recent stock picks from the newsletter_picks table.
 * Returns empty array if table doesn't exist or query fails.
 */
export async function fetchRecentPicks(days = 14): Promise<RecentPick[]> {
  try {
    // Editorial history is server-owned; reads and writes both use the trusted
    // server client so no public policy can reveal upcoming issue choices.
    // newsletter_picks predates the generated Database snapshot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServiceRoleClient() as any
    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data, error } = await supabase
      .from('newsletter_picks')
      .select('ticker, name, picked_at')
      .gte('picked_at', since.toISOString())
      .order('picked_at', { ascending: false })

    if (error || !data) return []

    return data.map((row: any) => ({
      ticker: row.ticker,
      name: row.name,
      pickedAt: row.picked_at,
    }))
  } catch {
    return []
  }
}

/**
 * Record a stock pick in the newsletter_picks table.
 * Non-fatal: logs a warning on failure.
 */
export async function recordPick(result: StockPickerResult): Promise<void> {
  try {
    // Picks are server-owned editorial history. Never rely on a public INSERT
    // policy for this write.
    // newsletter_picks predates the generated Database snapshot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServiceRoleClient() as any

    const { error } = await supabase.from('newsletter_picks').insert({
      ticker: result.ticker,
      name: result.name,
      editorial_hook: result.editorialHook,
      subject_line: result.subjectLine,
      changes_percentage: result.changesPercentage,
      picked_at: new Date().toISOString(),
      pick_source: result.pickSource || null,
    })

    if (error) {
      console.warn('Failed to record pick:', error)
    }
  } catch (err) {
    console.warn('Failed to record pick:', err)
  }
}

// ---------------------------------------------------------------------------
// Market context fetcher (for AI stock picker)
// ---------------------------------------------------------------------------

/**
 * The daily newsletter selects up to 50 candidates (and defaults to 40) after a
 * quality gate that drops anything without fresh, entity-matched evidence. A
 * pool of 50 therefore demanded a ~80% pass rate and could never satisfy the
 * gate once FMP's movers feeds thinned out. Healthy days historically produced
 * 130-150 candidates, so target that instead. This costs no extra requests:
 * fetchSP500QuoteCandidates already quotes the whole S&P 500 universe, and the
 * target only decides how many of those results are retained.
 */
const MARKET_CANDIDATE_POOL_TARGET = 150
const FMP_QUOTE_BATCH_SIZE = 100
const NEWS_COVERAGE_TARGET = 60
const NEWS_TICKERS_PER_REQUEST = 15

interface FmpQuoteCandidate {
  symbol?: unknown
  name?: unknown
  price?: unknown
  change?: unknown
  changesPercentage?: unknown
}

function finiteNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapFmpQuoteCandidate(value: unknown): StockCandidate | null {
  if (!value || typeof value !== 'object') return null
  const quote = value as FmpQuoteCandidate
  if (typeof quote.symbol !== 'string') return null
  const symbol = normalizeSP500Symbol(quote.symbol)
  const price = finiteNumber(quote.price)
  if (!symbol || !isSP500(symbol) || price <= 0) return null

  return {
    symbol,
    name:
      typeof quote.name === 'string' && quote.name.trim()
        ? quote.name
        : (getSP500Constituent(symbol)?.name ?? symbol),
    price,
    change: finiteNumber(quote.change),
    changesPercentage: finiteNumber(quote.changesPercentage),
  }
}

function fmpQuoteSymbol(symbol: string): string {
  return getSP500Constituent(symbol)?.alternate_symbols?.fmp ?? symbol
}

/**
 * FMP's top-50 actives/gainers/losers feeds can occasionally contain almost
 * no S&P 500 names before the opening bell. Batch quotes provide a bounded,
 * current-universe fallback so a thin movers feed cannot stop the newsletter.
 */
async function fetchSP500QuoteCandidates(
  apiKey: string,
): Promise<StockCandidate[]> {
  const symbols = Array.from(SP500_SYMBOLS, fmpQuoteSymbol)
  const batches = Array.from(
    { length: Math.ceil(symbols.length / FMP_QUOTE_BATCH_SIZE) },
    (_, index) =>
      symbols.slice(
        index * FMP_QUOTE_BATCH_SIZE,
        (index + 1) * FMP_QUOTE_BATCH_SIZE,
      ),
  )
  const results = await Promise.allSettled(
    batches.map(async (batch) => {
      const response = await fetch(
        `https://financialmodelingprep.com/api/v3/quote/${batch.join(',')}?apikey=${apiKey}`,
      )
      if (!response.ok) return []
      const data = await response.json()
      if (!Array.isArray(data)) return []
      return data.flatMap((entry) => {
        const candidate = mapFmpQuoteCandidate(entry)
        return candidate ? [candidate] : []
      })
    }),
  )

  const deduplicated = new Map<string, StockCandidate>()
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const candidate of result.value) {
      deduplicated.set(candidate.symbol, candidate)
    }
  }

  return Array.from(deduplicated.values()).sort(
    (left, right) =>
      Math.abs(right.changesPercentage) -
        Math.abs(left.changesPercentage) ||
      left.symbol.localeCompare(right.symbol),
  )
}

/**
 * Fetch most-active stocks from FMP, merge with earnings & gainers/losers,
 * filter to S&P 500, and gather news.
 *
 * On quiet days (fewer than 3 candidates with >2% moves), widens the
 * candidate pool from top 10 to top 20 actives.
 */
export async function fetchMarketContext(): Promise<MarketContext> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) {
    throw new Error('Missing FMP_API_KEY environment variable')
  }

  // Fetch actives, earnings, and gainers/losers in parallel
  const [activesRes, earningsReports, gainersLosers] = await Promise.all([
    fetch(`https://financialmodelingprep.com/api/v3/stock_market/actives?apikey=${apiKey}`),
    fetchEarningsContext(),
    fetchGainersLosers(),
  ])

  if (!activesRes.ok) {
    throw new Error(`FMP actives API returned ${activesRes.status}`)
  }
  const activesData = await activesRes.json()

  if (!Array.isArray(activesData) || activesData.length === 0) {
    throw new Error('No active stocks returned from FMP')
  }

  // Filter actives to S&P 500 — start with top 10
  const sp500Actives = filterToSP500(activesData).filter(
    (s: any) => s.price > 0,
  )
  let initialSlice = 10

  // Quiet day expansion: if fewer than 3 candidates have >2% absolute moves, widen pool
  const bigMovers = sp500Actives
    .slice(0, 10)
    .filter((s: any) => Math.abs(s.changesPercentage) > 2)
  if (bigMovers.length < 3) {
    initialSlice = 20
  }

  // Build deduplicated candidate map: actives first, then gainers/losers, then earnings
  const candidateMap = new Map<string, StockCandidate>()

  for (const s of sp500Actives.slice(0, initialSlice)) {
    const symbol = normalizeSP500Symbol(s.symbol) ?? s.symbol
    candidateMap.set(symbol, {
      symbol,
      name: s.name,
      price: s.price,
      change: s.change,
      changesPercentage: s.changesPercentage,
    })
  }

  for (const gl of gainersLosers) {
    const symbol = normalizeSP500Symbol(gl.symbol) ?? gl.symbol
    if (!candidateMap.has(symbol)) {
      candidateMap.set(symbol, { ...gl, symbol })
    }
  }

  // For earnings reporters not already in map, fetch batch quote
  const earningsSymbolsMissing = earningsReports
    .map((e) => e.symbol)
    .filter((sym) => !candidateMap.has(sym))

  if (earningsSymbolsMissing.length > 0) {
    const batchSymbols = earningsSymbolsMissing.join(',')
    try {
      const quoteRes = await fetch(
        `https://financialmodelingprep.com/api/v3/quote/${batchSymbols}?apikey=${apiKey}`,
      )
      if (quoteRes.ok) {
        const quoteData = await quoteRes.json()
        if (Array.isArray(quoteData)) {
          for (const q of quoteData) {
            const symbol = normalizeSP500Symbol(q.symbol)
            if (symbol && isSP500(symbol) && q.price > 0) {
              candidateMap.set(symbol, {
                symbol,
                name: q.name || symbol,
                price: q.price,
                change: q.change ?? 0,
                changesPercentage: q.changesPercentage ?? 0,
              })
            }
          }
        }
      }
    } catch {
      // Non-fatal: earnings candidates just won't have quote data
    }
  }

  if (candidateMap.size < MARKET_CANDIDATE_POOL_TARGET) {
    const supplementalCandidates = await fetchSP500QuoteCandidates(apiKey)
    for (const candidate of supplementalCandidates) {
      if (!candidateMap.has(candidate.symbol)) {
        candidateMap.set(candidate.symbol, candidate)
      }
      if (candidateMap.size >= MARKET_CANDIDATE_POOL_TARGET) break
    }
  }

  const candidates = Array.from(candidateMap.values())

  if (candidates.length === 0) {
    throw new Error('No S&P 500 stocks found in candidate pool')
  }

  // Fetch news in fixed-size batches by absolute % move. A candidate needs two
  // relevant stories to escape the `watch_only` classification, so covering
  // only the top 15 starved the pool the moment it stopped being movers-driven.
  // Batch size stays at 15 to keep both the URL bounded and the per-request
  // article budget (limit=50) from being spread too thin across tickers.
  const rankedNewsSymbols = [...candidates]
    .sort((a, b) => Math.abs(b.changesPercentage) - Math.abs(a.changesPercentage))
    .slice(0, NEWS_COVERAGE_TARGET)
    .map((c) => c.symbol)
  const newsBatches = Array.from(
    { length: Math.ceil(rankedNewsSymbols.length / NEWS_TICKERS_PER_REQUEST) },
    (_, index) =>
      rankedNewsSymbols.slice(
        index * NEWS_TICKERS_PER_REQUEST,
        (index + 1) * NEWS_TICKERS_PER_REQUEST,
      ),
  )

  // A failed batch is non-fatal: those candidates simply stay unenriched.
  const newsResults = await Promise.allSettled(
    newsBatches.map(async (batch) => {
      const response = await fetch(
        `https://financialmodelingprep.com/api/v3/stock_news?tickers=${batch.join(',')}&limit=50&apikey=${apiKey}`,
      )
      if (!response.ok) return []
      const data = await response.json()
      return Array.isArray(data) ? data : []
    }),
  )
  const newsData = newsResults.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  )

  // Group news by symbol, cap at 5 per stock
  const newsBySymbol: Record<string, StockNewsItem[]> = {}
  if (Array.isArray(newsData)) {
    for (const item of newsData) {
      const sym = normalizeSP500Symbol(item.symbol)
      if (!sym || !candidateMap.has(sym)) continue
      if (!newsBySymbol[sym]) newsBySymbol[sym] = []
      if (newsBySymbol[sym].length >= 5) continue
      newsBySymbol[sym].push({
        title: item.title || '',
        text: item.text || '',
        url: item.url || '',
        publishedDate: item.publishedDate || '',
        site: item.site || '',
      })
    }
  }

  return { candidates, newsBySymbol, earningsReports, gainersLosers }
}

// ---------------------------------------------------------------------------
// Today's quote (for newsletter intro)
// ---------------------------------------------------------------------------

/**
 * Fetch today's quote for a ticker from FMP.
 * Returns price, $ change, and % change.
 */
export async function fetchTodayQuote(ticker: string): Promise<TodayQuote> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) {
    throw new Error('Missing FMP_API_KEY environment variable')
  }

  const symbol = ticker.toUpperCase()

  // Fetch quote and YTD price change in parallel
  const [quoteRes, changeRes] = await Promise.all([
    fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`),
    fetch(`https://financialmodelingprep.com/api/v3/stock-price-change/${symbol}?apikey=${apiKey}`),
  ])

  if (!quoteRes.ok) {
    throw new Error(`FMP quote API returned ${quoteRes.status} for ${symbol}`)
  }

  const data = await quoteRes.json()
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No quote data returned for ${symbol}`)
  }

  let ytdReturn: number | undefined
  if (changeRes.ok) {
    const changeData = await changeRes.json()
    if (Array.isArray(changeData) && changeData.length > 0) {
      ytdReturn = changeData[0].ytd ?? undefined
    }
  }

  const q = data[0]
  return {
    ticker: symbol,
    name: q.name || symbol,
    price: q.price ?? 0,
    change: q.change ?? 0,
    changesPercentage: q.changesPercentage ?? 0,
    marketCap: q.marketCap ?? undefined,
    pe: q.pe ?? undefined,
    yearHigh: q.yearHigh ?? undefined,
    yearLow: q.yearLow ?? undefined,
    ytdReturn,
  }
}

// ---------------------------------------------------------------------------
// Today's news (for manual ticker editorial hook)
// ---------------------------------------------------------------------------

/**
 * Fetch recent news headlines for a single ticker.
 */
export async function fetchTickerNews(
  ticker: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<StockNewsItem[]> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) return []

  const url = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${ticker.toUpperCase()}&limit=${limit}&apikey=${apiKey}`
  const res = await fetch(url, { signal })
  if (!res.ok) return []

  const data = await res.json()
  if (!Array.isArray(data)) return []

  return data.map((item: any) => ({
    title: item.title || '',
    text: item.text || '',
    url: item.url || '',
    publishedDate: item.publishedDate || '',
    site: item.site || '',
  }))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function averageClose(
  candles: Array<{ close: number }>,
): number | null {
  if (candles.length === 0) return null
  const total = candles.reduce((sum, candle) => sum + candle.close, 0)
  return round2(total / candles.length)
}

function computeTrailingReturn(
  candles: Array<{ close: number }>,
  lookbackBars: number,
): number | null {
  if (candles.length <= lookbackBars) return null
  const latest = candles[candles.length - 1]?.close
  const prior = candles[candles.length - 1 - lookbackBars]?.close
  if (!Number.isFinite(latest) || !Number.isFinite(prior) || !prior) return null
  return round2(((latest - prior) / prior) * 100)
}

function computeGrowth(
  current: number | undefined,
  prior: number | undefined,
): number | null {
  if (current == null || prior == null || prior === 0) return null
  return round2(((current - prior) / Math.abs(prior)) * 100)
}
