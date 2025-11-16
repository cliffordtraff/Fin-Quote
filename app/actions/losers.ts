'use server'

import { getCurrentMarketSession } from '@/lib/market-utils'
import { deriveLosers } from './scan-extended-hours'

export interface LoserData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  volume: number
}

/**
 * Fetch losers from regular hours endpoint (FMP dedicated endpoint)
 */
async function fetchRegularHoursLosers(): Promise<{ losers?: LoserData[]; error?: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${apiKey}`
    const response = await fetch(url, {
      next: { revalidate: 60 } // Cache for 1 minute
    })

    if (!response.ok) {
      throw new Error('Failed to fetch losers data')
    }

    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      // Take top 20 losers
      const topLosers = data.slice(0, 20)

      // Fetch volume data for all losers in parallel using the quote endpoint
      const symbols = topLosers.map((item: any) => item.symbol).join(',')
      const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/${symbols}?apikey=${apiKey}`

      const quoteResponse = await fetch(quoteUrl, {
        next: { revalidate: 60 }
      })

      const quoteData = await quoteResponse.json()

      // Create a map of symbol to volume
      const volumeMap = new Map()
      if (Array.isArray(quoteData)) {
        quoteData.forEach((quote: any) => {
          volumeMap.set(quote.symbol, quote.volume)
        })
      }

      // Map losers with volume data
      const losers: LoserData[] = topLosers.map((item: any) => ({
        symbol: item.symbol,
        name: item.name,
        price: item.price,
        change: item.change,
        changesPercentage: item.changesPercentage,
        volume: volumeMap.get(item.symbol) || 0
      }))

      return { losers }
    }

    return { losers: [] }
  } catch (error) {
    console.error('Error fetching losers data:', error)
    return { error: 'Failed to load losers data' }
  }
}

/**
 * Main entry point with smart routing based on market session
 */
export async function getLosersData() {
  const session = getCurrentMarketSession()

  console.log(`[Losers] Current session: ${session}`)

  try {
    if (session === 'premarket') {
      // Use pre-market scanner (reads from shared cache)
      console.log('[Losers] Using pre-market scanner')
      const losers = await deriveLosers('premarket')
      // Fallback to regular hours if no premarket data
      if (losers.length === 0) {
        console.log('[Losers] No premarket data, falling back to regular hours')
        return await fetchRegularHoursLosers()
      }
      return { losers }
    } else if (session === 'afterhours') {
      // Use after-hours scanner (reads from shared cache)
      console.log('[Losers] Using after-hours scanner')
      const losers = await deriveLosers('afterhours')
      // Fallback to regular hours if no afterhours data
      if (losers.length === 0) {
        console.log('[Losers] No afterhours data, falling back to regular hours')
        return await fetchRegularHoursLosers()
      }
      return { losers }
    } else {
      // Regular hours or closed: use dedicated FMP endpoint
      console.log('[Losers] Using regular hours endpoint')
      return await fetchRegularHoursLosers()
    }
  } catch (error) {
    console.error('[Losers] Error, falling back to regular hours:', error)
    // Fallback to regular hours endpoint on error
    return await fetchRegularHoursLosers()
  }
}
