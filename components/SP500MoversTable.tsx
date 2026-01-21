'use client'

import type { SP500MoverData } from '@/app/actions/sp500-movers'

interface SP500MoversTableProps {
  data: SP500MoverData[]
  type: 'gainers' | 'losers'
}

export default function SP500MoversTable({ data, type }: SP500MoversTableProps) {
  const title = type === 'gainers' ? 'S&P 500 Gainers' : 'S&P 500 Losers'
  const isGainers = type === 'gainers'

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden" style={{ width: '320px' }}>
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h2>
      </div>
      <div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Ticker</th>
              <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Price</th>
              <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">Change</th>
            </tr>
          </thead>
          <tbody>
            {data.map((stock, index) => (
              <tr
                key={stock.symbol}
                className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td className="py-1.5 px-2">
                  <span className="font-medium text-xs text-gray-900 dark:text-gray-100">{stock.symbol}</span>
                </td>
                <td className="py-1.5 px-2 text-right text-xs text-gray-900 dark:text-gray-100">
                  ${stock.price.toFixed(2)}
                </td>
                <td className={`py-1.5 px-2 text-right text-xs font-medium ${
                  isGainers
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {isGainers ? '+' : ''}{stock.changesPercentage.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
