'use client'

import type { StockData } from '@/app/actions/stocks'

interface StocksTableProps {
  stocks: StockData[]
}

export default function StocksTable({ stocks }: StocksTableProps) {
  return (
    <div style={{ width: '180px' }}>
      <div className="overflow-hidden rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)]">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-[rgb(26,26,26)]">
            <tr>
              <th className="px-3 py-1.5 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Symbol
              </th>
              <th className="px-3 py-1.5 text-right text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {stocks.map((stock) => (
              <tr key={stock.symbol} className="hover:bg-gray-50 dark:hover:bg-[rgb(40,40,40)] transition-colors">
                <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold text-gray-900 dark:text-white">
                  {stock.symbol}
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
