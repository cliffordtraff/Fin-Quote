'use client'

import type { SegmentData } from '@/app/actions/segment-data'

interface CompanySegmentsCardProps {
  productSegments: SegmentData[] | null
  geographicSegments: SegmentData[] | null
  fiscalYear?: number
}

function formatRevenue(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

interface SegmentTableProps {
  title: string
  segments: SegmentData[] | null
  fiscalYear?: number
}

function SegmentTable({ title, segments, fiscalYear }: SegmentTableProps) {
  if (!segments || segments.length === 0) {
    return (
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">No data available</p>
      </div>
    )
  }

  // Get the most recent year's data for each segment
  const latestData = segments.map(segment => {
    // Find the latest FY data point
    const latestPoint = segment.data
      .filter(d => d.period === 'FY')
      .sort((a, b) => b.year - a.year)[0]
    return {
      segment: segment.segment,
      value: latestPoint?.value || 0,
      year: latestPoint?.year,
    }
  })

  // Calculate total for percentages
  const total = latestData.reduce((sum, d) => sum + d.value, 0)

  // Sort by value descending
  latestData.sort((a, b) => b.value - a.value)

  const displayYear = fiscalYear || latestData[0]?.year

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          {title}
        </h3>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 uppercase">
              {title.replace(' Segment', '')}
            </th>
            <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 uppercase">
              Revenue
            </th>
            <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 uppercase w-[140px]">
              Rev %
            </th>
          </tr>
        </thead>
        <tbody>
          {latestData.map((item, index) => {
            const percentage = total > 0 ? (item.value / total) * 100 : 0
            return (
              <tr
                key={item.segment}
                className={index < latestData.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}
              >
                <td className="py-2 text-sm text-gray-900 dark:text-gray-100">
                  {item.segment}
                </td>
                <td className="py-2 text-sm text-gray-900 dark:text-gray-100 text-right tabular-nums">
                  {formatRevenue(item.value)}
                </td>
                <td className="py-2 pl-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-400 dark:bg-blue-500 rounded transition-all duration-300"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-600 dark:text-gray-400 w-[42px] text-right tabular-nums">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
          {/* Total row */}
          <tr className="border-t border-gray-300 dark:border-gray-600 font-medium">
            <td className="py-2 text-sm text-gray-900 dark:text-gray-100">
              Total
            </td>
            <td className="py-2 text-sm text-gray-900 dark:text-gray-100 text-right tabular-nums">
              {formatRevenue(total)}
            </td>
            <td className="py-2 pl-4">
              <div className="flex items-center justify-end">
                <span className="text-xs text-gray-600 dark:text-gray-400 w-[42px] text-right tabular-nums">
                  100.0%
                </span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      {displayYear && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          As of FY ending Dec-{String(displayYear).slice(-2)}. Currency: USD; all values in millions.
        </p>
      )}
    </div>
  )
}

export default function CompanySegmentsCard({
  productSegments,
  geographicSegments,
  fiscalYear,
}: CompanySegmentsCardProps) {
  return (
    <div className="rounded-lg bg-gray-100 dark:bg-[rgb(38,38,38)] p-6">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Segments</h2>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <div className="flex flex-col lg:flex-row gap-8">
        <SegmentTable
          title="Business Segment"
          segments={productSegments}
          fiscalYear={fiscalYear}
        />
        <div className="hidden lg:block w-px bg-gray-200 dark:bg-gray-700" />
        <SegmentTable
          title="Geographic Segment"
          segments={geographicSegments}
          fiscalYear={fiscalYear}
        />
      </div>
    </div>
  )
}
