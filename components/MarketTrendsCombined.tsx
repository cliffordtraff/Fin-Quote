'use client'

import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'

interface MarketTrendsCombinedProps {
  gainers: GainerData[]
  losers: LoserData[]
  marketSummary?: string
  marketSummaryLoading?: boolean
}

interface StockData {
  symbol: string
  name: string
  price: number
  changesPercentage: number
}

function MiniTable({ title, stocks, colorMode }: { title: string; stocks: StockData[]; colorMode: 'green' | 'red' | 'neutral' }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden flex-1">
      <div className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">{title}</h2>
      </div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-1 px-2 font-medium text-gray-500 dark:text-gray-400">Ticker</th>
            <th className="text-right py-1 px-2 font-medium text-gray-500 dark:text-gray-400">Price</th>
            <th className="text-right py-1 px-2 font-medium text-gray-500 dark:text-gray-400">Chg%</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => {
            const isPositive = stock.changesPercentage >= 0
            let changeColor: string
            if (colorMode === 'green') {
              changeColor = 'text-green-600 dark:text-green-400'
            } else if (colorMode === 'red') {
              changeColor = 'text-red-600 dark:text-red-400'
            } else {
              changeColor = isPositive
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }

            return (
              <tr
                key={stock.symbol}
                className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td className="py-1 px-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{stock.symbol}</span>
                </td>
                <td className="py-1 px-2 text-right text-gray-900 dark:text-gray-100">
                  ${stock.price.toFixed(2)}
                </td>
                <td className={`py-1 px-2 text-right font-medium ${changeColor}`}>
                  {isPositive ? '+' : ''}{stock.changesPercentage.toFixed(2)}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MarketSummaryCard({ summary, loading }: { summary?: string; loading?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden flex-1">
      <div className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">What&apos;s Happening Today</h2>
      </div>
      <div className="p-3 text-xs text-gray-700 dark:text-gray-300 leading-relaxed overflow-y-auto" style={{ maxHeight: '400px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-gray-400">Loading market summary...</div>
          </div>
        ) : summary ? (
          <div className="whitespace-pre-wrap">{summary}</div>
        ) : (
          <div className="text-gray-400 italic">Market summary unavailable</div>
        )}
      </div>
    </div>
  )
}

export default function MarketTrendsCombined({ gainers, losers, marketSummary, marketSummaryLoading }: MarketTrendsCombinedProps) {
  const maxRows = 17

  return (
    <div className="flex gap-4 w-full">
      <MiniTable
        title="Gainers"
        stocks={gainers.slice(0, maxRows)}
        colorMode="green"
      />
      <MiniTable
        title="Losers"
        stocks={losers.slice(0, maxRows)}
        colorMode="red"
      />
      <MarketSummaryCard
        summary={marketSummary}
        loading={marketSummaryLoading}
      />
    </div>
  )
}
