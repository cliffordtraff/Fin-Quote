/**
 * Price Matcher Utility
 *
 * Matches stock price data to fiscal period end dates.
 * Uses binary search to efficiently find the closest prior trading day price.
 */

/**
 * Helper to check if a metric ID represents a price metric
 */
export function isPriceMetric(metricId: string): boolean {
  return metricId === 'stock_price' || metricId.endsWith(':stock_price')
}

export interface PriceDataPoint {
  date: string      // YYYY-MM-DD format
  close: number     // Closing price
  open?: number
  high?: number
  low?: number
  volume?: number
}

export interface MatchedPrice {
  targetDate: string      // The fiscal period end date we're matching to
  matchedDate: string | null  // The actual date of the price (may differ if market was closed)
  price: number | null    // The closing price, or null if no data available
}

/**
 * Maximum number of days to look back when the exact date doesn't have data
 * (market was closed on weekends/holidays)
 */
const MAX_LOOKBACK_DAYS = 7

/**
 * Matches price data to target dates.
 * For each target date, finds the closing price on that date or the nearest prior trading day.
 *
 * @param priceData - Array of price data points sorted by date (ascending or descending - will be sorted)
 * @param targetDates - Array of target dates (fiscal period end dates) to match prices to
 * @returns Array of matched prices aligned to the target dates
 */
export function matchPricesToDates(
  priceData: PriceDataPoint[],
  targetDates: string[]
): MatchedPrice[] {
  if (priceData.length === 0) {
    return targetDates.map(date => ({
      targetDate: date,
      matchedDate: null,
      price: null,
    }))
  }

  // Sort price data by date ascending for binary search
  const sortedPrices = [...priceData].sort((a, b) =>
    new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Get earliest and latest available dates
  const earliestDate = sortedPrices[0].date
  const latestDate = sortedPrices[sortedPrices.length - 1].date

  return targetDates.map(targetDate => {
    // If target date is before our earliest data (pre-IPO), return null
    if (targetDate < earliestDate) {
      return {
        targetDate,
        matchedDate: null,
        price: null,
      }
    }

    // If target date is after our latest data, use the latest available
    // (This shouldn't normally happen if we fetch recent data)
    if (targetDate > latestDate) {
      return {
        targetDate,
        matchedDate: latestDate,
        price: sortedPrices[sortedPrices.length - 1].close,
      }
    }

    // Binary search for the target date or nearest prior date
    const matched = findPriceForDate(sortedPrices, targetDate)

    return {
      targetDate,
      matchedDate: matched?.date ?? null,
      price: matched?.close ?? null,
    }
  })
}

/**
 * Binary search to find the price on the target date or nearest prior trading day.
 * Returns null if no valid price found within lookback window.
 */
function findPriceForDate(
  sortedPrices: PriceDataPoint[],
  targetDate: string
): PriceDataPoint | null {
  // Binary search to find the index of the target date or insertion point
  let left = 0
  let right = sortedPrices.length - 1
  let result: PriceDataPoint | null = null

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const midDate = sortedPrices[mid].date

    if (midDate === targetDate) {
      // Exact match found
      return sortedPrices[mid]
    } else if (midDate < targetDate) {
      // This could be our answer (nearest prior date)
      result = sortedPrices[mid]
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  // Check if the result is within our lookback window
  if (result) {
    const targetTime = new Date(targetDate).getTime()
    const resultTime = new Date(result.date).getTime()
    const daysDiff = (targetTime - resultTime) / (1000 * 60 * 60 * 24)

    if (daysDiff <= MAX_LOOKBACK_DAYS) {
      return result
    }
  }

  return null
}

/**
 * Generates calendar-based period end dates for price-only queries.
 * When no financial metrics are selected, we need to generate standard
 * period end dates to align the price data.
 *
 * @param startYear - The starting year (earliest)
 * @param endYear - The ending year (most recent)
 * @param periodType - 'annual' or 'quarterly'
 * @returns Array of date strings in YYYY-MM-DD format
 */
export function generateCalendarDates(
  startYear: number,
  endYear: number,
  periodType: 'annual' | 'quarterly'
): string[] {
  const dates: string[] = []

  for (let year = startYear; year <= endYear; year++) {
    if (periodType === 'annual') {
      // Use December 31 for annual data
      dates.push(`${year}-12-31`)
    } else {
      // Use quarter-end dates for quarterly data
      dates.push(`${year}-03-31`) // Q1
      dates.push(`${year}-06-30`) // Q2
      dates.push(`${year}-09-30`) // Q3
      dates.push(`${year}-12-31`) // Q4
    }
  }

  return dates
}

/**
 * Generates month-end dates for smooth price line display.
 * Creates ~12 data points per year for a smoother visualization.
 *
 * @param startYear - The starting year (earliest)
 * @param endYear - The ending year (most recent)
 * @returns Array of date strings in YYYY-MM-DD format (month-end dates)
 */
export function generateMonthlyDates(
  startYear: number,
  endYear: number
): string[] {
  const dates: string[] = []

  for (let year = startYear; year <= endYear; year++) {
    for (let month = 0; month < 12; month++) {
      // Get last day of each month
      const lastDay = new Date(year, month + 1, 0).getDate()
      const monthStr = String(month + 1).padStart(2, '0')
      dates.push(`${year}-${monthStr}-${lastDay}`)
    }
  }

  return dates
}
