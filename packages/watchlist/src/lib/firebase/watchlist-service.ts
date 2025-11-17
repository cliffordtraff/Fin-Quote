import type { WatchlistTab } from '@watchlist/types'

interface WatchlistResponse {
  tabs: WatchlistTab[]
  activeTabIndex: number
}

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
    const message = text || response.statusText
    throw new Error(message || 'Request failed')
  }

  return (await response.json()) as T
}

export class WatchlistService {
  // The constructor signature stays the same to match Sunday’s hook usage
  constructor(private _userId: string) {}

  async getWatchlist(): Promise<{ tabs: WatchlistTab[]; activeTabIndex: number } | null> {
    try {
      return await apiRequest<WatchlistResponse>('/api/watchlist')
    } catch (error) {
      console.warn('[watchlist] Failed to load watchlist, falling back to defaults', error)
      return null
    }
  }

  async saveWatchlist(tabs: WatchlistTab[], activeTabIndex: number): Promise<void> {
    await apiRequest<WatchlistResponse>('/api/watchlist', {
      method: 'PUT',
      body: JSON.stringify({ tabs, activeTabIndex })
    })
  }

  async updateTabs(tabs: WatchlistTab[]): Promise<void> {
    await apiRequest<WatchlistResponse>('/api/watchlist', {
      method: 'PUT',
      body: JSON.stringify({ tabs })
    })
  }

  async updateActiveTabIndex(activeTabIndex: number): Promise<void> {
    await apiRequest<WatchlistResponse>('/api/watchlist', {
      method: 'PUT',
      body: JSON.stringify({ activeTabIndex })
    })
  }

  async migrateFromLocalStorage(): Promise<boolean> {
    try {
      const localTabs = localStorage.getItem('watchlistTabs')
      if (!localTabs) {
        return false
      }

      const tabs = JSON.parse(localTabs) as WatchlistTab[]
      const activeTabIndex = parseInt(localStorage.getItem('activeWatchlistTabIndex') || '0', 10) || 0

      await this.saveWatchlist(tabs, activeTabIndex)
      localStorage.removeItem('pendingDataImport')
      return true
    } catch (error) {
      console.warn('[watchlist] Failed to migrate local data', error)
      return false
    }
  }
}
