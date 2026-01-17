'use client'

import { useState } from 'react'

type StatementType = 'income' | 'balance' | 'cashflow'

interface IncomeStatementData {
  year: number
  revenue: number | null
  costOfRevenue: number | null
  grossProfit: number | null
  grossMargin: number | null
  operatingExpenses: number | null
  operatingIncome: number | null
  operatingMargin: number | null
  netIncome: number | null
  netMargin: number | null
  eps: number | null
  // Additional metrics
  ebitda: number | null
  stockBasedCompensation: number | null
  peRatio: number | null
  priceToSalesRatio: number | null
  sharesOutstanding: number | null
  marketCap: number | null
}

interface BalanceSheetData {
  year: number
  // Assets
  cashAndShortTermInvestments: number | null
  shortTermReceivables: number | null
  inventories: number | null
  otherCurrentAssets: number | null
  totalCurrentAssets: number | null
  netPropertyPlantEquipment: number | null
  totalInvestmentsAndAdvances: number | null
  longTermNoteReceivable: number | null
  intangibleAssets: number | null
  deferredTaxAssets: number | null
  otherAssets: number | null
  totalAssets: number | null
  // Liabilities
  shortTermDebt: number | null
  accountsPayable: number | null
  incomeTaxPayable: number | null
  otherCurrentLiabilities: number | null
  totalCurrentLiabilities: number | null
  longTermDebt: number | null
  provisionForRisksCharges: number | null
  deferredTaxLiabilities: number | null
  otherLiabilities: number | null
  totalLiabilities: number | null
  // Equity
  nonEquityReserves: number | null
  preferredStock: number | null
  commonEquity: number | null
  totalShareholdersEquity: number | null
  accumulatedMinorityInterest: number | null
  totalEquity: number | null
  totalLiabilitiesAndEquity: number | null
  // Per Share & Ratios
  bookValuePerShare: number | null
  tangibleBookValuePerShare: number | null
  fullTimeEmployees: number | null
  priceToBookRatio: number | null
  returnOnAssets: number | null
  returnOnEquity: number | null
  returnOnInvestedCapital: number | null
  quickRatio: number | null
  currentRatio: number | null
}

interface CashFlowData {
  year: number
  // Operating Activities
  netIncome: number | null
  depreciation: number | null
  otherFundsNonCash: number | null
  fundsFromOperations: number | null
  extraordinaryItem: number | null
  changesInWorkingCapital: number | null
  incomeTaxesPayable: number | null
  cashFromOperatingActivities: number | null
  // Investing Activities
  capitalExpenditures: number | null
  netAssetsFromAcquisitions: number | null
  saleOfFixedAssetsAndBusinesses: number | null
  purchaseOrSaleOfInvestments: number | null
  purchaseOfInvestments: number | null
  saleOrMaturityOfInvestments: number | null
  otherUses: number | null
  otherSources: number | null
  cashFromInvestingActivities: number | null
  // Financing Activities
  cashDividendsPaid: number | null
  changeInCapitalStock: number | null
  repurchaseOfCommonPrefStock: number | null
  saleOfCommonPrefStock: number | null
  proceedsFromStockOptions: number | null
  issuanceOrReductionOfDebtNet: number | null
  changeInLongTermDebt: number | null
  issuanceOfLongTermDebt: number | null
  reductionOfLongTermDebt: number | null
  netFinancingActiveOtherCashFlow: number | null
  otherFinancingActivitiesUses: number | null
  cashFromFinancingActivities: number | null
  // Summary
  exchangeRateEffect: number | null
  netChangeInCash: number | null
  freeCashFlow: number | null
  preferredDividends: number | null
  priceToFreeCashFlow: number | null
}

interface FinancialStatementsTabsProps {
  incomeStatement: IncomeStatementData[]
  balanceSheet: BalanceSheetData[]
  cashFlow: CashFlowData[]
}

export default function FinancialStatementsTabs({
  incomeStatement,
  balanceSheet,
  cashFlow,
}: FinancialStatementsTabsProps) {
  const [activeTab, setActiveTab] = useState<StatementType>('income')

  // Get unique years
  const years = [...new Set(incomeStatement.map(f => f.year))].sort((a, b) => b - a)

  // Format helpers
  const formatCurrency = (value: number | null): string => {
    if (value === null || value === undefined || value === 0) return 'N/A'
    const absValue = Math.abs(value)
    if (absValue >= 1e12) return `$${(value / 1e12).toFixed(2)}T`
    if (absValue >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
    if (absValue >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
    if (absValue >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
    return `$${value.toFixed(2)}`
  }

  const formatPercentage = (value: number | null): string => {
    if (value === null || value === undefined) return 'N/A'
    return `${value.toFixed(2)}%`
  }

  const formatRatio = (value: number | null): string => {
    if (value === null || value === undefined || value === 0) return 'N/A'
    return value.toFixed(2)
  }

  const formatEps = (value: number | null): string => {
    if (value === null || value === undefined) return 'N/A'
    return `$${value.toFixed(2)}`
  }

  const formatShares = (value: number | null): string => {
    if (value === null || value === undefined || value === 0) return 'N/A'
    const absValue = Math.abs(value)
    if (absValue >= 1e9) return `${(value / 1e9).toFixed(2)}B`
    if (absValue >= 1e6) return `${(value / 1e6).toFixed(2)}M`
    if (absValue >= 1e3) return `${(value / 1e3).toFixed(2)}K`
    return value.toFixed(0)
  }

  const formatNumber = (value: number | null): string => {
    if (value === null || value === undefined || value === 0) return 'N/A'
    return value.toLocaleString()
  }

  // Define rows for each statement type
  const incomeRows = [
    { label: 'Revenue', key: 'revenue', format: 'currency' },
    { label: 'Cost of Revenue', key: 'costOfRevenue', format: 'currency' },
    { label: 'Gross Profit', key: 'grossProfit', format: 'currency' },
    { label: 'Gross Margin', key: 'grossMargin', format: 'percentage' },
    { label: 'Operating Expenses', key: 'operatingExpenses', format: 'currency' },
    { label: 'Operating Income', key: 'operatingIncome', format: 'currency' },
    { label: 'Operating Margin', key: 'operatingMargin', format: 'percentage' },
    { label: 'Net Income', key: 'netIncome', format: 'currency' },
    { label: 'Net Margin', key: 'netMargin', format: 'percentage' },
    { label: 'EPS (Basic)', key: 'eps', format: 'eps' },
    { label: 'EBITDA', key: 'ebitda', format: 'currency' },
    { label: 'Stock Option Compensation Expense', key: 'stockBasedCompensation', format: 'currency' },
    { label: 'Price To Earnings Ratio', key: 'peRatio', format: 'ratio' },
    { label: 'Price To Sales Ratio', key: 'priceToSalesRatio', format: 'ratio' },
    { label: 'Shares Outstanding', key: 'sharesOutstanding', format: 'shares' },
    { label: 'Market Capitalization', key: 'marketCap', format: 'currency' },
  ]

  const balanceRows = [
    // Assets
    { label: 'Cash & Short Term Investments', key: 'cashAndShortTermInvestments', format: 'currency' },
    { label: 'Short Term Receivables', key: 'shortTermReceivables', format: 'currency' },
    { label: 'Inventories', key: 'inventories', format: 'currency' },
    { label: 'Other Current Assets', key: 'otherCurrentAssets', format: 'currency' },
    { label: 'Total Current Assets', key: 'totalCurrentAssets', format: 'currency' },
    { label: 'Net Property, Plant & Equipment', key: 'netPropertyPlantEquipment', format: 'currency' },
    { label: 'Total Investments and Advances', key: 'totalInvestmentsAndAdvances', format: 'currency' },
    { label: 'Long-Term Note Receivable', key: 'longTermNoteReceivable', format: 'currency' },
    { label: 'Intangible Assets', key: 'intangibleAssets', format: 'currency' },
    { label: 'Deferred Tax Assets', key: 'deferredTaxAssets', format: 'currency' },
    { label: 'Other Assets', key: 'otherAssets', format: 'currency' },
    { label: 'Total Assets', key: 'totalAssets', format: 'currency' },
    // Liabilities
    { label: 'Short Term Debt Incl. Current Port. of LT Debt', key: 'shortTermDebt', format: 'currency' },
    { label: 'Accounts Payable', key: 'accountsPayable', format: 'currency' },
    { label: 'Income Tax Payable', key: 'incomeTaxPayable', format: 'currency' },
    { label: 'Other Current Liabilities', key: 'otherCurrentLiabilities', format: 'currency' },
    { label: 'Total Current Liabilities', key: 'totalCurrentLiabilities', format: 'currency' },
    { label: 'Long Term Debt', key: 'longTermDebt', format: 'currency' },
    { label: 'Provision for Risks Charges', key: 'provisionForRisksCharges', format: 'currency' },
    { label: 'Deferred Tax Liabilities', key: 'deferredTaxLiabilities', format: 'currency' },
    { label: 'Other Liabilities', key: 'otherLiabilities', format: 'currency' },
    { label: 'Total Liabilities', key: 'totalLiabilities', format: 'currency' },
    // Equity
    { label: 'Non-Equity Reserves', key: 'nonEquityReserves', format: 'currency' },
    { label: 'Preferred Stock - Carrying Value', key: 'preferredStock', format: 'currency' },
    { label: 'Common Equity', key: 'commonEquity', format: 'currency' },
    { label: 'Total Shareholders Equity', key: 'totalShareholdersEquity', format: 'currency' },
    { label: 'Accumulated Minority Interest', key: 'accumulatedMinorityInterest', format: 'currency' },
    { label: 'Total Equity', key: 'totalEquity', format: 'currency' },
    { label: 'Total Liabilities & Stockholders Equity', key: 'totalLiabilitiesAndEquity', format: 'currency' },
    // Per Share & Ratios
    { label: 'Book Value Per Share', key: 'bookValuePerShare', format: 'eps' },
    { label: 'Tangible Book Value Per Share', key: 'tangibleBookValuePerShare', format: 'eps' },
    { label: 'Full-Time Employees', key: 'fullTimeEmployees', format: 'number' },
    { label: 'Price to Book Ratio', key: 'priceToBookRatio', format: 'ratio' },
    { label: 'Return on Assets', key: 'returnOnAssets', format: 'percentage' },
    { label: 'Return on Equity', key: 'returnOnEquity', format: 'percentage' },
    { label: 'Return on Invested Capital', key: 'returnOnInvestedCapital', format: 'percentage' },
    { label: 'Quick Ratio', key: 'quickRatio', format: 'ratio' },
    { label: 'Current Ratio', key: 'currentRatio', format: 'ratio' },
  ]

  const cashFlowRows = [
    // Operating Activities
    { label: 'Net Income', key: 'netIncome', format: 'currency' },
    { label: 'Depreciation', key: 'depreciation', format: 'currency' },
    { label: 'Other Funds (Non Cash)', key: 'otherFundsNonCash', format: 'currency' },
    { label: 'Funds from Operations', key: 'fundsFromOperations', format: 'currency' },
    { label: 'Extraordinary Item', key: 'extraordinaryItem', format: 'currency' },
    { label: 'Changes in Working Capital', key: 'changesInWorkingCapital', format: 'currency' },
    { label: 'Income Taxes Payable', key: 'incomeTaxesPayable', format: 'currency' },
    { label: 'Cash from Operating Activities', key: 'cashFromOperatingActivities', format: 'currency' },
    // Investing Activities
    { label: 'Capital Expenditures', key: 'capitalExpenditures', format: 'currency' },
    { label: 'Net Assets From Acquisitions', key: 'netAssetsFromAcquisitions', format: 'currency' },
    { label: 'Sale of Fixed Assets and Businesses', key: 'saleOfFixedAssetsAndBusinesses', format: 'currency' },
    { label: 'Purchase or Sale of Investments', key: 'purchaseOrSaleOfInvestments', format: 'currency' },
    { label: 'Purchase of Investments', key: 'purchaseOfInvestments', format: 'currency' },
    { label: 'Sale Or Maturity of Investments', key: 'saleOrMaturityOfInvestments', format: 'currency' },
    { label: 'Other Uses', key: 'otherUses', format: 'currency' },
    { label: 'Other Sources', key: 'otherSources', format: 'currency' },
    { label: 'Cash from Investing Activities', key: 'cashFromInvestingActivities', format: 'currency' },
    // Financing Activities
    { label: 'Cash Dividends Paid', key: 'cashDividendsPaid', format: 'currency' },
    { label: 'Change in Capital Stock', key: 'changeInCapitalStock', format: 'currency' },
    { label: 'Repurchase of Common Pref Stock', key: 'repurchaseOfCommonPrefStock', format: 'currency' },
    { label: 'Sale of Common Pref Stock', key: 'saleOfCommonPrefStock', format: 'currency' },
    { label: 'Proceeds from Stock Options', key: 'proceedsFromStockOptions', format: 'currency' },
    { label: 'Issuance or Reduction of Debt, Net', key: 'issuanceOrReductionOfDebtNet', format: 'currency' },
    { label: 'Change in Long Term Debt', key: 'changeInLongTermDebt', format: 'currency' },
    { label: 'Issuance of Long Term Debt', key: 'issuanceOfLongTermDebt', format: 'currency' },
    { label: 'Reduction of Long Term Debt', key: 'reductionOfLongTermDebt', format: 'currency' },
    { label: 'Net Financing Active Other Cash Flow', key: 'netFinancingActiveOtherCashFlow', format: 'currency' },
    { label: 'Other Financing Activities Uses', key: 'otherFinancingActivitiesUses', format: 'currency' },
    { label: 'Cash from Financing Activities', key: 'cashFromFinancingActivities', format: 'currency' },
    // Summary
    { label: 'Exchange Rate Effect', key: 'exchangeRateEffect', format: 'currency' },
    { label: 'Net Change in Cash', key: 'netChangeInCash', format: 'currency' },
    { label: 'Free Cash Flow', key: 'freeCashFlow', format: 'currency' },
    { label: 'Preferred Dividends (Cash Flow)', key: 'preferredDividends', format: 'currency' },
    { label: 'Price to Free Cash Flow', key: 'priceToFreeCashFlow', format: 'ratio' },
  ]

  const getRows = () => {
    switch (activeTab) {
      case 'income':
        return incomeRows
      case 'balance':
        return balanceRows
      case 'cashflow':
        return cashFlowRows
    }
  }

  const getData = () => {
    switch (activeTab) {
      case 'income':
        return incomeStatement
      case 'balance':
        return balanceSheet
      case 'cashflow':
        return cashFlow
    }
  }

  const formatValue = (value: number | null, format: string): string => {
    switch (format) {
      case 'currency':
        return formatCurrency(value)
      case 'percentage':
        return formatPercentage(value)
      case 'ratio':
        return formatRatio(value)
      case 'eps':
        return formatEps(value)
      case 'shares':
        return formatShares(value)
      case 'number':
        return formatNumber(value)
      default:
        return String(value ?? 'N/A')
    }
  }

  const rows = getRows()
  const data = getData()

  const tabs = [
    { id: 'income' as StatementType, label: 'Income Statement' },
    { id: 'balance' as StatementType, label: 'Balance Sheet' },
    { id: 'cashflow' as StatementType, label: 'Cash Flow' },
  ]

  if (years.length === 0) return null

  return (
    <div>
      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
        <nav className="flex space-x-4" aria-label="Financial Statements">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Metric
              </th>
              {years.map(year => (
                <th key={year} className="px-2 py-1.5 text-right text-[11px] font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  FY {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-[rgb(45,45,45)]">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="whitespace-nowrap px-2 py-1 text-xs font-medium text-gray-900 dark:text-gray-100">
                  {row.label}
                </td>
                {years.map(year => {
                  const yearData = data.find(d => d.year === year)
                  const value = yearData ? (yearData as any)[row.key] : null
                  return (
                    <td key={year} className="whitespace-nowrap px-2 py-1 text-xs text-right text-gray-900 dark:text-gray-100">
                      {formatValue(value, row.format)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
