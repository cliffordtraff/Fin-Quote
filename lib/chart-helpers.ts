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
 * Converts financial data to chart configuration
 */
export function generateFinancialChart(
  data: FinancialData[],
  metric: string
): ChartConfig | null {
  if (!data || data.length === 0) return null

  // Sort by year ascending
  const sortedData = [...data].sort((a, b) => a.year - b.year)

  // Extract years and values
  const categories = sortedData.map((d) => d.year.toString())
  const values = sortedData.map((d) => formatFinancialValue(d.value))

  // Generate human-readable metric name
  const metricName = formatMetricName(metric)

  return {
    type: 'column',
    title: `AAPL ${metricName} (${categories[0]}-${categories[categories.length - 1]})`,
    data: values,
    categories,
    yAxisLabel: `${metricName} ($B)`,
    xAxisLabel: 'Year',
  }
}

/**
 * Converts price data to chart configuration
 */
export function generatePriceChart(data: PriceData[], range: string): ChartConfig | null {
  if (!data || data.length === 0) return null

  // Sort by date ascending
  const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Extract dates and prices
  const categories = sortedData.map((d) => formatDateLabel(d.date))
  const values = sortedData.map((d) => parseFloat(d.close.toFixed(2)))

  // Get first and last date for title
  const firstDate = new Date(sortedData[0].date)
  const lastDate = new Date(sortedData[sortedData.length - 1].date)

  return {
    type: 'column',
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
 */
export function formatFinancialValue(value: number): number {
  return parseFloat((value / 1_000_000_000).toFixed(1))
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
 * Formats dates for x-axis labels
 * "2025-10-24" → "Oct 24"
 */
export function formatDateLabel(dateString: string): string {
  const date = new Date(dateString)
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  const day = date.getDate()
  return `${month} ${day}`
}

/**
 * Formats date range for chart titles
 * (2025-10-24, 2025-10-30) → "Oct 24 - Oct 30"
 */
export function formatDateRange(startDate: Date, endDate: Date): string {
  const start = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const end = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${start} - ${end}`
}
