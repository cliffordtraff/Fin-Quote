const SPEC_TO_CHARTING_METRIC_ALIASES: Record<string, string> = {
  net_income: 'netIncome',
  gross_profit: 'grossProfit',
  operating_income: 'operatingIncome',
  total_assets: 'totalAssets',
  total_liabilities: 'totalLiabilities',
  shareholders_equity: 'shareholdersEquity',
  operating_cash_flow: 'operatingCashFlow',
  stock_based_comp: 'stockBasedCompensation',
  rnd_expense: 'researchAndDevelopmentExpenses',
  stock_buybacks: 'commonStockRepurchased',
  debt_to_equity_ratio: 'debtEquityRatio',
  ps_ratio: 'priceSalesRatio',
  ev_ebitda: 'enterpriseValueMultiple',
  fcf_yield: 'freeCashFlowYield',
  stock_price: 'stockPrice',
}

const CHARTING_TO_SPEC_METRIC_ALIASES: Record<string, string> = {
  netIncome: 'net_income',
  grossProfit: 'gross_profit',
  operatingIncome: 'operating_income',
  totalAssets: 'total_assets',
  totalLiabilities: 'total_liabilities',
  totalShareholdersEquity: 'shareholders_equity',
  shareholdersEquity: 'shareholders_equity',
  operatingCashFlow: 'operating_cash_flow',
  freeCashFlow: 'free_cash_flow',
  capitalExpenditure: 'capital_expenditure',
  dividendsPaid: 'dividends_paid',
  commonStockRepurchased: 'stock_buybacks',
  sharesOutstanding: 'shares_outstanding',
  numberOfShares: 'shares_outstanding',
  depreciationAmortization: 'depreciation_amortization',
  depreciationAndAmortization: 'depreciation_amortization',
  stockBasedCompensation: 'stock_based_comp',
  researchAndDevelopmentExpenses: 'rnd_expense',
  debtEquityRatio: 'debt_to_equity_ratio',
  priceSalesRatio: 'ps_ratio',
  enterpriseValueMultiple: 'ev_ebitda',
  freeCashFlowYield: 'fcf_yield',
  stockPrice: 'stock_price',
}

const SPEC_METRIC_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  gross_profit: 'Gross Profit',
  net_income: 'Net Income',
  operating_income: 'Operating Income',
  eps: 'EPS',
  ebitda: 'EBITDA',
  depreciation_amortization: 'Depreciation & Amortization',
  stock_based_comp: 'Stock-Based Compensation',
  rnd_expense: 'R&D Expense',
  total_assets: 'Total Assets',
  total_liabilities: 'Total Liabilities',
  shareholders_equity: "Shareholders' Equity",
  operating_cash_flow: 'Operating Cash Flow',
  free_cash_flow: 'Free Cash Flow',
  capital_expenditure: 'Capital Expenditure',
  dividends_paid: 'Dividends Paid',
  stock_buybacks: 'Stock Buybacks',
  shares_outstanding: 'Shares Outstanding',
  gross_margin: 'Gross Margin',
  operating_margin: 'Operating Margin',
  net_margin: 'Net Margin',
  roe: 'ROE',
  roa: 'ROA',
  pe_ratio: 'P/E Ratio',
  pb_ratio: 'P/B Ratio',
  ps_ratio: 'P/S Ratio',
  ev_ebitda: 'EV/EBITDA',
  fcf_yield: 'FCF Yield',
  debt_to_equity_ratio: 'Debt/Equity',
  rd_pct_revenue: 'R&D % Revenue',
  stock_price: 'Stock Price',
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

function camelToSnake(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1_$2')
    .toLowerCase()
}

function titleCaseWord(value: string): string {
  if (!value) return value

  switch (value.toLowerCase()) {
    case 'eps':
    case 'ebitda':
    case 'rd':
    case 'fcf':
    case 'roe':
    case 'roa':
    case 'ev':
    case 'pe':
    case 'pb':
    case 'ps':
      return value.toUpperCase()
    default:
      return value.charAt(0).toUpperCase() + value.slice(1)
  }
}

function humanizeMetricId(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ')
}

export function toChartingMetricId(metricId: string): string {
  const trimmed = metricId.trim()
  if (!trimmed) {
    throw new Error('Chart export spec contains an empty metric id')
  }

  if (SPEC_TO_CHARTING_METRIC_ALIASES[trimmed]) {
    return SPEC_TO_CHARTING_METRIC_ALIASES[trimmed]
  }

  return trimmed.includes('_') ? snakeToCamel(trimmed) : trimmed
}

export function toSpecMetricId(metricId: string): string {
  const trimmed = metricId.trim()
  if (!trimmed) {
    throw new Error('Chart editor state contains an empty metric id')
  }

  if (CHARTING_TO_SPEC_METRIC_ALIASES[trimmed]) {
    return CHARTING_TO_SPEC_METRIC_ALIASES[trimmed]
  }

  return trimmed.includes('_') ? trimmed : camelToSnake(trimmed)
}

export function getSpecMetricLabel(metricId: string): string {
  const specMetricId = toSpecMetricId(metricId)
  return SPEC_METRIC_LABELS[specMetricId] ?? humanizeMetricId(specMetricId)
}
