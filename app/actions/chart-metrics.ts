'use server'

import { createServerClient } from '@/lib/supabase/server'
import { Financial } from '@/lib/database.types'

// Statement types for categorization
export type StatementType = 'income' | 'balance' | 'cashflow' | 'ratios' | 'stock' | 'price'

// Source table for each metric
type MetricSource = 'financials_std' | 'financial_metrics' | 'company_metrics' | 'price'

// Metric configuration with labels, units, statement type, definitions, and source
const METRIC_CONFIG = {
  // === INCOME STATEMENT (from financials_std) ===
  revenue: { label: 'Revenue', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Total income generated from sales of goods and services before any expenses are deducted.', source: 'financials_std' as MetricSource },
  gross_profit: { label: 'Gross Profit', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Revenue minus cost of goods sold. Shows profitability before operating expenses.', source: 'financials_std' as MetricSource },
  net_income: { label: 'Net Income', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Total profit after all expenses, taxes, and costs have been deducted from revenue.', source: 'financials_std' as MetricSource },
  operating_income: { label: 'Operating Income', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Profit from core business operations, excluding interest and taxes.', source: 'financials_std' as MetricSource },
  eps: { label: 'Earnings Per Share (EPS)', unit: 'number' as const, statement: 'income' as StatementType, definition: 'Net income divided by outstanding shares. Shows profit allocated to each share.', source: 'financials_std' as MetricSource },
  // Extended income metrics (from financial_metrics)
  ebitda: { label: 'EBITDA', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Earnings before interest, taxes, depreciation, and amortization. Measures operating profitability.', source: 'financial_metrics' as MetricSource, dbMetricName: 'ebitda' },
  depreciation_amortization: { label: 'Depreciation & Amortization', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Non-cash expenses for asset value reduction over time.', source: 'financial_metrics' as MetricSource, dbMetricName: 'depreciationAndAmortization' },
  stock_based_comp: { label: 'Stock-Based Compensation', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Non-cash expense from employee equity compensation including stock options and RSUs.', source: 'financial_metrics' as MetricSource, dbMetricName: 'stockBasedCompensation' },
  rnd_expense: { label: 'R&D Expense', unit: 'currency' as const, statement: 'income' as StatementType, definition: 'Research and development expenses for new products, technologies, and innovation.', source: 'financial_metrics' as MetricSource, dbMetricName: 'researchAndDevelopmentExpenses' },

  // === BALANCE SHEET (from financials_std) ===
  total_assets: { label: 'Total Assets', unit: 'currency' as const, statement: 'balance' as StatementType, definition: 'Everything the company owns, including cash, inventory, property, and investments.', source: 'financials_std' as MetricSource },
  total_liabilities: { label: 'Total Liabilities', unit: 'currency' as const, statement: 'balance' as StatementType, definition: 'All debts and obligations the company owes to others.', source: 'financials_std' as MetricSource },
  shareholders_equity: { label: "Shareholders' Equity", unit: 'currency' as const, statement: 'balance' as StatementType, definition: 'Total assets minus total liabilities. Represents the owners\' stake in the company.', source: 'financials_std' as MetricSource },

  // === CASH FLOW (from financials_std) ===
  operating_cash_flow: { label: 'Operating Cash Flow', unit: 'currency' as const, statement: 'cashflow' as StatementType, definition: 'Cash generated from normal business operations, excluding investing and financing.', source: 'financials_std' as MetricSource },
  // Extended cash flow metrics (from financial_metrics)
  free_cash_flow: { label: 'Free Cash Flow', unit: 'currency' as const, statement: 'cashflow' as StatementType, definition: 'Operating cash flow minus capital expenditures. Cash available for distribution to investors.', source: 'financial_metrics' as MetricSource, dbMetricName: 'freeCashFlow' },
  capital_expenditure: { label: 'Capital Expenditure', unit: 'currency' as const, statement: 'cashflow' as StatementType, definition: 'Cash spent on acquiring or upgrading physical assets like property, plant, and equipment.', source: 'financial_metrics' as MetricSource, dbMetricName: 'capitalExpenditure' },
  dividends_paid: { label: 'Dividends Paid', unit: 'currency' as const, statement: 'cashflow' as StatementType, definition: 'Total cash distributed to shareholders as dividends during the period.', source: 'financial_metrics' as MetricSource, dbMetricName: 'dividendsPaid' },
  stock_buybacks: { label: 'Stock Buybacks', unit: 'currency' as const, statement: 'cashflow' as StatementType, definition: 'Cash used to repurchase company shares, returning capital to shareholders.', source: 'financial_metrics' as MetricSource, dbMetricName: 'commonStockRepurchased' },
  shares_outstanding: { label: 'Shares Outstanding', unit: 'shares' as const, statement: 'cashflow' as StatementType, definition: 'Total number of shares outstanding.', source: 'financial_metrics' as MetricSource, dbMetricName: 'numberOfShares' },

  // === RATIOS (calculated or from financial_metrics) ===
  gross_margin: { label: 'Gross Margin', unit: 'percent' as const, statement: 'ratios' as StatementType, definition: 'Gross profit as a percentage of revenue. Measures production efficiency.', source: 'financials_std' as MetricSource },
  operating_margin: { label: 'Operating Margin', unit: 'percent' as const, statement: 'ratios' as StatementType, definition: 'Operating income as a percentage of revenue. Shows operational efficiency.', source: 'financials_std' as MetricSource },
  net_margin: { label: 'Net Margin', unit: 'percent' as const, statement: 'ratios' as StatementType, definition: 'Net income as a percentage of revenue. Measures overall profitability.', source: 'financials_std' as MetricSource },
  roe: { label: 'Return on Equity (ROE)', unit: 'percent' as const, statement: 'ratios' as StatementType, definition: 'Net income divided by shareholders\' equity. Shows return on shareholder investment.', source: 'financials_std' as MetricSource },
  roa: { label: 'Return on Assets (ROA)', unit: 'percent' as const, statement: 'ratios' as StatementType, definition: 'Net income divided by total assets. Measures how efficiently assets generate profit.', source: 'financials_std' as MetricSource },
  pe_ratio: { label: 'P/E Ratio', unit: 'number' as const, statement: 'ratios' as StatementType, definition: 'Stock price divided by earnings per share. Shows how much investors pay per dollar of earnings.', source: 'financial_metrics' as MetricSource, dbMetricName: 'peRatio' },
  // Valuation ratios (from financial_metrics)
  pb_ratio: { label: 'P/B Ratio', unit: 'number' as const, statement: 'ratios' as StatementType, definition: 'Stock price divided by book value per share. Shows if stock is cheap or expensive relative to net assets.', source: 'financial_metrics' as MetricSource, dbMetricName: 'pbRatio' },
  ps_ratio: { label: 'P/S Ratio', unit: 'number' as const, statement: 'ratios' as StatementType, definition: 'Market cap divided by revenue. Useful for valuing companies with no earnings.', source: 'financial_metrics' as MetricSource, dbMetricName: 'priceSalesRatio' },
  ev_ebitda: { label: 'EV/EBITDA', unit: 'number' as const, statement: 'ratios' as StatementType, definition: 'Enterprise value divided by EBITDA. A capital structure-neutral valuation metric preferred by analysts.', source: 'financial_metrics' as MetricSource, dbMetricName: 'enterpriseValueMultiple' },
  fcf_yield: { label: 'FCF Yield', unit: 'percent' as const, statement: 'ratios' as StatementType, definition: 'Free cash flow per share divided by stock price. Shows cash return on investment.', source: 'financial_metrics' as MetricSource, dbMetricName: 'freeCashFlowYield', valueTransform: 100 },

  // === AAPL STOCK SPECIFIC - Product Segments (from company_metrics) ===
  segment_iphone: { label: 'iPhone Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from iPhone sales including all iPhone models.', source: 'company_metrics' as MetricSource, stock: 'AAPL', dimensionType: 'product', dimensionValue: 'iPhone' },
  segment_services: { label: 'Services Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from services including App Store, Apple Music, iCloud, Apple TV+, and AppleCare.', source: 'company_metrics' as MetricSource, stock: 'AAPL', dimensionType: 'product', dimensionValue: 'Services' },
  segment_wearables: { label: 'Wearables Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from Wearables, Home and Accessories including Apple Watch, AirPods, and HomePod.', source: 'company_metrics' as MetricSource, stock: 'AAPL', dimensionType: 'product', dimensionValue: 'Wearables, Home and Accessories' },
  segment_mac: { label: 'Mac Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from Mac computers including MacBook, iMac, Mac Pro, and Mac mini.', source: 'company_metrics' as MetricSource, stock: 'AAPL', dimensionType: 'product', dimensionValue: 'Mac' },
  segment_ipad: { label: 'iPad Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from iPad tablets including all iPad models.', source: 'company_metrics' as MetricSource, stock: 'AAPL', dimensionType: 'product', dimensionValue: 'iPad' },

  // === AAPL STOCK SPECIFIC - Geographic Segments (from company_metrics) ===
  segment_americas: { label: 'Americas Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from North and South America including the United States.', source: 'company_metrics' as MetricSource, stock: 'AAPL', dimensionType: 'geographic', dimensionValue: 'Americas' },
  segment_europe: { label: 'Europe Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from Europe, India, the Middle East, and Africa.', source: 'company_metrics' as MetricSource, stock: 'AAPL', dimensionType: 'geographic', dimensionValue: 'Europe' },
  segment_china: { label: 'Greater China Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from mainland China, Hong Kong, and Taiwan.', source: 'company_metrics' as MetricSource, stock: 'AAPL', dimensionType: 'geographic', dimensionValue: 'Greater China' },
  segment_japan: { label: 'Japan Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from Japan.', source: 'company_metrics' as MetricSource, stock: 'AAPL', dimensionType: 'geographic', dimensionValue: 'Japan' },
  segment_asia_pacific: { label: 'Rest of Asia Pacific Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from Australia, South Korea, and other Asia Pacific countries.', source: 'company_metrics' as MetricSource, stock: 'AAPL', dimensionType: 'geographic', dimensionValue: 'Rest of Asia Pacific' },

  // === AAPL STOCK SPECIFIC - Operating Income by Region (from company_metrics) ===
  opex_americas: { label: 'Americas Operating Income', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Operating income from North and South America.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'segment_operating_income', dimensionType: 'geographic', dimensionValue: 'Americas' },
  opex_europe: { label: 'Europe Operating Income', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Operating income from Europe, India, the Middle East, and Africa.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'segment_operating_income', dimensionType: 'geographic', dimensionValue: 'Europe' },
  opex_china: { label: 'Greater China Operating Income', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Operating income from mainland China, Hong Kong, and Taiwan.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'segment_operating_income', dimensionType: 'geographic', dimensionValue: 'Greater China' },
  opex_japan: { label: 'Japan Operating Income', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Operating income from Japan.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'segment_operating_income', dimensionType: 'geographic', dimensionValue: 'Japan' },
  opex_asia_pacific: { label: 'Rest of Asia Pacific Operating Income', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Operating income from Australia, South Korea, and other Asia Pacific countries.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'segment_operating_income', dimensionType: 'geographic', dimensionValue: 'Rest of Asia Pacific' },

  // === AAPL STOCK SPECIFIC - Cost of Sales (from company_metrics) ===
  cost_products: { label: 'Cost of Sales - Products', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Cost of sales for physical products including iPhone, Mac, iPad, and Wearables.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'cost_of_sales', dimensionType: 'product_type', dimensionValue: 'Products' },
  cost_services: { label: 'Cost of Sales - Services', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Cost of sales for services including App Store, Apple Music, iCloud, and Apple TV+.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'cost_of_sales', dimensionType: 'product_type', dimensionValue: 'Services' },

  // === AAPL STOCK SPECIFIC - Revenue by Country (from company_metrics) ===
  revenue_us: { label: 'United States Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from the United States market.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'revenue_by_country', dimensionType: 'country', dimensionValue: 'United States' },
  revenue_china_country: { label: 'China Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from China (country-level, including Hong Kong).', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'revenue_by_country', dimensionType: 'country', dimensionValue: 'China' },
  revenue_other_countries: { label: 'Other Countries Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from all countries outside the United States and China.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'revenue_by_country', dimensionType: 'country', dimensionValue: 'Other Countries' },

  // === AAPL STOCK SPECIFIC - Long-Lived Assets by Country (from company_metrics) ===
  assets_us: { label: 'US Long-Lived Assets', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Property, plant, and equipment located in the United States.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'long_lived_assets', dimensionType: 'country', dimensionValue: 'United States' },
  assets_china: { label: 'China Long-Lived Assets', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Property, plant, and equipment located in China.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'long_lived_assets', dimensionType: 'country', dimensionValue: 'China' },
  assets_other: { label: 'Other Countries Long-Lived Assets', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Property, plant, and equipment located in other countries.', source: 'company_metrics' as MetricSource, stock: 'AAPL', metricName: 'long_lived_assets', dimensionType: 'country', dimensionValue: 'Other Countries' },

  // === GOOGL SEGMENTS - Business Segments (from company_metrics) ===
  googl_segment_services: { label: 'Google Services Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from Google Services including Search, YouTube, Android, Chrome, Maps, Play, and Devices.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'product', dimensionValue: 'Google Services' },
  googl_segment_cloud: { label: 'Google Cloud Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from Google Cloud Platform (GCP) and Google Workspace.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'product', dimensionValue: 'Google Cloud' },
  googl_segment_other_bets: { label: 'Other Bets Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from Other Bets including Waymo, Verily, Wing, and other ventures.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'product', dimensionValue: 'Other Bets' },

  // === GOOGL SEGMENTS - Product/Service Breakdown (from company_metrics) ===
  googl_search: { label: 'Google Search Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from Google Search and other Google-owned properties.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'product', dimensionValue: 'Google Search & Other' },
  googl_youtube: { label: 'YouTube Advertising Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from YouTube advertising including video ads and YouTube TV.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'product', dimensionValue: 'YouTube Advertising' },
  googl_network: { label: 'Google Network Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from Google Network including AdSense and AdMob on partner sites.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'product', dimensionValue: 'Google Network' },
  googl_subscriptions: { label: 'Subscriptions & Platforms Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Revenue from subscriptions, platforms, and devices including YouTube Premium, Google Play, and Pixel devices.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'product', dimensionValue: 'Subscriptions, Platforms & Devices' },
  googl_advertising_total: { label: 'Google Advertising (Total)', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Total advertising revenue from Google Search, YouTube, and Google Network combined.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'product', dimensionValue: 'Google Advertising (Total)' },

  // === GOOGL SEGMENTS - Geographic (from company_metrics) ===
  googl_geo_us: { label: 'GOOGL US Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Google/Alphabet revenue from the United States.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'geographic', dimensionValue: 'United States' },
  googl_geo_emea: { label: 'GOOGL EMEA Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Google/Alphabet revenue from Europe, Middle East, and Africa.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'geographic', dimensionValue: 'EMEA' },
  googl_geo_apac: { label: 'GOOGL Asia Pacific Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Google/Alphabet revenue from Asia Pacific region.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'geographic', dimensionValue: 'Asia Pacific' },
  googl_geo_other_americas: { label: 'GOOGL Other Americas Revenue', unit: 'currency' as const, statement: 'stock' as StatementType, definition: 'Google/Alphabet revenue from Americas excluding the United States.', source: 'company_metrics' as MetricSource, stock: 'GOOGL', dimensionType: 'geographic', dimensionValue: 'Other Americas' },

  // === PRICE (special handling - fetched from FMP API) ===
  stock_price: { label: 'Stock Price', unit: 'price' as const, statement: 'price' as StatementType, definition: 'Closing stock price at the fiscal period end date. Aligned to the same fiscal periods as financial metrics.', source: 'price' as MetricSource },
} as const

// Ratio metrics that need to be calculated
const CALCULATED_RATIOS: Record<string, (row: ChartFinancialRow) => number> = {
  gross_margin: (row) => row.revenue ? ((row.gross_profit ?? 0) / row.revenue) * 100 : 0,
  operating_margin: (row) => row.revenue ? ((row.operating_income ?? 0) / row.revenue) * 100 : 0,
  net_margin: (row) => row.revenue ? ((row.net_income ?? 0) / row.revenue) * 100 : 0,
  roe: (row) => row.shareholders_equity ? ((row.net_income ?? 0) / row.shareholders_equity) * 100 : 0,
  roa: (row) => row.total_assets ? ((row.net_income ?? 0) / row.total_assets) * 100 : 0,
}

export type MetricId = keyof typeof METRIC_CONFIG

export type PeriodType = 'annual' | 'quarterly'

export type MetricDataPoint = {
  year: number
  value: number
  fiscal_quarter?: number | null
  fiscal_label?: string | null
  date?: string | null  // period_end_date for price matching
}

export type MetricData = {
  metric: MetricId
  label: string
  unit: 'currency' | 'number' | 'percent' | 'shares' | 'price'
  data: MetricDataPoint[]
}

// Type for financial row data used in charts
type ChartFinancialRow = Pick<Financial, 'year' | 'revenue' | 'gross_profit' | 'net_income' | 'operating_income' | 'total_assets' | 'total_liabilities' | 'shareholders_equity' | 'operating_cash_flow' | 'eps'> & {
  fiscal_quarter?: number | null
  fiscal_label?: string | null
  period_end_date?: string | null
}

// Validate that requested metrics are in the whitelist
function validateMetrics(metrics: string[]): metrics is MetricId[] {
  const validMetrics = Object.keys(METRIC_CONFIG)
  return metrics.every((m) => validMetrics.includes(m))
}

// Check if a metric is a calculated ratio
function isCalculatedRatio(metricId: string): boolean {
  return metricId in CALCULATED_RATIOS
}

// Helper to check if a metric comes from financial_metrics table
function isExtendedMetric(metricId: string): boolean {
  const config = METRIC_CONFIG[metricId as MetricId]
  return config?.source === 'financial_metrics'
}

// Helper to check if a metric comes from company_metrics table (segments)
function isSegmentMetric(metricId: string): boolean {
  const config = METRIC_CONFIG[metricId as MetricId]
  return config?.source === 'company_metrics'
}

// Get segment dimension info for company_metrics
function getSegmentDimension(metricId: string): { dimensionType: string; dimensionValue: string; metricName: string } | undefined {
  const config = METRIC_CONFIG[metricId as MetricId] as { dimensionType?: string; dimensionValue?: string; metricName?: string }
  if (config?.dimensionType && config?.dimensionValue) {
    return {
      dimensionType: config.dimensionType,
      dimensionValue: config.dimensionValue,
      metricName: config.metricName ?? 'segment_revenue' // Default to segment_revenue for backward compatibility
    }
  }
  return undefined
}

// Get the database metric name for extended metrics
function getDbMetricName(metricId: string): string | undefined {
  const config = METRIC_CONFIG[metricId as MetricId] as { dbMetricName?: string }
  return config?.dbMetricName
}

// Get value transform multiplier (e.g., 100 to convert decimal to percent)
function getValueTransform(metricId: string): number {
  const config = METRIC_CONFIG[metricId as MetricId] as { valueTransform?: number }
  return config?.valueTransform ?? 1
}

export async function getMultipleMetrics(params: {
  symbol?: string  // Stock symbol (default: AAPL)
  metrics: string[]
  limit?: number
  minYear?: number
  maxYear?: number
  period?: PeriodType
}): Promise<{
  data: MetricData[] | null
  error: string | null
  yearBounds?: { min: number; max: number }
}> {
  // Deduplicate metrics
  const metrics = [...new Set(params.metrics)]
  const symbol = params.symbol ?? 'AAPL'
  const period = params.period ?? 'annual'
  const hasCustomRange = typeof params.minYear === 'number' || typeof params.maxYear === 'number'
  // Default limit: 12 quarters or 10 years; max limit: 40 quarters or 20 years
  const defaultLimit = period === 'quarterly' ? 12 : 10
  const maxLimit = period === 'quarterly' ? 40 : 20
  const limit = hasCustomRange ? undefined : Math.min(Math.max(params.limit ?? defaultLimit, 1), maxLimit)

  // Validate metrics
  if (!metrics || metrics.length === 0) {
    return { data: null, error: 'No metrics specified' }
  }

  if (!validateMetrics(metrics)) {
    return { data: null, error: 'Invalid metric specified' }
  }

  if (typeof params.minYear === 'number' && typeof params.maxYear === 'number' && params.minYear > params.maxYear) {
    return { data: null, error: 'Invalid year range' }
  }

  // Separate metrics by source
  const stdMetrics = metrics.filter((m) => !isExtendedMetric(m) && !isSegmentMetric(m))
  const extendedMetrics = metrics.filter((m) => isExtendedMetric(m))
  const segmentMetrics = metrics.filter((m) => isSegmentMetric(m))

  try {
    const supabase = await createServerClient()

    // Fetch from financials_std if needed (for std metrics, extended metrics, or as year reference)
    let stdRows: ChartFinancialRow[] = []
    let years: number[] = []

    if (stdMetrics.length > 0 || extendedMetrics.length > 0) {
      // Fetch std data for year reference and standard metrics
      let query = supabase
        .from('financials_std')
        .select('year, revenue, gross_profit, net_income, operating_income, total_assets, total_liabilities, shareholders_equity, operating_cash_flow, eps, fiscal_quarter, fiscal_label, period_end_date')
        .eq('symbol', symbol)
        .eq('period_type', period)
        .order('year', { ascending: false })
        .order('fiscal_quarter', { ascending: false, nullsFirst: false })

      if (typeof params.minYear === 'number') {
        query = query.gte('year', params.minYear)
      }
      if (typeof params.maxYear === 'number') {
        query = query.lte('year', params.maxYear)
      }
      if (limit) {
        query = query.limit(limit)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching metrics:', error)
        return { data: null, error: error.message }
      }

      stdRows = (data ?? []) as ChartFinancialRow[]
      // Sort by year ascending for chart display (and by quarter for quarterly data)
      stdRows = [...stdRows].sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year
        // For quarterly data, sort by fiscal quarter
        return (a.fiscal_quarter ?? 0) - (b.fiscal_quarter ?? 0)
      })
      // Deduplicate rows by year+quarter combination (in case of data issues)
      const seenKeys = new Set<string>()
      stdRows = stdRows.filter((row) => {
        const key = `${row.year}-${row.fiscal_quarter ?? 'FY'}`
        if (seenKeys.has(key)) return false
        seenKeys.add(key)
        return true
      })
      years = stdRows.map((row) => row.year)
    }

    // For segment-only queries, get years from company_metrics
    if (segmentMetrics.length > 0 && years.length === 0) {
      let yearQuery = supabase
        .from('company_metrics')
        .select('year')
        .eq('symbol', symbol)
        .eq('metric_name', 'segment_revenue')
        .order('year', { ascending: true })

      if (typeof params.minYear === 'number') {
        yearQuery = yearQuery.gte('year', params.minYear)
      }
      if (typeof params.maxYear === 'number') {
        yearQuery = yearQuery.lte('year', params.maxYear)
      }

      const { data: yearData } = await yearQuery
      if (yearData) {
        years = [...new Set(yearData.map((r) => r.year))].sort((a, b) => a - b)
      }
    }

    if (years.length === 0 && stdRows.length === 0) {
      return { data: null, error: 'No data found' }
    }

    const sortedStdData = stdRows

    // Fetch extended metrics from financial_metrics if needed
    // For quarterly: key -> "year-quarter" -> value
    // For annual: key -> "year" -> value
    const extendedMetricData: Record<string, Record<string, number>> = {}
    if (extendedMetrics.length > 0) {
      const dbMetricNames = extendedMetrics.map((m) => getDbMetricName(m)).filter(Boolean) as string[]

      if (dbMetricNames.length > 0) {
        // Determine which periods to fetch based on periodType
        const periodsToFetch = period === 'annual' ? ['FY'] : ['Q1', 'Q2', 'Q3', 'Q4']

        let extQuery = supabase
          .from('financial_metrics')
          .select('year, period, metric_name, metric_value')
          .eq('symbol', symbol)
          .in('metric_name', dbMetricNames)
          .in('period', periodsToFetch)

        // Apply year filters
        if (typeof params.minYear === 'number') {
          extQuery = extQuery.gte('year', params.minYear)
        }
        if (typeof params.maxYear === 'number') {
          extQuery = extQuery.lte('year', params.maxYear)
        }

        const { data: extData, error: extError } = await extQuery

        if (extError) {
          console.error('Error fetching extended metrics:', extError)
        } else if (extData) {
          // Organize extended metric data by metric name and year(-quarter)
          for (const row of extData) {
            if (!extendedMetricData[row.metric_name]) {
              extendedMetricData[row.metric_name] = {}
            }
            // Use year-quarter key for quarterly, just year for annual
            const key = period === 'quarterly' && row.period ? `${row.year}-${row.period}` : String(row.year)
            extendedMetricData[row.metric_name][key] = row.metric_value ?? 0
          }
        }
      }
    }

    // Fetch segment metrics from company_metrics if needed
    // For quarterly: key -> "year-quarter" -> value
    // For annual: key -> "year" -> value
    type SegmentDataRow = { year: number; period: string; metric_name: string; dimension_type: string; dimension_value: string; metric_value: number }
    const segmentMetricData: Record<string, Record<string, number>> = {}
    let segmentRows: SegmentDataRow[] = []

    if (segmentMetrics.length > 0) {
      // Build list of dimension queries needed, including metric name
      const dimensionQueries = segmentMetrics
        .map((m) => getSegmentDimension(m))
        .filter(Boolean) as { dimensionType: string; dimensionValue: string; metricName: string }[]

      if (dimensionQueries.length > 0) {
        // Get unique metric names we need to fetch
        const metricNames = [...new Set(dimensionQueries.map((d) => d.metricName))]

        // Determine which periods to fetch based on periodType
        const periodsToFetch = period === 'annual' ? ['FY'] : ['Q1', 'Q2', 'Q3', 'Q4']

        // Build segment query with period filter
        let segQuery = supabase
          .from('company_metrics')
          .select('year, period, metric_name, dimension_type, dimension_value, metric_value')
          .eq('symbol', symbol as never)
          .in('metric_name', metricNames as never)
          .in('period', periodsToFetch as never)
          .order('year', { ascending: true })
          .order('period', { ascending: true })

        // Apply year filters
        if (typeof params.minYear === 'number') {
          segQuery = segQuery.gte('year', params.minYear)
        }
        if (typeof params.maxYear === 'number') {
          segQuery = segQuery.lte('year', params.maxYear)
        }

        const { data: segData, error: segError } = await segQuery

        if (segError) {
          console.error('Error fetching segment metrics:', segError)
        } else if (segData) {
          segmentRows = segData as unknown as SegmentDataRow[]

          // Organize segment metric data by metric+dimension key and year(-quarter)
          for (const row of segmentRows) {
            const key = `${row.metric_name}:${row.dimension_type}:${row.dimension_value}`
            if (!segmentMetricData[key]) {
              segmentMetricData[key] = {}
            }
            // For quarterly, use year-quarter as key; for annual, just year
            const dataKey = period === 'quarterly' ? `${row.year}-${row.period}` : `${row.year}`
            segmentMetricData[key][dataKey] = row.metric_value ?? 0
          }
        }
      }
    }

    // For segment-only queries, derive years from segment data (if no std data available)
    let segmentYears: number[] = years
    if (segmentMetrics.length > 0 && years.length === 0 && segmentRows.length > 0) {
      segmentYears = [...new Set(segmentRows.map(r => r.year))].sort((a, b) => a - b)
    }

    // Build result for all metrics
    const result: MetricData[] = metrics.map((metricId) => {
      const config = METRIC_CONFIG[metricId as MetricId]

      if (isSegmentMetric(metricId)) {
        // Get data from company_metrics
        const dimension = getSegmentDimension(metricId)
        const key = dimension ? `${dimension.metricName}:${dimension.dimensionType}:${dimension.dimensionValue}` : ''
        const metricYearData = segmentMetricData[key] ?? {}

        // Build data points based on period type
        let dataPoints: MetricDataPoint[]
        if (period === 'quarterly') {
          // For quarterly, we need to build data points for each year-quarter combination
          const quarters: Array<{ q: number; period: string; label: string }> = [
            { q: 1, period: 'Q1', label: 'Q1' },
            { q: 2, period: 'Q2', label: 'Q2' },
            { q: 3, period: 'Q3', label: 'Q3' },
            { q: 4, period: 'Q4', label: 'Q4' },
          ]
          dataPoints = []
          for (const year of segmentYears) {
            for (const { q, period: periodStr, label } of quarters) {
              const dataKey = `${year}-${periodStr}`
              const value = metricYearData[dataKey]
              // Only include quarters that have data
              if (value !== undefined) {
                dataPoints.push({
                  year,
                  value,
                  fiscal_quarter: q,
                  fiscal_label: `FY${year} ${label}`,
                })
              }
            }
          }
        } else {
          // For annual, use year as key
          dataPoints = segmentYears.map((year) => ({
            year,
            value: metricYearData[`${year}`] ?? 0,
          }))
        }

        return {
          metric: metricId as MetricId,
          label: config.label,
          unit: config.unit,
          data: dataPoints,
        }
      } else if (isExtendedMetric(metricId)) {
        // Get data from financial_metrics
        const dbName = getDbMetricName(metricId)
        const metricYearData = dbName ? extendedMetricData[dbName] ?? {} : {}
        const transform = getValueTransform(metricId)

        return {
          metric: metricId as MetricId,
          label: config.label,
          unit: config.unit,
          data: sortedStdData.map((row) => {
            // Build the key: "year-Q#" for quarterly, "year" for annual
            const key = period === 'quarterly' && row.fiscal_quarter
              ? `${row.year}-Q${row.fiscal_quarter}`
              : String(row.year)
            return {
              year: row.year,
              value: (metricYearData[key] ?? 0) * transform,
              fiscal_quarter: row.fiscal_quarter,
              fiscal_label: row.fiscal_label,
              date: row.period_end_date,
            }
          }),
        }
      } else {
        // Get data from financials_std
        return {
          metric: metricId as MetricId,
          label: config.label,
          unit: config.unit,
          data: sortedStdData.map((row) => ({
            year: row.year,
            value: isCalculatedRatio(metricId)
              ? CALCULATED_RATIOS[metricId](row)
              : (row[metricId as keyof ChartFinancialRow] as number | null) ?? 0,
            fiscal_quarter: row.fiscal_quarter,
            fiscal_label: row.fiscal_label,
            date: row.period_end_date,
          })),
        }
      }
    })

    // Get year bounds - use segment data bounds if only segment metrics requested
    let yearBounds: { min: number; max: number } | undefined

    if (segmentMetrics.length > 0 && stdMetrics.length === 0 && extendedMetrics.length === 0) {
      // Only segment metrics - get bounds from company_metrics filtered by period
      const periodsForBounds = period === 'annual' ? ['FY'] : ['Q1', 'Q2', 'Q3', 'Q4']
      const { data: boundsData, error: boundsError } = await supabase
        .from('company_metrics')
        .select('year')
        .eq('symbol', symbol as never)
        .eq('metric_name', 'segment_revenue' as never)
        .in('period', periodsForBounds as never)
        .order('year', { ascending: true })

      if (!boundsError && boundsData && boundsData.length > 0) {
        const uniqueYears = [...new Set((boundsData as unknown as { year: number }[]).map((r) => r.year))].sort((a, b) => a - b)
        yearBounds = {
          min: uniqueYears[0],
          max: uniqueYears[uniqueYears.length - 1],
        }
      }
    } else {
      // Standard/extended metrics - get bounds from financials_std filtered by period
      const { data: boundsData, error: boundsError } = await supabase
        .from('financials_std')
        .select('year')
        .eq('symbol', symbol)
        .eq('period_type', period)
        .order('year', { ascending: true })

      if (!boundsError && boundsData && boundsData.length > 0) {
        const uniqueYears = [...new Set(boundsData.map((r) => r.year))].sort((a, b) => a - b)
        yearBounds = {
          min: uniqueYears[0],
          max: uniqueYears[uniqueYears.length - 1],
        }
      }

      if (boundsError) {
        console.error('Error fetching year bounds:', boundsError)
      }
    }

    return { data: result, error: null, yearBounds }
  } catch (err) {
    console.error('Unexpected error in getMultipleMetrics:', err)
    return {
      data: null,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    }
  }
}

// Export metric config for use in other components
export async function getMetricConfig() {
  return METRIC_CONFIG
}

// Segment category type for dropdown organization
export type SegmentCategory = 'product' | 'geographic' | 'operating_income' | 'cost_of_sales' | 'revenue_by_country' | 'long_lived_assets'

// Map dimensionType + metricName to segment category for UI grouping
function getSegmentCategory(metricId: string): SegmentCategory | undefined {
  const config = METRIC_CONFIG[metricId as MetricId] as { dimensionType?: string; metricName?: string }
  if (!config?.dimensionType) return undefined

  // Original segment revenue metrics
  if (config.dimensionType === 'product' && !config.metricName) return 'product'
  if (config.dimensionType === 'geographic' && !config.metricName) return 'geographic'

  // New metrics by their metricName
  if (config.metricName === 'segment_operating_income') return 'operating_income'
  if (config.metricName === 'cost_of_sales') return 'cost_of_sales'
  if (config.metricName === 'revenue_by_country') return 'revenue_by_country'
  if (config.metricName === 'long_lived_assets') return 'long_lived_assets'

  return undefined
}

// Get stock symbol for a metric (only segment metrics have this)
function getMetricStock(metricId: string): string | undefined {
  const config = METRIC_CONFIG[metricId as MetricId] as { stock?: string }
  return config?.stock
}

export async function getAvailableMetrics() {
  return Object.entries(METRIC_CONFIG).map(([id, config]) => {
    return {
      id: id as MetricId,
      label: config.label,
      unit: config.unit,
      statement: config.statement,
      definition: config.definition,
      segmentCategory: getSegmentCategory(id),
      stock: getMetricStock(id),
    }
  })
}
