'use client'

import type { StockData } from '@/app/actions/stocks'
import TickerLink from '@/components/TickerLink'

interface StocksTableProps {
  stocks: StockData[]
}

export default function StocksTable({ stocks }: StocksTableProps) {
  return (
    <div className="w-full lg:w-[180px] h-full">
      <div className="h-full overflow-hidden rounded border border-cream-300 dark:border-gray-700 bg-white dark:bg-gray-800">
        <table className="w-full">
          <thead className="bg-cream-50 dark:bg-gray-800/50">
            <tr>
              <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Symbol
              </th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200 dark:divide-gray-700">
            {stocks.map((stock) => (
              <tr key={stock.symbol} className="hover:bg-cream-50 dark:hover:bg-gray-800 transition-colors">
                <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold">
                  <TickerLink symbol={stock.symbol} className="text-gray-900 dark:text-white" />
                </td>
                <td className={`px-3 py-2 whitespace-nowrap text-xs text-right font-bold ${
                  stock.changePercent >= 0
                    ? 'text-green-600 dark:text-green-400'
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
