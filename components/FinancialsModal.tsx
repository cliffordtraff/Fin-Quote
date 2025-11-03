'use client'

import { useState, useEffect } from 'react'
import { getCompaniesWithFinancials } from '@/app/actions/financials'
import type { CompanyWithFinancials } from '@/lib/database.types'
import type { Database } from '@/lib/database.types'

type FinancialsModalProps = {
  isOpen: boolean
  onClose: () => void
}

type FinancialRow = Database['public']['Tables']['financials_std']['Row']


// Format large numbers (millions/billions)
function formatLargeNumber(value: number | null): string {
  if (value === null) return '—'
  if (value >= 1_000_000_000_000) return (value / 1_000_000_000_000).toFixed(2)
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2)
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2)
  return value.toFixed(2)
}

// Format percentage
function formatPercent(value: number | null): string {
  if (value === null) return '—'
  return value.toFixed(2)
}

// Calculate margin
function calculateMargin(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null
  return (numerator / denominator) * 100
}

export default function FinancialsModal({ isOpen, onClose }: FinancialsModalProps) {
  const [companies, setCompanies] = useState<CompanyWithFinancials[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && !companies) {
      loadFinancials()
    }
  }, [isOpen])

  const loadFinancials = async () => {
    setLoading(true)
    setError(null)
    const result = await getCompaniesWithFinancials()
    if (result.error) {
      setError(result.error)
    } else {
      setCompanies(result.data)
    }
    setLoading(false)
  }

  if (!isOpen) return null

  // Get the first company (AAPL) for display
  const company = companies?.[0]
  const financials = company?.financials_std || []

  // Get last 3 years only (descending for display)
  const years = [...financials]
    .sort((a, b) => b.year - a.year)
    .slice(0, 3)
    .map(f => f.year)

  // Filter financials to only include those 3 years
  const filteredFinancials = financials.filter(f => years.includes(f.year))

  // Sort by year ascending for proper sparkline direction
  const sortedFinancials = [...filteredFinancials].sort((a, b) => a.year - b.year)

  // Helper to get value for a specific year
  const getValue = (year: number, field: keyof FinancialRow): number | null => {
    const record = financials.find(f => f.year === year)
    return record ? (record[field] as number | null) : null
  }


  // Metric row component
  const MetricRow = ({
    label,
    field,
    formatFn = formatLargeNumber,
    isPercentage = false
  }: {
    label: string
    field: keyof FinancialRow | 'calculated'
    formatFn?: (value: number | null) => string
    isPercentage?: boolean
  }) => {
    let values: (number | null)[] = []

    if (field === 'calculated') {
      // For calculated fields, we'll handle them separately
      values = years.map(() => null)
    } else {
      values = years.map(year => getValue(year, field))
    }

    return (
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3 text-sm text-gray-900 font-medium">{label}</td>
        {values.map((value, idx) => (
          <td key={idx} className="px-4 py-3 text-sm text-gray-900 text-right">
            {formatFn(value)}
          </td>
        ))}
      </tr>
    )
  }

  // Special metric row for calculated values
  const CalculatedRow = ({
    label,
    calculator,
    formatFn = formatLargeNumber
  }: {
    label: string
    calculator: (year: number) => number | null
    formatFn?: (value: number | null) => string
  }) => {
    const values = years.map(calculator)

    return (
      <tr className="hover:bg-gray-50">
        <td className="px-4 py-3 text-sm text-gray-900 font-medium">{label}</td>
        {values.map((value, idx) => (
          <td key={idx} className="px-4 py-3 text-sm text-gray-900 text-right">
            {formatFn(value)}
          </td>
        ))}
      </tr>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold">Company Financials</h2>
            {company && (
              <p className="text-sm text-gray-600 mt-1">
                {company.name} ({company.symbol}) - {company.sector}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Loading financials...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-red-800 font-semibold mb-2">Error Loading Data</h3>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {!loading && !error && financials.length === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800">No financial data available.</p>
            </div>
          )}

          {!loading && !error && financials.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wider">
                      Metric
                    </th>
                    {years.map(year => (
                      <th key={year} className="px-4 py-3 text-right text-sm font-medium uppercase tracking-wider">
                        FY {year}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* Period Info */}
                  <tr className="bg-gray-100">
                    <td colSpan={1 + years.length} className="px-4 py-2 text-xs font-semibold text-gray-700 uppercase">
                      Period Information
                    </td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">Period End Date</td>
                    {years.map(year => (
                      <td key={year} className="px-4 py-3 text-sm text-gray-900 text-right">
                        12/31/{year}
                      </td>
                    ))}
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">Period Length</td>
                    {years.map(year => (
                      <td key={year} className="px-4 py-3 text-sm text-gray-900 text-right">
                        12 Months
                      </td>
                    ))}
                  </tr>

                  {/* Income Statement */}
                  <tr className="bg-gray-100">
                    <td colSpan={1 + years.length} className="px-4 py-2 text-xs font-semibold text-gray-700 uppercase">
                      Income Statement
                    </td>
                  </tr>
                  <MetricRow label="Total Revenue" field="revenue" />
                  <MetricRow label="Gross Profit" field="gross_profit" />
                  <MetricRow label="Operating Income" field="operating_income" />
                  <MetricRow label="Net Income" field="net_income" />
                  <MetricRow label="Operating Cash Flow" field="operating_cash_flow" />
                  <MetricRow label="EPS" field="eps" formatFn={(v) => v !== null ? v.toFixed(2) : '—'} />

                  {/* Balance Sheet */}
                  <tr className="bg-gray-100">
                    <td colSpan={1 + years.length} className="px-4 py-2 text-xs font-semibold text-gray-700 uppercase">
                      Balance Sheet
                    </td>
                  </tr>
                  <MetricRow label="Total Assets" field="total_assets" />
                  <MetricRow label="Total Liabilities" field="total_liabilities" />
                  <MetricRow label="Shareholders Equity" field="shareholders_equity" />

                  {/* Financial Ratios */}
                  <tr className="bg-gray-100">
                    <td colSpan={1 + years.length} className="px-4 py-2 text-xs font-semibold text-gray-700 uppercase">
                      Financial Ratios
                    </td>
                  </tr>
                  <CalculatedRow
                    label="Gross Margin (%)"
                    calculator={(year) => calculateMargin(getValue(year, 'gross_profit'), getValue(year, 'revenue'))}
                    formatFn={formatPercent}
                  />
                  <CalculatedRow
                    label="Operating Margin (%)"
                    calculator={(year) => calculateMargin(getValue(year, 'operating_income'), getValue(year, 'revenue'))}
                    formatFn={formatPercent}
                  />
                  <CalculatedRow
                    label="Net Margin (%)"
                    calculator={(year) => calculateMargin(getValue(year, 'net_income'), getValue(year, 'revenue'))}
                    formatFn={formatPercent}
                  />
                  <CalculatedRow
                    label="ROE (%)"
                    calculator={(year) => calculateMargin(getValue(year, 'net_income'), getValue(year, 'shareholders_equity'))}
                    formatFn={formatPercent}
                  />
                  <CalculatedRow
                    label="ROA (%)"
                    calculator={(year) => calculateMargin(getValue(year, 'net_income'), getValue(year, 'total_assets'))}
                    formatFn={formatPercent}
                  />
                  <CalculatedRow
                    label="Debt to Equity"
                    calculator={(year) => {
                      const liabilities = getValue(year, 'total_liabilities')
                      const equity = getValue(year, 'shareholders_equity')
                      if (liabilities === null || equity === null || equity === 0) return null
                      return liabilities / equity
                    }}
                    formatFn={(v) => v !== null ? v.toFixed(2) : '—'}
                  />
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
