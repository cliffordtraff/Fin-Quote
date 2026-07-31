'use client'

import type { StockData } from '@/app/actions/stocks'
import TickerLink from '@/components/TickerLink'

interface StocksTableProps {
  stocks: StockData[]
}

export default function StocksTable({ stocks }: StocksTableProps) {
  return (
    <div className="h-full w-full">
      <div className="h-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex min-h-11 items-center border-b border-gray-200 px-3 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-950 dark:text-white">
            Watchlist
          </h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                Symbol
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                Change
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {stocks.map((stock) => (
              <tr key={stock.symbol} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold">
                  <TickerLink symbol={stock.symbol} className="text-gray-900 dark:text-white" />
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold tabular-nums ${
                  stock.changePercent >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {stock.changePercent >= 0 ? '+' : ''}
                  {stock.changePercent.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
