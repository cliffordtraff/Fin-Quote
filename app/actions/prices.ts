'use server'

export type PriceRange = '7d' | '30d' | '90d' | '365d' | 'ytd' | '3y' | '5y' | '10y' | '20y' | 'max'

export type PriceParams = {
  symbol: string // Stock symbol (e.g., 'AAPL', 'MSFT')
  from?: string
  to?: string
  range?: PriceRange
}

// Helper to convert range to from date
function rangeToFromDate(range: PriceRange): string {
  const today = new Date()
  let fromDate: Date

  switch (range) {
    case '7d':
      fromDate = new Date(today)
      fromDate.setDate(today.getDate() - 7)
      break
    case '30d':
      fromDate = new Date(today)
      fromDate.setDate(today.getDate() - 30)
      break
    case '90d':
      fromDate = new Date(today)
      fromDate.setDate(today.getDate() - 90)
      break
    case '365d':
      fromDate = new Date(today)
      fromDate.setFullYear(today.getFullYear() - 1)
      break
    case 'ytd':
      fromDate = new Date(today.getFullYear(), 0, 1) // Jan 1 of current year
      break
    case '3y':
      fromDate = new Date(today)
      fromDate.setFullYear(today.getFullYear() - 3)
      break
    case '5y':
      fromDate = new Date(today)
      fromDate.setFullYear(today.getFullYear() - 5)
      break
    case '10y':
      fromDate = new Date(today)
      fromDate.setFullYear(today.getFullYear() - 10)
      break
    case '20y':
      fromDate = new Date(today)
      fromDate.setFullYear(today.getFullYear() - 20)
      break
    case 'max':
      fromDate = new Date('1980-01-01') // AAPL IPO was 1980
      break
    default:
      fromDate = new Date(today)
      fromDate.setDate(today.getDate() - 30) // Default to 30 days
  }

  return fromDate.toISOString().split('T')[0]
}

export async function getPrices(params: PriceParams): Promise<{
  data: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> | null
  error: string | null
}> {
  const { symbol } = params
  let { from, to } = params
  const { range } = params

  // Convert range to from date if provided
  if (range && !from) {
    from = rangeToFromDate(range)
  }

  // Validate date format (basic check)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (from && !dateRegex.test(from)) {
    return { data: null, error: 'Invalid from date. Must be in YYYY-MM-DD format.' }
  }
  if (to && !dateRegex.test(to)) {
    return { data: null, error: 'Invalid to date. Must be in YYYY-MM-DD format.' }
  }

  // Default from date if neither from nor range provided
  if (!from) {
    const defaultFrom = new Date()
    defaultFrom.setDate(defaultFrom.getDate() - 30)
    from = defaultFrom.toISOString().split('T')[0]
  }

  try {
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) {
      console.error('FMP_API_KEY not found in environment')
      return { data: null, error: 'API configuration error' }
    }

    // Build API URL with date parameters
    const fromDate = from
    const toDate = to || new Date().toISOString().split('T')[0]

    // Check if we're asking for ONLY today's data (both from and to are today)
    const today = new Date().toISOString().split('T')[0]
    const isAskingForTodayOnly = fromDate === today && toDate === today

    let url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${apiKey}&from=${fromDate}&to=${toDate}`

    // Only use fallback if asking for today's data specifically (not for ranges that include today)
    if (isAskingForTodayOnly) {
      // Get last 5 trading days to ensure we have data
      const fiveDaysAgo = new Date()
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)
      const fallbackFrom = fiveDaysAgo.toISOString().split('T')[0]
      url = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${apiKey}&from=${fallbackFrom}`
    }

    const response = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    })

    if (!response.ok) {
      console.error('FMP API error:', response.status, response.statusText)
      return {
        data: null,
        error: `API request failed: ${response.status}`,
      }
    }

    const json = await response.json()

    // FMP returns: { symbol: "AAPL", historical: [{date, open, high, low, close, volume}, ...] }
    if (!json.historical || !Array.isArray(json.historical)) {
      console.error('Unexpected FMP response format:', json)

      // Check if this is an API error message
      if (json.error || json['Error Message']) {
        const errorMsg = json.error || json['Error Message']
        return { data: null, error: `API error: ${errorMsg}` }
      }

      // If it's an empty response, it might be because the date is too recent or market is closed
      if (Object.keys(json).length === 0 || (json.historical && json.historical.length === 0)) {
        return {
          data: null,
          error: 'No price data available for this date. The market may be closed or data may not be available yet for today.'
        }
      }

      return { data: null, error: 'Unexpected API response format' }
    }

    // Map and sort data (API already filtered by date parameters)
    // Filter out any records with null/invalid OHLC values (including NaN and Infinity)
    let filteredData: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> = json.historical
      .filter((item: any) =>
        item.date &&
        item.open != null && Number.isFinite(item.open) &&
        item.high != null && Number.isFinite(item.high) &&
        item.low != null && Number.isFinite(item.low) &&
        item.close != null && Number.isFinite(item.close) &&
        item.volume != null && Number.isFinite(item.volume)
      )
      .map((item: any) => ({
        date: item.date,
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume),
      }))
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Most recent first

    // Only filter to single day if explicitly asking for today's data only
    if (isAskingForTodayOnly && filteredData.length > 0) {
      console.log(`Asked for today only (${today}), returning most recent available: ${filteredData[0].date}`)
      filteredData = [filteredData[0]]
    }

    if (filteredData.length === 0) {
      return { data: null, error: 'No price data available for the requested range' }
    }

    return { data: filteredData, error: null }
  } catch (err) {
    console.error(`Error fetching ${symbol} prices:`, err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}

// Backward-compatible alias for existing code
export async function getAaplPrices(params: Omit<PriceParams, 'symbol'>): Promise<{
  data: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> | null
  error: string | null
}> {
  return getPrices({ ...params, symbol: 'AAPL' })
}
