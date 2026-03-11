'use server'

import { getProvider } from '@/lib/providers'

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
  try {
    const provider = getProvider()

    // Fetch current quote via provider
    const quote = await provider.getQuote('^VIX')

    if (!quote) {
      return { error: 'No VIX data available' }
    }

    // Fetch 30-day historical data via provider
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    const fromDate = sixtyDaysAgo.toISOString().split('T')[0]

    const candles = await provider.getHistoricalDaily('^VIX', fromDate)

    // Candles come newest-first; take 30 most recent, reverse for chronological order
    const history = candles.slice(0, 30).reverse().map(c => ({
      date: c.date,
      close: c.close
    }))

    const vixData: VIXData = {
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changesPercentage: quote.changesPercentage,
      dayLow: quote.dayLow ?? 0,
      dayHigh: quote.dayHigh ?? 0,
      yearHigh: quote.yearHigh ?? 0,
      yearLow: quote.yearLow ?? 0,
      history
    }

    return { vix: vixData }
  } catch (error) {
    console.error('Error fetching VIX data:', error)
    return { error: 'Failed to load VIX data' }
  }
}
