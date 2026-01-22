'use server'

import * as fs from 'fs/promises'
import * as path from 'path'

export interface StockReturn {
  symbol: string
  returnPct: number
}

export interface SP500DistributionData {
  returns: StockReturn[]
  spxReturnPct: number
  stocksUp: number
  stocksDown: number
  stocksUnchanged: number
  avgReturn: number
  avgGain: number
  avgDecline: number
  date: string
}

interface SP500Constituent {
  symbol: string
  name: string
  alternate_symbols: Record<string, string>
}

// Cache for constituent list
let cachedConstituents: SP500Constituent[] | null = null

async function getSP500Constituents(): Promise<SP500Constituent[]> {
  if (cachedConstituents) {
    return cachedConstituents
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'sp500-constituents.json')
    const content = await fs.readFile(filePath, 'utf-8')
    cachedConstituents = JSON.parse(content)
    return cachedConstituents!
  } catch (error) {
    console.error('Error loading S&P 500 constituents:', error)
    return []
  }
}

/**
 * Fetch daily returns for all S&P 500 constituents
 * Uses FMP batch quote endpoint to get current day's return data
 */
export async function getSP500Distribution(): Promise<{ data: SP500DistributionData } | { error: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    const constituents = await getSP500Constituents()

    if (constituents.length === 0) {
      return { error: 'Could not load S&P 500 constituents' }
    }

    // Get all symbols - use FMP variant if available
    const symbols = constituents.map(c => {
      if (c.alternate_symbols?.fmp) {
        return c.alternate_symbols.fmp
      }
      return c.symbol
    })

    // FMP supports batch quotes - fetch in chunks of 100 to avoid URL length limits
    const chunkSize = 100
    const allQuotes: any[] = []

    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize)
      const symbolsParam = chunk.join(',')
      const url = `https://financialmodelingprep.com/api/v3/quote/${symbolsParam}?apikey=${apiKey}`

      const response = await fetch(url, {
        next: { revalidate: 60 } // Cache for 1 minute
      })

      if (!response.ok) {
        console.error(`FMP batch quote error for chunk ${i}: ${response.status}`)
        continue
      }

      const data = await response.json()
      if (Array.isArray(data)) {
        allQuotes.push(...data)
      }
    }

    if (allQuotes.length === 0) {
      return { error: 'Could not fetch stock quotes' }
    }

    // Also fetch SPX (S&P 500 index) return
    const spxUrl = `https://financialmodelingprep.com/api/v3/quote/%5EGSPC?apikey=${apiKey}`
    let spxReturnPct = 0
    let tradingDate = new Date().toISOString().split('T')[0]

    try {
      const spxResponse = await fetch(spxUrl, { next: { revalidate: 60 } })
      if (spxResponse.ok) {
        const spxData = await spxResponse.json()
        if (Array.isArray(spxData) && spxData.length > 0) {
          spxReturnPct = spxData[0].changesPercentage || 0
        }
      }
    } catch (e) {
      // Fall back to SPY if ^GSPC doesn't work
      try {
        const spyUrl = `https://financialmodelingprep.com/api/v3/quote/SPY?apikey=${apiKey}`
        const spyResponse = await fetch(spyUrl, { next: { revalidate: 60 } })
        if (spyResponse.ok) {
          const spyData = await spyResponse.json()
          if (Array.isArray(spyData) && spyData.length > 0) {
            spxReturnPct = spyData[0].changesPercentage || 0
          }
        }
      } catch {
        console.error('Could not fetch SPX or SPY return')
      }
    }

    // Process returns
    const returns: StockReturn[] = []
    let stocksUp = 0
    let stocksDown = 0
    let stocksUnchanged = 0
    let totalReturn = 0
    let totalGain = 0
    let gainCount = 0
    let totalDecline = 0
    let declineCount = 0

    for (const quote of allQuotes) {
      if (quote.changesPercentage !== undefined && quote.changesPercentage !== null) {
        const returnPct = quote.changesPercentage

        returns.push({
          symbol: quote.symbol,
          returnPct,
        })

        totalReturn += returnPct

        if (returnPct > 0) {
          stocksUp++
          totalGain += returnPct
          gainCount++
        } else if (returnPct < 0) {
          stocksDown++
          totalDecline += returnPct
          declineCount++
        } else {
          stocksUnchanged++
        }
      }
    }

    const avgReturn = returns.length > 0 ? totalReturn / returns.length : 0
    const avgGain = gainCount > 0 ? totalGain / gainCount : 0
    const avgDecline = declineCount > 0 ? totalDecline / declineCount : 0

    return {
      data: {
        returns,
        spxReturnPct,
        stocksUp,
        stocksDown,
        stocksUnchanged,
        avgReturn,
        avgGain,
        avgDecline,
        date: tradingDate,
      },
    }
  } catch (error) {
    console.error('Error fetching S&P 500 distribution:', error)
    return { error: 'Failed to load S&P 500 distribution data' }
  }
}
