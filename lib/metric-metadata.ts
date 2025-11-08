/**
 * Metric Metadata - Manually Curated Descriptions and Aliases
 *
 * This file contains human-readable descriptions and common aliases for all financial metrics.
 * It's the ONLY manually-maintained file for metric metadata.
 *
 * Update this file when:
 * - New metrics are added to the database
 * - Better descriptions are needed
 * - New aliases are discovered from user queries (check metric_resolutions table)
 */

export interface MetricMetadata {
  description: string
  unit: 'ratio' | 'percentage' | 'currency' | 'number' | 'days'
  commonAliases: string[]
}

/**
 * Comprehensive metadata for all 50 financial metrics
 * Organized alphabetically by metric name
 */
export const METRIC_METADATA: Record<string, MetricMetadata> = {
  // A
  addTotalDebt: {
    description: 'Additional Total Debt - New debt added during the period',
    unit: 'currency',
    commonAliases: ['new debt', 'additional debt', 'debt added']
  },

  assetGrowth: {
    description: 'Asset Growth Rate - Year-over-year percentage growth in total assets',
    unit: 'percentage',
    commonAliases: ['asset growth rate', 'growth in assets', 'total asset growth']
  },

  assetTurnover: {
    description: 'Asset Turnover Ratio - Revenue generated per dollar of assets',
    unit: 'ratio',
    commonAliases: ['asset turnover ratio', 'total asset turnover', 'asset efficiency']
  },

  averageInventory: {
    description: 'Average Inventory - Average inventory value during the period',
    unit: 'currency',
    commonAliases: ['avg inventory', 'mean inventory']
  },

  averagePayables: {
    description: 'Average Accounts Payable - Average payables during the period',
    unit: 'currency',
    commonAliases: ['avg payables', 'mean payables', 'average AP']
  },

  averageReceivables: {
    description: 'Average Accounts Receivable - Average receivables during the period',
    unit: 'currency',
    commonAliases: ['avg receivables', 'mean receivables', 'average AR']
  },

  // B
  bookValuePerShare: {
    description: 'Book Value Per Share - Net asset value per share of common stock',
    unit: 'currency',
    commonAliases: ['BVPS', 'book value per share', 'equity per share', 'net asset value per share']
  },

  bookValueperShareGrowth: {
    description: 'Book Value Per Share Growth - Year-over-year growth in book value per share',
    unit: 'percentage',
    commonAliases: ['BVPS growth', 'book value growth']
  },

  // C
  capexPerShare: {
    description: 'Capital Expenditure Per Share - Capital spending per share',
    unit: 'currency',
    commonAliases: ['capex per share', 'capital spending per share']
  },

  capexToDepreciation: {
    description: 'Capex to Depreciation Ratio - Capital expenditure relative to depreciation',
    unit: 'ratio',
    commonAliases: ['capex depreciation ratio', 'replacement ratio']
  },

  capexToOperatingCashFlow: {
    description: 'Capex to Operating Cash Flow Ratio - Capital expenditure as percentage of operating cash flow',
    unit: 'ratio',
    commonAliases: ['capex to OCF', 'capital intensity']
  },

  capexToRevenue: {
    description: 'Capex to Revenue Ratio - Capital expenditure as percentage of revenue',
    unit: 'ratio',
    commonAliases: ['capex to sales', 'capital expenditure ratio']
  },

  capitalExpenditureCoverageRatio: {
    description: 'Capital Expenditure Coverage Ratio - Ability to fund capital expenditures from cash flow',
    unit: 'ratio',
    commonAliases: ['capex coverage', 'capital expenditure coverage']
  },

  cashConversionCycle: {
    description: 'Cash Conversion Cycle - Days to convert inventory and receivables into cash',
    unit: 'days',
    commonAliases: ['CCC', 'cash cycle', 'operating cycle']
  },

  cashFlowCoverageRatios: {
    description: 'Cash Flow Coverage Ratios - Ability to cover obligations with cash flow',
    unit: 'ratio',
    commonAliases: ['cash flow coverage', 'CF coverage']
  },

  cashFlowToDebtRatio: {
    description: 'Cash Flow to Debt Ratio - Operating cash flow relative to total debt',
    unit: 'ratio',
    commonAliases: ['cash flow to debt', 'CF to debt', 'debt coverage ratio']
  },

  cashPerShare: {
    description: 'Cash Per Share - Cash and equivalents per share of common stock',
    unit: 'currency',
    commonAliases: ['cash per share', 'CPS']
  },

  cashRatio: {
    description: 'Cash Ratio - Cash and equivalents divided by current liabilities',
    unit: 'ratio',
    commonAliases: ['cash ratio', 'liquidity ratio']
  },

  companyEquityMultiplier: {
    description: 'Equity Multiplier - Total assets divided by shareholders equity',
    unit: 'ratio',
    commonAliases: ['equity multiplier', 'leverage multiplier']
  },

  currentRatio: {
    description: 'Current Ratio - Current assets divided by current liabilities',
    unit: 'ratio',
    commonAliases: ['current ratio', 'working capital ratio']
  },

  // D
  daysOfInventoryOnHand: {
    description: 'Days Inventory On Hand - Average number of days inventory is held',
    unit: 'days',
    commonAliases: ['days inventory', 'DIO', 'inventory days']
  },

  daysOfPayablesOutstanding: {
    description: 'Days Payables Outstanding - Average days to pay suppliers',
    unit: 'days',
    commonAliases: ['DPO', 'payables days', 'days payable']
  },

  daysOfSalesOutstanding: {
    description: 'Days Sales Outstanding - Average days to collect receivables',
    unit: 'days',
    commonAliases: ['DSO', 'receivables days', 'collection period']
  },

  debtEquityRatio: {
    description: 'Debt-to-Equity Ratio - Total liabilities divided by shareholders equity',
    unit: 'ratio',
    commonAliases: ['D/E', 'debt to equity', 'debt-to-equity', 'leverage ratio', 'gearing ratio']
  },

  debtGrowth: {
    description: 'Debt Growth Rate - Year-over-year percentage growth in total debt',
    unit: 'percentage',
    commonAliases: ['debt growth rate', 'growth in debt']
  },

  debtRatio: {
    description: 'Debt Ratio - Total debt divided by total assets',
    unit: 'ratio',
    commonAliases: ['debt ratio', 'total debt ratio', 'debt to assets']
  },

  dividendPaidAndCapexCoverageRatio: {
    description: 'Dividend and Capex Coverage Ratio - Cash flow coverage of dividends and capital expenditures',
    unit: 'ratio',
    commonAliases: ['dividend and capex coverage', 'total distribution coverage']
  },

  dividendPayoutRatio: {
    description: 'Dividend Payout Ratio - Percentage of earnings paid as dividends',
    unit: 'percentage',
    commonAliases: ['payout ratio', 'dividend payout']
  },

  dividendsperShareGrowth: {
    description: 'Dividends Per Share Growth - Year-over-year growth in dividends per share',
    unit: 'percentage',
    commonAliases: ['DPS growth', 'dividend growth', 'dividend per share growth']
  },

  dividendYield: {
    description: 'Dividend Yield - Annual dividend as percentage of stock price',
    unit: 'percentage',
    commonAliases: ['dividend yield', 'yield']
  },

  // E
  earningsYield: {
    description: 'Earnings Yield - Earnings per share divided by stock price (inverse of P/E)',
    unit: 'percentage',
    commonAliases: ['earnings yield', 'E/P ratio', 'inverse P/E']
  },

  ebitgrowth: {
    description: 'EBIT Growth - Year-over-year growth in earnings before interest and taxes',
    unit: 'percentage',
    commonAliases: ['EBIT growth', 'operating income growth']
  },

  ebitPerRevenue: {
    description: 'EBIT Margin - Earnings before interest and taxes as percentage of revenue (operating margin before non-operating items)',
    unit: 'percentage',
    commonAliases: ['EBIT margin', 'operating margin', 'EBIT to revenue', 'operating profit margin']
  },

  ebitda: {
    description: 'EBITDA - Earnings before interest, taxes, depreciation, and amortization',
    unit: 'currency',
    commonAliases: ['EBITDA', 'earnings before interest taxes depreciation amortization']
  },

  ebitdaMargin: {
    description: 'EBITDA Margin - EBITDA as percentage of revenue, measuring operating profitability before non-cash charges',
    unit: 'percentage',
    commonAliases: ['EBITDA margin', 'EBITDA to revenue', 'EBITDA ratio']
  },

  depreciationAndAmortization: {
    description: 'Depreciation and Amortization - Non-cash expenses for asset value reduction over time',
    unit: 'currency',
    commonAliases: ['D&A', 'depreciation and amortization', 'amortization and depreciation']
  },

  ebtPerEbit: {
    description: 'EBT to EBIT Ratio - Earnings before tax divided by EBIT',
    unit: 'ratio',
    commonAliases: ['EBT to EBIT', 'interest burden']
  },

  effectiveTaxRate: {
    description: 'Effective Tax Rate - Actual tax rate paid on earnings',
    unit: 'percentage',
    commonAliases: ['tax rate', 'effective tax rate', 'ETR']
  },

  enterpriseValue: {
    description: 'Enterprise Value - Market cap plus debt minus cash',
    unit: 'currency',
    commonAliases: ['EV', 'enterprise value', 'firm value']
  },

  enterpriseValueMultiple: {
    description: 'Enterprise Value Multiple - EV divided by EBITDA',
    unit: 'ratio',
    commonAliases: ['EV multiple', 'EV/EBITDA']
  },

  epsdilutedGrowth: {
    description: 'Diluted EPS Growth - Year-over-year growth in diluted earnings per share',
    unit: 'percentage',
    commonAliases: ['diluted EPS growth', 'earnings growth']
  },

  epsgrowth: {
    description: 'EPS Growth - Year-over-year growth in earnings per share',
    unit: 'percentage',
    commonAliases: ['EPS growth', 'earnings per share growth', 'earnings growth rate']
  },

  evToFreeCashFlow: {
    description: 'EV to Free Cash Flow - Enterprise value divided by free cash flow',
    unit: 'ratio',
    commonAliases: ['EV/FCF', 'EV to FCF', 'enterprise value to free cash flow']
  },

  evToOperatingCashFlow: {
    description: 'EV to Operating Cash Flow - Enterprise value divided by operating cash flow',
    unit: 'ratio',
    commonAliases: ['EV/OCF', 'EV to OCF']
  },

  evToSales: {
    description: 'EV to Sales Ratio - Enterprise value divided by revenue',
    unit: 'ratio',
    commonAliases: ['EV/Sales', 'EV to revenue', 'price to sales']
  },

  // F
  fiveYDividendperShareGrowthPerShare: {
    description: 'Five Year Dividend Per Share Growth - Compound annual growth rate of dividends over 5 years',
    unit: 'percentage',
    commonAliases: ['5Y dividend growth', '5 year DPS growth', 'dividend CAGR']
  },

  fiveYNetIncomeGrowthPerShare: {
    description: 'Five Year Net Income Growth Per Share - Compound annual growth rate of net income per share over 5 years',
    unit: 'percentage',
    commonAliases: ['5Y net income growth', '5 year earnings growth', 'earnings CAGR']
  },

  fiveYOperatingCFGrowthPerShare: {
    description: 'Five Year Operating Cash Flow Growth Per Share - Compound annual growth rate of operating cash flow per share over 5 years',
    unit: 'percentage',
    commonAliases: ['5Y OCF growth', '5 year cash flow growth', 'OCF CAGR']
  },

  fiveYRevenueGrowthPerShare: {
    description: 'Five Year Revenue Growth Per Share - Compound annual growth rate of revenue per share over 5 years',
    unit: 'percentage',
    commonAliases: ['5Y revenue growth', '5 year sales growth', 'revenue CAGR']
  },

  fiveYShareholdersEquityGrowthPerShare: {
    description: 'Five Year Shareholders Equity Growth Per Share - Compound annual growth rate of equity per share over 5 years',
    unit: 'percentage',
    commonAliases: ['5Y equity growth', '5 year book value growth', 'equity CAGR']
  },

  fixedAssetTurnover: {
    description: 'Fixed Asset Turnover Ratio - Revenue generated per dollar of fixed assets',
    unit: 'ratio',
    commonAliases: ['fixed asset turnover', 'FAT ratio', 'PP&E turnover']
  },

  freeCashFlow: {
    description: 'Free Cash Flow - Operating cash flow minus capital expenditures, representing cash available for distribution to investors',
    unit: 'currency',
    commonAliases: ['FCF', 'free cash flow', 'free cash', 'unlevered free cash flow', 'unlevered FCF']
  },

  freeCashFlowGrowth: {
    description: 'Free Cash Flow Growth - Year-over-year growth in free cash flow',
    unit: 'percentage',
    commonAliases: ['FCF growth', 'free cash flow growth rate']
  },

  capitalExpenditure: {
    description: 'Capital Expenditures - Cash spent on acquiring or upgrading physical assets like property, plant, and equipment',
    unit: 'currency',
    commonAliases: ['capex', 'capital spending', 'capital expenditures', 'CapEx', 'PP&E spending', 'investment in PP&E']
  },

  commonStockRepurchased: {
    description: 'Stock Repurchases - Cash used to buy back company shares, a form of capital return to shareholders',
    unit: 'currency',
    commonAliases: ['buybacks', 'share buybacks', 'stock buybacks', 'share repurchases', 'treasury stock purchases', 'stock repurchases']
  },

  dividendsPaid: {
    description: 'Dividends Paid - Total cash distributed to shareholders as dividends during the period',
    unit: 'currency',
    commonAliases: ['dividends', 'dividend payments', 'cash dividends', 'dividends paid']
  },

  stockBasedCompensation: {
    description: 'Stock-Based Compensation - Non-cash expense from employee equity compensation including stock options and restricted stock units',
    unit: 'currency',
    commonAliases: ['SBC', 'stock comp', 'equity compensation', 'stock-based comp', 'RSU expense', 'stock option expense']
  },

  freeCashFlowOperatingCashFlowRatio: {
    description: 'Free Cash Flow to Operating Cash Flow Ratio - Free cash flow as percentage of operating cash flow',
    unit: 'ratio',
    commonAliases: ['FCF to OCF', 'free cash flow ratio']
  },

  freeCashFlowPerShare: {
    description: 'Free Cash Flow Per Share - Free cash flow divided by shares outstanding',
    unit: 'currency',
    commonAliases: ['FCF per share', 'free cash flow per share']
  },

  freeCashFlowYield: {
    description: 'Free Cash Flow Yield - Free cash flow per share divided by stock price',
    unit: 'percentage',
    commonAliases: ['FCF yield', 'free cash flow yield']
  },

  // G
  grahamNetNet: {
    description: 'Graham Net-Net - Net current asset value minus total liabilities (Benjamin Graham formula)',
    unit: 'currency',
    commonAliases: ['net-net', 'Graham net net', 'NCAV']
  },

  grahamNumber: {
    description: 'Graham Number - Fair value estimate using earnings and book value (Benjamin Graham formula)',
    unit: 'currency',
    commonAliases: ['Graham number', 'Graham value']
  },

  grossProfitGrowth: {
    description: 'Gross Profit Growth - Year-over-year growth in gross profit',
    unit: 'percentage',
    commonAliases: ['gross profit growth rate']
  },

  grossProfitMargin: {
    description: 'Gross Profit Margin - Gross profit as percentage of revenue',
    unit: 'percentage',
    commonAliases: ['gross margin', 'GP margin']
  },

  // I
  incomeQuality: {
    description: 'Income Quality Ratio - Operating cash flow divided by net income',
    unit: 'ratio',
    commonAliases: ['earnings quality', 'cash flow quality']
  },

  intangiblesToTotalAssets: {
    description: 'Intangibles to Total Assets Ratio - Intangible assets as percentage of total assets',
    unit: 'ratio',
    commonAliases: ['intangible ratio', 'intangibles ratio']
  },

  interestCoverage: {
    description: 'Interest Coverage Ratio - Ability to pay interest from operating income',
    unit: 'ratio',
    commonAliases: ['interest coverage', 'times interest earned', 'TIE']
  },

  interestDebtPerShare: {
    description: 'Interest Debt Per Share - Interest-bearing debt per share',
    unit: 'currency',
    commonAliases: ['interest bearing debt per share']
  },

  inventoryGrowth: {
    description: 'Inventory Growth - Year-over-year growth in inventory',
    unit: 'percentage',
    commonAliases: ['inventory growth rate']
  },

  inventoryTurnover: {
    description: 'Inventory Turnover - Number of times inventory is sold per period',
    unit: 'ratio',
    commonAliases: ['inventory turnover ratio', 'stock turnover']
  },

  investedCapital: {
    description: 'Invested Capital - Total capital invested in the business',
    unit: 'currency',
    commonAliases: ['total invested capital', 'capital employed']
  },

  // L
  longTermDebtToCapitalization: {
    description: 'Long-Term Debt to Capitalization Ratio - Long-term debt divided by total capitalization',
    unit: 'ratio',
    commonAliases: ['long term debt to cap', 'LTD to capitalization']
  },

  // M
  marketCap: {
    description: 'Market Capitalization - Total market value of outstanding shares',
    unit: 'currency',
    commonAliases: ['market cap', 'market value', 'equity value']
  },

  marketCapitalization: {
    description: 'Market Capitalization - Total market value of outstanding shares',
    unit: 'currency',
    commonAliases: ['market cap', 'market capitalization', 'market value']
  },

  minusCashAndCashEquivalents: {
    description: 'Cash and Cash Equivalents (Negative) - Used for net debt calculations',
    unit: 'currency',
    commonAliases: ['minus cash', 'negative cash']
  },

  // N
  netCurrentAssetValue: {
    description: 'Net Current Asset Value - Current assets minus all liabilities',
    unit: 'currency',
    commonAliases: ['NCAV', 'net current assets']
  },

  netDebtToEBITDA: {
    description: 'Net Debt to EBITDA Ratio - Net debt divided by EBITDA',
    unit: 'ratio',
    commonAliases: ['net debt to EBITDA', 'net leverage ratio']
  },

  netIncomeGrowth: {
    description: 'Net Income Growth - Year-over-year growth in net income',
    unit: 'percentage',
    commonAliases: ['net income growth rate', 'earnings growth', 'profit growth']
  },

  netIncomePerEBT: {
    description: 'Net Income to EBT Ratio - Net income divided by earnings before tax (tax efficiency)',
    unit: 'ratio',
    commonAliases: ['NI to EBT', 'net income to earnings before tax', 'tax efficiency']
  },

  netIncomePerShare: {
    description: 'Net Income Per Share - Net income divided by shares outstanding (same as EPS)',
    unit: 'currency',
    commonAliases: ['earnings per share', 'EPS', 'net earnings per share']
  },

  netIncomePerWallDollarBWIC: {
    description: 'Net Income Per Wall Dollar BWIC - Profitability metric',
    unit: 'ratio',
    commonAliases: []
  },

  netProfitMargin: {
    description: 'Net Profit Margin - Net income as percentage of revenue',
    unit: 'percentage',
    commonAliases: ['net margin', 'profit margin', 'bottom line margin']
  },

  numberOfShares: {
    description: 'Number of Shares Outstanding - Total shares of stock outstanding',
    unit: 'number',
    commonAliases: ['shares outstanding', 'outstanding shares', 'share count']
  },

  // O
  operatingCashFlowGrowth: {
    description: 'Operating Cash Flow Growth - Year-over-year growth in operating cash flow',
    unit: 'percentage',
    commonAliases: ['OCF growth', 'cash flow growth']
  },

  operatingCashFlowPerShare: {
    description: 'Operating Cash Flow Per Share - Operating cash flow divided by shares outstanding',
    unit: 'currency',
    commonAliases: ['OCF per share', 'cash flow per share']
  },

  operatingCashFlowSalesRatio: {
    description: 'Operating Cash Flow to Sales Ratio - Operating cash flow as percentage of revenue',
    unit: 'ratio',
    commonAliases: ['OCF to sales', 'cash flow to revenue']
  },

  operatingCycle: {
    description: 'Operating Cycle - Days to convert inventory to cash (DIO + DSO)',
    unit: 'days',
    commonAliases: ['operating cycle days']
  },

  operatingIncomeGrowth: {
    description: 'Operating Income Growth - Year-over-year growth in operating income',
    unit: 'percentage',
    commonAliases: ['EBIT growth', 'operating profit growth']
  },

  // P
  payablesTurnover: {
    description: 'Payables Turnover Ratio - Number of times payables are paid per period',
    unit: 'ratio',
    commonAliases: ['payables turnover', 'AP turnover']
  },

  payoutRatio: {
    description: 'Payout Ratio - Percentage of earnings paid as dividends',
    unit: 'percentage',
    commonAliases: ['dividend payout ratio']
  },

  pbRatio: {
    description: 'Price-to-Book Ratio - Market price divided by book value per share',
    unit: 'ratio',
    commonAliases: ['P/B', 'price to book', 'price-to-book', 'market to book']
  },

  peRatio: {
    description: 'Price-to-Earnings Ratio - Market price divided by earnings per share',
    unit: 'ratio',
    commonAliases: ['P/E', 'PE', 'price to earnings', 'price-to-earnings', 'earnings multiple', 'PE ratio']
  },

  pegRatio: {
    description: 'PEG Ratio - P/E ratio divided by earnings growth rate',
    unit: 'ratio',
    commonAliases: ['PEG', 'price earnings to growth', 'price/earnings to growth']
  },

  pfcfRatio: {
    description: 'Price to Free Cash Flow Ratio - Market price divided by free cash flow per share',
    unit: 'ratio',
    commonAliases: ['P/FCF', 'price to FCF', 'PFCF']
  },

  pocfratio: {
    description: 'Price to Operating Cash Flow Ratio - Market price divided by operating cash flow per share',
    unit: 'ratio',
    commonAliases: ['P/OCF', 'price to OCF', 'POCF']
  },

  pretaxProfitMargin: {
    description: 'Pretax Profit Margin - Earnings before tax as percentage of revenue',
    unit: 'percentage',
    commonAliases: ['pretax margin', 'EBT margin']
  },

  priceCashFlowRatio: {
    description: 'Price to Cash Flow Ratio - Market price divided by cash flow per share',
    unit: 'ratio',
    commonAliases: ['P/CF', 'price to cash flow']
  },

  priceEarningsToGrowthRatio: {
    description: 'PEG Ratio - P/E ratio divided by earnings growth rate',
    unit: 'ratio',
    commonAliases: ['PEG', 'PEG ratio']
  },

  priceFairValue: {
    description: 'Price to Fair Value Ratio - Market price compared to intrinsic value',
    unit: 'ratio',
    commonAliases: ['price to fair value', 'P/FV']
  },

  priceSalesRatio: {
    description: 'Price-to-Sales Ratio - Market cap divided by revenue',
    unit: 'ratio',
    commonAliases: ['P/S', 'price to sales', 'price-to-sales', 'PSR']
  },

  ptbRatio: {
    description: 'Price-to-Book Ratio - Market price divided by tangible book value per share',
    unit: 'ratio',
    commonAliases: ['PTB', 'price to tangible book', 'P/TB']
  },

  // Q
  quickRatio: {
    description: 'Quick Ratio - (Current assets minus inventory) divided by current liabilities',
    unit: 'ratio',
    commonAliases: ['quick ratio', 'acid test ratio', 'acid test']
  },

  // R
  rdexpenseGrowth: {
    description: 'R&D Expense Growth - Year-over-year growth in research and development expenses',
    unit: 'percentage',
    commonAliases: ['R&D growth', 'research expense growth']
  },

  rdPerRevenue: {
    description: 'R&D to Revenue Ratio - Research and development expense as percentage of revenue',
    unit: 'percentage',
    commonAliases: ['R&D intensity', 'R&D to sales', 'research intensity']
  },

  receivablesGrowth: {
    description: 'Receivables Growth - Year-over-year growth in accounts receivable',
    unit: 'percentage',
    commonAliases: ['AR growth', 'receivables growth rate']
  },

  receivablesTurnover: {
    description: 'Receivables Turnover Ratio - Number of times receivables are collected per period',
    unit: 'ratio',
    commonAliases: ['receivables turnover', 'AR turnover']
  },

  researchAndDdevelopementToRevenue: {
    description: 'R&D to Revenue Ratio - Research and development expense as percentage of revenue',
    unit: 'percentage',
    commonAliases: ['R&D to revenue', 'R&D intensity']
  },

  returnOnAssets: {
    description: 'Return on Assets - Net income divided by total assets',
    unit: 'percentage',
    commonAliases: ['ROA', 'return on assets']
  },

  returnOnCapitalEmployed: {
    description: 'Return on Capital Employed - Operating income divided by capital employed',
    unit: 'percentage',
    commonAliases: ['ROCE', 'return on capital employed']
  },

  returnOnEquity: {
    description: 'Return on Equity - Net income divided by shareholders equity',
    unit: 'percentage',
    commonAliases: ['ROE', 'return on equity']
  },

  returnOnTangibleAssets: {
    description: 'Return on Tangible Assets - Net income divided by tangible assets',
    unit: 'percentage',
    commonAliases: ['ROTA', 'return on tangible assets']
  },

  roic: {
    description: 'Return on Invested Capital (ROIC) - Net operating profit after tax divided by invested capital',
    unit: 'percentage',
    commonAliases: ['ROIC', 'return on invested capital']
  },

  revenueGrowth: {
    description: 'Revenue Growth - Year-over-year growth in revenue',
    unit: 'percentage',
    commonAliases: ['revenue growth rate', 'sales growth', 'top line growth']
  },

  revenuePerShare: {
    description: 'Revenue Per Share - Total revenue divided by shares outstanding',
    unit: 'currency',
    commonAliases: ['RPS', 'sales per share']
  },

  // S
  salesGeneralAndAdministrativeToRevenue: {
    description: 'SG&A to Revenue Ratio - Selling, general & administrative expenses as percentage of revenue',
    unit: 'percentage',
    commonAliases: ['SG&A to revenue', 'SG&A ratio', 'SGA to revenue']
  },

  sgaexpensesGrowth: {
    description: 'SG&A Expenses Growth - Year-over-year growth in selling, general & administrative expenses',
    unit: 'percentage',
    commonAliases: ['SG&A growth', 'operating expense growth']
  },

  sgaToRevenue: {
    description: 'SG&A to Revenue Ratio - Selling, general & administrative expenses as percentage of revenue',
    unit: 'percentage',
    commonAliases: ['SG&A ratio', 'operating expense ratio']
  },

  shareholdersEquityGrowth: {
    description: 'Shareholders Equity Growth - Year-over-year growth in shareholders equity',
    unit: 'percentage',
    commonAliases: ['equity growth', 'book value growth']
  },

  shortTermCoverageRatios: {
    description: 'Short Term Coverage Ratios - Ability to cover short-term obligations',
    unit: 'ratio',
    commonAliases: ['short term coverage']
  },

  stockBasedCompensationToRevenue: {
    description: 'Stock-Based Compensation to Revenue Ratio - Stock compensation as percentage of revenue',
    unit: 'percentage',
    commonAliases: ['SBC to revenue', 'stock comp ratio']
  },

  stockPrice: {
    description: 'Stock Price - Current market price per share',
    unit: 'currency',
    commonAliases: ['share price', 'stock price', 'market price']
  },

  // T
  tangibleAssetValue: {
    description: 'Tangible Asset Value - Total assets minus intangible assets',
    unit: 'currency',
    commonAliases: ['tangible assets', 'TAV']
  },

  tangibleBookValuePerShare: {
    description: 'Tangible Book Value Per Share - Tangible equity divided by shares outstanding',
    unit: 'currency',
    commonAliases: ['tangible BVPS', 'tangible book value']
  },

  tenYDividendperShareGrowthPerShare: {
    description: 'Ten Year Dividend Per Share Growth - Compound annual growth rate of dividends over 10 years',
    unit: 'percentage',
    commonAliases: ['10Y dividend growth', '10 year DPS growth']
  },

  tenYNetIncomeGrowthPerShare: {
    description: 'Ten Year Net Income Growth Per Share - Compound annual growth rate of net income per share over 10 years',
    unit: 'percentage',
    commonAliases: ['10Y net income growth', '10 year earnings growth']
  },

  tenYOperatingCFGrowthPerShare: {
    description: 'Ten Year Operating Cash Flow Growth Per Share - Compound annual growth rate of operating cash flow per share over 10 years',
    unit: 'percentage',
    commonAliases: ['10Y OCF growth', '10 year cash flow growth']
  },

  tenYRevenueGrowthPerShare: {
    description: 'Ten Year Revenue Growth Per Share - Compound annual growth rate of revenue per share over 10 years',
    unit: 'percentage',
    commonAliases: ['10Y revenue growth', '10 year sales growth']
  },

  tenYShareholdersEquityGrowthPerShare: {
    description: 'Ten Year Shareholders Equity Growth Per Share - Compound annual growth rate of equity per share over 10 years',
    unit: 'percentage',
    commonAliases: ['10Y equity growth', '10 year book value growth']
  },

  threeYDividendperShareGrowthPerShare: {
    description: 'Three Year Dividend Per Share Growth - Compound annual growth rate of dividends over 3 years',
    unit: 'percentage',
    commonAliases: ['3Y dividend growth', '3 year DPS growth']
  },

  threeYNetIncomeGrowthPerShare: {
    description: 'Three Year Net Income Growth Per Share - Compound annual growth rate of net income per share over 3 years',
    unit: 'percentage',
    commonAliases: ['3Y net income growth', '3 year earnings growth']
  },

  threeYOperatingCFGrowthPerShare: {
    description: 'Three Year Operating Cash Flow Growth Per Share - Compound annual growth rate of operating cash flow per share over 3 years',
    unit: 'percentage',
    commonAliases: ['3Y OCF growth', '3 year cash flow growth']
  },

  threeYRevenueGrowthPerShare: {
    description: 'Three Year Revenue Growth Per Share - Compound annual growth rate of revenue per share over 3 years',
    unit: 'percentage',
    commonAliases: ['3Y revenue growth', '3 year sales growth']
  },

  threeYShareholdersEquityGrowthPerShare: {
    description: 'Three Year Shareholders Equity Growth Per Share - Compound annual growth rate of equity per share over 3 years',
    unit: 'percentage',
    commonAliases: ['3Y equity growth', '3 year book value growth']
  },

  totalDebtToCapitalization: {
    description: 'Total Debt to Capitalization Ratio - Total debt divided by total capitalization',
    unit: 'ratio',
    commonAliases: ['debt to cap', 'debt to capitalization']
  },

  // W
  weightedAverageSharesDilutedGrowth: {
    description: 'Weighted Average Shares Diluted Growth - Year-over-year growth in diluted shares outstanding',
    unit: 'percentage',
    commonAliases: ['diluted shares growth', 'share count growth']
  },

  weightedAverageSharesGrowth: {
    description: 'Weighted Average Shares Growth - Year-over-year growth in shares outstanding',
    unit: 'percentage',
    commonAliases: ['shares growth', 'share count growth']
  },

  workingCapital: {
    description: 'Working Capital - Current assets minus current liabilities',
    unit: 'currency',
    commonAliases: ['net working capital', 'WC']
  }
}
