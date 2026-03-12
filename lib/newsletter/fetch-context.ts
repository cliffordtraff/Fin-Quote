import { createClient } from '@supabase/supabase-js'
import type {
  NewsletterContext,
  MarketContext,
  StockCandidate,
  StockNewsItem,
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
// S&P 500 constituent symbols (for filtering most-active list)
// ---------------------------------------------------------------------------

const SP500_SYMBOLS = new Set([
  'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'GOOG', 'BRK.B', 'TSLA', 'UNH',
  'XOM', 'JNJ', 'JPM', 'V', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV',
  'LLY', 'PEP', 'KO', 'COST', 'AVGO', 'WMT', 'MCD', 'CSCO', 'TMO', 'ACN',
  'ABT', 'DHR', 'NEE', 'LIN', 'ADBE', 'WFC', 'NKE', 'PM', 'TXN', 'CRM',
  'VZ', 'RTX', 'CMCSA', 'BMY', 'HON', 'ORCL', 'QCOM', 'COP', 'T', 'UPS',
  'MS', 'LOW', 'UNP', 'INTC', 'ELV', 'SPGI', 'IBM', 'CAT', 'PLD', 'BA',
  'AMD', 'GE', 'INTU', 'AMAT', 'DE', 'AMGN', 'GS', 'SBUX', 'ISRG', 'MDT',
  'AXP', 'BKNG', 'BLK', 'GILD', 'ADI', 'SYK', 'MDLZ', 'TJX', 'CVS', 'ADP',
  'REGN', 'LMT', 'CI', 'VRTX', 'PGR', 'MMC', 'SCHW', 'CB', 'ETN', 'ZTS',
  'MO', 'SO', 'DUK', 'BSX', 'BDX', 'TMUS', 'FI', 'CME', 'EOG', 'SLB',
  'NOC', 'PNC', 'MU', 'CL', 'ITW', 'AON', 'LRCX', 'CSX', 'EQIX', 'ICE',
  'WM', 'SHW', 'SNPS', 'CDNS', 'HUM', 'MCK', 'FCX', 'APD', 'KLAC', 'ORLY',
  'NSC', 'GD', 'EMR', 'MCO', 'PXD', 'PSA', 'NXPI', 'USB', 'MAR', 'ROP',
  'MNST', 'MSI', 'CTAS', 'AJG', 'ADSK', 'GM', 'F', 'AZO', 'HCA', 'PCAR',
  'OXY', 'TGT', 'MCHP', 'MSCI', 'TEL', 'TT', 'PAYX', 'AEP', 'KMB', 'TDG',
  'ANET', 'MET', 'SRE', 'PSX', 'CCI', 'D', 'O', 'KDP', 'APH', 'ECL',
  'PH', 'WELL', 'CMG', 'AIG', 'CARR', 'AFL', 'STZ', 'IDXX', 'COF', 'HLT',
  'DVN', 'DXCM', 'FTNT', 'ODFL', 'NEM', 'TRV', 'SPG', 'ALL', 'ROST', 'GWW',
  'WMB', 'BK', 'KMI', 'IQV', 'PRU', 'HSY', 'DLR', 'CTVA', 'YUM', 'A',
  'AME', 'KEYS', 'EXC', 'FAST', 'ON', 'EW', 'CPRT', 'DOW', 'DD', 'XEL',
  'PCG', 'VRSK', 'PPG', 'ED', 'EA', 'AWK', 'HPQ', 'ROK', 'KR', 'GIS',
  'VICI', 'CSGP', 'EXR', 'DHI', 'OKE', 'WEC', 'MLM', 'LEN', 'VMC', 'CTSH',
  'HAL', 'BIIB', 'BKR', 'ANSS', 'CDW', 'GLW', 'EBAY', 'RMD', 'CBRE', 'MTD',
  'ACGL', 'FTV', 'ZBH', 'HES', 'FANG', 'DAL', 'DLTR', 'DFS', 'TSCO', 'WTW',
  'HPE', 'EFX', 'ALGN', 'LH', 'AVB', 'GPN', 'TROW', 'WY', 'CAH', 'EIX',
  'STT', 'FE', 'ENPH', 'LYB', 'ES', 'MTB', 'WAB', 'HOLX', 'ILMN', 'RJF',
  'IR', 'DTE', 'ETR', 'DOV', 'FITB', 'NTRS', 'VTR', 'ARE', 'IFF', 'PPL',
  'CHD', 'BAX', 'CINF', 'SBAC', 'CLX', 'EXPD', 'PTC', 'TSN', 'AEE', 'LUV',
  'TDY', 'PKI', 'MKC', 'DRI', 'STLD', 'K', 'STE', 'RF', 'ESS', 'NVR',
  'HBAN', 'EQR', 'NDAQ', 'GRMN', 'COO', 'WAT', 'CNP', 'TRGP', 'ATO', 'MAA',
  'J', 'CFG', 'AMCR', 'JBHT', 'IP', 'FMC', 'SWK', 'WRB', 'SYY', 'EXPE',
  'SEDG', 'CE', 'LKQ', 'TXT', 'BBY', 'FDS', 'CMS', 'AES', 'KEY', 'NTAP',
  'URI', 'BALL', 'MOH', 'BR', 'DGX', 'SNA', 'IEX', 'L', 'TECH', 'OMC',
  'MAS', 'CF', 'POOL', 'AKAM', 'BRO', 'TER', 'LNT', 'CAG', 'GPC', 'AVY',
  'NI', 'UDR', 'SWKS', 'EVRG', 'VTRS', 'HST', 'KIM', 'WDC', 'CHRW', 'MGM',
  'HRL', 'PEAK', 'CPB', 'TPR', 'TFC', 'NRG', 'LDOS', 'GL', 'PNR', 'BXP',
  'JKHY', 'RCL', 'AAP', 'CZR', 'WYNN', 'PNW', 'NWS', 'NWSA', 'ROL', 'REG',
  'BEN', 'MOS', 'PHM', 'HSIC', 'FFIV', 'AAL', 'CCL', 'CPT', 'CRL', 'BWA',
  'CTLT', 'AIZ', 'WHR', 'DISH', 'IVZ', 'XRAY', 'SEE', 'ALK', 'NCLH', 'HII',
  'FRT', 'MKTX', 'EMN', 'PFG', 'APA', 'ALLE', 'HAS', 'TAP', 'QRVO', 'LW',
  'BBWI', 'DXC', 'ZION', 'WBA', 'VFC', 'PARA', 'LUMN', 'DVA', 'PAYC', 'CMA',
  'GNRC', 'BIO', 'INCY', 'UHS', 'ETSY', 'FOXA', 'FOX', 'NWL', 'MTCH', 'RL',
])

// ---------------------------------------------------------------------------
// Market context fetcher (for AI stock picker)
// ---------------------------------------------------------------------------

/**
 * Fetch most-active stocks from FMP, filter to S&P 500, and gather news.
 * Works in CLI scripts (no Next.js server actions needed).
 */
export async function fetchMarketContext(): Promise<MarketContext> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) {
    throw new Error('Missing FMP_API_KEY environment variable')
  }

  // Fetch most active stocks
  const activesUrl = `https://financialmodelingprep.com/api/v3/stock_market/actives?apikey=${apiKey}`
  const activesRes = await fetch(activesUrl)
  if (!activesRes.ok) {
    throw new Error(`FMP actives API returned ${activesRes.status}`)
  }
  const activesData = await activesRes.json()

  if (!Array.isArray(activesData) || activesData.length === 0) {
    throw new Error('No active stocks returned from FMP')
  }

  // Filter to S&P 500 and take top 10
  const candidates: StockCandidate[] = activesData
    .filter((s: any) => SP500_SYMBOLS.has(s.symbol) && s.price > 0)
    .slice(0, 10)
    .map((s: any) => ({
      symbol: s.symbol,
      name: s.name,
      price: s.price,
      change: s.change,
      changesPercentage: s.changesPercentage,
    }))

  if (candidates.length === 0) {
    throw new Error('No S&P 500 stocks found in most-active list')
  }

  // Fetch news for all candidates in one call
  const symbols = candidates.map((c) => c.symbol).join(',')
  const newsUrl = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${symbols}&limit=30&apikey=${apiKey}`
  const newsRes = await fetch(newsUrl)
  const newsData = newsRes.ok ? await newsRes.json() : []

  // Group news by symbol, cap at 5 per stock
  const newsBySymbol: Record<string, StockNewsItem[]> = {}
  if (Array.isArray(newsData)) {
    for (const item of newsData) {
      const sym = item.symbol
      if (!sym) continue
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

  return { candidates, newsBySymbol }
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
