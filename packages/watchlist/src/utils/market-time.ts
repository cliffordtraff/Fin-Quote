import { toZonedTime, format } from 'date-fns-tz'
import { addDays, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns'

/**
 * Market Hours and Smart Cache TTL Utilities
 *
 * Implements intelligent cache expiration based on market state.
 * When markets are closed, stock prices don't change, so we can
 * cache data until the next market open instead of expiring after 30 seconds.
 */

const ET_TIMEZONE = 'America/New_York'
const MARKET_OPEN_HOUR = 9
const MARKET_OPEN_MINUTE = 30
const MARKET_CLOSE_HOUR = 16
const MARKET_CLOSE_MINUTE = 0

/**
 * Detect if a symbol is cryptocurrency
 * Crypto trades 24/7, so always use short cache
 */
export function isCryptoSymbol(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase()
  return upperSymbol.includes('-USD') || upperSymbol.includes('-USDT')
}

/**
 * Get current time in Eastern Time
 */
export function getCurrentETTime(): Date {
  return toZonedTime(new Date(), ET_TIMEZONE)
}

/**
 * Check if market is currently open
 * Market hours: Monday-Friday, 9:30 AM - 4:00 PM ET
 * Does not account for holidays (simplified approach)
 */
export function isMarketOpen(etTime: Date = getCurrentETTime()): boolean {
  const dayOfWeek = etTime.getDay() // 0 = Sunday, 6 = Saturday

  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false
  }

  // Convert time to minutes since midnight for easy comparison
  const currentMinutes = etTime.getHours() * 60 + etTime.getMinutes()
  const openMinutes = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE // 9:30 AM = 570
  const closeMinutes = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE // 4:00 PM = 960

  // Check if within market hours
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes
}

/**
 * Get the next market open time
 * Returns a Date object for when the market will next open
 */
export function getNextMarketOpen(etTime: Date = getCurrentETTime()): Date {
  const dayOfWeek = etTime.getDay()
  const currentMinutes = etTime.getHours() * 60 + etTime.getMinutes()
  const marketOpenMinutes = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE

  // Create a date for market open time
  let nextOpen = setMilliseconds(
    setSeconds(
      setMinutes(
        setHours(etTime, MARKET_OPEN_HOUR),
        MARKET_OPEN_MINUTE
      ),
      0
    ),
    0
  )

  // Sunday - open on Monday
  if (dayOfWeek === 0) {
    nextOpen = addDays(nextOpen, 1)
  }
  // Saturday - open on Monday
  else if (dayOfWeek === 6) {
    nextOpen = addDays(nextOpen, 2)
  }
  // Weekday before market open - opens today
  else if (currentMinutes < marketOpenMinutes) {
    // nextOpen is already set to today at 9:30 AM
  }
  // Weekday after market open - opens tomorrow (or Monday if Friday)
  else {
    if (dayOfWeek === 5) { // Friday
      nextOpen = addDays(nextOpen, 3) // Monday
    } else {
      nextOpen = addDays(nextOpen, 1) // Tomorrow
    }
  }

  return nextOpen
}

/**
 * Calculate smart cache TTL based on market state and symbols
 *
 * Logic:
 * - If any symbol is crypto → use baseline TTL (30s)
 * - If market is open → use baseline TTL (30s)
 * - If market is closed → cache until next market open
 *
 * @param symbols - Array of stock symbols to check
 * @param baselineTTL - Default TTL in milliseconds (usually 30000 = 30s)
 * @returns TTL in milliseconds
 */
export function getSmartCacheTTL(symbols: string[], baselineTTL: number = 30000): number {
  // Check for crypto in batch
  const hasCrypto = symbols.some(isCryptoSymbol)

  if (hasCrypto) {
    console.log('[Smart Cache] Crypto detected, using baseline TTL:', baselineTTL / 1000, 'seconds')
    return baselineTTL
  }

  // Get current ET time
  const currentET = getCurrentETTime()

  // Check if market is open
  if (isMarketOpen(currentET)) {
    console.log('[Smart Cache] Market OPEN, using baseline TTL:', baselineTTL / 1000, 'seconds')
    return baselineTTL
  }

  // Market is closed - calculate time until next open
  const nextOpen = getNextMarketOpen(currentET)
  const msUntilOpen = nextOpen.getTime() - currentET.getTime()

  // Format for logging
  const hoursUntilOpen = Math.floor(msUntilOpen / (1000 * 60 * 60))
  const minutesUntilOpen = Math.floor((msUntilOpen % (1000 * 60 * 60)) / (1000 * 60))

  console.log(
    `[Smart Cache] Market CLOSED, caching until next open: ${hoursUntilOpen}h ${minutesUntilOpen}m`,
    `(${format(nextOpen, 'EEE h:mm a', { timeZone: ET_TIMEZONE })} ET)`
  )

  return msUntilOpen
}
