'use server'

import { getProvider } from '@/lib/providers'

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
  try {
    const provider = getProvider()
    const symbols = FOREX_BONDS_SYMBOLS.map(f => f.symbol)
    const quotes = await provider.getQuotes(symbols)

    const forexBondsData: ForexBondData[] = FOREX_BONDS_SYMBOLS
      .map(({ symbol, name }) => {
        const quote = quotes.find(q => q.symbol === symbol)
        if (!quote) return null
        return {
          symbol,
          name,
          price: quote.price,
          change: quote.change,
          changesPercentage: quote.changesPercentage
        }
      })
      .filter((f): f is ForexBondData => f !== null)

    return { forexBonds: forexBondsData }
  } catch (error) {
    console.error('Error fetching forex/bonds data:', error)
    return { error: 'Failed to load forex/bonds data' }
  }
}

/**
 * Fetch forex/bonds data with YTD change percentage
 */
export async function getForexBondsWithYTD(): Promise<{ forexBonds: ForexBondDataWithYTD[] } | { error: string }> {
  // Get start of year date
  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear}-01-01`

  try {
    const provider = getProvider()
    const symbols = FOREX_BONDS_SYMBOLS.map(f => f.symbol)
    const quotes = await provider.getQuotes(symbols)

    const forexBondsData = await Promise.all(
      FOREX_BONDS_SYMBOLS.map(async ({ symbol, name }) => {
        const quote = quotes.find(q => q.symbol === symbol)
        if (!quote) return null

        // Fetch YTD historical data via provider
        let ytdChangePercent: number | undefined

        try {
          const candles = await provider.getHistoricalDaily(symbol, yearStart)

          if (candles.length >= 2) {
            // Candles come newest-first: [0] is latest, [length-1] is oldest
            const firstClose = candles[candles.length - 1].close
            const lastClose = candles[0].close
            ytdChangePercent = ((lastClose - firstClose) / firstClose) * 100
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
