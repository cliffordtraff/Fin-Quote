/**
 * Earnings Badge Component
 *
 * Displays earnings proximity/status badge
 */

import React from 'react'
import { EarningsContext } from '@watchlist/types/earnings'

interface EarningsBadgeProps {
  earningsContext: EarningsContext
  compact?: boolean
}

export const EarningsBadge: React.FC<EarningsBadgeProps> = ({
  earningsContext,
  compact = false
}) => {
  const { status, daysAway, daysSince, lastEarnings } = earningsContext

  // Don't show badge if no earnings nearby
  if (status === 'none') {
    return null
  }

  // Determine badge style and content
  const getBadgeConfig = () => {
    switch (status) {
      case 'today_bmo':
        return {
          color: 'bg-red-500 text-white',
          icon: '🌅',
          text: compact ? 'Earnings Today (BMO)' : 'Earnings Today (Before Market Open)',
          tooltip: 'Earnings reported this morning - current session is reacting'
        }
      case 'today_amc':
        return {
          color: 'bg-red-500 text-white',
          icon: '🌆',
          text: compact ? 'Earnings Today (AMC)' : 'Earnings Today (After Market Close)',
          tooltip: 'Earnings will be reported after market close - anticipatory positioning'
        }
      case 'recent':
        const hasBeat = lastEarnings && lastEarnings.epsActual !== null && lastEarnings.epsEstimate !== null
        const didBeat = hasBeat && lastEarnings.epsActual! > lastEarnings.epsEstimate!
        const beatIcon = hasBeat ? (didBeat ? '✅' : '❌') : '📊'

        return {
          color: 'bg-green-600 text-white',
          icon: beatIcon,
          text: compact
            ? `Post-Earnings (${daysSince}d)`
            : `Post-Earnings (${daysSince} day${daysSince !== 1 ? 's' : ''} ago)`,
          tooltip: hasBeat
            ? `Earnings ${didBeat ? 'beat' : 'missed'} ${daysSince} day${daysSince !== 1 ? 's' : ''} ago`
            : `Earnings reported ${daysSince} day${daysSince !== 1 ? 's' : ''} ago`
        }
      case 'upcoming':
        return {
          color: 'bg-yellow-500 text-gray-900',
          icon: '📅',
          text: compact
            ? `Earnings in ${daysAway}d`
            : `Earnings in ${daysAway} day${daysAway !== 1 ? 's' : ''}`,
          tooltip: `Earnings scheduled in ${daysAway} day${daysAway !== 1 ? 's' : ''} - watch for anticipatory moves`
        }
      default:
        return null
    }
  }

  const config = getBadgeConfig()
  if (!config) return null

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${config.color}`}
      title={config.tooltip}
      role="status"
      aria-label={config.tooltip}
    >
      <span aria-hidden="true">{config.icon}</span>
      <span>{config.text}</span>
    </div>
  )
}

export default EarningsBadge
