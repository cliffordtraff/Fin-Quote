'use server'

import { createServerClient } from '@/lib/supabase/server'

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
    // Get latest index price from FMP API
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) {
      return { error: 'API configuration error' }
    }

    // Fetch latest price quote for S&P 500 index
    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/^GSPC?apikey=${apiKey}`
    const quoteResponse = await fetch(quoteUrl, {
      next: { revalidate: 10 }, // Cache for 10 seconds (real-time data)
    })

    if (!quoteResponse.ok) {
      console.error('FMP API error:', quoteResponse.status)
      return { error: 'Failed to fetch price data' }
    }

    const quoteJson = await quoteResponse.json()
    const priceData = quoteJson[0] // FMP returns array with one item

    // Fetch 1-minute intraday data and aggregate into 10-minute candles
    // FMP Premium tier includes 1-minute data for last 3 trading days
    const intradayUrl = `https://financialmodelingprep.com/api/v3/historical-chart/1min/^GSPC?apikey=${apiKey}`
    const intradayResponse = await fetch(intradayUrl, {
      next: { revalidate: 10 }, // Cache for 10 seconds (real-time data)
    })

    let priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }> = []
    if (intradayResponse.ok) {
      const intradayJson = await intradayResponse.json()

      // Check if we got an error response
      if (intradayJson && 'Error Message' in intradayJson) {
        console.log('FMP API Error:', intradayJson['Error Message'])
      } else if (intradayJson && Array.isArray(intradayJson) && intradayJson.length > 0) {
        console.log('FMP Intraday Response (1-min):', {
          totalCandles: intradayJson.length,
          firstCandle: intradayJson[0],
          lastCandle: intradayJson[intradayJson.length - 1]
        })

        // FMP returns newest first. Get most recent trading day.
        const mostRecentDate = intradayJson[0].date.split(' ')[0]

        // Find unique dates in the data (sorted newest to oldest)
        const uniqueDates = [...new Set(intradayJson.map((c: { date: string }) => c.date.split(' ')[0]))] as string[]
        const previousDate = uniqueDates.length > 1 ? uniqueDates[1] : null

        console.log(`SPX: Most recent date: ${mostRecentDate}, Previous date: ${previousDate}`)

        // Get previous day's last 2 hours (2pm-4pm = slots 27-38, which is 14:00-15:50)
        // 2pm = 14:00 = (14*60 - 9*60 - 30) / 10 = 270/10 = 27
        // 4pm = 16:00 = (16*60 - 9*60 - 30) / 10 = 390/10 = 39 (but last slot is 38 since 15:50-15:59)
        let prevDayCandles: Array<{ date: string; open: number; high: number; low: number; close: number }> = []
        if (previousDate) {
          const prevDayAllCandles = intradayJson.filter((candle: { date: string }) =>
            candle.date.startsWith(previousDate)
          )

          // Filter to only 2pm-4pm (14:00-16:00)
          prevDayCandles = prevDayAllCandles.filter((candle: { date: string }) => {
            const time = candle.date.split(' ')[1]
            const hour = parseInt(time.split(':')[0])
            return hour >= 14 && hour < 16
          })

          console.log(`SPX: Previous day ${previousDate} has ${prevDayCandles.length} 1-min candles from 2pm-4pm`)
        }

        // Get today's candles
        const todayCandles = intradayJson.filter((candle: { date: string }) =>
          candle.date.startsWith(mostRecentDate)
        )

        console.log(`Filtered to ${todayCandles.length} 1-min candles from ${mostRecentDate}`)

        // Aggregate previous day's last 2 hours (use negative slot offset to position before today)
        // Previous day slots 27-38 should appear before today's slot 0
        // So offset them by a negative amount: if prev day slot is 27, we want it at position -12
        // prevDaySlot 27 + offset = -12, so offset = -39
        const prevDayTenMin = prevDayCandles.length > 0
          ? aggregateTo10MinCandlesWithOffset(prevDayCandles, -39)
          : []

        // Aggregate today's candles (no offset)
        const todayTenMin = aggregateTo10MinCandles(todayCandles)

        console.log(`SPX: Aggregated ${prevDayTenMin.length} prev day 10-min candles + ${todayTenMin.length} today 10-min candles`)

        // Combine: previous day's last 2 hours + today
        priceHistory = [...prevDayTenMin, ...todayTenMin]
      } else {
        console.log('FMP Intraday: No data available (possibly weekend/market closed)')
      }
    } else {
      console.error('Intraday API error:', intradayResponse.status, intradayResponse.statusText)
    }

    // Fallback to daily data if no intraday data available (markets closed, weekend, etc)
    if (priceHistory.length === 0) {
      console.log('No intraday data, fetching daily historical data instead')
      const dailyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/AAPL?apikey=${apiKey}`
      const dailyResponse = await fetch(dailyUrl, {
        next: { revalidate: 3600 }, // Cache for 1 hour
      })

      if (dailyResponse.ok) {
        const dailyJson = await dailyResponse.json()
        // Get last 30 trading days
        priceHistory = dailyJson?.historical?.slice(0, 30).reverse() || []
        console.log('Daily data fetched:', {
          count: priceHistory.length,
          first: priceHistory[0],
          last: priceHistory[priceHistory.length - 1]
        })
      }
    }

    // Get the date - prefer price history date (actual candle date), then quote timestamp
    // When market is open, priceHistory has today's intraday candles
    const historyDate = priceHistory.length > 0
      ? priceHistory[priceHistory.length - 1].date.split(' ')[0]  // Use most recent candle date
      : null
    const quoteDate = priceData.timestamp
      ? new Date(priceData.timestamp * 1000).toISOString().split('T')[0]
      : null
    const actualDate = historyDate || quoteDate || new Date().toISOString().split('T')[0]

    return {
      currentPrice: priceData.price,
      priceChange: priceData.change,
      priceChangePercent: priceData.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory,
    }
  } catch (error) {
    console.error('Error in getAaplMarketData:', error)
    return { error: 'Failed to fetch market data' }
  }
}

/**
 * Fetch latest Nasdaq index price and intraday data for homepage
 */
export async function getNasdaqMarketData() {
  try {
    // Get latest index price from FMP API
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) {
      return { error: 'API configuration error' }
    }

    // Fetch latest price quote for Nasdaq Composite index
    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/^IXIC?apikey=${apiKey}`
    const quoteResponse = await fetch(quoteUrl, {
      next: { revalidate: 10 }, // Cache for 10 seconds (real-time data)
    })

    if (!quoteResponse.ok) {
      console.error('FMP API error:', quoteResponse.status)
      return { error: 'Failed to fetch price data' }
    }

    const quoteJson = await quoteResponse.json()
    const priceData = quoteJson[0] // FMP returns array with one item

    // Fetch 1-minute intraday data and aggregate into 10-minute candles
    // FMP Premium tier includes 1-minute data for last 3 trading days
    const intradayUrl = `https://financialmodelingprep.com/api/v3/historical-chart/1min/^IXIC?apikey=${apiKey}`
    const intradayResponse = await fetch(intradayUrl, {
      next: { revalidate: 10 }, // Cache for 10 seconds (real-time data)
    })

    let priceHistory = []
    if (intradayResponse.ok) {
      const intradayJson = await intradayResponse.json()

      // Check if we got an error response
      if (intradayJson && 'Error Message' in intradayJson) {
        console.log('FMP API Error:', intradayJson['Error Message'])
      } else if (intradayJson && Array.isArray(intradayJson) && intradayJson.length > 0) {
        console.log('FMP Intraday Response (1-min) Nasdaq:', {
          totalCandles: intradayJson.length,
          firstCandle: intradayJson[0],
          lastCandle: intradayJson[intradayJson.length - 1]
        })

        // FMP returns newest first. Get most recent trading day.
        // Find the date of the most recent candle
        const mostRecentDate = intradayJson[0].date.split(' ')[0] // "2024-11-08 15:55:00" -> "2024-11-08"

        // Filter to only candles from that date (one trading day)
        const todayCandles = intradayJson.filter(candle =>
          candle.date.startsWith(mostRecentDate)
        )

        console.log(`Filtered to ${todayCandles.length} 1-min candles from ${mostRecentDate} (Nasdaq)`)

        // Aggregate 1-minute candles into 10-minute candles
        const tenMinCandles = aggregateTo10MinCandles(todayCandles)

        console.log(`Aggregated into ${tenMinCandles.length} 10-min candles (Nasdaq)`)

        // Log first candle details to debug color issue
        if (tenMinCandles.length > 0) {
          const firstCandle = tenMinCandles[tenMinCandles.length - 1] // After reverse, this becomes first
          console.log('NASDAQ First 10-min candle (9:30-9:39):', {
            open: firstCandle.open,
            close: firstCandle.close,
            high: firstCandle.high,
            low: firstCandle.low,
            shouldBeGreen: firstCandle.close >= firstCandle.open,
            color: firstCandle.close >= firstCandle.open ? 'GREEN' : 'RED'
          })
        }

        // Reverse so oldest is first (chronological order for chart)
        priceHistory = tenMinCandles
      } else {
        console.log('FMP Intraday: No data available (possibly weekend/market closed)')
      }
    } else {
      console.error('Intraday API error:', intradayResponse.status, intradayResponse.statusText)
    }

    // Fallback to daily data if no intraday data available (markets closed, weekend, etc)
    if (priceHistory.length === 0) {
      console.log('No intraday data, fetching daily historical data instead (Nasdaq)')
      const dailyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/^IXIC?apikey=${apiKey}`
      const dailyResponse = await fetch(dailyUrl, {
        next: { revalidate: 3600 }, // Cache for 1 hour
      })

      if (dailyResponse.ok) {
        const dailyJson = await dailyResponse.json()
        // Get last 30 trading days
        priceHistory = dailyJson?.historical?.slice(0, 30).reverse() || []
        console.log('Daily data fetched (Nasdaq):', {
          count: priceHistory.length,
          first: priceHistory[0],
          last: priceHistory[priceHistory.length - 1]
        })
      }
    }

    // Get the date - prefer price history date (actual candle date), then quote timestamp
    // When market is open, priceHistory has today's intraday candles
    const historyDate = priceHistory.length > 0
      ? priceHistory[priceHistory.length - 1].date.split(' ')[0]  // Use most recent candle date
      : null
    const quoteDate = priceData.timestamp
      ? new Date(priceData.timestamp * 1000).toISOString().split('T')[0]
      : null
    const actualDate = historyDate || quoteDate || new Date().toISOString().split('T')[0]

    return {
      currentPrice: priceData.price,
      priceChange: priceData.change,
      priceChangePercent: priceData.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory,
    }
  } catch (error) {
    console.error('Error in getNasdaqMarketData:', error)
    return { error: 'Failed to fetch market data' }
  }
}

/**
 * Fetch latest Dow Jones index price and intraday data for homepage
 */
export async function getDowMarketData() {
  try {
    // Get latest index price from FMP API
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) {
      return { error: 'API configuration error' }
    }

    // Fetch latest price quote for Dow Jones index
    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/^DJI?apikey=${apiKey}`
    const quoteResponse = await fetch(quoteUrl, {
      next: { revalidate: 10 }, // Cache for 10 seconds (real-time data)
    })

    if (!quoteResponse.ok) {
      console.error('FMP API error:', quoteResponse.status)
      return { error: 'Failed to fetch price data' }
    }

    const quoteJson = await quoteResponse.json()
    const priceData = quoteJson[0] // FMP returns array with one item

    // Fetch 1-minute intraday data and aggregate into 10-minute candles
    // FMP Premium tier includes 1-minute data for last 3 trading days
    const intradayUrl = `https://financialmodelingprep.com/api/v3/historical-chart/1min/^DJI?apikey=${apiKey}`
    const intradayResponse = await fetch(intradayUrl, {
      next: { revalidate: 10 }, // Cache for 10 seconds (real-time data)
    })

    let priceHistory = []
    if (intradayResponse.ok) {
      const intradayJson = await intradayResponse.json()

      // Check if we got an error response
      if (intradayJson && 'Error Message' in intradayJson) {
        console.log('FMP API Error:', intradayJson['Error Message'])
      } else if (intradayJson && Array.isArray(intradayJson) && intradayJson.length > 0) {
        console.log('FMP Intraday Response (1-min) Dow:', {
          totalCandles: intradayJson.length,
          firstCandle: intradayJson[0],
          lastCandle: intradayJson[intradayJson.length - 1]
        })

        // FMP returns newest first. Get most recent trading day.
        // Find the date of the most recent candle
        const mostRecentDate = intradayJson[0].date.split(' ')[0] // "2024-11-08 15:55:00" -> "2024-11-08"

        // Filter to only candles from that date (one trading day)
        const todayCandles = intradayJson.filter(candle =>
          candle.date.startsWith(mostRecentDate)
        )

        console.log(`Filtered to ${todayCandles.length} 1-min candles from ${mostRecentDate} (Dow)`)

        // Aggregate 1-minute candles into 10-minute candles
        const tenMinCandles = aggregateTo10MinCandles(todayCandles)

        console.log(`Aggregated into ${tenMinCandles.length} 10-min candles (Dow)`)

        // Reverse so oldest is first (chronological order for chart)
        priceHistory = tenMinCandles
      } else {
        console.log('FMP Intraday: No data available (possibly weekend/market closed)')
      }
    } else {
      console.error('Intraday API error:', intradayResponse.status, intradayResponse.statusText)
    }

    // Fallback to daily data if no intraday data available (markets closed, weekend, etc)
    if (priceHistory.length === 0) {
      console.log('No intraday data, fetching daily historical data instead (Dow)')
      const dailyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/^DJI?apikey=${apiKey}`
      const dailyResponse = await fetch(dailyUrl, {
        next: { revalidate: 3600 }, // Cache for 1 hour
      })

      if (dailyResponse.ok) {
        const dailyJson = await dailyResponse.json()
        // Get last 30 trading days
        priceHistory = dailyJson?.historical?.slice(0, 30).reverse() || []
        console.log('Daily data fetched (Dow):', {
          count: priceHistory.length,
          first: priceHistory[0],
          last: priceHistory[priceHistory.length - 1]
        })
      }
    }

    // Get the date - prefer price history date (actual candle date), then quote timestamp
    // When market is open, priceHistory has today's intraday candles
    const historyDate = priceHistory.length > 0
      ? priceHistory[priceHistory.length - 1].date.split(' ')[0]  // Use most recent candle date
      : null
    const quoteDate = priceData.timestamp
      ? new Date(priceData.timestamp * 1000).toISOString().split('T')[0]
      : null
    const actualDate = historyDate || quoteDate || new Date().toISOString().split('T')[0]

    return {
      currentPrice: priceData.price,
      priceChange: priceData.change,
      priceChangePercent: priceData.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory,
    }
  } catch (error) {
    console.error('Error in getDowMarketData:', error)
    return { error: 'Failed to fetch market data' }
  }
}

/**
 * Fetch latest Russell 2000 index price and intraday data for homepage
 */
export async function getRussellMarketData() {
  try {
    // Get latest index price from FMP API
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) {
      return { error: 'API configuration error' }
    }

    // Fetch latest price quote for Russell 2000 index
    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/^RUT?apikey=${apiKey}`
    const quoteResponse = await fetch(quoteUrl, {
      next: { revalidate: 10 }, // Cache for 10 seconds (real-time data)
    })

    if (!quoteResponse.ok) {
      console.error('FMP API error:', quoteResponse.status)
      return { error: 'Failed to fetch price data' }
    }

    const quoteJson = await quoteResponse.json()
    const priceData = quoteJson[0] // FMP returns array with one item

    // Fetch 1-minute intraday data and aggregate into 10-minute candles
    // FMP Premium tier includes 1-minute data for last 3 trading days
    const intradayUrl = `https://financialmodelingprep.com/api/v3/historical-chart/1min/^RUT?apikey=${apiKey}`
    const intradayResponse = await fetch(intradayUrl, {
      next: { revalidate: 10 }, // Cache for 10 seconds (real-time data)
    })

    let priceHistory = []
    if (intradayResponse.ok) {
      const intradayJson = await intradayResponse.json()

      // Check if we got an error response
      if (intradayJson && 'Error Message' in intradayJson) {
        console.log('FMP API Error:', intradayJson['Error Message'])
      } else if (intradayJson && Array.isArray(intradayJson) && intradayJson.length > 0) {
        console.log('FMP Intraday Response (1-min) Russell:', {
          totalCandles: intradayJson.length,
          firstCandle: intradayJson[0],
          lastCandle: intradayJson[intradayJson.length - 1]
        })

        // FMP returns newest first. Get most recent trading day.
        // Find the date of the most recent candle
        const mostRecentDate = intradayJson[0].date.split(' ')[0] // "2024-11-08 15:55:00" -> "2024-11-08"

        // Filter to only candles from that date (one trading day)
        const todayCandles = intradayJson.filter(candle =>
          candle.date.startsWith(mostRecentDate)
        )

        console.log(`Filtered to ${todayCandles.length} 1-min candles from ${mostRecentDate} (Russell)`)

        // Aggregate 1-minute candles into 10-minute candles
        const tenMinCandles = aggregateTo10MinCandles(todayCandles)

        console.log(`Aggregated into ${tenMinCandles.length} 10-min candles (Russell)`)

        // Reverse so oldest is first (chronological order for chart)
        priceHistory = tenMinCandles
      } else {
        console.log('FMP Intraday: No data available (possibly weekend/market closed)')
      }
    } else {
      console.error('Intraday API error:', intradayResponse.status, intradayResponse.statusText)
    }

    // Fallback to daily data if no intraday data available (markets closed, weekend, etc)
    if (priceHistory.length === 0) {
      console.log('No intraday data, fetching daily historical data instead (Russell)')
      const dailyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/^RUT?apikey=${apiKey}`
      const dailyResponse = await fetch(dailyUrl, {
        next: { revalidate: 3600 }, // Cache for 1 hour
      })

      if (dailyResponse.ok) {
        const dailyJson = await dailyResponse.json()
        // Get last 30 trading days
        priceHistory = dailyJson?.historical?.slice(0, 30).reverse() || []
        console.log('Daily data fetched (Russell):', {
          count: priceHistory.length,
          first: priceHistory[0],
          last: priceHistory[priceHistory.length - 1]
        })
      }
    }

    // Get the date - prefer price history date (actual candle date), then quote timestamp
    // When market is open, priceHistory has today's intraday candles
    const historyDate = priceHistory.length > 0
      ? priceHistory[priceHistory.length - 1].date.split(' ')[0]  // Use most recent candle date
      : null
    const quoteDate = priceData.timestamp
      ? new Date(priceData.timestamp * 1000).toISOString().split('T')[0]
      : null
    const actualDate = historyDate || quoteDate || new Date().toISOString().split('T')[0]

    return {
      currentPrice: priceData.price,
      priceChange: priceData.change,
      priceChangePercent: priceData.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory,
    }
  } catch (error) {
    console.error('Error in getRussellMarketData:', error)
    return { error: 'Failed to fetch market data' }
  }
}

/**
 * Fetch latest ES futures price and intraday data for homepage
 * ES futures trade nearly 24 hours (Sunday 6pm - Friday 5pm ET)
 */
export async function getESFuturesMarketData() {
  try {
    const apiKey = process.env.FMP_API_KEY
    if (!apiKey) {
      return { error: 'API configuration error' }
    }

    // Fetch latest price quote for ES futures
    const quoteUrl = `https://financialmodelingprep.com/api/v3/quote/ES=F?apikey=${apiKey}`
    const quoteResponse = await fetch(quoteUrl, {
      next: { revalidate: 10 },
    })

    if (!quoteResponse.ok) {
      console.error('FMP API error:', quoteResponse.status)
      return { error: 'Failed to fetch price data' }
    }

    const quoteJson = await quoteResponse.json()
    const priceData = quoteJson[0]

    // Fetch 1-minute intraday data and aggregate into 10-minute candles
    const intradayUrl = `https://financialmodelingprep.com/api/v3/historical-chart/1min/ES=F?apikey=${apiKey}`
    const intradayResponse = await fetch(intradayUrl, {
      next: { revalidate: 10 },
    })

    let priceHistory: Array<{ date: string; open: number; high: number; low: number; close: number }> = []
    if (intradayResponse.ok) {
      const intradayJson = await intradayResponse.json()

      if (intradayJson && 'Error Message' in intradayJson) {
        console.log('FMP API Error (ES Futures):', intradayJson['Error Message'])
      } else if (intradayJson && Array.isArray(intradayJson) && intradayJson.length > 0) {
        console.log('FMP Intraday Response (1-min) ES Futures:', {
          totalCandles: intradayJson.length,
          firstCandle: intradayJson[0],
          lastCandle: intradayJson[intradayJson.length - 1]
        })

        // Get most recent trading day
        const mostRecentDate = intradayJson[0].date.split(' ')[0]

        // Filter to only candles from that date
        const todayCandles = intradayJson.filter((candle: { date: string }) =>
          candle.date.startsWith(mostRecentDate)
        )

        console.log(`Filtered to ${todayCandles.length} 1-min candles from ${mostRecentDate} (ES Futures)`)

        // Aggregate 1-minute candles into 10-minute candles
        const tenMinCandles = aggregateTo10MinCandles(todayCandles)

        console.log(`Aggregated into ${tenMinCandles.length} 10-min candles (ES Futures)`)

        priceHistory = tenMinCandles
      } else {
        console.log('FMP Intraday: No intraday data available (ES Futures), trying daily data')
      }
    } else {
      console.error('Intraday API error (ES Futures):', intradayResponse.status, intradayResponse.statusText)
    }

    // Fallback to daily data if no intraday data available
    if (priceHistory.length === 0) {
      console.log('Fetching daily historical data for ES Futures')
      const dailyUrl = `https://financialmodelingprep.com/api/v3/historical-price-full/ES=F?apikey=${apiKey}`
      const dailyResponse = await fetch(dailyUrl, {
        next: { revalidate: 3600 }, // Cache for 1 hour
      })

      if (dailyResponse.ok) {
        const dailyJson = await dailyResponse.json()
        // Get last 30 trading days
        priceHistory = dailyJson?.historical?.slice(0, 30).reverse() || []
        console.log('Daily data fetched (ES Futures):', {
          count: priceHistory.length,
          first: priceHistory[0],
          last: priceHistory[priceHistory.length - 1]
        })
      } else {
        console.error('Daily API error (ES Futures):', dailyResponse.status)
      }
    }

    // Get the date
    const historyDate = priceHistory.length > 0
      ? priceHistory[priceHistory.length - 1].date.split(' ')[0]
      : null
    const quoteDate = priceData?.timestamp
      ? new Date(priceData.timestamp * 1000).toISOString().split('T')[0]
      : null
    const actualDate = historyDate || quoteDate || new Date().toISOString().split('T')[0]

    return {
      currentPrice: priceData?.price || 0,
      priceChange: priceData?.change || 0,
      priceChangePercent: priceData?.changesPercentage || 0,
      date: actualDate,
      priceHistory: priceHistory,
    }
  } catch (error) {
    console.error('Error in getESFuturesMarketData:', error)
    return { error: 'Failed to fetch market data' }
  }
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
      console.error('Error fetching financial history:', error)
      return { error: 'Failed to fetch financial history' }
    }

    return { data: data?.reverse() || [] }
  } catch (error) {
    console.error('Error in getAaplFinancialHistory:', error)
    return { error: 'Failed to fetch financial history' }
  }
}
