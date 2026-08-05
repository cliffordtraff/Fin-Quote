import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  parseDashboardPreferences,
} from '@/lib/dashboard/preferences'

describe('parseDashboardPreferences', () => {
  it('returns defaults for missing or unsupported data', () => {
    expect(parseDashboardPreferences(null)).toEqual(DEFAULT_DASHBOARD_PREFERENCES)
    expect(parseDashboardPreferences('{"version":2}')).toEqual(DEFAULT_DASHBOARD_PREFERENCES)
  })

  it('normalizes persisted symbols and layout preferences', () => {
    expect(parseDashboardPreferences(JSON.stringify({
      version: 1,
      watchlistSymbols: [' tsla ', 'AAPL', 'TSLA', 'not valid!'],
      moverSession: 'afterhours',
      crossAssetExpanded: true,
      flowsExpanded: true,
      sp500MoversExpanded: false,
    }))).toEqual({
      version: 1,
      watchlistSymbols: ['TSLA', 'AAPL'],
      moverSession: 'afterhours',
      crossAssetExpanded: true,
      flowsExpanded: true,
      sp500MoversExpanded: false,
    })
  })
})
