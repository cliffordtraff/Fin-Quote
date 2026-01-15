// Chart configuration types for Highcharts integration

export type ChartConfig = {
  type: 'column' | 'line' | 'candlestick' // Column for comparisons, line for trends, candlestick for OHLC
  title: string // e.g., "AAPL Revenue (2020-2024)"
  data: number[] | [number, number][] | [number, number, number, number, number][] // Array of values OR [timestamp, value] OR [timestamp, open, high, low, close]
  volumeData?: [number, number][] // Optional volume data: [timestamp, volume]
  categories: string[] // Array of x-axis labels (years, dates, etc.) - empty for time-series
  yAxisLabel: string // e.g., "Revenue ($B)"
  xAxisLabel: string // e.g., "Year"
  color?: string // Optional custom series color
  symbol?: string // Optional ticker symbol for labeling
  dataGrouping?: {
    enabled: boolean
    units: [string, number[]][]
    approximation: string
  } // Optional Highcharts data grouping for time-series
}
