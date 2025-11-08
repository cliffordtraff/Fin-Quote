'use server'

export type PriceRange = '7d' | '30d' | '90d' | '365d' | 'ytd' | '3y' | '5y' | '10y' | '20y' | 'max'

export type PriceParams =
  | { range: PriceRange }
  | { from: string; to?: string }

export async function getAaplPrices(params: PriceParams): Promise<{
  data: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> | null
  error: string | null
}> {
  // Determine if using preset range or custom dates
  const isRangeMode = 'range' in params

  if (isRangeMode) {
    const { range } = params
    // Validate range
    const allowedRanges: PriceRange[] = ['7d', '30d', '90d', '365d', 'ytd', '3y', '5y', '10y', '20y', 'max']
    if (!allowedRanges.includes(range)) {
      return { data: null, error: `Invalid range. Must be one of: ${allowedRanges.join(', ')}` }
    }
  } else {
    const { from, to } = params
    // Validate date format (basic check)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(from)) {
      return { data: null, error: 'Invalid from date. Must be in YYYY-MM-DD format.' }
    }
    if (to && !dateRegex.test(to)) {
      return { data: null, error: 'Invalid to date. Must be in YYYY-MM-DD format.' }
    }
  }

  try {
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) {
      console.error('FMP_API_KEY not found in environment')
      return { data: null, error: 'API configuration error' }
    }

    // Build API URL
    let url = `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=${apiKey}`
    let fromDate: string | null = null
    let toDate: string | null = null

    if (isRangeMode) {
      const { range } = params

      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]

      if (range === 'ytd') {
        // Year to date: January 1st to today
        const startOfYear = new Date(today.getFullYear(), 0, 1)
        fromDate = startOfYear.toISOString().split('T')[0]
        toDate = todayStr
      } else if (range === 'max') {
        // Maximum available data (FMP has ~20+ years for AAPL)
        // Must explicitly set from parameter to get more than 5 years (API default limit)
        const twentyYearsAgo = new Date(today)
        twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20)
        fromDate = twentyYearsAgo.toISOString().split('T')[0]
        toDate = todayStr
      } else if (range.endsWith('y')) {
        // Multi-year ranges: 3y, 5y, 10y, 20y
        const years = parseInt(range.slice(0, -1))
        const startDate = new Date(today)
        startDate.setFullYear(startDate.getFullYear() - years)
        fromDate = startDate.toISOString().split('T')[0]
        toDate = todayStr
      } else {
        // Day ranges: 7d, 30d, 90d, 365d
        const days = parseInt(range.slice(0, -1))
        const startDate = new Date(today)
        startDate.setDate(startDate.getDate() - days)
        fromDate = startDate.toISOString().split('T')[0]
        toDate = todayStr
      }
    } else {
      // Custom date range mode
      const { from, to } = params
      fromDate = from
      toDate = to || new Date().toISOString().split('T')[0]
    }

    // Add date parameters to URL if specified
    if (fromDate) {
      url += `&from=${fromDate}`
    }
    if (toDate) {
      url += `&to=${toDate}`
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
      return { data: null, error: 'Unexpected API response format' }
    }

    // Map and sort data (API already filtered by date parameters)
    // Filter out any records with null/invalid OHLC values (including NaN and Infinity)
    const filteredData: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> = json.historical
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

    if (filteredData.length === 0) {
      return { data: null, error: 'No price data available for the requested range' }
    }

    return { data: filteredData, error: null }
  } catch (err) {
    console.error('Error fetching AAPL prices:', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
