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

const VALID_SYMBOL = /^[A-Z]{1,10}(?:\.[A-Z]{1,4}|=[A-Z])?$/

function normalizeSymbols(value: unknown): string[] | null {
  if (value === null) return null
  if (!Array.isArray(value)) return null

  return Array.from(
    new Set(
      value
        .filter((symbol): symbol is string => typeof symbol === 'string')
        .map((symbol) => symbol.trim().toUpperCase())
        .filter((symbol) => VALID_SYMBOL.test(symbol)),
    ),
  ).slice(0, 20)
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
