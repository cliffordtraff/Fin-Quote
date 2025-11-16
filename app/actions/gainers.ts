'use server'

import { getCurrentMarketSession } from '@/lib/market-utils'
import { deriveGainers } from './scan-extended-hours'

export interface GainerData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  volume: number
}

/**
 * Fetch gainers from regular hours endpoint (FMP dedicated endpoint)
 */
async function fetchRegularHoursGainers(): Promise<{ gainers?: GainerData[]; error?: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${apiKey}`
    const response = await fetch(url, {
      next: { revalidate: 60 } // Cache for 1 minute
    })

    if (!response.ok) {
      throw new Error('Failed to fetch gainers data')
    }

    const data = await response.json()

    if (Array.isArray(data) && data.length > 0) {
      // Take top 20 gainers
      const topGainers = data.slice(0, 20)

      // Fetch volume data for all gainers in parallel using the quote endpoint
      const symbols = topGainers.map((item: any) => item.symbol).join(',')
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

      // Map gainers with volume data
      const gainers: GainerData[] = topGainers.map((item: any) => ({
        symbol: item.symbol,
        name: item.name,
        price: item.price,
        change: item.change,
        changesPercentage: item.changesPercentage,
        volume: volumeMap.get(item.symbol) || 0
      }))

      return { gainers }
    }

    return { gainers: [] }
  } catch (error) {
    console.error('Error fetching gainers data:', error)
    return { error: 'Failed to load gainers data' }
  }
}

/**
 * Main entry point with smart routing based on market session
 */
export async function getGainersData() {
  const session = getCurrentMarketSession()

  console.log(`[Gainers] Current session: ${session}`)

  try {
    if (session === 'premarket') {
      // Use pre-market scanner (reads from shared cache)
      console.log('[Gainers] Using pre-market scanner')
      const gainers = await deriveGainers('premarket')
      // Fallback to regular hours if no premarket data
      if (gainers.length === 0) {
        console.log('[Gainers] No premarket data, falling back to regular hours')
        return await fetchRegularHoursGainers()
      }
      return { gainers }
    } else if (session === 'afterhours') {
      // Use after-hours scanner (reads from shared cache)
      console.log('[Gainers] Using after-hours scanner')
      const gainers = await deriveGainers('afterhours')
      // Fallback to regular hours if no afterhours data
      if (gainers.length === 0) {
        console.log('[Gainers] No afterhours data, falling back to regular hours')
        return await fetchRegularHoursGainers()
      }
      return { gainers }
    } else {
      // Regular hours or closed: use dedicated FMP endpoint
      console.log('[Gainers] Using regular hours endpoint')
      return await fetchRegularHoursGainers()
    }
  } catch (error) {
    console.error('[Gainers] Error, falling back to regular hours:', error)
    // Fallback to regular hours endpoint on error
    return await fetchRegularHoursGainers()
  }
}
