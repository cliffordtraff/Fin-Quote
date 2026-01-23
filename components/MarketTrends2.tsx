'use client'

import type { GainerData } from '@/app/actions/gainers'
import type { LoserData } from '@/app/actions/losers'

interface MarketTrends2Props {
  gainers: GainerData[]
  losers: LoserData[]
}

interface StockData {
  symbol: string
  name: string
  price: number
  changesPercentage: number
}

function MiniTable({ title, stocks, colorMode }: { title: string; stocks: StockData[]; colorMode: 'green' | 'red' | 'neutral' }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[rgb(33,33,33)] overflow-hidden" style={{ width: '340px' }}>
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

export default function MarketTrends2({ gainers, losers }: MarketTrends2Props) {
  return (
    <div className="flex gap-2">
      <MiniTable
        title="Gainers"
        stocks={gainers.slice(0, 17)}
        colorMode="green"
      />
      <MiniTable
        title="Losers"
        stocks={losers.slice(0, 17)}
        colorMode="red"
      />
    </div>
  )
}
