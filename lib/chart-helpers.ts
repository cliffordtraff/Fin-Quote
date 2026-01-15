// Chart generation helper functions

import type { ChartConfig } from '@/types/chart'
import type { FinancialData, PriceData } from '@/app/actions/ask-question'
import type { FinancialMetricResult } from '@/app/actions/get-financial-metric'
import { METRIC_METADATA } from '@/lib/metric-metadata'

type MetricUnit = 'ratio' | 'percentage' | 'currency' | 'number' | 'days' | 'per_share'

const NATIVE_METRIC_UNITS: Record<string, MetricUnit> = {
  revenue: 'currency',
  gross_profit: 'currency',
  net_income: 'currency',
  operating_income: 'currency',
  total_assets: 'currency',
  total_liabilities: 'currency',
  shareholders_equity: 'currency',
  operating_cash_flow: 'currency',
  eps: 'per_share',
}

/**
 * Determines if the data type should generate a chart
 */
export function shouldGenerateChart(dataType: string): boolean {
  return dataType === 'financials' || dataType === 'prices' || dataType === 'financial_metrics'
}

/**
 * Extracts years from question and returns filtered year range based on distance-based context
 * Option A: Distance-Based Context
 * - Current year (2025): Show 3 years before → [2022, 2023, 2024, 2025]
 * - Other years: Show 2 years before and 2 years after → [year-2, year-1, year, year+1, year+2]
 * - 3+ years mentioned: Show exact years only (no context)
 */
function getFilteredYearRange(question: string, availableData: any[]): any[] {
  if (!question || !availableData || availableData.length === 0) {
    return availableData
  }

  const currentYear = new Date().getFullYear()

  // Extract explicit years (e.g., 2023, 2024, 2025)
  const explicitYears = [...question.matchAll(/\b(20\d{2})\b/g)].map(match => parseInt(match[1]))

  // Extract "last N years" or "past N years"
  const lastYearsMatch = question.match(/(?:last|past)\s+(\d+)\s+years?/i)
  let mentionedYears: number[] = []

  if (lastYearsMatch) {
    const n = parseInt(lastYearsMatch[1])
    // "last 5 years" means current year back to current-4
    for (let i = 0; i < n; i++) {
      mentionedYears.push(currentYear - i)
    }
  } else if (explicitYears.length > 0) {
    mentionedYears = [...new Set(explicitYears)] // Remove duplicates
  }

  // If no years mentioned, default to last 5 years
  if (mentionedYears.length === 0) {
    const last5Years = []
    for (let i = 0; i < 5; i++) {
      last5Years.push(currentYear - i)
    }
    return availableData.filter(row =>
      last5Years.includes(row.year)
    ).sort((a, b) => a.year - b.year)
  }

  const yearCount = mentionedYears.length

  // Rule: If 3+ years mentioned, show exact years only
  if (yearCount >= 3) {
    return availableData.filter(row =>
      mentionedYears.includes(row.year)
    ).sort((a, b) => a.year - b.year)
  }

  // Rule: If 1-2 years mentioned, add context
  const latestMentionedYear = Math.max(...mentionedYears)
  const earliestMentionedYear = Math.min(...mentionedYears)

  let minYear: number
  let maxYear: number

  if (latestMentionedYear === currentYear) {
    // Current year: show 3 years before
    minYear = currentYear - 3
    maxYear = currentYear
  } else {
    // Past year(s): show 2 years before and 2 years after
    minYear = earliestMentionedYear - 2
    maxYear = latestMentionedYear + 2
  }

  return availableData.filter(row =>
    row.year >= minYear && row.year <= maxYear
  ).sort((a, b) => a.year - b.year)
}

/**
 * Converts financial data to chart configuration
 */
export function generateFinancialChart(
  data: FinancialData[],
  metric: string,
  userQuestion?: string,
  symbol: string = 'AAPL'
): ChartConfig | null {
  // Edge case: no data
  if (!data || data.length === 0) return null

  // Apply smart filtering based on user question
  const filteredData = userQuestion ? getFilteredYearRange(userQuestion, data) : data

  // Sort by year ascending
  const sortedData = [...filteredData].sort((a, b) => a.year - b.year)
  const validData = sortedData.filter((d) => d.value != null && !isNaN(d.value))
  if (validData.length === 0) return null

  // Don't generate chart for single data point
  if (validData.length === 1) return null

  const categories = validData.map((d) => d.year.toString())

  // ===============================================
  // HANDLE NATIVE CALCULATED METRICS
  // ===============================================

  if (metric === 'debt_to_equity_ratio') {
    const values = validData.map((d) => parseFloat(d.value.toFixed(2)))
    return {
      type: 'line',
      title: `AAPL Debt-to-Equity Ratio (${categories[0]}-${categories[categories.length - 1]})`,
      data: values,
      categories,
      yAxisLabel: 'Ratio',
      xAxisLabel: 'Year',
    }
  }

  if (metric === 'gross_margin') {
    const values = validData.map((d) => parseFloat(d.value.toFixed(1)))
    return {
      type: 'column',
      title: `AAPL Gross Margin (${categories[0]}-${categories[categories.length - 1]})`,
      data: values,
      categories,
      yAxisLabel: 'Margin (%)',
      xAxisLabel: 'Year',
    }
  }

  if (metric === 'roe') {
    const values = validData.map((d) => parseFloat(d.value.toFixed(1)))
    return {
      type: 'line',
      title: `AAPL Return on Equity (${categories[0]}-${categories[categories.length - 1]})`,
      data: values,
      categories,
      yAxisLabel: 'ROE (%)',
      xAxisLabel: 'Year',
    }
  }

  // ===============================================
  // HANDLE RAW METRICS (with prompt-based calculations)
  // ===============================================

  // Check if this is a margin/ratio calculation (has both value and revenue)
  const hasRevenue = data[0] && 'revenue' in data[0] && data[0].revenue != null
  const hasShareholders = data[0] && 'shareholders_equity' in data[0]
  const hasLiabilities = data[0] && 'total_liabilities' in data[0]
  const hasAssets = data[0] && 'total_assets' in data[0]

  // Only calculate margins if the user explicitly asked for them
  const userAskedForMargin = userQuestion?.toLowerCase().includes('margin') || userQuestion?.toLowerCase().includes('percent')
  const isMarginCalculation = hasRevenue && userAskedForMargin && (metric === 'gross_profit' || metric === 'operating_income' || metric === 'net_income')
  const isCashFlowMargin = hasRevenue && userAskedForMargin && metric === 'operating_cash_flow'

  // Only calculate ratios if user explicitly asked for them
  const userAskedForROE = userQuestion?.toLowerCase().includes('roe') || userQuestion?.toLowerCase().includes('return on equity')
  const userAskedForROA = userQuestion?.toLowerCase().includes('roa') || userQuestion?.toLowerCase().includes('return on assets')
  const userAskedForDebtRatio = userQuestion?.toLowerCase().includes('debt') && (userQuestion?.toLowerCase().includes('equity') || userQuestion?.toLowerCase().includes('assets'))
  const userAskedForTurnover = userQuestion?.toLowerCase().includes('turnover')

  const isROECalculation = hasShareholders && metric === 'net_income' && userAskedForROE
  const isROACalculation = hasAssets && metric === 'net_income' && userAskedForROA
  const isDebtToEquityCalculation = hasLiabilities && metric === 'shareholders_equity' && userAskedForDebtRatio
  const isDebtToAssetsCalculation = hasAssets && metric === 'total_liabilities' && userAskedForDebtRatio
  const isAssetTurnover = hasRevenue && metric === 'total_assets' && userAskedForTurnover

  // Calculate values based on type
  let values: number[]
  let yAxisLabel: string
  let metricName: string

  if (isMarginCalculation) {
    // Calculate margin percentages
    values = validData.map((d: any) => {
      const margin = (d.value / d.revenue) * 100
      return parseFloat(margin.toFixed(1))
    })
    metricName = metric === 'gross_profit' ? 'Gross Margin' :
                 metric === 'operating_income' ? 'Operating Margin' : 'Net Margin'
    yAxisLabel = `${metricName} (%)`
  } else if (isCashFlowMargin) {
    // Calculate cash flow margin
    values = validData.map((d: any) => {
      const margin = (d.value / d.revenue) * 100
      return parseFloat(margin.toFixed(1))
    })
    metricName = 'Cash Flow Margin'
    yAxisLabel = 'Cash Flow Margin (%)'
  } else if (isROECalculation) {
    // Calculate ROE percentages
    values = validData.map((d: any) => {
      const roe = (d.value / d.shareholders_equity) * 100
      return parseFloat(roe.toFixed(1))
    })
    metricName = 'Return on Equity (ROE)'
    yAxisLabel = 'ROE (%)'
  } else if (isROACalculation) {
    // Calculate ROA percentages
    values = validData.map((d: any) => {
      const roa = (d.value / d.total_assets) * 100
      return parseFloat(roa.toFixed(1))
    })
    metricName = 'Return on Assets (ROA)'
    yAxisLabel = 'ROA (%)'
  } else if (isDebtToEquityCalculation) {
    // Calculate debt-to-equity ratio
    values = validData.map((d: any) => {
      const ratio = d.total_liabilities / d.value
      return parseFloat(ratio.toFixed(2))
    })
    metricName = 'Debt-to-Equity Ratio'
    yAxisLabel = 'Ratio'
  } else if (isDebtToAssetsCalculation) {
    // Calculate debt-to-assets ratio
    values = validData.map((d: any) => {
      const ratio = d.value / d.total_assets
      return parseFloat(ratio.toFixed(2))
    })
    metricName = 'Debt-to-Assets Ratio'
    yAxisLabel = 'Ratio'
  } else if (isAssetTurnover) {
    // Calculate asset turnover
    values = validData.map((d: any) => {
      const turnover = d.revenue / d.value
      return parseFloat(turnover.toFixed(2))
    })
    metricName = 'Asset Turnover'
    yAxisLabel = 'Turnover Ratio'
  } else {
    metricName = formatMetricName(metric)
    const metricUnit: MetricUnit = METRIC_METADATA[metric]?.unit as MetricUnit || NATIVE_METRIC_UNITS[metric] || 'currency'

    if (metricUnit === 'currency') {
      // Scale currency intelligently (B/M/$) to avoid tiny numbers for smaller metrics
      const maxAbs = Math.max(...validData.map((d) => Math.abs(d.value)))
      let divisor = 1
      let unitLabel = '$'

      if (maxAbs >= 1_000_000_000) {
        divisor = 1_000_000_000
        unitLabel = '$B'
      } else if (maxAbs >= 1_000_000) {
        divisor = 1_000_000
        unitLabel = '$M'
      }

      values = validData.map((d) => parseFloat((d.value / divisor).toFixed(1)))
      yAxisLabel = `${metricName} (${unitLabel})`
    } else if (metricUnit === 'per_share') {
      values = validData.map((d) => parseFloat(d.value.toFixed(2)))
      yAxisLabel = `${metricName} ($ per share)`
    } else if (metricUnit === 'percentage') {
      values = validData.map((d) => parseFloat((d.value * 100).toFixed(2)))
      yAxisLabel = `${metricName} (%)`
    } else if (metricUnit === 'ratio') {
      values = validData.map((d) => parseFloat(d.value.toFixed(2)))
      yAxisLabel = metricName
    } else if (metricUnit === 'days') {
      values = validData.map((d) => parseFloat(d.value.toFixed(1)))
      yAxisLabel = `${metricName} (days)`
    } else {
      // number / unknown: keep raw with mild rounding
      values = validData.map((d) => parseFloat(d.value.toFixed(2)))
      yAxisLabel = metricName
    }
  }

  return {
    type: 'column',
    title: `${symbol} ${metricName} (${categories[0]}-${categories[categories.length - 1]})`,
    data: values,
    categories,
    yAxisLabel,
    xAxisLabel: 'Year',
    symbol,
  }
}

/**
 * Converts price data to chart configuration
 * Now returns time-series data with timestamps for Highcharts dataGrouping
 */
export function generatePriceChart(data: PriceData[], range: string, symbol: string = 'AAPL'): ChartConfig | null {
  // Edge case: no data
  if (!data || data.length === 0) return null

  // Sort by date ascending
  const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Filter out any invalid/null values
  const validData = sortedData.filter((d) => d.close != null && !isNaN(d.close) && d.date)

  if (validData.length === 0) return null

  // Edge case: single data point
  if (validData.length === 1) {
    const categories = [formatDateLabel(validData[0].date)]
    const values = [parseFloat(validData[0].close.toFixed(2))]
    const date = new Date(validData[0].date)

    return {
      type: 'line', // Line charts for price data
      title: `AAPL Stock Price (${formatDateRange(date, date)})`,
      data: values,
      categories,
      yAxisLabel: 'Stock Price ($)',
      xAxisLabel: 'Date',
    }
  }

  // Limit data points to prevent JSON serialization issues
  // For very large datasets, we'll pre-aggregate the data
  const MAX_DATA_POINTS = 100 // Safe limit for JSON serialization (100 points × 5 OHLC values = 500 numbers)
  let dataToUse = validData

  if (validData.length > MAX_DATA_POINTS) {
    // Determine aggregation period based on data size
    // For very large datasets (> 500 points), use monthly aggregation
    // Otherwise use weekly
    const daysPerPeriod = validData.length > 500 ? 30 : 7

    const aggregatedData: typeof validData = []
    for (let i = 0; i < validData.length; i += daysPerPeriod) {
      const periodData = validData.slice(i, Math.min(i + daysPerPeriod, validData.length))
      if (periodData.length > 0) {
        aggregatedData.push({
          date: periodData[0].date,
          open: periodData[0].open,
          high: Math.max(...periodData.map(d => d.high)),
          low: Math.min(...periodData.map(d => d.low)),
          close: periodData[periodData.length - 1].close,
          volume: periodData.reduce((sum, d) => sum + d.volume, 0)
        })
      }
    }
    dataToUse = aggregatedData
  }

  // Convert to OHLC candlestick data [timestamp, open, high, low, close] for Highcharts
  // Add additional validation to ensure no NaN, null, or Infinity values
  const candlestickData = dataToUse
    .filter((d) =>
      d.open != null && Number.isFinite(d.open) &&
      d.high != null && Number.isFinite(d.high) &&
      d.low != null && Number.isFinite(d.low) &&
      d.close != null && Number.isFinite(d.close)
    )
    .map((d) => {
      const timestamp = new Date(d.date).getTime()
      if (!Number.isFinite(timestamp)) {
        return null
      }

      const open = parseFloat(d.open.toFixed(2))
      const high = parseFloat(d.high.toFixed(2))
      const low = parseFloat(d.low.toFixed(2))
      const close = parseFloat(d.close.toFixed(2))

      // Double-check all values are finite after toFixed
      if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
        return null
      }

      return [timestamp, open, high, low, close]
    })
    .filter((item): item is [number, number, number, number, number] => item !== null)

  // Also prepare volume data [timestamp, volume] for volume chart
  const volumeData = dataToUse
    .filter((d) => d.volume != null && Number.isFinite(d.volume))
    .map((d) => {
      const timestamp = new Date(d.date).getTime()
      if (!Number.isFinite(timestamp) || !Number.isFinite(d.volume)) {
        return null
      }
      return [timestamp, d.volume]
    })
    .filter((item): item is [number, number] => item !== null)

  // Get first and last date for title
  const firstDate = new Date(validData[0].date)
  const lastDate = new Date(validData[validData.length - 1].date)

  // Determine appropriate data grouping based on data point count
  let dataGroupingUnits: [string, number[]][]
  const dataPointCount = dataToUse.length

  if (dataPointCount <= 90) {
    // 0-90 days: Daily grouping only
    dataGroupingUnits = [['day', [1]]]
  } else if (dataPointCount <= 500) {
    // 91-500 days (~2 years): Daily and weekly
    dataGroupingUnits = [
      ['day', [1]],
      ['week', [1]]
    ]
  } else {
    // 500+ days (2+ years): Daily, weekly, and monthly
    dataGroupingUnits = [
      ['day', [1]],
      ['week', [1]],
      ['month', [1]]
    ]
  }

  // Ensure we have valid candlestick data
  if (candlestickData.length === 0) {
    return null
  }

  // Create the config object
  const config = {
    type: 'candlestick' as const, // Candlestick charts show OHLC data
    title: `${symbol} Stock Price (${formatDateRange(firstDate, lastDate)})`,
    data: candlestickData, // OHLC format: [timestamp, open, high, low, close]
    volumeData, // Separate volume data for optional volume chart
    categories: [] as string[], // Empty for time-series charts (uses timestamps instead)
    yAxisLabel: 'Stock Price ($)',
    xAxisLabel: 'Date',
    dataGrouping: {
      enabled: true,
      units: dataGroupingUnits,
      approximation: 'ohlc', // Use OHLC aggregation for candlesticks
    },
    symbol,
  }

  // Validate that the config can be serialized to JSON
  try {
    JSON.stringify(config)
  } catch (error) {
    console.error('Chart config cannot be serialized to JSON:', error)
    return null
  }

  return config
}

/**
 * Converts large financial numbers to billions for display
 * 274515000000 → 274.5
 * Uses internationalization for proper number formatting
 */
export function formatFinancialValue(value: number): number {
  // Handle edge cases
  if (value == null || isNaN(value)) return 0

  // Convert to billions
  const billions = value / 1_000_000_000

  // Round to 1 decimal place
  return parseFloat(billions.toFixed(1))
}

/**
 * Formats financial values with proper internationalization
 * Used for display in tooltips and data labels
 * 274.5 → "$274.5B" (US) or "274,5 Mrd. $" (DE)
 */
export function formatFinancialValueForDisplay(value: number, locale: string = 'en-US'): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })

  return `${formatter.format(value)}B`
}

/**
 * Formats metric names for display
 * "net_income" → "Net Income"
 * "revenue" → "Revenue"
 */
export function formatMetricName(metric: string): string {
  const metricNames: Record<string, string> = {
    revenue: 'Revenue',
    gross_profit: 'Gross Profit',
    net_income: 'Net Income',
    operating_income: 'Operating Income',
    total_assets: 'Total Assets',
    total_liabilities: 'Total Liabilities',
    shareholders_equity: "Shareholders' Equity",
    operating_cash_flow: 'Operating Cash Flow',
    eps: 'Earnings Per Share',
  }

  return metricNames[metric] || metric.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

/**
 * Formats dates for x-axis labels with better internationalization
 * "2025-10-24" → "Oct 24"
 * Handles invalid dates gracefully
 */
export function formatDateLabel(dateString: string, locale: string = 'en-US'): string {
  try {
    const date = new Date(dateString)

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return dateString // Return original if invalid
    }

    const month = date.toLocaleDateString(locale, { month: 'short' })
    const day = date.getDate()
    return `${month} ${day}`
  } catch (error) {
    return dateString // Fallback to original string
  }
}

/**
 * Formats date range for chart titles with internationalization
 * (2025-10-24, 2025-10-30) → "Oct 24 - Oct 30"
 * Handles same-date edge case
 */
export function formatDateRange(startDate: Date, endDate: Date, locale: string = 'en-US'): string {
  try {
    // Edge case: same date
    if (startDate.getTime() === endDate.getTime()) {
      return startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
    }

    const start = startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
    const end = endDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' })

    // If different years, include year in the range
    if (startDate.getFullYear() !== endDate.getFullYear()) {
      const startWithYear = startDate.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      const endWithYear = endDate.toLocaleDateString(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      return `${startWithYear} - ${endWithYear}`
    }

    return `${start} - ${end}`
  } catch (error) {
    return 'Invalid Date Range'
  }
}

/**
 * Formats extended metric names for display
 * "peRatio" → "P/E Ratio"
 * "returnOnEquity" → "Return on Equity"
 */
export function formatExtendedMetricName(metricName: string): string {
  // Check if we have a custom display name in metadata
  const metadata = METRIC_METADATA[metricName]
  if (metadata?.description) {
    // Extract the first part before the dash (e.g., "P/E Ratio" from "P/E Ratio - Price to earnings")
    const dashIndex = metadata.description.indexOf(' - ')
    if (dashIndex > 0) {
      return metadata.description.substring(0, dashIndex)
    }
  }

  // Fallback: convert camelCase to Title Case
  return metricName
    .replace(/([A-Z])/g, ' $1') // Add space before capitals
    .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
    .trim()
}

/**
 * Generates chart configuration for extended financial metrics (139 metrics)
 * Handles different unit types: ratio, percentage, currency, days, number
 */
export function generateExtendedMetricChart(
  data: FinancialMetricResult[],
  metricName: string,
  userQuestion?: string,
  symbol: string = 'AAPL'
): ChartConfig | null {
  // Edge case: no data
  if (!data || data.length === 0) return null

  // Filter to just this metric (in case of multi-metric queries)
  const metricData = data.filter(d => d.metric_name === metricName)
  if (metricData.length === 0) return null

  // Sort by year ascending
  const sortedData = [...metricData].sort((a, b) => a.year - b.year)
  const validData = sortedData.filter(d => d.metric_value != null && !isNaN(d.metric_value))

  // Don't generate chart for single data point or no data
  if (validData.length < 2) return null

  const categories = validData.map(d => d.year.toString())

  // Get metadata for this metric to determine formatting
  const metadata = METRIC_METADATA[metricName]
  const unit = metadata?.unit || 'number'

  let values: number[]
  let yAxisLabel: string
  let chartType: 'line' | 'column' = 'line' // Default to line for trends
  const displayName = formatExtendedMetricName(metricName)

  switch (unit) {
    case 'percentage':
      // FMP stores percentage metrics as decimals (e.g., ROE of 1.52 = 152%, margin of 0.46 = 46%)
      // Always multiply by 100 to convert to percentage display
      values = validData.map(d => {
        const val = d.metric_value!
        return parseFloat((val * 100).toFixed(2))
      })
      yAxisLabel = `${displayName} (%)`
      break

    case 'ratio':
      values = validData.map(d => parseFloat(d.metric_value!.toFixed(2)))
      yAxisLabel = displayName
      break

    case 'currency':
      // Determine scale based on magnitude
      const maxVal = Math.max(...validData.map(d => Math.abs(d.metric_value!)))
      if (maxVal >= 1_000_000_000) {
        values = validData.map(d => parseFloat((d.metric_value! / 1e9).toFixed(2)))
        yAxisLabel = `${displayName} ($B)`
      } else if (maxVal >= 1_000_000) {
        values = validData.map(d => parseFloat((d.metric_value! / 1e6).toFixed(2)))
        yAxisLabel = `${displayName} ($M)`
      } else {
        values = validData.map(d => parseFloat(d.metric_value!.toFixed(2)))
        yAxisLabel = `${displayName} ($)`
      }
      chartType = 'column' // Bar charts for currency values
      break

    case 'days':
      values = validData.map(d => parseFloat(d.metric_value!.toFixed(1)))
      yAxisLabel = `${displayName} (days)`
      break

    default: // 'number' or unknown
      values = validData.map(d => parseFloat(d.metric_value!.toFixed(2)))
      yAxisLabel = displayName
  }

  return {
    type: chartType,
    title: `${symbol} ${displayName} (${categories[0]}-${categories[categories.length - 1]})`,
    data: values,
    categories,
    yAxisLabel,
    xAxisLabel: 'Year',
    symbol,
  }
}
