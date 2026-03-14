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
      revenue: '#3d4a30',
      net_income: '#b8c4a0',
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
    chartType: 'bar',
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
  {
    id: 'eps_trend',
    label: 'EPS Trend',
    description:
      'Line chart of earnings per share over time — tracks per-share profitability.',
    whenToUse:
      'Use when the story is about earnings growth, dilution, or per-share value creation.',
    metrics: ['eps'],
    maxMetrics: 1,
    chartType: 'line',
    yearRange: { kind: 'last_n_years', n: 10 },
    periodType: 'annual',
    priceOverlayAllowed: true,
    priceOverlayDefault: false,
    titlePattern: '{ticker} Earnings Per Share ({minYear}-{maxYear})',
    subtitlePattern: 'Annual diluted EPS in USD',
    defaultColors: {
      eps: '#3d4a30',
    },
  },
  {
    id: 'debt_to_equity',
    label: 'Debt-to-Equity Ratio',
    description:
      'Bar chart of debt-to-equity ratio — reveals how leveraged the balance sheet is.',
    whenToUse:
      'Use when discussing financial risk, leverage, or whether a company is overleveraged relative to its equity.',
    metrics: ['debt_to_equity_ratio'],
    maxMetrics: 1,
    chartType: 'bar',
    yearRange: { kind: 'last_n_years', n: 10 },
    periodType: 'annual',
    priceOverlayAllowed: false,
    priceOverlayDefault: false,
    titlePattern: '{ticker} Debt-to-Equity Ratio ({minYear}-{maxYear})',
    subtitlePattern: 'Annual total liabilities / shareholders\' equity',
    defaultColors: {
      debt_to_equity_ratio: '#6b4a3d',
    },
  },
  {
    id: 'rd_as_pct_of_revenue',
    label: 'R&D as % of Revenue',
    description:
      'Area chart showing research & development spending as a percentage of revenue.',
    whenToUse:
      'Use when discussing innovation investment, tech companies reinvesting in growth, or comparing R&D intensity.',
    metrics: ['rd_pct_revenue'],
    maxMetrics: 1,
    chartType: 'area',
    yearRange: { kind: 'last_n_years', n: 10 },
    periodType: 'annual',
    priceOverlayAllowed: false,
    priceOverlayDefault: false,
    titlePattern: '{ticker} R&D as % of Revenue ({minYear}-{maxYear})',
    subtitlePattern: 'Annual R&D expenditure as a percentage of total revenue',
    defaultColors: {
      rd_pct_revenue: '#4a5a6b',
    },
  },
  {
    id: 'revenue_vs_operating_income',
    label: 'Revenue vs Operating Income',
    description:
      'Side-by-side bar chart comparing revenue with operating income — shows core business profitability before interest and taxes.',
    whenToUse:
      'Use when telling an operational efficiency story — how much of the top line survives operating costs.',
    metrics: ['revenue', 'operating_income'],
    maxMetrics: 2,
    chartType: 'bar',
    yearRange: { kind: 'last_n_years', n: 7 },
    periodType: 'annual',
    priceOverlayAllowed: true,
    priceOverlayDefault: false,
    titlePattern: '{ticker} Revenue vs Operating Income ({minYear}-{maxYear})',
    subtitlePattern: 'Annual figures in USD',
    defaultColors: {
      revenue: '#3d4a30',
      operating_income: '#a0b88c',
    },
  },
  {
    id: 'gross_vs_operating_margin',
    label: 'Gross vs Operating Margin',
    description:
      'Dual-line chart comparing gross margin and operating margin — reveals how much margin is consumed by operating expenses (SG&A, R&D).',
    whenToUse:
      'Use when the gap between gross and operating margin is widening or narrowing — shows whether operating cost discipline is improving or deteriorating. Especially useful for turnaround stories or companies with high R&D spend.',
    metrics: ['gross_margin', 'operating_margin'],
    maxMetrics: 2,
    chartType: 'line',
    yearRange: { kind: 'last_n_years', n: 10 },
    periodType: 'annual',
    priceOverlayAllowed: false,
    priceOverlayDefault: false,
    titlePattern: '{ticker} Gross vs Operating Margin ({minYear}-{maxYear})',
    subtitlePattern: 'Annual margin percentages — the gap reveals operating cost structure',
    defaultColors: {
      gross_margin: '#5a6b4a',
      operating_margin: '#b8c4a0',
    },
  },
  {
    id: 'net_income_vs_free_cash_flow',
    label: 'Net Income vs Free Cash Flow',
    description:
      'Bar chart comparing reported net income with free cash flow — shows earnings quality and cash conversion.',
    whenToUse:
      'Use when net income and free cash flow diverge significantly — indicates heavy capex, working capital issues, or high-quality cash earnings. Great for capital-intensive companies or those with questionable earnings quality.',
    metrics: ['net_income', 'free_cash_flow'],
    maxMetrics: 2,
    chartType: 'bar',
    yearRange: { kind: 'last_n_years', n: 7 },
    periodType: 'annual',
    priceOverlayAllowed: true,
    priceOverlayDefault: false,
    titlePattern: '{ticker} Net Income vs Free Cash Flow ({minYear}-{maxYear})',
    subtitlePattern: 'Annual figures in USD — divergence reveals earnings quality',
    defaultColors: {
      net_income: '#3d4a30',
      free_cash_flow: '#a0b88c',
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
