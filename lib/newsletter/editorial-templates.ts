import type { EditorialChartTemplate } from './types'

/**
 * Registry of approved editorial chart templates.
 *
 * Each template is a pre-approved chart pattern that an AI can select from.
 * The resolver turns a template + ticker into a valid ChartExportSpec.
 */
export const EDITORIAL_TEMPLATES: EditorialChartTemplate[] = [
  {
    id: 'revenue_vs_net_income',
    label: 'Revenue vs Net Income',
    description:
      'Side-by-side bar chart comparing top-line revenue with bottom-line profit.',
    whenToUse:
      'Use when telling a profitability story — how much of the revenue actually turns into earnings.',
    metrics: ['revenue', 'net_income'],
    maxMetrics: 2,
    chartType: 'bar',
    yearRange: { kind: 'last_n_years', n: 7 },
    periodType: 'annual',
    priceOverlayAllowed: true,
    priceOverlayDefault: false,
    titlePattern: '{ticker} Revenue vs Net Income ({minYear}-{maxYear})',
    subtitlePattern: 'Annual figures in USD',
    defaultColors: {
      revenue: '#5a6b4a',
      net_income: '#8a9b7a',
    },
  },
  {
    id: 'free_cash_flow_trend',
    label: 'Free Cash Flow Trend',
    description:
      'Line chart showing the free cash flow trajectory over a decade.',
    whenToUse:
      'Use to highlight cash generation ability — great for dividend or buyback stories.',
    metrics: ['free_cash_flow'],
    maxMetrics: 1,
    chartType: 'line',
    yearRange: { kind: 'last_n_years', n: 10 },
    periodType: 'annual',
    priceOverlayAllowed: true,
    priceOverlayDefault: false,
    titlePattern: '{ticker} Free Cash Flow ({minYear}-{maxYear})',
    subtitlePattern: 'Annual free cash flow in USD',
    defaultColors: {
      free_cash_flow: '#5a6b4a',
    },
  },
  {
    id: 'gross_margin_trend',
    label: 'Gross Margin Trend',
    description:
      'Area chart of gross margin percentage over time — shows pricing power.',
    whenToUse:
      'Use when discussing competitive moats, pricing power, or cost structure shifts.',
    metrics: ['gross_margin'],
    maxMetrics: 1,
    chartType: 'area',
    yearRange: { kind: 'last_n_years', n: 10 },
    periodType: 'annual',
    priceOverlayAllowed: false,
    priceOverlayDefault: false,
    titlePattern: '{ticker} Gross Margin ({minYear}-{maxYear})',
    subtitlePattern: 'Annual gross margin as a percentage of revenue',
    defaultColors: {
      gross_margin: '#5a6b4a',
    },
  },
  {
    id: 'operating_margin_trend',
    label: 'Operating Margin Trend',
    description:
      'Area chart of operating margin — reveals operational efficiency over time.',
    whenToUse:
      'Use to show how efficiently a company converts revenue into operating profit.',
    metrics: ['operating_margin'],
    maxMetrics: 1,
    chartType: 'area',
    yearRange: { kind: 'last_n_years', n: 10 },
    periodType: 'annual',
    priceOverlayAllowed: false,
    priceOverlayDefault: false,
    titlePattern: '{ticker} Operating Margin ({minYear}-{maxYear})',
    subtitlePattern: 'Annual operating margin percentage',
    defaultColors: {
      operating_margin: '#4a5a3a',
    },
  },
  {
    id: 'revenue_growth_vs_price',
    label: 'Revenue Growth vs Stock Price',
    description:
      'Bar chart of revenue with stock price overlaid — connects fundamentals to market valuation.',
    whenToUse:
      'Use when exploring whether the stock price tracks fundamental growth or has diverged.',
    metrics: ['revenue'],
    maxMetrics: 1,
    chartType: 'bar',
    yearRange: { kind: 'last_n_years', n: 7 },
    periodType: 'annual',
    priceOverlayAllowed: true,
    priceOverlayDefault: true,
    titlePattern: '{ticker} Revenue vs Stock Price ({minYear}-{maxYear})',
    subtitlePattern: 'Revenue (bars) with closing price overlay (line)',
    defaultColors: {
      revenue: '#5a6b4a',
    },
  },
]

/** Lookup a template by ID. Returns undefined if not found. */
export function getEditorialTemplate(
  id: string,
): EditorialChartTemplate | undefined {
  return EDITORIAL_TEMPLATES.find((t) => t.id === id)
}

/** All template IDs, useful for validation / autocomplete. */
export const EDITORIAL_TEMPLATE_IDS = EDITORIAL_TEMPLATES.map((t) => t.id)
