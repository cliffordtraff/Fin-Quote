import { describe, expect, it } from 'vitest'

import {
  buildWarmRunComparisonRow,
  formatWarmRunComparison,
  mergeWarmRetryResults,
  resolveWarmProfile,
  summarizeWarmResults,
  type WarmResult,
} from '@/lib/wiim/warm'

function result(overrides: Partial<WarmResult>): WarmResult {
  return {
    symbol: 'AAPL',
    status: 'found',
    displayText: 'Apple rises on AI demand',
    errorMessage: null,
    source: 'live',
    pass: 1,
    ...overrides,
  }
}

describe('summarizeWarmResults', () => {
  it('counts skipped fresh rows separately from live errors', () => {
    const summary = summarizeWarmResults([
      result({ symbol: 'AAPL', status: 'found' }),
      result({ symbol: 'MSFT', status: 'not_found', displayText: null }),
      result({ symbol: 'NVDA', status: 'error', displayText: null, errorMessage: 'timeout' }),
      result({ symbol: 'UNH', status: 'skipped_fresh', source: 'cache' }),
    ])

    expect(summary.successCount).toBe(1)
    expect(summary.notFoundCount).toBe(1)
    expect(summary.errorCount).toBe(1)
    expect(summary.skippedFreshCount).toBe(1)
    expect(summary.errorRate).toBe(0.333)
    expect(summary.errorSymbols).toEqual(['NVDA'])
  })
})

describe('mergeWarmRetryResults', () => {
  it('replaces first-pass errors with successful second-pass results', () => {
    const merged = mergeWarmRetryResults(
      [
        result({ symbol: 'AAPL', status: 'found' }),
        result({ symbol: 'NVDA', status: 'error', displayText: null, errorMessage: 'parse failure' }),
      ],
      [
        result({ symbol: 'NVDA', status: 'not_found', displayText: null, errorMessage: null, pass: 2 }),
      ],
    )

    expect(merged.find((item) => item.symbol === 'NVDA')?.status).toBe('not_found')
    expect(merged.find((item) => item.symbol === 'NVDA')?.pass).toBe(2)
  })

  it('keeps the original error when the retry pass still fails', () => {
    const merged = mergeWarmRetryResults(
      [result({ symbol: 'NVDA', status: 'error', displayText: null, errorMessage: 'first failure' })],
      [result({ symbol: 'NVDA', status: 'error', displayText: null, errorMessage: 'second failure', pass: 2 })],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.errorMessage).toBe('first failure')
    expect(merged[0]?.pass).toBe(1)
  })
})

describe('resolveWarmProfile', () => {
  it('defaults to balanced settings', () => {
    expect(resolveWarmProfile(undefined).concurrency).toBe(2)
  })

  it('returns gentle settings when requested', () => {
    expect(resolveWarmProfile('gentle').concurrency).toBe(1)
  })
})

describe('warm run comparison helpers', () => {
  it('builds and formats a comparison table from saved warm-run JSON', () => {
    const row = buildWarmRunComparisonRow('run-a.json', {
      profile: 'gentle',
      universeMode: 'all_sp500',
      results: [
        result({ symbol: 'AAPL', status: 'found' }),
        result({ symbol: 'MSFT', status: 'skipped_fresh', source: 'cache' }),
      ],
    })

    expect(row.successCount).toBe(1)
    expect(row.skippedFreshCount).toBe(1)
    expect(formatWarmRunComparison([row])).toContain('run-a.json')
  })
})
