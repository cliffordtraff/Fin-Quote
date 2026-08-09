'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DASHBOARD_PREFERENCES_STORAGE_KEY,
  DEFAULT_DASHBOARD_PREFERENCES,
  parseDashboardPreferences,
  type DashboardPreferences,
} from '@/lib/dashboard/preferences'
import { normalizeWatchlistSymbols } from '@/lib/dashboard/watchlist-contract'

export function useDashboardPreferences() {
  const [preferences, setPreferences] = useState<DashboardPreferences>(
    DEFAULT_DASHBOARD_PREFERENCES,
  )
  const [loaded, setLoaded] = useState(false)
  const [storageError, setStorageError] = useState(false)

  useEffect(() => {
    const readPreferences = (raw: string | null) => {
      setPreferences(parseDashboardPreferences(raw))
    }
    try {
      readPreferences(
        window.localStorage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY),
      )
    } catch {
      setStorageError(true)
    }
    setLoaded(true)

    const onStorage = (event: StorageEvent) => {
      if (event.key !== DASHBOARD_PREFERENCES_STORAGE_KEY) return
      readPreferences(event.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(
        DASHBOARD_PREFERENCES_STORAGE_KEY,
        JSON.stringify(preferences),
      )
    } catch {
      setStorageError(true)
    }
  }, [loaded, preferences])

  const setPreference = useCallback(
    <Key extends keyof Omit<DashboardPreferences, 'version'>>(
      key: Key,
      value: DashboardPreferences[Key],
    ) => {
      setPreferences((current) => {
        if (key === 'watchlistSymbols') {
          return {
            ...current,
            watchlistSymbols: value === null
              ? null
              : normalizeWatchlistSymbols(value),
          }
        }
        return { ...current, [key]: value }
      })
    },
    [],
  )

  return { preferences, setPreference, loaded, storageError }
}
