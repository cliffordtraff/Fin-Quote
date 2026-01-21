'use server'

import { getCurrentMarketSession } from '@/lib/market-utils'
import { deriveGainers } from './scan-extended-hours'

export interface GainerData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  volume: number // For extended hours: pre-market/after-hours volume; for regular hours: daily volume
  floatShares?: number | null // Float shares (only available for extended hours scanner)
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
      // Take top 35 gainers (extra buffer for filtering bad data)
      const topGainers = data.slice(0, 35)

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

      // Map gainers with volume data, filtering out bad data
      const gainers: GainerData[] = topGainers
        .filter((item: any) => {
          // Filter out unrealistic percentage changes (likely bad data from API)
          // Max realistic daily gain is ~1000% (even that is extreme)
          const pctChange = Math.abs(item.changesPercentage || 0)
          return pctChange < 1000 && item.price > 0
        })
        .map((item: any) => ({
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          change: item.change,
          changesPercentage: item.changesPercentage,
          volume: volumeMap.get(item.symbol) || 0
        }))
        .slice(0, 16) // Always return exactly 16 gainers

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
      const extendedGainers = await deriveGainers('premarket')
      // Fallback to regular hours if no premarket data
      if (extendedGainers.length === 0) {
        console.log('[Gainers] No premarket data, falling back to regular hours')
        return await fetchRegularHoursGainers()
      }
      // Map to GainerData format, using extendedVolume as the volume
      const gainers: GainerData[] = extendedGainers.slice(0, 16).map(g => ({
        symbol: g.symbol,
        name: g.name,
        price: g.price,
        change: g.change,
        changesPercentage: g.changesPercentage,
        volume: g.extendedVolume, // Use pre-market volume
        floatShares: g.floatShares,
      }))
      return { gainers }
    } else if (session === 'afterhours') {
      // Use after-hours scanner (reads from shared cache)
      console.log('[Gainers] Using after-hours scanner')
      const extendedGainers = await deriveGainers('afterhours')
      // Fallback to regular hours if no afterhours data
      if (extendedGainers.length === 0) {
        console.log('[Gainers] No afterhours data, falling back to regular hours')
        return await fetchRegularHoursGainers()
      }
      // Map to GainerData format, using extendedVolume as the volume
      const gainers: GainerData[] = extendedGainers.slice(0, 16).map(g => ({
        symbol: g.symbol,
        name: g.name,
        price: g.price,
        change: g.change,
        changesPercentage: g.changesPercentage,
        volume: g.extendedVolume, // Use after-hours volume
        floatShares: g.floatShares,
      }))
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
