// Chart configuration types for Highcharts integration

export type ChartConfig = {
  type: 'column' | 'line' // Column for comparisons, line for trends
  title: string // e.g., "AAPL Revenue (2020-2024)"
  data: number[] // Array of values to plot
  categories: string[] // Array of x-axis labels (years, dates, etc.)
  yAxisLabel: string // e.g., "Revenue ($B)"
  xAxisLabel: string // e.g., "Year"
  color?: string // Optional custom series color
}
