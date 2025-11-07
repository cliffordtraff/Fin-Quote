// Chart generation helper functions

import type { ChartConfig } from '@/types/chart'
import type { FinancialData, PriceData } from '@/app/actions/ask-question'

/**
 * Determines if the data type should generate a chart
 */
export function shouldGenerateChart(dataType: string): boolean {
  return dataType === 'financials' || dataType === 'prices'
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
  userQuestion?: string
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
      color: '#EF4444', // Red for leverage metrics
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
      color: '#10B981', // Green for profitability
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
      color: '#3B82F6', // Blue for returns
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
    // Regular financial values in billions
    values = validData.map((d) => formatFinancialValue(d.value))
    metricName = formatMetricName(metric)
    yAxisLabel = `${metricName} ($B)`
  }

  return {
    type: 'column',
    title: `AAPL ${metricName} (${categories[0]}-${categories[categories.length - 1]})`,
    data: values,
    categories,
    yAxisLabel,
    xAxisLabel: 'Year',
  }
}

/**
 * Converts price data to chart configuration
 */
export function generatePriceChart(data: PriceData[], range: string): ChartConfig | null {
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

  // Extract dates and prices
  const categories = validData.map((d) => formatDateLabel(d.date))
  const values = validData.map((d) => parseFloat(d.close.toFixed(2)))

  // Get first and last date for title
  const firstDate = new Date(validData[0].date)
  const lastDate = new Date(validData[validData.length - 1].date)

  return {
    type: 'line', // Line charts are better for time-series price data
    title: `AAPL Stock Price (${formatDateRange(firstDate, lastDate)})`,
    data: values,
    categories,
    yAxisLabel: 'Stock Price ($)',
    xAxisLabel: 'Date',
  }
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
