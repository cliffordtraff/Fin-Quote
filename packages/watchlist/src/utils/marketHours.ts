// Market hours utilities for smart polling

export interface MarketStatus {
  isOpen: boolean
  isPreMarket: boolean
  isAfterHours: boolean
  isWeekend: boolean
  nextOpenTime: Date | null
  currentSession: 'closed' | 'pre-market' | 'market' | 'after-hours' | 'weekend'
}

/**
 * Get current Eastern Time regardless of server timezone
 */
function getEasternTime(): Date {
  const now = new Date()
  // Create a date in ET timezone
  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" })
  return new Date(etString)
}

/**
 * Check if US stock market is currently open
 */
export function isMarketOpen(): boolean {
  const et = getEasternTime()
  const day = et.getDay()
  const hours = et.getHours()
  const minutes = et.getMinutes()
  const timeInMinutes = hours * 60 + minutes
  
  // Weekend - markets closed
  if (day === 0 || day === 6) return false
  
  // Market hours: 9:30 AM - 4:00 PM ET (570 - 960 minutes)
  return timeInMinutes >= 570 && timeInMinutes < 960
}

/**
 * Check if in pre-market hours (4:00 AM - 9:30 AM ET)
 */
export function isPreMarket(): boolean {
  const et = getEasternTime()
  const day = et.getDay()
  const hours = et.getHours()
  const minutes = et.getMinutes()
  const timeInMinutes = hours * 60 + minutes
  
  // Weekend - no pre-market
  if (day === 0 || day === 6) return false
  
  // Pre-market: 4:00 AM - 9:30 AM ET (240 - 570 minutes)
  return timeInMinutes >= 240 && timeInMinutes < 570
}

/**
 * Check if in after-hours trading (4:00 PM - 8:00 PM ET)
 */
export function isAfterHours(): boolean {
  const et = getEasternTime()
  const day = et.getDay()
  const hours = et.getHours()
  const minutes = et.getMinutes()
  const timeInMinutes = hours * 60 + minutes
  
  // Weekend - no after-hours
  if (day === 0 || day === 6) return false
  
  // Friday after-hours ends at 8:00 PM
  if (day === 5 && timeInMinutes >= 960 && timeInMinutes < 1200) return true
  
  // Monday-Thursday: 4:00 PM - 8:00 PM ET (960 - 1200 minutes)
  return timeInMinutes >= 960 && timeInMinutes < 1200
}

/**
 * Check if it's the weekend
 */
export function isWeekend(): boolean {
  const et = getEasternTime()
  const day = et.getDay()
  return day === 0 || day === 6
}

/**
 * Get comprehensive market status
 */
export function getMarketStatus(): MarketStatus {
  const et = getEasternTime()
  const isOpen = isMarketOpen()
  const isPre = isPreMarket()
  const isAfter = isAfterHours()
  const isWknd = isWeekend()
  
  let currentSession: MarketStatus['currentSession'] = 'closed'
  if (isOpen) currentSession = 'market'
  else if (isPre) currentSession = 'pre-market'
  else if (isAfter) currentSession = 'after-hours'
  else if (isWknd) currentSession = 'weekend'
  
  // Calculate next market open
  let nextOpenTime: Date | null = null
  if (!isOpen) {
    const next = new Date(et)
    
    if (isWknd || (et.getDay() === 5 && et.getHours() >= 16)) {
      // It's weekend or Friday after close, next open is Monday 9:30 AM
      const daysUntilMonday = et.getDay() === 0 ? 1 : (8 - et.getDay())
      next.setDate(next.getDate() + daysUntilMonday)
    } else if (et.getHours() >= 16) {
      // After market close, next open is tomorrow 9:30 AM
      next.setDate(next.getDate() + 1)
    }
    // Set to 9:30 AM ET
    next.setHours(9, 30, 0, 0)
    nextOpenTime = next
  }
  
  return {
    isOpen,
    isPreMarket: isPre,
    isAfterHours: isAfter,
    isWeekend: isWknd,
    nextOpenTime,
    currentSession
  }
}

/**
 * Check if forex market is open (Sunday 5 PM - Friday 5 PM ET)
 */
export function isForexOpen(): boolean {
  const et = getEasternTime()
  const day = et.getDay()
  const hours = et.getHours()
  
  // Closed from Friday 5 PM to Sunday 5 PM
  if (day === 6) return false // Saturday always closed
  if (day === 5 && hours >= 17) return false // Friday after 5 PM
  if (day === 0 && hours < 17) return false // Sunday before 5 PM
  
  return true
}

/**
 * Check if crypto market is open (always true - 24/7)
 */
export function isCryptoOpen(): boolean {
  return true
}

/**
 * Determine if we should poll for a given asset type
 */
export function shouldPollAsset(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase()
  
  // Crypto pairs (contains / or ends with USD/USDT/BTC)
  if (upperSymbol.includes('/') || 
      upperSymbol.endsWith('USD') || 
      upperSymbol.endsWith('USDT') ||
      upperSymbol.endsWith('BTC')) {
    return isCryptoOpen() // Always true
  }
  
  // Forex pairs (common currency codes)
  const forexPairs = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD']
  if (forexPairs.some(currency => upperSymbol.includes(currency))) {
    return isForexOpen()
  }
  
  // Everything else is stocks/ETFs
  const status = getMarketStatus()
  return status.isOpen || status.isPreMarket || status.isAfterHours
}

/**
 * Get appropriate polling interval based on market status
 */
export function getPollingInterval(symbols: string[] = []): number {
  // Check if any symbols are crypto (24/7 trading)
  const hasCrypto = symbols.some(s => 
    s.includes('/') || s.endsWith('USD') || s.endsWith('USDT')
  )
  
  if (hasCrypto) {
    return 5000 // Always 5 seconds for crypto
  }
  
  const status = getMarketStatus()
  
  switch (status.currentSession) {
    case 'market':
      return 5000      // 5 seconds during market hours
    case 'pre-market':
    case 'after-hours':
      return 30000     // 30 seconds during extended hours
    case 'weekend':
      return 0         // Don't poll on weekends for stocks
    default:
      return 300000    // 5 minutes when closed
  }
}

/**
 * Format market status for display
 */
export function formatMarketStatus(status: MarketStatus): string {
  if (status.isOpen) return '🟢 Market Open'
  if (status.isPreMarket) return '🟡 Pre-Market'
  if (status.isAfterHours) return '🟠 After-Hours'
  if (status.isWeekend) return '🔴 Weekend - Market Closed'
  
  if (status.nextOpenTime) {
    const hoursUntilOpen = Math.floor(
      (status.nextOpenTime.getTime() - Date.now()) / (1000 * 60 * 60)
    )
    if (hoursUntilOpen < 24) {
      return `🔴 Market Closed - Opens in ${hoursUntilOpen}h`
    }
  }
  
  return '🔴 Market Closed'
}