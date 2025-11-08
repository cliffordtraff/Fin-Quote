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

    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=${apiKey}&from=${fromDate}&to=${toDate}`

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
