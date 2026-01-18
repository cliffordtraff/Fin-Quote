'use server'

import { getPrices } from './prices'
import { matchPricesToDates, generateCalendarDates, type PriceDataPoint } from '@/lib/price-matcher'
import type { MetricData, MetricDataPoint, PeriodType } from './chart-metrics'

/**
 * Fetches stock price data aligned to fiscal period dates.
 *
 * This function integrates with the charting system by:
 * 1. Accepting the same period_end_dates from financial data
 * 2. Fetching price data from FMP API for the required date range
 * 3. Matching prices to fiscal periods using nearest prior trading day
 * 4. Returning data in MetricData format compatible with MultiMetricChart
 *
 * @param symbol - Stock ticker symbol (e.g., 'AAPL', 'MSFT')
 * @param periodEndDates - Array of period end dates from financial data, each with date and label
 * @param periodType - 'annual' or 'quarterly'
 * @param minYear - Optional minimum year (for price-only queries)
 * @param maxYear - Optional maximum year (for price-only queries)
 */
export async function getChartPriceData(params: {
  symbol: string
  periodEndDates?: Array<{ date: string; year: number; fiscal_quarter?: number | null; fiscal_label?: string | null }>
  periodType: PeriodType
  minYear?: number
  maxYear?: number
}): Promise<{
  data: MetricData | null
  error: string | null
}> {
  const { symbol, periodEndDates, periodType, minYear, maxYear } = params

  try {
    // If no period end dates provided (price-only query), generate calendar dates
    let targetPeriods: Array<{ date: string; year: number; fiscal_quarter?: number | null; fiscal_label?: string | null }>

    if (!periodEndDates || periodEndDates.length === 0) {
      // Generate calendar-based dates for price-only display
      const currentYear = new Date().getFullYear()
      const startYear = minYear ?? currentYear - 9  // Default: last 10 years
      const endYear = maxYear ?? currentYear

      const calendarDates = generateCalendarDates(startYear, endYear, periodType)

      targetPeriods = calendarDates.map(date => {
        const d = new Date(date)
        const year = d.getFullYear()
        const month = d.getMonth()

        if (periodType === 'quarterly') {
          // Determine quarter from date
          const quarter = Math.floor(month / 3) + 1
          return {
            date,
            year,
            fiscal_quarter: quarter,
            fiscal_label: `FY${year} Q${quarter}`,
          }
        } else {
          return {
            date,
            year,
            fiscal_quarter: null,
            fiscal_label: null,
          }
        }
      })
    } else {
      // Filter out any entries without a date
      targetPeriods = periodEndDates.filter(p => p.date)
    }

    if (targetPeriods.length === 0) {
      return { data: null, error: 'No valid period dates to match prices to' }
    }

    // Determine the date range we need to fetch
    const dates = targetPeriods.map(p => p.date).sort()
    const earliestDate = dates[0]
    const latestDate = dates[dates.length - 1]

    // Add buffer to ensure we have data for nearest trading day lookup
    const fromDate = new Date(earliestDate)
    fromDate.setDate(fromDate.getDate() - 10)  // 10 day buffer for weekend/holiday lookback
    const from = fromDate.toISOString().split('T')[0]

    // Fetch price data from FMP API
    const priceResult = await getPrices({
      symbol,
      from,
      to: latestDate,
    })

    if (priceResult.error) {
      return { data: null, error: priceResult.error }
    }

    if (!priceResult.data || priceResult.data.length === 0) {
      return { data: null, error: 'No price data available for the requested period' }
    }

    // Convert to PriceDataPoint format expected by price-matcher
    const priceData: PriceDataPoint[] = priceResult.data.map(p => ({
      date: p.date,
      close: p.close,
      open: p.open,
      high: p.high,
      low: p.low,
      volume: p.volume,
    }))

    // Match prices to period end dates
    const targetDates = targetPeriods.map(p => p.date)
    const matchedPrices = matchPricesToDates(priceData, targetDates)

    // Build MetricDataPoint array aligned to fiscal periods
    const dataPoints: MetricDataPoint[] = targetPeriods.map((period, index) => {
      const matched = matchedPrices[index]

      return {
        year: period.year,
        value: matched.price ?? 0,  // Use 0 for null (will show as gap in chart)
        fiscal_quarter: period.fiscal_quarter,
        fiscal_label: period.fiscal_label,
        date: period.date,
      }
    })

    // Sort by year and quarter for chart display
    dataPoints.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year
      return (a.fiscal_quarter ?? 0) - (b.fiscal_quarter ?? 0)
    })

    // Return as MetricData
    const result: MetricData = {
      metric: 'stock_price',
      label: 'Stock Price',
      unit: 'price',
      data: dataPoints,
    }

    return { data: result, error: null }
  } catch (err) {
    console.error(`Error fetching chart price data for ${symbol}:`, err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}
