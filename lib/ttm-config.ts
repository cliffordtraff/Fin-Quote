/**
 * TTM (Trailing Twelve Months) Configuration
 *
 * Defines how each metric should be calculated for TTM:
 * - 'sum': Flow metrics - sum last 4 quarters (revenue, net_income, cash flows)
 * - 'derived': Ratio metrics - recalculate from TTM components (margins, ROE, etc.)
 * - 'point_in_time': Balance sheet items - use most recent quarter value (assets, equity)
 * - 'average': Use average of last 4 quarters (for ratios based on average balances)
 * - 'not_applicable': Metrics that don't make sense as TTM (growth rates, price-based, multi-year CAGRs)
 */

export type TTMCalcType = 'sum' | 'derived' | 'point_in_time' | 'average' | 'not_applicable'

export interface TTMConfig {
  calcType: TTMCalcType
  // For derived metrics: the formula components and calculation
  derivedFrom?: {
    numerator: string | string[]  // metric name(s) to use as numerator (will be summed if array)
    denominator: string | string[] // metric name(s) to use as denominator (will be summed if array)
    operation: 'divide' | 'multiply'
    multiplier?: number  // e.g., 100 for percentages
  }
}

/**
 * Core metrics from financials_std table
 */
export const CORE_METRIC_TTM_CONFIG: Record<string, TTMConfig> = {
  // === FLOW METRICS (Sum last 4 quarters) ===
  revenue: { calcType: 'sum' },
  gross_profit: { calcType: 'sum' },
  net_income: { calcType: 'sum' },
  operating_income: { calcType: 'sum' },
  operating_cash_flow: { calcType: 'sum' },
  eps: { calcType: 'sum' },  // EPS adds up over quarters

  // === BALANCE SHEET (Point-in-time, use latest quarter) ===
  total_assets: { calcType: 'point_in_time' },
  total_liabilities: { calcType: 'point_in_time' },
  shareholders_equity: { calcType: 'point_in_time' },

  // === DERIVED METRICS (Recalculate from TTM components) ===
  gross_margin: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'gross_profit',
      denominator: 'revenue',
      operation: 'divide',
      multiplier: 100
    }
  },
  roe: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'net_income',
      denominator: 'shareholders_equity',  // Uses point-in-time (latest quarter)
      operation: 'divide',
      multiplier: 100
    }
  },
  debt_to_equity_ratio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'total_liabilities',
      denominator: 'shareholders_equity',
      operation: 'divide'
    }
  }
}

/**
 * Extended metrics from financial_metrics table
 * Organized by category for maintainability
 */
export const EXTENDED_METRIC_TTM_CONFIG: Record<string, TTMConfig> = {
  // ========================================
  // FLOW METRICS - Sum last 4 quarters
  // ========================================

  // Income Statement Flow Items
  ebitda: { calcType: 'sum' },
  freeCashFlow: { calcType: 'sum' },
  capitalExpenditure: { calcType: 'sum' },
  depreciationAndAmortization: { calcType: 'sum' },
  commonStockRepurchased: { calcType: 'sum' },
  dividendsPaid: { calcType: 'sum' },
  stockBasedCompensation: { calcType: 'sum' },
  addTotalDebt: { calcType: 'sum' },

  // ========================================
  // BALANCE SHEET - Point-in-time (latest quarter)
  // ========================================

  averageInventory: { calcType: 'point_in_time' },
  averagePayables: { calcType: 'point_in_time' },
  averageReceivables: { calcType: 'point_in_time' },
  investedCapital: { calcType: 'point_in_time' },
  workingCapital: { calcType: 'point_in_time' },
  tangibleAssetValue: { calcType: 'point_in_time' },
  netCurrentAssetValue: { calcType: 'point_in_time' },
  numberOfShares: { calcType: 'point_in_time' },
  marketCap: { calcType: 'point_in_time' },
  marketCapitalization: { calcType: 'point_in_time' },
  enterpriseValue: { calcType: 'point_in_time' },
  minusCashAndCashEquivalents: { calcType: 'point_in_time' },
  grahamNetNet: { calcType: 'point_in_time' },
  grahamNumber: { calcType: 'point_in_time' },

  // ========================================
  // DERIVED METRICS - Recalculate from components
  // ========================================

  // Profitability Margins
  grossProfitMargin: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'gross_profit',  // This would need to come from core metrics
      denominator: 'revenue',
      operation: 'divide',
      multiplier: 100
    }
  },
  netProfitMargin: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'net_income',
      denominator: 'revenue',
      operation: 'divide',
      multiplier: 100
    }
  },
  ebitdaMargin: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'ebitda',
      denominator: 'revenue',
      operation: 'divide',
      multiplier: 100
    }
  },
  ebitPerRevenue: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'operating_income',
      denominator: 'revenue',
      operation: 'divide',
      multiplier: 100
    }
  },
  pretaxProfitMargin: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'ebt',  // earnings before tax - may need to fetch separately
      denominator: 'revenue',
      operation: 'divide',
      multiplier: 100
    }
  },

  // Return Ratios
  returnOnEquity: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'net_income',
      denominator: 'shareholders_equity',
      operation: 'divide',
      multiplier: 100
    }
  },
  returnOnAssets: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'net_income',
      denominator: 'total_assets',
      operation: 'divide',
      multiplier: 100
    }
  },
  roic: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'nopat',  // net operating profit after tax
      denominator: 'investedCapital',
      operation: 'divide',
      multiplier: 100
    }
  },
  returnOnCapitalEmployed: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'operating_income',
      denominator: 'capitalEmployed',  // total assets - current liabilities
      operation: 'divide',
      multiplier: 100
    }
  },
  returnOnTangibleAssets: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'net_income',
      denominator: 'tangibleAssetValue',
      operation: 'divide',
      multiplier: 100
    }
  },

  // Leverage Ratios
  debtEquityRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'total_liabilities',
      denominator: 'shareholders_equity',
      operation: 'divide'
    }
  },
  debtRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'total_liabilities',
      denominator: 'total_assets',
      operation: 'divide'
    }
  },
  netDebtToEBITDA: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'netDebt',
      denominator: 'ebitda',
      operation: 'divide'
    }
  },
  longTermDebtToCapitalization: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'longTermDebt',
      denominator: 'totalCapitalization',
      operation: 'divide'
    }
  },
  totalDebtToCapitalization: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'totalDebt',
      denominator: 'totalCapitalization',
      operation: 'divide'
    }
  },
  companyEquityMultiplier: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'total_assets',
      denominator: 'shareholders_equity',
      operation: 'divide'
    }
  },

  // Coverage Ratios
  interestCoverage: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'operating_income',
      denominator: 'interestExpense',
      operation: 'divide'
    }
  },
  cashFlowToDebtRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'operating_cash_flow',
      denominator: 'totalDebt',
      operation: 'divide'
    }
  },
  capitalExpenditureCoverageRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'operating_cash_flow',
      denominator: 'capitalExpenditure',
      operation: 'divide'
    }
  },
  cashFlowCoverageRatios: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'operating_cash_flow',
      denominator: 'totalDebt',
      operation: 'divide'
    }
  },
  dividendPaidAndCapexCoverageRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'operating_cash_flow',
      denominator: ['dividendsPaid', 'capitalExpenditure'],
      operation: 'divide'
    }
  },

  // Liquidity Ratios
  currentRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'currentAssets',
      denominator: 'currentLiabilities',
      operation: 'divide'
    }
  },
  quickRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'quickAssets',  // current assets - inventory
      denominator: 'currentLiabilities',
      operation: 'divide'
    }
  },
  cashRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'cashAndEquivalents',
      denominator: 'currentLiabilities',
      operation: 'divide'
    }
  },

  // Efficiency Ratios
  assetTurnover: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'revenue',
      denominator: 'total_assets',
      operation: 'divide'
    }
  },
  fixedAssetTurnover: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'revenue',
      denominator: 'fixedAssets',
      operation: 'divide'
    }
  },
  inventoryTurnover: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'costOfGoodsSold',
      denominator: 'averageInventory',
      operation: 'divide'
    }
  },
  receivablesTurnover: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'revenue',
      denominator: 'averageReceivables',
      operation: 'divide'
    }
  },
  payablesTurnover: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'costOfGoodsSold',
      denominator: 'averagePayables',
      operation: 'divide'
    }
  },

  // Cash Flow Ratios
  operatingCashFlowSalesRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'operating_cash_flow',
      denominator: 'revenue',
      operation: 'divide'
    }
  },
  freeCashFlowOperatingCashFlowRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'freeCashFlow',
      denominator: 'operating_cash_flow',
      operation: 'divide'
    }
  },
  incomeQuality: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'operating_cash_flow',
      denominator: 'net_income',
      operation: 'divide'
    }
  },

  // Per-Share Metrics (derived from TTM values / shares)
  bookValuePerShare: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'shareholders_equity',
      denominator: 'numberOfShares',
      operation: 'divide'
    }
  },
  tangibleBookValuePerShare: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'tangibleAssetValue',
      denominator: 'numberOfShares',
      operation: 'divide'
    }
  },
  revenuePerShare: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'revenue',
      denominator: 'numberOfShares',
      operation: 'divide'
    }
  },
  netIncomePerShare: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'net_income',
      denominator: 'numberOfShares',
      operation: 'divide'
    }
  },
  operatingCashFlowPerShare: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'operating_cash_flow',
      denominator: 'numberOfShares',
      operation: 'divide'
    }
  },
  freeCashFlowPerShare: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'freeCashFlow',
      denominator: 'numberOfShares',
      operation: 'divide'
    }
  },
  cashPerShare: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'cashAndEquivalents',
      denominator: 'numberOfShares',
      operation: 'divide'
    }
  },
  capexPerShare: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'capitalExpenditure',
      denominator: 'numberOfShares',
      operation: 'divide'
    }
  },
  interestDebtPerShare: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'interestBearingDebt',
      denominator: 'numberOfShares',
      operation: 'divide'
    }
  },

  // Dividend Ratios
  dividendPayoutRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'dividendsPaid',
      denominator: 'net_income',
      operation: 'divide',
      multiplier: 100
    }
  },
  payoutRatio: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'dividendsPaid',
      denominator: 'net_income',
      operation: 'divide',
      multiplier: 100
    }
  },

  // Capex Ratios
  capexToDepreciation: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'capitalExpenditure',
      denominator: 'depreciationAndAmortization',
      operation: 'divide'
    }
  },
  capexToOperatingCashFlow: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'capitalExpenditure',
      denominator: 'operating_cash_flow',
      operation: 'divide'
    }
  },
  capexToRevenue: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'capitalExpenditure',
      denominator: 'revenue',
      operation: 'divide'
    }
  },

  // R&D and SG&A Ratios
  rdPerRevenue: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'researchAndDevelopment',
      denominator: 'revenue',
      operation: 'divide',
      multiplier: 100
    }
  },
  researchAndDdevelopementToRevenue: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'researchAndDevelopment',
      denominator: 'revenue',
      operation: 'divide',
      multiplier: 100
    }
  },
  sgaToRevenue: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'sgaExpenses',
      denominator: 'revenue',
      operation: 'divide',
      multiplier: 100
    }
  },
  salesGeneralAndAdministrativeToRevenue: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'sgaExpenses',
      denominator: 'revenue',
      operation: 'divide',
      multiplier: 100
    }
  },
  stockBasedCompensationToRevenue: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'stockBasedCompensation',
      denominator: 'revenue',
      operation: 'divide',
      multiplier: 100
    }
  },

  // Operating Cycle Metrics (in days - use average of 4 quarters)
  daysOfInventoryOnHand: { calcType: 'average' },
  daysOfPayablesOutstanding: { calcType: 'average' },
  daysOfSalesOutstanding: { calcType: 'average' },
  cashConversionCycle: { calcType: 'average' },
  operatingCycle: { calcType: 'average' },

  // Other Ratios
  intangiblesToTotalAssets: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'intangibleAssets',
      denominator: 'total_assets',
      operation: 'divide'
    }
  },
  effectiveTaxRate: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'incomeTaxExpense',
      denominator: 'ebt',
      operation: 'divide',
      multiplier: 100
    }
  },
  ebtPerEbit: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'ebt',
      denominator: 'operating_income',
      operation: 'divide'
    }
  },
  netIncomePerEBT: {
    calcType: 'derived',
    derivedFrom: {
      numerator: 'net_income',
      denominator: 'ebt',
      operation: 'divide'
    }
  },

  // ========================================
  // NOT APPLICABLE for TTM
  // (Growth rates, valuation ratios, price-based, multi-year CAGRs)
  // ========================================

  // Growth Rates - These are YoY comparisons, not TTM summable
  assetGrowth: { calcType: 'not_applicable' },
  debtGrowth: { calcType: 'not_applicable' },
  grossProfitGrowth: { calcType: 'not_applicable' },
  netIncomeGrowth: { calcType: 'not_applicable' },
  operatingIncomeGrowth: { calcType: 'not_applicable' },
  operatingCashFlowGrowth: { calcType: 'not_applicable' },
  freeCashFlowGrowth: { calcType: 'not_applicable' },
  revenueGrowth: { calcType: 'not_applicable' },
  epsgrowth: { calcType: 'not_applicable' },
  epsdilutedGrowth: { calcType: 'not_applicable' },
  ebitgrowth: { calcType: 'not_applicable' },
  inventoryGrowth: { calcType: 'not_applicable' },
  receivablesGrowth: { calcType: 'not_applicable' },
  rdexpenseGrowth: { calcType: 'not_applicable' },
  sgaexpensesGrowth: { calcType: 'not_applicable' },
  shareholdersEquityGrowth: { calcType: 'not_applicable' },
  bookValueperShareGrowth: { calcType: 'not_applicable' },
  dividendsperShareGrowth: { calcType: 'not_applicable' },
  weightedAverageSharesGrowth: { calcType: 'not_applicable' },
  weightedAverageSharesDilutedGrowth: { calcType: 'not_applicable' },

  // Multi-year CAGR metrics - inherently not TTM
  threeYDividendperShareGrowthPerShare: { calcType: 'not_applicable' },
  threeYNetIncomeGrowthPerShare: { calcType: 'not_applicable' },
  threeYOperatingCFGrowthPerShare: { calcType: 'not_applicable' },
  threeYRevenueGrowthPerShare: { calcType: 'not_applicable' },
  threeYShareholdersEquityGrowthPerShare: { calcType: 'not_applicable' },
  fiveYDividendperShareGrowthPerShare: { calcType: 'not_applicable' },
  fiveYNetIncomeGrowthPerShare: { calcType: 'not_applicable' },
  fiveYOperatingCFGrowthPerShare: { calcType: 'not_applicable' },
  fiveYRevenueGrowthPerShare: { calcType: 'not_applicable' },
  fiveYShareholdersEquityGrowthPerShare: { calcType: 'not_applicable' },
  tenYDividendperShareGrowthPerShare: { calcType: 'not_applicable' },
  tenYNetIncomeGrowthPerShare: { calcType: 'not_applicable' },
  tenYOperatingCFGrowthPerShare: { calcType: 'not_applicable' },
  tenYRevenueGrowthPerShare: { calcType: 'not_applicable' },
  tenYShareholdersEquityGrowthPerShare: { calcType: 'not_applicable' },

  // Price-based valuation ratios - depend on current stock price
  peRatio: { calcType: 'not_applicable' },  // P/E uses current price / TTM earnings
  pbRatio: { calcType: 'not_applicable' },
  ptbRatio: { calcType: 'not_applicable' },
  priceSalesRatio: { calcType: 'not_applicable' },
  pfcfRatio: { calcType: 'not_applicable' },
  pocfratio: { calcType: 'not_applicable' },
  priceCashFlowRatio: { calcType: 'not_applicable' },
  priceFairValue: { calcType: 'not_applicable' },
  pegRatio: { calcType: 'not_applicable' },
  priceEarningsToGrowthRatio: { calcType: 'not_applicable' },
  dividendYield: { calcType: 'not_applicable' },  // Depends on current price
  earningsYield: { calcType: 'not_applicable' },
  freeCashFlowYield: { calcType: 'not_applicable' },
  stockPrice: { calcType: 'not_applicable' },

  // EV-based ratios - depend on market values
  enterpriseValueMultiple: { calcType: 'not_applicable' },
  evToFreeCashFlow: { calcType: 'not_applicable' },
  evToOperatingCashFlow: { calcType: 'not_applicable' },
  evToSales: { calcType: 'not_applicable' },

  // Short-term coverage (context-dependent)
  shortTermCoverageRatios: { calcType: 'not_applicable' },

  // Legacy/special metrics
  netIncomePerWallDollarBWIC: { calcType: 'not_applicable' }
}

/**
 * Get TTM configuration for a metric
 * Checks both core and extended metric configs
 */
export function getTTMConfig(metricName: string): TTMConfig | null {
  // Check core metrics first
  if (metricName in CORE_METRIC_TTM_CONFIG) {
    return CORE_METRIC_TTM_CONFIG[metricName]
  }

  // Check extended metrics
  if (metricName in EXTENDED_METRIC_TTM_CONFIG) {
    return EXTENDED_METRIC_TTM_CONFIG[metricName]
  }

  return null
}

/**
 * Check if a metric supports TTM calculation
 */
export function supportsTTM(metricName: string): boolean {
  const config = getTTMConfig(metricName)
  return config !== null && config.calcType !== 'not_applicable'
}

/**
 * Get all metrics that support TTM
 */
export function getTTMSupportedMetrics(): string[] {
  const supported: string[] = []

  for (const [name, config] of Object.entries(CORE_METRIC_TTM_CONFIG)) {
    if (config.calcType !== 'not_applicable') {
      supported.push(name)
    }
  }

  for (const [name, config] of Object.entries(EXTENDED_METRIC_TTM_CONFIG)) {
    if (config.calcType !== 'not_applicable') {
      supported.push(name)
    }
  }

  return supported
}

/**
 * Get metrics by TTM calculation type
 */
export function getMetricsByTTMType(calcType: TTMCalcType): string[] {
  const metrics: string[] = []

  for (const [name, config] of Object.entries(CORE_METRIC_TTM_CONFIG)) {
    if (config.calcType === calcType) {
      metrics.push(name)
    }
  }

  for (const [name, config] of Object.entries(EXTENDED_METRIC_TTM_CONFIG)) {
    if (config.calcType === calcType) {
      metrics.push(name)
    }
  }

  return metrics
}
