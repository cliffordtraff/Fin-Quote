'use client'

import React from 'react'

interface DataSourceIndicatorProps {
  source: 'live' | 'cached' | 'mock' | 'error' | 'firestore-cache' | 'stale-cache' | 'mixed'
  lastUpdated?: string | null
  className?: string
}

export function DataSourceIndicator({ source, lastUpdated, className = '' }: DataSourceIndicatorProps) {
  // Don't show anything for live data (normal state) or cached data
  if (source === 'live' || source === 'cached' || source === 'firestore-cache' || source === 'stale-cache' || source === 'mixed') return null
  
  // Format the timestamp if provided
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      second: '2-digit'
    })
  }
  
  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      
      {source === 'mock' && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>Sample data (API unavailable)</span>
        </div>
      )}
      
      {source === 'error' && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Unable to load data - Please try again</span>
        </div>
      )}
    </div>
  )
}

// Mini version for inline use
export function DataSourceBadge({ source }: { source: 'live' | 'cached' | 'mock' | 'error' | 'firestore-cache' | 'stale-cache' | 'mixed' }) {
  // Don't show badges for live data or cache sources (they're all normal states)
  if (source === 'live' || source === 'cached' || source === 'firestore-cache' || source === 'stale-cache' || source === 'mixed') return null

  const badges = {
    mock: {
      text: 'Mock',
      className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    },
    error: {
      text: 'Error',
      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    }
  }

  const badge = badges[source]

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${badge.className}`}>
      {badge.text}
    </span>
  )
}