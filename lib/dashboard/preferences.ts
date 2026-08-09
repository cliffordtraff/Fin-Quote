import { normalizeWatchlistSymbols } from './watchlist-contract'

export const DASHBOARD_PREFERENCES_STORAGE_KEY = 'the-intraday:dashboard-preferences:v1'

export type DashboardMoverSession = 'premarket' | 'cash' | 'afterhours'

export interface DashboardPreferences {
  version: 1
  watchlistSymbols: string[] | null
  moverSession: DashboardMoverSession | null
  crossAssetExpanded: boolean
  flowsExpanded: boolean
  sp500MoversExpanded: boolean
}

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  version: 1,
  watchlistSymbols: null,
  moverSession: null,
  crossAssetExpanded: false,
  flowsExpanded: false,
  sp500MoversExpanded: false,
}

function normalizeSymbols(value: unknown): string[] | null {
  if (value === null) return null
  if (!Array.isArray(value)) return null
  return normalizeWatchlistSymbols(value)
}

export function parseDashboardPreferences(raw: string | null): DashboardPreferences {
  if (!raw) return DEFAULT_DASHBOARD_PREFERENCES

  try {
    const value = JSON.parse(raw) as Partial<DashboardPreferences>
    if (value.version !== 1) return DEFAULT_DASHBOARD_PREFERENCES

    return {
      version: 1,
      watchlistSymbols: normalizeSymbols(value.watchlistSymbols),
      moverSession:
        value.moverSession === 'premarket'
        || value.moverSession === 'cash'
        || value.moverSession === 'afterhours'
          ? value.moverSession
          : null,
      crossAssetExpanded: value.crossAssetExpanded === true,
      flowsExpanded: value.flowsExpanded === true,
      sp500MoversExpanded: value.sp500MoversExpanded === true,
    }
  } catch {
    return DEFAULT_DASHBOARD_PREFERENCES
  }
}
