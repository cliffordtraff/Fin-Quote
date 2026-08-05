'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  DASHBOARD_PREFERENCES_STORAGE_KEY,
  DEFAULT_DASHBOARD_PREFERENCES,
  parseDashboardPreferences,
  type DashboardPreferences,
} from '@/lib/dashboard/preferences'

export function useDashboardPreferences() {
  const [preferences, setPreferences] = useState<DashboardPreferences>(
    DEFAULT_DASHBOARD_PREFERENCES,
  )
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setPreferences(
      parseDashboardPreferences(
        window.localStorage.getItem(DASHBOARD_PREFERENCES_STORAGE_KEY),
      ),
    )
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    window.localStorage.setItem(
      DASHBOARD_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    )
  }, [loaded, preferences])

  const setPreference = useCallback(
    <Key extends keyof Omit<DashboardPreferences, 'version'>>(
      key: Key,
      value: DashboardPreferences[Key],
    ) => {
      setPreferences((current) => ({ ...current, [key]: value }))
    },
    [],
  )

  return { preferences, setPreference }
}
