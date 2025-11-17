import { WatchlistSettings } from '@watchlist/types'

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || response.statusText)
  }

  return (await response.json()) as T
}

interface SettingsResponse {
  showExtendedHours: boolean
  columnWidths?: Record<string, number>
  fontScale?: number
}

export class SettingsService {
  constructor(private _userId: string) {}

  async getWatchlistSettings(): Promise<WatchlistSettings> {
    try {
      const data = await apiRequest<SettingsResponse>('/api/watchlist/settings')
      return {
        showExtendedHours: data.showExtendedHours ?? false,
        columnWidths: data.columnWidths ?? {},
        fontScale: data.fontScale ?? 1
      }
    } catch (error) {
      console.warn('[watchlist] Failed to load settings, using defaults', error)
      return { showExtendedHours: false }
    }
  }

  async updateWatchlistSettings(settings: Partial<WatchlistSettings>): Promise<void> {
    try {
      await apiRequest<SettingsResponse>('/api/watchlist/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      })
    } catch (error) {
      console.warn('[watchlist] Failed to update settings', error)
      throw error
    }
  }

  async toggleExtendedHours(enabled: boolean): Promise<void> {
    await this.updateWatchlistSettings({ showExtendedHours: enabled })
  }
}
