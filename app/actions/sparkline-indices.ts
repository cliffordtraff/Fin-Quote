'use server'

export interface OHLCData {
  date: string
  open: number
  high: number
  low: number
  close: number
}

export interface SparklineIndexData {
  symbol: string
  name: string
  currentPrice: number
  priceChange: number
  priceChangePercent: number
  priceHistory: number[] // Simple array of closing prices for sparkline (yesterday)
  priceTimestamps: string[] // Timestamps corresponding to each price point
  todayOHLC: OHLCData[] // Full OHLC data for today's candlesticks
  previousClose: number | null // Previous day's closing price for reference line
  todayStartIndex: number | null // Index in priceHistory where today's data begins
}

// Index symbols with their display names
const INDEX_SYMBOLS = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^DJI', name: 'DOW' },
  { symbol: '^IXIC', name: 'NASDAQ' },
  { symbol: '^RUT', name: 'RUSSELL' },
  { symbol: '^VIX', name: 'VIX' },
]

/**
 * Fetch index data with intraday prices for sparkline charts (previous day + today)
 */
export async function getSparklineIndicesData(): Promise<{ indices: SparklineIndexData[] } | { error: string }> {
  const apiKey = process.env.FMP_API_KEY

  if (!apiKey) {
    return { error: 'API configuration error' }
  }

  try {
    const indicesData = await Promise.all(
      INDEX_SYMBOLS.map(async ({ symbol, name }) => {
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

        // Fetch 1-minute intraday data for sparkline (covers ~2 trading days)
        const intradayUrl = `https://financialmodelingprep.com/api/v3/historical-chart/1min/${symbol}?apikey=${apiKey}`
        const intradayResponse = await fetch(intradayUrl, {
          next: { revalidate: 60 } // Cache for 1 minute
        })

        let priceHistory: number[] = []
        let priceTimestamps: string[] = []
        let todayOHLC: OHLCData[] = []
        let previousClose: number | null = null
        let todayStartIndex: number | null = null

        if (intradayResponse.ok) {
          const intradayData = await intradayResponse.json()

          if (Array.isArray(intradayData) && intradayData.length > 0) {
            // Data comes newest first, so reverse for chronological order
            // Get unique dates to find today and previous day
            const uniqueDates = [...new Set(intradayData.map((c: { date: string }) => c.date.split(' ')[0]))] as string[]
            const today = uniqueDates[0]
            const previousDay = uniqueDates.length > 1 ? uniqueDates[1] : null

            // Filter to only today and previous day
            const filteredData = intradayData.filter((candle: { date: string }) => {
              const candleDate = candle.date.split(' ')[0]
              return candleDate === today || candleDate === previousDay
            })

            // Reverse to chronological order
            const chronological = filteredData.reverse()

            // For yesterday's data: sample every 5 minutes for line chart
            const yesterdayData = chronological.filter((c: { date: string }) => c.date.split(' ')[0] === previousDay)
            const sampledYesterday = yesterdayData.filter((_: unknown, i: number) => i % 5 === 0)

            priceHistory = sampledYesterday.map((d: { close: number }) => d.close)
            priceTimestamps = sampledYesterday.map((d: { date: string }) => d.date)

            // For today's data: aggregate into 5-minute OHLC candles
            const todayData = chronological.filter((c: { date: string }) => c.date.split(' ')[0] === today)

            // Group into 5-minute candles (every 5 1-min bars)
            for (let i = 0; i < todayData.length; i += 5) {
              const group = todayData.slice(i, i + 5)
              if (group.length > 0) {
                todayOHLC.push({
                  date: group[0].date,
                  open: group[0].open,
                  high: Math.max(...group.map((c: { high: number }) => c.high)),
                  low: Math.min(...group.map((c: { low: number }) => c.low)),
                  close: group[group.length - 1].close
                })
              }
            }

            // Set todayStartIndex to the length of yesterday's data (where today starts)
            todayStartIndex = priceHistory.length

            // Get previous day's closing price (last candle of the previous day)
            // Data is newest first, so find first match of previous day = most recent candle of that day
            if (previousDay) {
              const prevDayCandle = intradayData.find((c: { date: string }) => c.date.split(' ')[0] === previousDay)
              if (prevDayCandle) {
                previousClose = prevDayCandle.close
              }
            }
          }
        }

        return {
          symbol,
          name,
          currentPrice: quote.price,
          priceChange: quote.change,
          priceChangePercent: quote.changesPercentage,
          priceHistory,
          priceTimestamps,
          todayOHLC,
          previousClose,
          todayStartIndex
        }
      })
    )

    const validIndices = indicesData.filter((c): c is SparklineIndexData => c !== null)

    return { indices: validIndices }
  } catch (error) {
    console.error('Error fetching indices data:', error)
    return { error: 'Failed to load indices data' }
  }
}
