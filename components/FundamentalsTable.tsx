'use client'

import type { CompanyFundamentals } from '@/app/actions/company-fundamentals'

interface FundamentalsTableProps {
  data: CompanyFundamentals
}

function formatValue(value: number | null, label: string): string {
  if (value === null || value === undefined) return '-'

  // EPS is displayed as-is with 2 decimal places
  if (label === 'EPS') {
    return value.toFixed(2)
  }

  // For other metrics, format with commas (values are already in the right unit from DB)
  // Values in millions
  const absValue = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (absValue >= 1_000_000_000_000) {
    // Trillions - shouldn't happen but handle it
    return `${sign}${(absValue / 1_000_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}T`
  }

  if (absValue >= 1_000_000_000) {
    // Billions - display as whole number (in millions)
    return `${sign}${(absValue / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }

  if (absValue >= 1_000_000) {
    // Millions - display as whole number (in millions)
    return `${sign}${(absValue / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }

  // Smaller values
  return `${sign}${absValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export default function FundamentalsTable({ data }: FundamentalsTableProps) {
  const { metrics, annualYears, quarterlyPeriods } = data

  if (metrics.length === 0 || annualYears.length === 0) {
    return (
      <div className="rounded-lg bg-gray-100 dark:bg-[rgb(38,38,38)] p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Fundamentals & Estimates
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">No fundamentals data available</p>
      </div>
    )
  }

  // Group quarterly periods by year for sub-headers
  const quartersByYear: Record<number, typeof quarterlyPeriods> = {}
  for (const period of quarterlyPeriods) {
    if (!quartersByYear[period.year]) {
      quartersByYear[period.year] = []
    }
    quartersByYear[period.year].push(period)
  }

  // Get years that have quarterly data
  const yearsWithQuarters = Object.keys(quartersByYear).map(Number).sort((a, b) => a - b)

  return (
    <div className="rounded-lg bg-gray-100 dark:bg-[rgb(38,38,38)] p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Fundamentals & Estimates
        </h2>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Annual</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {/* Year header row */}
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 pr-4 font-medium text-gray-500 dark:text-gray-400 sticky left-0 bg-gray-100 dark:bg-[rgb(38,38,38)]">
                {/* Empty cell for metric labels */}
              </th>
              {/* Annual year columns */}
              {annualYears.map(year => (
                <th
                  key={`fy-${year}`}
                  className="text-right py-2 px-2 font-semibold text-gray-700 dark:text-gray-300"
                >
                  {year}
                </th>
              ))}
              {/* Quarterly columns grouped by year */}
              {yearsWithQuarters.map(year => {
                const quarters = quartersByYear[year]
                return quarters.map((period, idx) => (
                  <th
                    key={`q-${period.year}-${period.quarter}`}
                    className={`text-right py-2 px-2 font-medium text-gray-500 dark:text-gray-400 text-xs ${
                      idx === 0 ? 'border-l border-gray-300 dark:border-gray-600' : ''
                    }`}
                  >
                    {period.label}
                  </th>
                ))
              })}
            </tr>
            {/* FY sub-header row */}
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-1 pr-4 font-normal text-xs text-gray-400 dark:text-gray-500 sticky left-0 bg-gray-100 dark:bg-[rgb(38,38,38)]">
                {/* Empty */}
              </th>
              {annualYears.map(year => (
                <th
                  key={`fy-label-${year}`}
                  className="text-right py-1 px-2 font-normal text-xs text-gray-400 dark:text-gray-500"
                >
                  FY {year}
                </th>
              ))}
              {yearsWithQuarters.map(year => {
                const quarters = quartersByYear[year]
                return quarters.map((period, idx) => (
                  <th
                    key={`fy-label-q-${period.year}-${period.quarter}`}
                    className={`text-right py-1 px-2 font-normal text-xs text-gray-400 dark:text-gray-500 ${
                      idx === 0 ? 'border-l border-gray-300 dark:border-gray-600' : ''
                    }`}
                  >
                    FY {period.year}
                  </th>
                ))
              })}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, index) => (
              <tr
                key={metric.label}
                className={index < metrics.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}
              >
                <td className="py-2 pr-4 font-medium text-gray-900 dark:text-gray-100 sticky left-0 bg-gray-100 dark:bg-[rgb(38,38,38)] whitespace-nowrap">
                  {metric.label}
                </td>
                {/* Annual values */}
                {annualYears.map(year => (
                  <td
                    key={`val-${metric.label}-${year}`}
                    className="py-2 px-2 text-right text-gray-900 dark:text-gray-100 tabular-nums"
                  >
                    {formatValue(metric.annual[year], metric.label)}
                  </td>
                ))}
                {/* Quarterly values */}
                {yearsWithQuarters.map(year => {
                  const quarters = quartersByYear[year]
                  return quarters.map((period, idx) => {
                    const key = `${period.year}-Q${period.quarter}`
                    return (
                      <td
                        key={`val-${metric.label}-${key}`}
                        className={`py-2 px-2 text-right text-gray-700 dark:text-gray-300 tabular-nums ${
                          idx === 0 ? 'border-l border-gray-300 dark:border-gray-600' : ''
                        }`}
                      >
                        {formatValue(metric.quarterly[key], metric.label)}
                      </td>
                    )
                  })
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
        Currency: USD; non per share values in millions.
      </p>
    </div>
  )
}
