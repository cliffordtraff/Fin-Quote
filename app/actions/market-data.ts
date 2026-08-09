'use server'

import { createServerClient } from '@/lib/supabase/server'
import { getProvider } from '@/lib/providers'
import type {
  CandleRequestOptions,
  QuoteRequestOptions,
} from '@/lib/providers/types'
import { safeErrorMessage } from '@/lib/safe-logging'

const MARKET_DATA_DEBUG = process.env.MARKET_DATA_DEBUG === 'true'

function debugMarketData(...values: unknown[]) {
  if (MARKET_DATA_DEBUG) {
    console.info(...values)
  }
}

/**
 * Aggregate 1-minute candles into 10-minute candles by TIME SLOT
 * Groups candles into fixed 10-minute windows: 9:30-9:39, 9:40-9:49, etc.
 * This ensures completed periods never change as new data arrives.
 */
function aggregateTo10MinCandles(oneMinCandles: Array<{ date: string; open: number; high: number; low: number; close: number }>) {
  if (oneMinCandles.length === 0) return []

  // Group candles by their 10-minute time slot
  const slots: Map<number, Array<{ date: string; open: number; high: number; low: number; close: number }>> = new Map()

  for (const candle of oneMinCandles) {
    const date = new Date(candle.date)
    const minutes = date.getHours() * 60 + date.getMinutes()

    // Calculate which 10-minute slot this belongs to
    // 9:30 = slot 0, 9:40 = slot 1, 9:50 = slot 2, etc.
    const marketOpenMinutes = 9 * 60 + 30  // 9:30 AM
    const minutesSinceOpen = minutes - marketOpenMinutes
    const slotIndex = Math.floor(minutesSinceOpen / 10)

    if (!slots.has(slotIndex)) {
      slots.set(slotIndex, [])
    }
    slots.get(slotIndex)!.push(candle)
  }

  // Convert each slot to a 10-minute candle
  const tenMinCandles: Array<{ date: string; open: number; high: number; low: number; close: number }> = []

  // Sort slot indices to process in order
  const sortedSlots = Array.from(slots.keys()).sort((a, b) => a - b)

  for (const slotIndex of sortedSlots) {
    const slotCandles = slots.get(slotIndex)!

    // Sort candles within slot by time (oldest first)
    slotCandles.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const oldestCandle = slotCandles[0]
    const newestCandle = slotCandles[slotCandles.length - 1]

    // Calculate the slot's start time for display (e.g., 9:30, 9:40, etc.)
    const marketOpenMinutes = 9 * 60 + 30
    const slotStartMinutes = marketOpenMinutes + (slotIndex * 10)
    const slotHour = Math.floor(slotStartMinutes / 60)
    const slotMinute = slotStartMinutes % 60

    // Extract the date portion from the original candle (e.g., "2025-12-09")
    const datePart = oldestCandle.date.split(' ')[0]
    // Format time with leading zeros
    const hourStr = slotHour.toString().padStart(2, '0')
    const minuteStr = slotMinute.toString().padStart(2, '0')
    const slotDate = `${datePart} ${hourStr}:${minuteStr}:00`

    const tenMinCandle = {
      date: slotDate,
      open: oldestCandle.open,
      high: Math.max(...slotCandles.map(c => c.high)),
      low: Math.min(...slotCandles.map(c => c.low)),
      close: newestCandle.close
    }

    tenMinCandles.push(tenMinCandle)
  }

  return tenMinCandles
}

/**
 * Aggregate 1-minute candles into 10-minute candles for a specific date
 * with an optional slot offset (used for combining previous day + today)
 */
function aggregateTo10MinCandlesWithOffset(
  oneMinCandles: Array<{ date: string; open: number; high: number; low: number; close: number }>,
  slotOffset: number = 0
) {
  if (oneMinCandles.length === 0) return []

  // Group candles by their 10-minute time slot
  const slots: Map<number, Array<{ date: string; open: number; high: number; low: number; close: number }>> = new Map()

  for (const candle of oneMinCandles) {
    const date = new Date(candle.date)
    const minutes = date.getHours() * 60 + date.getMinutes()

    // Calculate which 10-minute slot this belongs to
    const marketOpenMinutes = 9 * 60 + 30  // 9:30 AM
    const minutesSinceOpen = minutes - marketOpenMinutes
    const slotIndex = Math.floor(minutesSinceOpen / 10) + slotOffset

    if (!slots.has(slotIndex)) {
      slots.set(slotIndex, [])
    }
    slots.get(slotIndex)!.push(candle)
  }

  // Convert each slot to a 10-minute candle
  const tenMinCandles: Array<{ date: string; open: number; high: number; low: number; close: number }> = []

  // Sort slot indices to process in order
  const sortedSlots = Array.from(slots.keys()).sort((a, b) => a - b)

  for (const slotIndex of sortedSlots) {
    const slotCandles = slots.get(slotIndex)!

    // Sort candles within slot by time (oldest first)
    slotCandles.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const oldestCandle = slotCandles[0]
    const newestCandle = slotCandles[slotCandles.length - 1]

    // Calculate the slot's start time for display
    const marketOpenMinutes = 9 * 60 + 30
    const actualSlot = slotIndex - slotOffset  // Remove offset to get actual time
    const slotStartMinutes = marketOpenMinutes + (actualSlot * 10)
    const slotHour = Math.floor(slotStartMinutes / 60)
    const slotMinute = slotStartMinutes % 60

    // Extract the date portion from the original candle
    const datePart = oldestCandle.date.split(' ')[0]
    const hourStr = slotHour.toString().padStart(2, '0')
    const minuteStr = slotMinute.toString().padStart(2, '0')
    const slotDate = `${datePart} ${hourStr}:${minuteStr}:00`

    const tenMinCandle = {
      date: slotDate,
      open: oldestCandle.open,
      high: Math.max(...slotCandles.map(c => c.high)),
      low: Math.min(...slotCandles.map(c => c.low)),
      close: newestCandle.close
    }

    tenMinCandles.push(tenMinCandle)
  }

  return tenMinCandles
}

/**
 * Fetch latest SPX index price and intraday data for homepage
 * Includes previous day's last 2 hours (2pm-4pm) to show the opening gap
 */
export async function getAaplMarketData() {
  try {
    const provider = getProvider()

    // Fetch latest price quote for S&P 500 index
    const quote = await provider.getQuote('^GSPC')
    if (!quote) {
      return { error: 'Failed to fetch price data' }
    }

    // Fetch 1-minute intraday data and aggregate into 10-minute candles
    const intradayCandles = await provider.getIntraday('^GSPC', 1, 'minute')

    let priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }> = []

    if (intradayCandles.length > 0) {
      debugMarketData('Provider intraday response (1-min):', {
        totalCandles: intradayCandles.length,
        firstCandle: intradayCandles[0],
        lastCandle: intradayCandles[intradayCandles.length - 1]
      })

      // Data arrives newest first. Get most recent trading day.
      const mostRecentDate = intradayCandles[0].date.split(' ')[0]

      // Find unique dates in the data (sorted newest to oldest)
      const uniqueDates = [...new Set(intradayCandles.map(c => c.date.split(' ')[0]))] as string[]
      const previousDate = uniqueDates.length > 1 ? uniqueDates[1] : null

      debugMarketData(`SPX: Most recent date: ${mostRecentDate}, Previous date: ${previousDate}`)

      // Get previous day's last 2 hours (2pm-4pm = slots 27-38, which is 14:00-15:50)
      let prevDayCandles: Array<{ date: string; open: number; high: number; low: number; close: number }> = []
      if (previousDate) {
        const prevDayAllCandles = intradayCandles.filter(c =>
          c.date.startsWith(previousDate)
        )

        // Filter to only 2pm-4pm (14:00-16:00)
        prevDayCandles = prevDayAllCandles.filter(c => {
          const time = c.date.split(' ')[1]
          const hour = parseInt(time.split(':')[0])
          return hour >= 14 && hour < 16
        })

        debugMarketData(`SPX: Previous day ${previousDate} has ${prevDayCandles.length} 1-min candles from 2pm-4pm`)
      }

      // Get today's candles
      const todayCandles = intradayCandles.filter(c =>
        c.date.startsWith(mostRecentDate)
      )

      debugMarketData(`Filtered to ${todayCandles.length} 1-min candles from ${mostRecentDate}`)

      // Aggregate previous day's last 2 hours (use negative slot offset to position before today)
      const prevDayTenMin = prevDayCandles.length > 0
        ? aggregateTo10MinCandlesWithOffset(prevDayCandles, -39)
        : []

      // Aggregate today's candles (no offset)
      const todayTenMin = aggregateTo10MinCandles(todayCandles)

      debugMarketData(`SPX: Aggregated ${prevDayTenMin.length} prev day 10-min candles + ${todayTenMin.length} today 10-min candles`)

      // Combine: previous day's last 2 hours + today
      priceHistory = [...prevDayTenMin, ...todayTenMin]
    } else {
      debugMarketData('Intraday: No data available (possibly weekend/market closed)')
    }

    // Fallback to daily data if no intraday data available (markets closed, weekend, etc)
    if (priceHistory.length === 0) {
      debugMarketData('No intraday data, fetching daily historical data instead')
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      const dailyCandles = await provider.getHistoricalDaily('AAPL', ninetyDaysAgo.toISOString().split('T')[0])

      // Get last 30 trading days (provider returns newest first)
      priceHistory = dailyCandles.slice(0, 30).reverse().map(c => ({
        date: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      debugMarketData('Daily data fetched:', {
        count: priceHistory.length,
        first: priceHistory[0],
        last: priceHistory[priceHistory.length - 1]
      })
    }

    // Get the date - prefer price history date (actual candle date), then quote timestamp
    const historyDate = priceHistory.length > 0
      ? priceHistory[priceHistory.length - 1].date.split(' ')[0]
      : null
    const quoteDate = quote.timestamp
      ? new Date(quote.timestamp).toISOString().split('T')[0]  // provider timestamp is already ms
      : null
    const actualDate = historyDate || quoteDate || new Date().toISOString().split('T')[0]

    return {
      currentPrice: quote.price,
      priceChange: quote.change,
      priceChangePercent: quote.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory,
    }
  } catch (error) {
    console.error('Error in getAaplMarketData:', safeErrorMessage(error))
    return { error: 'Failed to fetch market data' }
  }
}

/**
 * Fetch latest Nasdaq index price and intraday data for homepage
 */
export async function getNasdaqMarketData() {
  try {
    const provider = getProvider()

    // Fetch latest price quote for Nasdaq Composite index
    const quote = await provider.getQuote('^IXIC')
    if (!quote) {
      return { error: 'Failed to fetch price data' }
    }

    // Fetch 1-minute intraday data and aggregate into 10-minute candles
    const intradayCandles = await provider.getIntraday('^IXIC', 1, 'minute')

    let priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }> = []

    if (intradayCandles.length > 0) {
      debugMarketData('Provider intraday response (1-min) Nasdaq:', {
        totalCandles: intradayCandles.length,
        firstCandle: intradayCandles[0],
        lastCandle: intradayCandles[intradayCandles.length - 1]
      })

      // Data arrives newest first. Get most recent trading day.
      const mostRecentDate = intradayCandles[0].date.split(' ')[0]

      // Filter to only candles from that date (one trading day)
      const todayCandles = intradayCandles.filter(c =>
        c.date.startsWith(mostRecentDate)
      )

      debugMarketData(`Filtered to ${todayCandles.length} 1-min candles from ${mostRecentDate} (Nasdaq)`)

      // Aggregate 1-minute candles into 10-minute candles
      const tenMinCandles = aggregateTo10MinCandles(todayCandles)

      debugMarketData(`Aggregated into ${tenMinCandles.length} 10-min candles (Nasdaq)`)

      // Log first candle details to debug color issue
      if (tenMinCandles.length > 0) {
        const firstCandle = tenMinCandles[tenMinCandles.length - 1]
        debugMarketData('NASDAQ First 10-min candle (9:30-9:39):', {
          open: firstCandle.open,
          close: firstCandle.close,
          high: firstCandle.high,
          low: firstCandle.low,
          shouldBeGreen: firstCandle.close >= firstCandle.open,
          color: firstCandle.close >= firstCandle.open ? 'GREEN' : 'RED'
        })
      }

      priceHistory = tenMinCandles
    } else {
      debugMarketData('Intraday: No data available (possibly weekend/market closed)')
    }

    // Fallback to daily data if no intraday data available (markets closed, weekend, etc)
    if (priceHistory.length === 0) {
      debugMarketData('No intraday data, fetching daily historical data instead (Nasdaq)')
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      const dailyCandles = await provider.getHistoricalDaily('^IXIC', ninetyDaysAgo.toISOString().split('T')[0])

      priceHistory = dailyCandles.slice(0, 30).reverse().map(c => ({
        date: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      debugMarketData('Daily data fetched (Nasdaq):', {
        count: priceHistory.length,
        first: priceHistory[0],
        last: priceHistory[priceHistory.length - 1]
      })
    }

    // Get the date
    const historyDate = priceHistory.length > 0
      ? priceHistory[priceHistory.length - 1].date.split(' ')[0]
      : null
    const quoteDate = quote.timestamp
      ? new Date(quote.timestamp).toISOString().split('T')[0]
      : null
    const actualDate = historyDate || quoteDate || new Date().toISOString().split('T')[0]

    return {
      currentPrice: quote.price,
      priceChange: quote.change,
      priceChangePercent: quote.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory,
    }
  } catch (error) {
    console.error('Error in getNasdaqMarketData:', safeErrorMessage(error))
    return { error: 'Failed to fetch market data' }
  }
}

/**
 * Fetch latest Dow Jones index price and intraday data for homepage
 */
export async function getDowMarketData() {
  try {
    const provider = getProvider()

    // Fetch latest price quote for Dow Jones index
    const quote = await provider.getQuote('^DJI')
    if (!quote) {
      return { error: 'Failed to fetch price data' }
    }

    // Fetch 1-minute intraday data and aggregate into 10-minute candles
    const intradayCandles = await provider.getIntraday('^DJI', 1, 'minute')

    let priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }> = []

    if (intradayCandles.length > 0) {
      debugMarketData('Provider intraday response (1-min) Dow:', {
        totalCandles: intradayCandles.length,
        firstCandle: intradayCandles[0],
        lastCandle: intradayCandles[intradayCandles.length - 1]
      })

      // Data arrives newest first. Get most recent trading day.
      const mostRecentDate = intradayCandles[0].date.split(' ')[0]

      // Filter to only candles from that date (one trading day)
      const todayCandles = intradayCandles.filter(c =>
        c.date.startsWith(mostRecentDate)
      )

      debugMarketData(`Filtered to ${todayCandles.length} 1-min candles from ${mostRecentDate} (Dow)`)

      // Aggregate 1-minute candles into 10-minute candles
      const tenMinCandles = aggregateTo10MinCandles(todayCandles)

      debugMarketData(`Aggregated into ${tenMinCandles.length} 10-min candles (Dow)`)

      priceHistory = tenMinCandles
    } else {
      debugMarketData('Intraday: No data available (possibly weekend/market closed)')
    }

    // Fallback to daily data if no intraday data available (markets closed, weekend, etc)
    if (priceHistory.length === 0) {
      debugMarketData('No intraday data, fetching daily historical data instead (Dow)')
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      const dailyCandles = await provider.getHistoricalDaily('^DJI', ninetyDaysAgo.toISOString().split('T')[0])

      priceHistory = dailyCandles.slice(0, 30).reverse().map(c => ({
        date: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      debugMarketData('Daily data fetched (Dow):', {
        count: priceHistory.length,
        first: priceHistory[0],
        last: priceHistory[priceHistory.length - 1]
      })
    }

    // Get the date
    const historyDate = priceHistory.length > 0
      ? priceHistory[priceHistory.length - 1].date.split(' ')[0]
      : null
    const quoteDate = quote.timestamp
      ? new Date(quote.timestamp).toISOString().split('T')[0]
      : null
    const actualDate = historyDate || quoteDate || new Date().toISOString().split('T')[0]

    return {
      currentPrice: quote.price,
      priceChange: quote.change,
      priceChangePercent: quote.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory,
    }
  } catch (error) {
    console.error('Error in getDowMarketData:', safeErrorMessage(error))
    return { error: 'Failed to fetch market data' }
  }
}

/**
 * Fetch latest Russell 2000 index price and intraday data for homepage
 */
export async function getRussellMarketData() {
  try {
    const provider = getProvider()

    // Fetch latest price quote for Russell 2000 index
    const quote = await provider.getQuote('^RUT')
    if (!quote) {
      return { error: 'Failed to fetch price data' }
    }

    // Fetch 1-minute intraday data and aggregate into 10-minute candles
    const intradayCandles = await provider.getIntraday('^RUT', 1, 'minute')

    let priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }> = []

    if (intradayCandles.length > 0) {
      debugMarketData('Provider intraday response (1-min) Russell:', {
        totalCandles: intradayCandles.length,
        firstCandle: intradayCandles[0],
        lastCandle: intradayCandles[intradayCandles.length - 1]
      })

      // Data arrives newest first. Get most recent trading day.
      const mostRecentDate = intradayCandles[0].date.split(' ')[0]

      // Filter to only candles from that date (one trading day)
      const todayCandles = intradayCandles.filter(c =>
        c.date.startsWith(mostRecentDate)
      )

      debugMarketData(`Filtered to ${todayCandles.length} 1-min candles from ${mostRecentDate} (Russell)`)

      // Aggregate 1-minute candles into 10-minute candles
      const tenMinCandles = aggregateTo10MinCandles(todayCandles)

      debugMarketData(`Aggregated into ${tenMinCandles.length} 10-min candles (Russell)`)

      priceHistory = tenMinCandles
    } else {
      debugMarketData('Intraday: No data available (possibly weekend/market closed)')
    }

    // Fallback to daily data if no intraday data available (markets closed, weekend, etc)
    if (priceHistory.length === 0) {
      debugMarketData('No intraday data, fetching daily historical data instead (Russell)')
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      const dailyCandles = await provider.getHistoricalDaily('^RUT', ninetyDaysAgo.toISOString().split('T')[0])

      priceHistory = dailyCandles.slice(0, 30).reverse().map(c => ({
        date: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      debugMarketData('Daily data fetched (Russell):', {
        count: priceHistory.length,
        first: priceHistory[0],
        last: priceHistory[priceHistory.length - 1]
      })
    }

    // Get the date
    const historyDate = priceHistory.length > 0
      ? priceHistory[priceHistory.length - 1].date.split(' ')[0]
      : null
    const quoteDate = quote.timestamp
      ? new Date(quote.timestamp).toISOString().split('T')[0]
      : null
    const actualDate = historyDate || quoteDate || new Date().toISOString().split('T')[0]

    return {
      currentPrice: quote.price,
      priceChange: quote.change,
      priceChangePercent: quote.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory,
    }
  } catch (error) {
    console.error('Error in getRussellMarketData:', safeErrorMessage(error))
    return { error: 'Failed to fetch market data' }
  }
}

/**
 * Fetch latest ES futures price and intraday data for homepage
 * ES futures trade nearly 24 hours (Sunday 6pm - Friday 5pm ET)
 */
async function loadESFuturesMarketData(
  quoteOptions: QuoteRequestOptions = {},
  candleOptions: CandleRequestOptions = {},
) {
  try {
    const provider = getProvider()

    // Fetch latest price quote for ES futures
    const quote = quoteOptions.freshness || quoteOptions.failureMode || quoteOptions.signal
      ? await provider.getQuote('ES=F', quoteOptions)
      : await provider.getQuote('ES=F')
    if (!quote) {
      return { error: 'Failed to fetch price data' }
    }

    // Fetch 1-minute intraday data and aggregate into 10-minute candles
    const intradayCandles = candleOptions.failureMode || candleOptions.signal
      ? await provider.getIntraday(
        'ES=F',
        1,
        'minute',
        undefined,
        undefined,
        candleOptions,
      )
      : await provider.getIntraday('ES=F', 1, 'minute')

    let priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }> = []

    if (intradayCandles.length > 0) {
      debugMarketData('Provider intraday response (1-min) ES Futures:', {
        totalCandles: intradayCandles.length,
        firstCandle: intradayCandles[0],
        lastCandle: intradayCandles[intradayCandles.length - 1]
      })

      // Get most recent trading day
      const mostRecentDate = intradayCandles[0].date.split(' ')[0]

      // Filter to only candles from that date
      const todayCandles = intradayCandles.filter(c =>
        c.date.startsWith(mostRecentDate)
      )

      debugMarketData(`Filtered to ${todayCandles.length} 1-min candles from ${mostRecentDate} (ES Futures)`)

      // Aggregate 1-minute candles into 10-minute candles
      const tenMinCandles = aggregateTo10MinCandles(todayCandles)

      debugMarketData(`Aggregated into ${tenMinCandles.length} 10-min candles (ES Futures)`)

      priceHistory = tenMinCandles
    } else {
      debugMarketData('Intraday: No intraday data available (ES Futures), trying daily data')
    }

    // Fallback to daily data if no intraday data available
    if (priceHistory.length === 0) {
      debugMarketData('Fetching daily historical data for ES Futures')
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      const fromDate = ninetyDaysAgo.toISOString().split('T')[0]
      const dailyCandles = candleOptions.failureMode || candleOptions.signal
        ? await provider.getHistoricalDaily(
          'ES=F',
          fromDate,
          undefined,
          candleOptions,
        )
        : await provider.getHistoricalDaily('ES=F', fromDate)

      priceHistory = dailyCandles.slice(0, 30).reverse().map(c => ({
        date: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      debugMarketData('Daily data fetched (ES Futures):', {
        count: priceHistory.length,
        first: priceHistory[0],
        last: priceHistory[priceHistory.length - 1]
      })
    }

    // Get the date
    const historyDate = priceHistory.length > 0
      ? priceHistory[priceHistory.length - 1].date.split(' ')[0]
      : null
    const quoteDate = quote.timestamp
      ? new Date(quote.timestamp).toISOString().split('T')[0]
      : null
    const actualDate = historyDate || quoteDate || new Date().toISOString().split('T')[0]

    return {
      currentPrice: quote.price,
      priceChange: quote.change,
      priceChangePercent: quote.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory,
    }
  } catch (error) {
    console.error('Error in getESFuturesMarketData:', safeErrorMessage(error))
    return { error: 'Failed to fetch market data' }
  }
}

export async function getESFuturesMarketData() {
  return loadESFuturesMarketData()
}

export async function getESFuturesMarketDataWithStatus() {
  return loadESFuturesMarketData(
    { freshness: 'live' },
    { failureMode: 'throw' },
  )
}

/**
 * Fetch recent financial data for chart (last 5 years)
 */
export async function getAaplFinancialHistory() {
  try {
    const supabase = await createServerClient()

    const { data, error } = await supabase
      .from('financials_std')
      .select('year, revenue, net_income, gross_profit')
      .eq('symbol', 'AAPL')
      .order('year', { ascending: false })
      .limit(5)

    if (error) {
      console.error('Error fetching financial history:', safeErrorMessage(error))
      return { error: 'Failed to fetch financial history' }
    }

    return { data: data?.reverse() || [] }
  } catch (error) {
    console.error('Error in getAaplFinancialHistory:', safeErrorMessage(error))
    return { error: 'Failed to fetch financial history' }
  }
}
