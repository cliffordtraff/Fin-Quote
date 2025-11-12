'use server'

export type PriceParams = {
  from: string
  to?: string
}

export async function getAaplPrices(params: PriceParams): Promise<{
  data: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }> | null
  error: string | null
}> {
  const { from, to } = params

  // Validate date format (basic check)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(from)) {
    return { data: null, error: 'Invalid from date. Must be in YYYY-MM-DD format.' }
  }
  if (to && !dateRegex.test(to)) {
    return { data: null, error: 'Invalid to date. Must be in YYYY-MM-DD format.' }
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

    // Check if we're asking for today's data
    const today = new Date().toISOString().split('T')[0]
    const isAskingForToday = fromDate === today || toDate === today

    let url = `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=${apiKey}&from=${fromDate}&to=${toDate}`

    // If asking for today and it's before market close or data not available, fall back to a wider range
    if (isAskingForToday) {
      // Get last 5 trading days to ensure we have data
      const fiveDaysAgo = new Date()
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)
      const fallbackFrom = fiveDaysAgo.toISOString().split('T')[0]
      url = `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=${apiKey}&from=${fallbackFrom}`
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

    // If we asked for today specifically but got a wider range, return just the most recent trading day
    if (isAskingForToday && filteredData.length > 0) {
      console.log(`Asked for today (${today}), returning most recent available: ${filteredData[0].date}`)
      filteredData = [filteredData[0]]
    }

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
