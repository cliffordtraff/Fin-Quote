'use server'

import { createServerClient } from '@/lib/supabase/server'

/**
 * Aggregate 1-minute candles into 10-minute candles
 * Takes 10 consecutive 1-min candles and combines them into one 10-min candle
 */
function aggregateTo10MinCandles(oneMinCandles: Array<{ date: string; open: number; high: number; low: number; close: number }>) {
  const tenMinCandles = []

  // Group every 10 candles together
  for (let i = 0; i < oneMinCandles.length; i += 10) {
    const chunk = oneMinCandles.slice(i, i + 10)

    // Skip incomplete chunks (less than 10 candles)
    if (chunk.length < 10) continue

    // For a 10-minute candle:
    // - date: use the timestamp of the last (most recent) candle in the group
    // - open: first candle's open (oldest in the group)
    // - high: maximum high across all 10 candles
    // - low: minimum low across all 10 candles
    // - close: last candle's close (most recent in the group)

    const tenMinCandle = {
      date: chunk[0].date, // Most recent timestamp (FMP returns newest first)
      open: chunk[chunk.length - 1].open, // Oldest candle's open
      high: Math.max(...chunk.map(c => c.high)), // Highest high
      low: Math.min(...chunk.map(c => c.low)), // Lowest low
      close: chunk[0].close // Most recent candle's close
    }

    tenMinCandles.push(tenMinCandle)
  }

  return tenMinCandles
}

/**
 * Fetch latest SPX index price and intraday data for homepage
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
      next: { revalidate: 300 }, // Cache for 5 minutes
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
      next: { revalidate: 300 }, // Cache for 5 minutes
    })

    let priceHistory = []
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
        // Find the date of the most recent candle
        const mostRecentDate = intradayJson[0].date.split(' ')[0] // "2024-11-08 15:55:00" -> "2024-11-08"

        // Filter to only candles from that date (one trading day)
        const todayCandles = intradayJson.filter(candle =>
          candle.date.startsWith(mostRecentDate)
        )

        console.log(`Filtered to ${todayCandles.length} 1-min candles from ${mostRecentDate}`)

        // Aggregate 1-minute candles into 10-minute candles
        const tenMinCandles = aggregateTo10MinCandles(todayCandles)

        console.log(`Aggregated into ${tenMinCandles.length} 10-min candles`)

        // Reverse so oldest is first (chronological order for chart)
        priceHistory = tenMinCandles.reverse()
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

    // Get the actual date from the price history data
    const actualDate = priceHistory.length > 0
      ? priceHistory[0].date.split(' ')[0] // Extract date from first candle (e.g., "2024-11-07")
      : new Date().toISOString().split('T')[0]

    return {
      currentPrice: priceData.price,
      priceChange: priceData.change,
      priceChangePercent: priceData.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory, // Already reversed above on line 79 and 98
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
      next: { revalidate: 300 }, // Cache for 5 minutes
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
      next: { revalidate: 300 }, // Cache for 5 minutes
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

        // Reverse so oldest is first (chronological order for chart)
        priceHistory = tenMinCandles.reverse()
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

    // Get the actual date from the price history data
    const actualDate = priceHistory.length > 0
      ? priceHistory[0].date.split(' ')[0] // Extract date from first candle (e.g., "2024-11-07")
      : new Date().toISOString().split('T')[0]

    return {
      currentPrice: priceData.price,
      priceChange: priceData.change,
      priceChangePercent: priceData.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory, // Already reversed above on line 79 and 98
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
      next: { revalidate: 300 }, // Cache for 5 minutes
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
      next: { revalidate: 300 }, // Cache for 5 minutes
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
        priceHistory = tenMinCandles.reverse()
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

    // Get the actual date from the price history data
    const actualDate = priceHistory.length > 0
      ? priceHistory[0].date.split(' ')[0] // Extract date from first candle (e.g., "2024-11-07")
      : new Date().toISOString().split('T')[0]

    return {
      currentPrice: priceData.price,
      priceChange: priceData.change,
      priceChangePercent: priceData.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory, // Already reversed above on line 79 and 98
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
      next: { revalidate: 300 }, // Cache for 5 minutes
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
      next: { revalidate: 300 }, // Cache for 5 minutes
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
        priceHistory = tenMinCandles.reverse()
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

    // Get the actual date from the price history data
    const actualDate = priceHistory.length > 0
      ? priceHistory[0].date.split(' ')[0] // Extract date from first candle (e.g., "2024-11-07")
      : new Date().toISOString().split('T')[0]

    return {
      currentPrice: priceData.price,
      priceChange: priceData.change,
      priceChangePercent: priceData.changesPercentage,
      date: actualDate,
      priceHistory: priceHistory, // Already reversed above on line 79 and 98
    }
  } catch (error) {
    console.error('Error in getRussellMarketData:', error)
    return { error: 'Failed to fetch market data' }
  }
}

/**
 * Fetch recent financial data for chart (last 5 years)
 */
export async function getAaplFinancialHistory() {
  try {
    const supabase = createServerClient()

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
