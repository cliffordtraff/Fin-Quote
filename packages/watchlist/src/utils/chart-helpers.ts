import { CandlestickData, FMPCandleData, Timeframe } from '@watchlist/types/chart'
import { Time } from 'lightweight-charts'

/**
 * Transform FMP candle data to TradingView Lightweight Charts format
 */
export function transformFMPToTradingView(fmpData: FMPCandleData[]): CandlestickData[] {
  return fmpData
    .map((candle): CandlestickData => ({
      time: Math.floor(new Date(candle.date).getTime() / 1000), // Convert to Unix timestamp in seconds
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }))
    .sort((a, b) => a.time - b.time) // Sort ascending by time (oldest first)
}

/**
 * Get the default lookback period for a given timeframe
 * Returns number of days to look back
 */
export function getDefaultLookback(timeframe: Timeframe): number {
  const lookbackDays: Record<Timeframe, number> = {
    '1m': 10,      // 10 days (~3,900 candles)
    '5m': 40,      // 40 days (~3,120 candles)
    '15m': 120,    // 120 days (~3,120 candles)
    '30m': 180,    // 180 days (~2,340 candles)
    '1h': 365,     // 365 days (~2,373 candles)
    '4h': 540,     // 540 days (~702 candles)
    '1d': 3650,    // 10 years (~2,520 candles)
    '1w': 3650     // 10 years (~520 candles)
  }
  return lookbackDays[timeframe] || 60 // Default to 60 days
}

/**
 * Calculate the start time of a candle for a given timestamp and timeframe
 */
export function calculateCandleTimeframe(timestamp: number, timeframe: Timeframe): number {
  const date = new Date(timestamp * 1000) // Convert from seconds to milliseconds

  // Get time components
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const hours = date.getUTCHours()
  const minutes = date.getUTCMinutes()

  let candleStart: Date

  switch (timeframe) {
    case '1m':
      candleStart = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0))
      break
    case '5m':
      candleStart = new Date(Date.UTC(year, month, day, hours, Math.floor(minutes / 5) * 5, 0, 0))
      break
    case '15m':
      candleStart = new Date(Date.UTC(year, month, day, hours, Math.floor(minutes / 15) * 15, 0, 0))
      break
    case '30m':
      candleStart = new Date(Date.UTC(year, month, day, hours, Math.floor(minutes / 30) * 30, 0, 0))
      break
    case '1h':
      candleStart = new Date(Date.UTC(year, month, day, hours, 0, 0, 0))
      break
    case '4h':
      candleStart = new Date(Date.UTC(year, month, day, Math.floor(hours / 4) * 4, 0, 0, 0))
      break
    case '1d':
      candleStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
      break
    default:
      candleStart = date
  }

  return Math.floor(candleStart.getTime() / 1000) // Return Unix timestamp in seconds
}

/**
 * Merge a real-time quote into an existing candle or create a new one
 * This is used to update the current candle with live price data
 */
export function mergeQuoteIntoCandle(
  currentCandle: CandlestickData | null,
  quote: { price: number; volume?: number; timestamp?: number },
  timeframe: Timeframe
): CandlestickData {
  const now = quote.timestamp || Math.floor(Date.now() / 1000) // Unix timestamp in seconds
  const candleTime = calculateCandleTimeframe(now, timeframe)

  // If no current candle or the quote is for a new candle period
  if (!currentCandle || currentCandle.time !== candleTime) {
    return {
      time: candleTime,
      open: quote.price,
      high: quote.price,
      low: quote.price,
      close: quote.price,
      volume: quote.volume
    }
  }

  // Update existing candle
  return {
    time: candleTime,
    open: currentCandle.open,
    high: Math.max(currentCandle.high, quote.price),
    low: Math.min(currentCandle.low, quote.price),
    close: quote.price,
    volume: quote.volume !== undefined ? quote.volume : currentCandle.volume
  }
}

/**
 * Format timeframe for display
 */
export function formatTimeframe(timeframe: Timeframe): string {
  const mapping: Record<Timeframe, string> = {
    '1m': '1 Minute',
    '5m': '5 Minutes',
    '15m': '15 Minutes',
    '30m': '30 Minutes',
    '1h': '1 Hour',
    '4h': '4 Hours',
    '1d': '1 Day',
    '1w': '1 Week'
  }
  return mapping[timeframe] || timeframe
}

/**
 * Get cache TTL for a given timeframe (in seconds)
 */
export function getChartCacheTTL(timeframe: Timeframe): number {
  const ttlMap: Record<Timeframe, number> = {
    '1m': 60,           // 1 minute
    '5m': 5 * 60,       // 5 minutes
    '15m': 15 * 60,     // 15 minutes
    '30m': 30 * 60,     // 30 minutes
    '1h': 60 * 60,      // 1 hour
    '4h': 4 * 60 * 60,  // 4 hours
    '1d': 24 * 60 * 60, // 24 hours
    '1w': 7 * 24 * 60 * 60  // 7 days
  }
  return ttlMap[timeframe] || 5 * 60 // Default to 5 minutes
}

/**
 * Calculate Simple Moving Average (SMA) from candlestick data
 *
 * @param data - Array of candlestick data
 * @param period - Number of periods for the moving average (e.g., 20, 50, 200)
 * @returns Array of SMA values with time and value
 */
export function calculateSMA(data: CandlestickData[], period: number): Array<{ time: Time; value: number }> {
  if (data.length < period) {
    return []
  }

  const smaData: Array<{ time: Time; value: number }> = []

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close
    }
    const sma = sum / period

    smaData.push({
      time: data[i].time as Time,
      value: sma
    })
  }

  return smaData
}

/**
 * Check if a timestamp is during extended hours trading
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns true if extended hours (pre-market or after-hours), false if regular hours
 */
export function isExtendedHours(timestamp: number): boolean {
  const date = new Date(timestamp * 1000)

  // Convert to ET timezone
  const etTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const hours = etTime.getHours()
  const minutes = etTime.getMinutes()
  const totalMinutes = hours * 60 + minutes

  // Regular market hours: 9:30 AM - 4:00 PM ET
  const marketOpen = 9 * 60 + 30  // 9:30 AM
  const marketClose = 16 * 60     // 4:00 PM

  // Check if it's a weekday (0 = Sunday, 6 = Saturday)
  const dayOfWeek = etTime.getDay()
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return true // Weekend is extended hours
  }

  // Extended hours: before 9:30 AM or after 4:00 PM
  return totalMinutes < marketOpen || totalMinutes >= marketClose
}

/**
 * Filter chart data to exclude extended hours
 *
 * @param data - Array of candlestick data
 * @returns Filtered array with only regular hours data
 */
export function filterRegularHoursOnly(data: CandlestickData[]): CandlestickData[] {
  return data.filter(candle => !isExtendedHours(candle.time))
}