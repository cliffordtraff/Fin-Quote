import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@watchlist/lib/firebase/auth-context'
import { SettingsService } from '@watchlist/lib/firebase/settings-service'
import { WatchlistSettings } from '@watchlist/types'

const createDefaultSettings = (): WatchlistSettings => ({
  showExtendedHours: false,
  columnWidths: {},
  fontScale: 1
})

const normalizeSettings = (settings?: Partial<WatchlistSettings>): WatchlistSettings => ({
  showExtendedHours: settings?.showExtendedHours ?? false,
  columnWidths: settings?.columnWidths ?? {},
  fontScale: settings?.fontScale ?? 1
})

/**
 * Hook to manage watchlist settings (persisted to Firebase)
 */
export function useWatchlistSettings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<WatchlistSettings>(() => createDefaultSettings())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const previousSettingsRef = useRef<WatchlistSettings>(createDefaultSettings())

  // Load settings from Firebase on mount
  useEffect(() => {
    if (!user) {
      setSettings(createDefaultSettings())
      setIsLoading(false)
      setError(null)
      return
    }

    const loadSettings = async () => {
      try {
        setIsLoading(true)
        const service = new SettingsService(user.uid)
        const loadedSettings = await service.getWatchlistSettings()
        setSettings(normalizeSettings(loadedSettings))
        setError(null)
      } catch (err) {
        console.error('Error loading watchlist settings:', err)
        setError(err instanceof Error ? err.message : 'Failed to load settings')
        // Keep default settings on error
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [user])

  const updateSettings = useCallback(
    async (updates: Partial<WatchlistSettings>) => {
      const normalizedUpdates: Partial<WatchlistSettings> = {
        ...updates
      }

      if (updates.columnWidths) {
        normalizedUpdates.columnWidths = { ...updates.columnWidths }
      }

      setSettings(prev => {
        previousSettingsRef.current = prev
        return {
          ...prev,
          ...normalizedUpdates
        }
      })

      // If user is not authenticated, just keep the local optimistic value
      if (!user) {
        return
      }

      try {
        const service = new SettingsService(user.uid)
        await service.updateWatchlistSettings(normalizedUpdates)
        setError(null)
      } catch (err) {
        console.error('Error updating watchlist settings:', err)
        setError(err instanceof Error ? err.message : 'Failed to update settings')
        setSettings(previousSettingsRef.current)
        throw err
      }
    },
    [user]
  )

  // Toggle extended hours column visibility
  const toggleExtendedHours = useCallback(async () => {
    const newValue = !(settings.showExtendedHours ?? false)

    try {
      await updateSettings({ showExtendedHours: newValue })
    } catch {
      // Errors handled in updateSettings
    }
  }, [settings.showExtendedHours, updateSettings])

  return {
    settings,
    isLoading,
    error,
    toggleExtendedHours,
    updateSettings
  }
}
