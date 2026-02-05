'use client'

import { type MarketSession } from '@/lib/market-hours'

export type SessionType = 'premarket' | 'cash' | 'afterhours'

interface SessionToggleProps {
  selected: SessionType
  onChange: (session: SessionType) => void
  currentSession: MarketSession
}

const sessions: { id: SessionType; label: string; shortLabel: string }[] = [
  { id: 'premarket', label: 'Pre-Market', shortLabel: 'Pre' },
  { id: 'cash', label: 'Regular', shortLabel: 'Reg' },
  { id: 'afterhours', label: 'After-Hours', shortLabel: 'AH' }
]

export default function SessionToggle({
  selected,
  onChange,
  currentSession
}: SessionToggleProps) {
  return (
    <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
      {sessions.map((session) => {
        const isActive = selected === session.id
        const isLive = currentSession === session.id

        return (
          <button
            key={session.id}
            onClick={() => onChange(session.id)}
            className={`
              relative px-3 py-1 text-xs font-medium rounded-md transition-colors
              ${
                isActive
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }
            `}
            title={isLive ? `${session.label} (Live)` : session.label}
          >
            {session.shortLabel}
            {isLive && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            )}
          </button>
        )
      })}
    </div>
  )
}
