'use server'

export type PriceRange = '7d' | '30d' | '90d' | '365d' | 'ytd' | '3y' | '5y' | '10y' | '20y' | 'max'

// Timeframe represents the candle interval
export type Timeframe = '1h' | '4h' | '1d' | '1w' | '1m'

export type PriceParams = {
  symbol: string // Stock symbol (e.g., 'AAPL', 'MSFT')
  from?: string
  to?: string
  range?: PriceRange
  timeframe?: Timeframe // Candle timeframe (1h, 4h, 1d, 1w, 1m)
}

// Map timeframe to FMP API endpoint path
function getEndpointForTimeframe(timeframe: Timeframe): string {
  switch (timeframe) {
    case '1h':
      return 'historical-chart/1hour'
    case '4h':
      return 'historical-chart/4hour'
    case '1d':
    case '1w':
    case '1m':
      return 'historical-price-full' // Daily data (we aggregate for weekly/monthly)
    default:
      return 'historical-price-full'
  }
}

// Get appropriate date range for each timeframe
function getDefaultDateRangeForTimeframe(timeframe: Timeframe): { from: string; to: string } {
  const today = new Date()
  const toDate = today.toISOString().split('T')[0]
  let fromDate: Date

  switch (timeframe) {
    case '1h':
      // Last 10 days of hourly data
      fromDate = new Date(today)
      fromDate.setDate(today.getDate() - 10)
      break
    case '4h':
      // Last 30 days of 4-hour data
      fromDate = new Date(today)
      fromDate.setDate(today.getDate() - 30)
      break
    case '1d':
      // Last year of daily data
      fromDate = new Date(today)
      fromDate.setFullYear(today.getFullYear() - 1)
      break
    case '1w':
      // Last 3 years for weekly data
      fromDate = new Date(today)
      fromDate.setFullYear(today.getFullYear() - 3)
      break
    case '1m':
      // Last 10 years for monthly data
      fromDate = new Date(today)
      fromDate.setFullYear(today.getFullYear() - 10)
      break
    default:
      fromDate = new Date(today)
      fromDate.setFullYear(today.getFullYear() - 1)
  }

  return { from: fromDate.toISOString().split('T')[0], to: toDate }
}

type PriceDataPoint = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Aggregate daily candles into weekly candles
function aggregateToWeekly(dailyData: PriceDataPoint[]): PriceDataPoint[] {
  // Sort by date ascending
  const sorted = [...dailyData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const weeklyMap = new Map<string, PriceDataPoint[]>()

  for (const candle of sorted) {
    const date = new Date(candle.date)
    // Get the Monday of this week
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Adjust when day is Sunday
    const monday = new Date(date)
    monday.setDate(diff)
    const weekKey = monday.toISOString().split('T')[0]

    if (!weeklyMap.has(weekKey)) {
      weeklyMap.set(weekKey, [])
    }
    weeklyMap.get(weekKey)!.push(candle)
  }

  const weekly: PriceDataPoint[] = []
  for (const [weekStart, candles] of weeklyMap) {
    if (candles.length === 0) continue

    weekly.push({
      date: weekStart,
      open: candles[0].open,
      high: Math.max(...candles.map(c => c.high)),
      low: Math.min(...candles.map(c => c.low)),
      close: candles[candles.length - 1].close,
      volume: candles.reduce((sum, c) => sum + c.volume, 0),
    })
  }

  return weekly.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

// Aggregate daily candles into monthly candles
function aggregateToMonthly(dailyData: PriceDataPoint[]): PriceDataPoint[] {
  // Sort by date ascending
  const sorted = [...dailyData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const monthlyMap = new Map<string, PriceDataPoint[]>()

  for (const candle of sorted) {
    const date = new Date(candle.date)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, [])
    }
    monthlyMap.get(monthKey)!.push(candle)
  }

  const monthly: PriceDataPoint[] = []
  for (const [monthStart, candles] of monthlyMap) {
    if (candles.length === 0) continue

    monthly.push({
      date: monthStart,
      open: candles[0].open,
      high: Math.max(...candles.map(c => c.high)),
      low: Math.min(...candles.map(c => c.low)),
      close: candles[candles.length - 1].close,
      volume: candles.reduce((sum, c) => sum + c.volume, 0),
    })
  }

  return monthly.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
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

// New function for timeframe-based price fetching
export async function getPricesByTimeframe(params: {
  symbol: string
  timeframe: Timeframe
}): Promise<{
  data: PriceDataPoint[] | null
  error: string | null
}> {
  const { symbol, timeframe } = params

  try {
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) {
      console.error('FMP_API_KEY not found in environment')
      return { data: null, error: 'API configuration error' }
    }

    const endpoint = getEndpointForTimeframe(timeframe)
    const { from, to } = getDefaultDateRangeForTimeframe(timeframe)

    let url: string
    let isIntradayEndpoint = timeframe === '1h' || timeframe === '4h'

    if (isIntradayEndpoint) {
      // Intraday endpoints have a different format
      url = `https://financialmodelingprep.com/api/v3/${endpoint}/${symbol}?apikey=${apiKey}&from=${from}&to=${to}`
    } else {
      // Daily endpoint
      url = `https://financialmodelingprep.com/api/v3/${endpoint}/${symbol}?apikey=${apiKey}&from=${from}&to=${to}`
    }

    const response = await fetch(url, {
      next: { revalidate: timeframe === '1h' ? 300 : 3600 }, // Cache 5 min for hourly, 1 hour otherwise
    })

    if (!response.ok) {
      console.error('FMP API error:', response.status, response.statusText)
      return {
        data: null,
        error: `API request failed: ${response.status}`,
      }
    }

    const json = await response.json()

    // Handle different response formats
    let rawData: any[]

    if (isIntradayEndpoint) {
      // Intraday endpoints return array directly
      if (!Array.isArray(json)) {
        if (json.error || json['Error Message']) {
          return { data: null, error: `API error: ${json.error || json['Error Message']}` }
        }
        return { data: null, error: 'Unexpected API response format for intraday data' }
      }
      rawData = json
    } else {
      // Daily endpoint returns { symbol, historical: [...] }
      if (!json.historical || !Array.isArray(json.historical)) {
        if (json.error || json['Error Message']) {
          return { data: null, error: `API error: ${json.error || json['Error Message']}` }
        }
        return { data: null, error: 'Unexpected API response format' }
      }
      rawData = json.historical
    }

    // Filter and map data
    let filteredData: PriceDataPoint[] = rawData
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
      .sort((a: PriceDataPoint, b: PriceDataPoint) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )

    // Apply aggregation for weekly/monthly
    if (timeframe === '1w') {
      filteredData = aggregateToWeekly(filteredData)
    } else if (timeframe === '1m') {
      filteredData = aggregateToMonthly(filteredData)
    }

    if (filteredData.length === 0) {
      return { data: null, error: 'No price data available for the requested timeframe' }
    }

    return { data: filteredData, error: null }
  } catch (err) {
    console.error(`Error fetching ${symbol} prices for timeframe ${timeframe}:`, err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
