'use server'

export interface ForexBondData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

export interface ForexBondDataWithYTD extends ForexBondData {
  ytdChangePercent?: number
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

/**
 * Fetch forex/bonds data with YTD change percentage
 */
export async function getForexBondsWithYTD(): Promise<{ forexBonds: ForexBondDataWithYTD[] } | { error: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  // Get start of year date
  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear}-01-01`

  try {
    const forexBondsData = await Promise.all(
      FOREX_BONDS_SYMBOLS.map(async ({ symbol, name }) => {
        // Fetch quote data
        const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`
        const quoteResponse = await fetch(quoteUrl, {
          next: { revalidate: 60 }
        })

        if (!quoteResponse.ok) {
          console.error(`Failed to fetch quote for ${symbol}`)
          return null
        }

        const quoteData = await quoteResponse.json()
        const quote = quoteData[0]

        if (!quote) {
          return null
        }

        // Fetch YTD historical data
        // For forex, use different endpoint
        let historyUrl: string
        if (symbol.startsWith('^')) {
          // Treasury yields use index historical endpoint
          historyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?from=${yearStart}&apikey=${apiKey}`
        } else {
          // Forex pairs use forex historical endpoint
          historyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?from=${yearStart}&apikey=${apiKey}`
        }

        let ytdChangePercent: number | undefined

        try {
          const historyResponse = await fetch(historyUrl, {
            next: { revalidate: 3600 } // Cache for 1 hour
          })

          if (historyResponse.ok) {
            const historyData = await historyResponse.json()
            const historical = historyData?.historical || []

            if (historical.length >= 2) {
              // Historical data comes in reverse chronological order
              const firstClose = historical[historical.length - 1].close
              const lastClose = historical[0].close
              ytdChangePercent = ((lastClose - firstClose) / firstClose) * 100
            }
          }
        } catch (histError) {
          console.error(`Failed to fetch YTD history for ${symbol}:`, histError)
        }

        return {
          symbol,
          name,
          price: quote.price,
          change: quote.change,
          changesPercentage: quote.changesPercentage,
          ytdChangePercent
        } as ForexBondDataWithYTD
      })
    )

    const validData = forexBondsData.filter((f): f is ForexBondDataWithYTD => f !== null)

    return { forexBonds: validData }
  } catch (error) {
    console.error('Error fetching forex/bonds data with YTD:', error)
    return { error: 'Failed to load forex/bonds data' }
  }
}
