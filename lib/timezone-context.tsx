'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface TimezoneContextType {
  timezone: string
  setTimezone: (tz: string) => void
  isAutoDetected: boolean
  resetToAutoDetect: () => void
}

const TimezoneContext = createContext<TimezoneContextType | null>(null)

const STORAGE_KEY = 'user-timezone-preference'

/**
 * Common US timezones + major international ones
 */
export const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (ET)', offset: 'UTC-5/-4' },
  { value: 'America/Chicago', label: 'Central (CT)', offset: 'UTC-6/-5' },
  { value: 'America/Denver', label: 'Mountain (MT)', offset: 'UTC-7/-6' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)', offset: 'UTC-8/-7' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)', offset: 'UTC-9/-8' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)', offset: 'UTC-10' },
  { value: 'Europe/London', label: 'London (GMT/BST)', offset: 'UTC+0/+1' },
  { value: 'Europe/Paris', label: 'Central European (CET)', offset: 'UTC+1/+2' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)', offset: 'UTC+9' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', offset: 'UTC+8' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)', offset: 'UTC+8' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)', offset: 'UTC+10/+11' },
] as const

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState<string>('America/New_York')
  const [isAutoDetected, setIsAutoDetected] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Initialize timezone on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)

    if (saved) {
      // User has a saved preference
      setTimezoneState(saved)
      setIsAutoDetected(false)
    } else {
      // Auto-detect from browser
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      setTimezoneState(detected)
      setIsAutoDetected(true)
    }

    setMounted(true)
  }, [])

  const setTimezone = (tz: string) => {
    setTimezoneState(tz)
    setIsAutoDetected(false)
    localStorage.setItem(STORAGE_KEY, tz)
  }

  const resetToAutoDetect = () => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    setTimezoneState(detected)
    setIsAutoDetected(true)
    localStorage.removeItem(STORAGE_KEY)
  }

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return <>{children}</>
  }

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone, isAutoDetected, resetToAutoDetect }}>
      {children}
    </TimezoneContext.Provider>
  )
}

export function useTimezone() {
  const context = useContext(TimezoneContext)
  // Return default values if used outside provider (e.g., during static generation)
  if (!context) {
    return {
      timezone: 'America/New_York',
      setTimezone: () => {},
      isAutoDetected: true,
      resetToAutoDetect: () => {},
    }
  }
  return context
}

/**
 * Get the short timezone abbreviation (e.g., "PT", "ET")
 */
export function getTimezoneAbbr(timezone: string): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'short'
  })
  const parts = formatter.formatToParts(now)
  const tzPart = parts.find(p => p.type === 'timeZoneName')
  return tzPart?.value || timezone
}
