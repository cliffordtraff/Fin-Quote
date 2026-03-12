/**
 * Serializable chart specification for export / newsletter rendering.
 *
 * An AI or newsletter system generates this spec, encodes it into a URL,
 * and a headless browser opens /charts/export?spec=<base64> to screenshot it.
 *
 * Example spec:
 *   { stocks: ['AAPL'], metrics: ['revenue', 'net_income'], title: 'AAPL Revenue & Profit' }
 */
export interface ChartExportSpec {
  /** Stock ticker symbols (e.g., ['AAPL'] or ['AAPL', 'MSFT']) */
  stocks: string[]

  /** Metric IDs to display (e.g., ['revenue', 'net_income']) */
  metrics: string[]

  /** Annual or quarterly data. Default: 'annual' */
  periodType?: 'annual' | 'quarterly'

  /** Start year filter (inclusive) */
  minYear?: number

  /** End year filter (inclusive) */
  maxYear?: number

  /** Overlay stock price line on the chart */
  showStockPrice?: boolean

  /** Chart visualization type. Default: 'bar' */
  chartType?: 'bar' | 'line' | 'area'

  /** Show data point labels on bars/points. Default: true */
  showLabels?: boolean

  /** Stack bars (only applies to bar chart type). Default: false */
  stacked?: boolean

  /** Normalize all series to % change from first value. Default: false */
  indexToZero?: boolean

  /** Optional chart title displayed above the chart */
  title?: string

  /** Optional subtitle displayed below the title */
  subtitle?: string

  /** Optional custom colors keyed by metric ID (e.g., { revenue: '#1a1a2e' }) */
  colors?: Record<string, string>
}

/** Defaults applied when optional spec fields are omitted */
export const CHART_EXPORT_DEFAULTS = {
  periodType: 'annual' as const,
  showStockPrice: false,
  chartType: 'bar' as const,
  showLabels: true,
  stacked: false,
  indexToZero: false,
}
