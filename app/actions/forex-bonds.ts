'use server'

export interface ForexBondData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

// Forex pairs and treasury bonds
const FOREX_BONDS_SYMBOLS = [
  { symbol: 'EURUSD', name: 'EUR/USD' },
  { symbol: 'USDJPY', name: 'USD/JPY' },
  { symbol: 'GBPUSD', name: 'GBP/USD' },
  { symbol: 'BTCUSD', name: 'BTC/USD' },
  { symbol: '^FVX', name: '5-Year Treasury' },
  { symbol: '^TNX', name: '10-Year Treasury' },
  { symbol: '^TYX', name: '30-Year Treasury' },
]

export async function getForexBondsData(): Promise<{ forexBonds: ForexBondData[] } | { error: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    const forexBondsData = await Promise.all(
      FOREX_BONDS_SYMBOLS.map(async ({ symbol, name }) => {
        const url = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`
        const response = await fetch(url, {
          next: { revalidate: 60 }
        })

        if (!response.ok) {
          console.error(`Failed to fetch ${name}`)
          return null
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

    const validData = forexBondsData.filter((f): f is ForexBondData => f !== null)

    return { forexBonds: validData }
  } catch (error) {
    console.error('Error fetching forex/bonds data:', error)
    return { error: 'Failed to load forex/bonds data' }
  }
}
