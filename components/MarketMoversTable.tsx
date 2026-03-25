'use client'

import { useState } from 'react'
import Link from 'next/link'
import SessionToggle, { type SessionType } from './SessionToggle'
import type { MoverData } from '@/app/actions/market-movers'
import type { MarketSession } from '@/lib/market-hours'

interface MarketMoversTableProps {
  title: 'Gainers' | 'Losers'
  data: {
    premarket: MoverData[]
    cash: MoverData[]
    afterhours: MoverData[]
    currentSession: MarketSession
  }
  maxRows?: number
  onSymbolClick?: (symbol: string) => void
}

export default function MarketMoversTable({
  title,
  data,
  maxRows = 10,
  onSymbolClick,
}: MarketMoversTableProps) {
  // Default to current session, fallback to 'cash' if market closed
  const getDefaultSession = (): SessionType => {
    if (data.currentSession === 'premarket') return 'premarket'
    if (data.currentSession === 'cash') return 'cash'
    if (data.currentSession === 'afterhours') return 'afterhours'
    return 'cash' // Default when closed
  }

  const [selectedSession, setSelectedSession] = useState<SessionType>(getDefaultSession)

  const movers = data[selectedSession]
  const isGainers = title === 'Gainers'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-cream-300 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-cream-300 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
        <SessionToggle
          selected={selectedSession}
          onChange={setSelectedSession}
          currentSession={data.currentSession}
        />
      </div>

      {/* Table */}
      <div className="divide-y divide-cream-200 dark:divide-gray-700">
        {movers.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No {title.toLowerCase()} data for {selectedSession === 'premarket' ? 'pre-market' : selectedSession === 'afterhours' ? 'after-hours' : 'regular'} session
          </div>
        ) : (
          movers.slice(0, maxRows).map((mover) => {
            const rowContent = (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-sage-600 dark:text-sage-400">
                    {mover.symbol}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                    {mover.name}
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-sm text-gray-900 dark:text-white">
                    ${mover.price.toFixed(2)}
                  </div>
                  <div
                    className={`text-xs font-medium ${
                      isGainers ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {mover.changesPercentage >= 0 ? '+' : ''}
                    {mover.changesPercentage.toFixed(2)}%
                  </div>
                </div>
              </>
            )
            const rowClass = "flex items-center justify-between px-4 py-2 hover:bg-cream-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"

            return onSymbolClick ? (
              <button
                key={mover.symbol}
                onClick={() => onSymbolClick(mover.symbol)}
                className={`${rowClass} w-full text-left`}
              >
                {rowContent}
              </button>
            ) : (
              <Link
                key={mover.symbol}
                href={`/stock/${mover.symbol}`}
                className={rowClass}
              >
                {rowContent}
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
