'use client'

export default function MarketInsights() {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden" style={{ width: '340px' }}>
      <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Market Trends</h2>
      </div>
      <div className="p-2 text-sm text-gray-700 dark:text-gray-300 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-green-500">📈</span>
          <span>Materials is the leading sector on the day.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-500">🏆</span>
          <span>META is the biggest gainer in the S&P 500.</span>
        </div>
        <p className="flex items-center gap-2">
          <span className="text-orange-500">⚡</span>
          Technology stocks are mixed in early trading.
        </p>
      </div>
    </div>
  )
}
