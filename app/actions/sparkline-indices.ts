'use server'

import { getProvider } from '@/lib/providers'
import type { ProviderCandle } from '@/lib/providers'
import type { ProviderQuote } from '@/lib/providers/types'
import { DASHBOARD_INDEX_SYMBOLS } from '@/lib/dashboard-fixed-panels'
import { safeErrorMessage } from '@/lib/safe-logging'

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
  yesterdayChangePercent: number | null // Previous day's percentage change
  priceHistory: number[] // Simple array of closing prices for sparkline (yesterday) - deprecated
  priceTimestamps: string[] // Timestamps corresponding to each price point - deprecated
  yesterdayOHLC: OHLCData[] // Full OHLC data for yesterday's candlesticks
  todayOHLC: OHLCData[] // Full OHLC data for today's candlesticks
  previousClose: number | null // Previous day's closing price for reference line
  todayStartIndex: number | null // Index in priceHistory where today's data begins
}

// Index symbols with their display names
const INDEX_NAMES = {
  '^GSPC': 'S&P 500',
  '^DJI': 'DOW',
  '^IXIC': 'NASDAQ',
  '^RUT': 'Russell 2000',
  '^VIX': 'VIX',
} as const satisfies Record<typeof DASHBOARD_INDEX_SYMBOLS[number], string>

const INDEX_SYMBOLS = DASHBOARD_INDEX_SYMBOLS.map((symbol) => ({
  symbol,
  name: INDEX_NAMES[symbol],
}))

function hasCompleteIndexQuotePanel(quotes: ProviderQuote[]): boolean {
  const expected = new Set<string>(INDEX_SYMBOLS.map(({ symbol }) => symbol))
  const seen = new Set<string>()
  return quotes.length === expected.size && quotes.every((quote) => {
    if (
      !expected.has(quote.symbol) ||
      seen.has(quote.symbol) ||
      !Number.isFinite(quote.price) ||
      quote.price <= 0 ||
      !Number.isFinite(quote.change) ||
      !Number.isFinite(quote.changesPercentage)
    ) {
      return false
    }
    seen.add(quote.symbol)
    return true
  }) && seen.size === expected.size
}

function hasValidStrictOhlc(candle: ProviderCandle): boolean {
  const { open, high, low, close } = candle

  return (
    Number.isFinite(open) &&
    Number.isFinite(high) &&
    Number.isFinite(low) &&
    Number.isFinite(close) &&
    open > 0 &&
    high > 0 &&
    low > 0 &&
    close > 0 &&
    high >= Math.max(open, close) &&
    low <= Math.min(open, close) &&
    high >= low
  )
}

/**
 * Fetch index data with intraday prices for sparkline charts (previous day + today)
 */
async function loadSparklineIndicesData(
  strict: boolean,
  signal?: AbortSignal,
): Promise<{ indices: SparklineIndexData[] } | { error: string }> {
  try {
    const provider = getProvider()

    // Batch-fetch all quotes via provider
    const allSymbols = INDEX_SYMBOLS.map(i => i.symbol)
    const quotes = await provider.getQuotes(
      allSymbols,
      strict ? { failureMode: 'throw', signal } : undefined,
    )
    if (strict && !hasCompleteIndexQuotePanel(quotes)) {
      throw new Error('Incomplete index quote panel')
    }

    const indicesData = await Promise.all(
      INDEX_SYMBOLS.map(async ({ symbol, name }) => {
        // Look up the quote from the batch result
        const quote = quotes.find(q => q.symbol === symbol)

        if (!quote) {
          return null
        }

        // Fetch 1-minute intraday data for sparkline via provider
        const intradayData = await provider.getIntraday(
          symbol,
          1,
          'minute',
          undefined,
          undefined,
          strict ? { failureMode: 'throw', signal } : undefined,
        )

        if (strict && !intradayData.every(hasValidStrictOhlc)) {
          throw new Error(`Invalid index OHLC data for ${symbol}`)
        }

        let priceHistory: number[] = []
        let priceTimestamps: string[] = []
        const yesterdayOHLC: OHLCData[] = []
        const todayOHLC: OHLCData[] = []
        let previousClose: number | null = null
        let todayStartIndex: number | null = null
        let yesterdayChangePercent: number | null = null

        if (intradayData.length > 0) {
          // Data comes newest first, so reverse for chronological order
          // Get unique dates to find today and previous day
          const uniqueDates = [...new Set(intradayData.map((c) => c.date.split(' ')[0]))] as string[]
          const today = uniqueDates[0]
          const previousDay = uniqueDates.length > 1 ? uniqueDates[1] : null

          // Filter to only today and previous day
          const filteredData = intradayData.filter((candle) => {
            const candleDate = candle.date.split(' ')[0]
            return candleDate === today || candleDate === previousDay
          })

          // Reverse to chronological order
          const chronological = filteredData.reverse()

          // For yesterday's data: aggregate into 5-minute OHLC candles (same as today)
          const yesterdayData = chronological.filter((c) => c.date.split(' ')[0] === previousDay)

          // Group into 5-minute candles (every 5 1-min bars)
          for (let i = 0; i < yesterdayData.length; i += 5) {
            const group = yesterdayData.slice(i, i + 5)
            if (group.length > 0) {
              yesterdayOHLC.push({
                date: group[0].date,
                open: group[0].open,
                high: Math.max(...group.map((c) => c.high)),
                low: Math.min(...group.map((c) => c.low)),
                close: group[group.length - 1].close
              })
            }
          }

          // Keep priceHistory for backwards compatibility
          const sampledYesterday = yesterdayData.filter((_: ProviderCandle, i: number) => i % 5 === 0)
          priceHistory = sampledYesterday.map((d) => d.close)
          priceTimestamps = sampledYesterday.map((d) => d.date)

          // For today's data: aggregate into 5-minute OHLC candles
          const todayData = chronological.filter((c) => c.date.split(' ')[0] === today)

          // Group into 5-minute candles (every 5 1-min bars)
          for (let i = 0; i < todayData.length; i += 5) {
            const group = todayData.slice(i, i + 5)
            if (group.length > 0) {
              todayOHLC.push({
                date: group[0].date,
                open: group[0].open,
                high: Math.max(...group.map((c) => c.high)),
                low: Math.min(...group.map((c) => c.low)),
                close: group[group.length - 1].close
              })
            }
          }

          // Set todayStartIndex to the length of yesterday's data (where today starts)
          todayStartIndex = priceHistory.length

          // Get previous day's closing price (last candle of the previous day)
          // Data is newest first, so find first match of previous day = most recent candle of that day
          if (previousDay) {
            const prevDayCandle = intradayData.find((c) => c.date.split(' ')[0] === previousDay)
            if (prevDayCandle) {
              previousClose = prevDayCandle.close
            }
          }

          // Calculate yesterday's percentage change (from yesterday's open to yesterday's close)
          if (yesterdayData.length > 0) {
            const yesterdayOpen = yesterdayData[0].open
            const yesterdayClose = yesterdayData[yesterdayData.length - 1].close
            if (yesterdayOpen && yesterdayOpen !== 0) {
              yesterdayChangePercent = ((yesterdayClose - yesterdayOpen) / yesterdayOpen) * 100
            }
          }
        }

        return {
          symbol,
          name,
          currentPrice: quote.price,
          priceChange: quote.change,
          priceChangePercent: quote.changesPercentage,
          yesterdayChangePercent,
          priceHistory,
          priceTimestamps,
          yesterdayOHLC,
          todayOHLC,
          previousClose,
          todayStartIndex
        }
      })
    )

    const validIndices = indicesData.filter(
      (candidate): candidate is NonNullable<typeof candidate> =>
        candidate !== null,
    )

    return { indices: validIndices }
  } catch (error) {
    console.error('Error fetching indices data:', safeErrorMessage(error))
    return { error: 'Failed to load indices data' }
  }
}

export async function getSparklineIndicesData(): Promise<
  { indices: SparklineIndexData[] } | { error: string }
> {
  return loadSparklineIndicesData(false)
}

/** Strict snapshot path: failed or partial fixed panels remain provenance. */
export async function getSparklineIndicesDataWithStatus(
  signal?: AbortSignal,
): Promise<{ indices: SparklineIndexData[] } | { error: string }> {
  return loadSparklineIndicesData(true, signal)
}
