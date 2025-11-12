'use server'

interface FutureData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

export async function getFuturesData() {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  // Futures symbols with their display names
  const futuresSymbols = [
    { symbol: 'CL=F', name: 'Crude Oil' },
    { symbol: 'NG=F', name: 'Natural Gas' },
    { symbol: 'GC=F', name: 'Gold' },
    { symbol: 'YM=F', name: 'Dow' },
    { symbol: 'ES=F', name: 'S&P 500' },
    { symbol: 'NQ=F', name: 'Nasdaq 100' },
    { symbol: 'RTY=F', name: 'Russell 2000' }
  ]

  try {
    // Fetch all futures data in parallel
    const futuresData = await Promise.all(
      futuresSymbols.map(async ({ symbol, name }) => {
        const url = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`
        const response = await fetch(url, {
          next: { revalidate: 60 } // Cache for 1 minute
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch ${name}`)
        }

        const data = await response.json()

        if (Array.isArray(data) && data.length > 0) {
          const quote = data[0]
          return {
            symbol,
            name,
            price: quote.price,
            change: quote.change,
            changesPercentage: quote.changesPercentage
          }
        }

        return null
      })
    )

    // Filter out any null results
    const validFutures = futuresData.filter((f): f is FutureData => f !== null)

    return { futures: validFutures }
  } catch (error) {
    console.error('Error fetching futures data:', error)
    return { error: 'Failed to load futures data' }
  }
}
