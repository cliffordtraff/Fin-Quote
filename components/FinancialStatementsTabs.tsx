'use client'

import { useState } from 'react'

interface FinancialYear {
  year: number
  revenue: number
  costOfRevenue: number
  grossProfit: number
  grossMargin: number
  operatingExpenses: number
  operatingIncome: number
  operatingMargin: number
  netIncome: number
  netMargin: number
  eps: number
}

interface BalanceSheetYear {
  year: number
  totalAssets: number
  currentAssets: number
  cashAndEquivalents: number
  totalLiabilities: number
  currentLiabilities: number
  longTermDebt: number
  shareholdersEquity: number
  debtToEquity: number
  currentRatio: number
}

interface CashFlowYear {
  year: number
  operatingCashFlow: number
  investingCashFlow: number
  financingCashFlow: number
  freeCashFlow: number
  capitalExpenditures: number
}

interface FinancialStatementsTabsProps {
  incomeStatement: FinancialYear[]
  balanceSheet: BalanceSheetYear[]
  cashFlow: CashFlowYear[]
}

type TabType = 'income' | 'balance' | 'cashflow'

// Format large numbers to billions/millions
function formatCurrency(value: number): string {
  const absValue = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (absValue >= 1e9) {
    return `${sign}$${(absValue / 1e9).toFixed(1)}B`
  } else if (absValue >= 1e6) {
    return `${sign}$${(absValue / 1e6).toFixed(1)}M`
  } else {
    return `${sign}$${absValue.toFixed(2)}`
  }
}

// Format percentages
function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

// Format ratios
function formatRatio(value: number): string {
  return `${value.toFixed(2)}x`
}

export default function FinancialStatementsTabs({
  incomeStatement,
  balanceSheet,
  cashFlow,
}: FinancialStatementsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('income')

  // Sort years in ascending order for display (oldest to newest, left to right)
  const sortedIncome = [...incomeStatement].sort((a, b) => a.year - b.year)
  const sortedBalance = [...balanceSheet].sort((a, b) => a.year - b.year)
  const sortedCashFlow = [...cashFlow].sort((a, b) => a.year - b.year)

  const years = sortedIncome.map((d) => d.year)

  return (
    <div className="w-full">
      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('income')}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === 'income'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'
            }`}
          >
            Income Statement
          </button>
          <button
            onClick={() => setActiveTab('balance')}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === 'balance'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'
            }`}
          >
            Balance Sheet
          </button>
          <button
            onClick={() => setActiveTab('cashflow')}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
              activeTab === 'cashflow'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'
            }`}
          >
            Cash Flow Statement
          </button>
        </nav>
      </div>

      {/* Table Container with horizontal scroll */}
      <div className="overflow-x-auto">
        {/* Income Statement Table */}
        {activeTab === 'income' && (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr className="bg-gray-100 dark:bg-[rgb(45,45,45)]">
                <th className="sticky left-0 z-10 bg-gray-100 dark:bg-[rgb(45,45,45)] px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Metric
                </th>
                {years.map((year) => (
                  <th
                    key={year}
                    className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    {year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Revenue
                </td>
                {sortedIncome.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900 dark:text-white"
                  >
                    {formatCurrency(data.revenue)}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-[rgb(38,38,38)] hover:bg-gray-100 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-gray-50 dark:bg-[rgb(38,38,38)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Cost of Revenue
                </td>
                {sortedIncome.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900 dark:text-white"
                  >
                    {formatCurrency(data.costOfRevenue)}
                  </td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Gross Profit
                </td>
                {sortedIncome.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-white"
                  >
                    {formatCurrency(data.grossProfit)}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-[rgb(38,38,38)] hover:bg-gray-100 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-gray-50 dark:bg-[rgb(38,38,38)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Gross Margin
                </td>
                {sortedIncome.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm text-blue-600 dark:text-blue-400"
                  >
                    {formatPercent(data.grossMargin)}
                  </td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Operating Expenses
                </td>
                {sortedIncome.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900 dark:text-white"
                  >
                    {formatCurrency(data.operatingExpenses)}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-[rgb(38,38,38)] hover:bg-gray-100 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-gray-50 dark:bg-[rgb(38,38,38)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Operating Income
                </td>
                {sortedIncome.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-white"
                  >
                    {formatCurrency(data.operatingIncome)}
                  </td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Operating Margin
                </td>
                {sortedIncome.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm text-blue-600 dark:text-blue-400"
                  >
                    {formatPercent(data.operatingMargin)}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-[rgb(38,38,38)] hover:bg-gray-100 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-gray-50 dark:bg-[rgb(38,38,38)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Net Income
                </td>
                {sortedIncome.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-bold text-green-600 dark:text-green-400"
                  >
                    {formatCurrency(data.netIncome)}
                  </td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Net Margin
                </td>
                {sortedIncome.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-blue-600 dark:text-blue-400"
                  >
                    {formatPercent(data.netMargin)}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-[rgb(38,38,38)] hover:bg-gray-100 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-gray-50 dark:bg-[rgb(38,38,38)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Earnings Per Share (EPS)
                </td>
                {sortedIncome.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-gray-900 dark:text-white"
                  >
                    ${data.eps.toFixed(2)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}

        {/* Balance Sheet Table */}
        {activeTab === 'balance' && (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr className="bg-gray-100 dark:bg-[rgb(45,45,45)]">
                <th className="sticky left-0 z-10 bg-gray-100 dark:bg-[rgb(45,45,45)] px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Metric
                </th>
                {years.map((year) => (
                  <th
                    key={year}
                    className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    {year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Total Assets
                </td>
                {sortedBalance.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-bold text-gray-900 dark:text-white"
                  >
                    {formatCurrency(data.totalAssets)}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-[rgb(38,38,38)] hover:bg-gray-100 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-gray-50 dark:bg-[rgb(38,38,38)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Current Assets
                </td>
                {sortedBalance.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900 dark:text-white"
                  >
                    {formatCurrency(data.currentAssets)}
                  </td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Cash & Equivalents
                </td>
                {sortedBalance.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900 dark:text-white"
                  >
                    {formatCurrency(data.cashAndEquivalents)}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-[rgb(38,38,38)] hover:bg-gray-100 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-gray-50 dark:bg-[rgb(38,38,38)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Total Liabilities
                </td>
                {sortedBalance.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-bold text-red-600 dark:text-red-400"
                  >
                    {formatCurrency(data.totalLiabilities)}
                  </td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Current Liabilities
                </td>
                {sortedBalance.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900 dark:text-white"
                  >
                    {formatCurrency(data.currentLiabilities)}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-[rgb(38,38,38)] hover:bg-gray-100 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-gray-50 dark:bg-[rgb(38,38,38)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Long-term Debt
                </td>
                {sortedBalance.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900 dark:text-white"
                  >
                    {formatCurrency(data.longTermDebt)}
                  </td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Shareholders' Equity
                </td>
                {sortedBalance.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-bold text-green-600 dark:text-green-400"
                  >
                    {formatCurrency(data.shareholdersEquity)}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-[rgb(38,38,38)] hover:bg-gray-100 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-gray-50 dark:bg-[rgb(38,38,38)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Debt-to-Equity Ratio
                </td>
                {sortedBalance.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-blue-600 dark:text-blue-400"
                  >
                    {formatRatio(data.debtToEquity)}
                  </td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Current Ratio
                </td>
                {sortedBalance.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold text-blue-600 dark:text-blue-400"
                  >
                    {formatRatio(data.currentRatio)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}

        {/* Cash Flow Statement Table */}
        {activeTab === 'cashflow' && (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr className="bg-gray-100 dark:bg-[rgb(45,45,45)]">
                <th className="sticky left-0 z-10 bg-gray-100 dark:bg-[rgb(45,45,45)] px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Metric
                </th>
                {years.map((year) => (
                  <th
                    key={year}
                    className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    {year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Operating Cash Flow
                </td>
                {sortedCashFlow.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-bold text-green-600 dark:text-green-400"
                  >
                    {formatCurrency(data.operatingCashFlow)}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-[rgb(38,38,38)] hover:bg-gray-100 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-gray-50 dark:bg-[rgb(38,38,38)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Investing Cash Flow
                </td>
                {sortedCashFlow.map((data) => (
                  <td
                    key={data.year}
                    className={`whitespace-nowrap px-6 py-4 text-right text-sm ${
                      data.investingCashFlow < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    {formatCurrency(data.investingCashFlow)}
                  </td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Financing Cash Flow
                </td>
                {sortedCashFlow.map((data) => (
                  <td
                    key={data.year}
                    className={`whitespace-nowrap px-6 py-4 text-right text-sm ${
                      data.financingCashFlow < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    {formatCurrency(data.financingCashFlow)}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50 dark:bg-[rgb(38,38,38)] hover:bg-gray-100 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-gray-50 dark:bg-[rgb(38,38,38)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Free Cash Flow
                </td>
                {sortedCashFlow.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm font-bold text-green-600 dark:text-green-400"
                  >
                    {formatCurrency(data.freeCashFlow)}
                  </td>
                ))}
              </tr>
              <tr className="bg-white dark:bg-[rgb(33,33,33)] hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)]">
                <td className="sticky left-0 z-10 bg-white dark:bg-[rgb(33,33,33)] px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                  Capital Expenditures
                </td>
                {sortedCashFlow.map((data) => (
                  <td
                    key={data.year}
                    className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900 dark:text-white"
                  >
                    {formatCurrency(data.capitalExpenditures)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Data Quality Disclaimer */}
      <div className="mt-4 rounded-md bg-blue-50 dark:bg-blue-900/20 p-3">
        <p className="text-xs text-blue-700 dark:text-blue-300">
          <span className="font-medium">Note:</span> Some balance sheet and cash flow fields are approximated
          based on available data. For complete financial details, please refer to official SEC filings.
        </p>
      </div>
    </div>
  )
}
