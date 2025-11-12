'use server'

export interface VIXData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  dayLow: number
  dayHigh: number
  yearHigh: number
  yearLow: number
  history: Array<{ date: string; close: number }>
}

export async function getVIXData() {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    // Fetch current quote
    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/^VIX?apikey=${apiKey}`
    const quoteResponse = await fetch(quoteUrl, {
      next: { revalidate: 60 } // Cache for 1 minute
    })

    if (!quoteResponse.ok) {
      throw new Error('Failed to fetch VIX data')
    }

    const quoteData = await quoteResponse.json()

    // Fetch 30-day historical data
    const historyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/^VIX?apikey=${apiKey}`
    const historyResponse = await fetch(historyUrl, {
      next: { revalidate: 300 } // Cache for 5 minutes
    })

    let history: Array<{ date: string; close: number }> = []

    if (historyResponse.ok) {
      const historyData = await historyResponse.json()
      if (historyData.historical && Array.isArray(historyData.historical)) {
        // Get last 30 days
        history = historyData.historical.slice(0, 30).reverse().map((item: any) => ({
          date: item.date,
          close: item.close
        }))
      }
    }

    if (Array.isArray(quoteData) && quoteData.length > 0) {
      const vixData: VIXData = {
        symbol: quoteData[0].symbol,
        name: quoteData[0].name,
        price: quoteData[0].price,
        change: quoteData[0].change,
        changesPercentage: quoteData[0].changesPercentage,
        dayLow: quoteData[0].dayLow,
        dayHigh: quoteData[0].dayHigh,
        yearHigh: quoteData[0].yearHigh,
        yearLow: quoteData[0].yearLow,
        history
      }

      return { vix: vixData }
    }

    return { error: 'No VIX data available' }
  } catch (error) {
    console.error('Error fetching VIX data:', error)
    return { error: 'Failed to load VIX data' }
  }
}
