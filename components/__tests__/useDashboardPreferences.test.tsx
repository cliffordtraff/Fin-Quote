import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDashboardPreferences } from '@/components/useDashboardPreferences'
import { DASHBOARD_PREFERENCES_STORAGE_KEY } from '@/lib/dashboard/preferences'

describe('useDashboardPreferences', () => {
  beforeEach(() => window.localStorage.clear())

  afterEach(() => vi.restoreAllMocks())

  it('survives unavailable browser storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is disabled', 'SecurityError')
    })

    const { result } = renderHook(() => useDashboardPreferences())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    expect(result.current.storageError).toBe(true)
    expect(result.current.preferences.watchlistSymbols).toBeNull()
  })

  it('normalizes and caps symbols at the setter boundary', async () => {
    const { result } = renderHook(() => useDashboardPreferences())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => result.current.setPreference(
      'watchlistSymbols',
      ['brk-b', 'ES=F', ...Array.from({ length: 24 }, (_, index) => `T${index}`)],
    ))

    expect(result.current.preferences.watchlistSymbols).toHaveLength(20)
    expect(result.current.preferences.watchlistSymbols?.slice(0, 3)).toEqual([
      'BRK.B',
      'T0',
      'T1',
    ])
    expect(result.current.preferences.watchlistSymbols).not.toContain('ES=F')
  })

  it('accepts a newer anonymous preference from another browser tab', async () => {
    const { result } = renderHook(() => useDashboardPreferences())
    await waitFor(() => expect(result.current.loaded).toBe(true))

    act(() => window.dispatchEvent(new StorageEvent('storage', {
      key: DASHBOARD_PREFERENCES_STORAGE_KEY,
      newValue: JSON.stringify({
        version: 1,
        watchlistSymbols: ['MSFT', 'BRK-B'],
        moverSession: null,
        crossAssetExpanded: false,
        flowsExpanded: false,
        sp500MoversExpanded: false,
      }),
    })))

    expect(result.current.preferences.watchlistSymbols).toEqual(['MSFT', 'BRK.B'])
  })
})
