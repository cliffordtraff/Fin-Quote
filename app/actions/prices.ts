'use server'

export type PriceRange = '7d' | '30d' | '90d'

export async function getAaplPrices(params: {
  range: PriceRange
}): Promise<{
  data: Array<{ date: string; close: number }> | null
  error: string | null
}> {
  const { range } = params

  // Validate range
  const allowedRanges: PriceRange[] = ['7d', '30d', '90d']
  if (!allowedRanges.includes(range)) {
    return { data: null, error: 'Invalid range. Must be 7d, 30d, or 90d.' }
  }

  // Convert range to number of days
  const daysMap: Record<PriceRange, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
  }
  const days = daysMap[range]

  try {
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) {
      console.error('FMP_API_KEY not found in environment')
      return { data: null, error: 'API configuration error' }
    }

    // Call Financial Modeling Prep API
    const url = `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=${apiKey}`

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

    // Filter to the requested number of days and sort by date descending
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const filteredData = json.historical
      .filter((item: any) => {
        const itemDate = new Date(item.date)
        return itemDate >= cutoffDate
      })
      .slice(0, days) // Ensure we don't exceed requested days
      .map((item: any) => ({
        date: item.date,
        close: item.close,
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
