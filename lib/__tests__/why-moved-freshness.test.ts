import { describe, expect, it } from 'vitest'
import { getWhyMovedEditorialFreshness } from '@/lib/why-moved-freshness'
import type { WhyMovedEditorialInboxItem } from '@/lib/why-moved-types'

const now = new Date('2026-08-08T16:00:00.000Z')

function item(
  overrides: {
    firstSeenAt?: string
    catalystFetchedAt?: string
    snapshotState?: 'captured' | 'legacy_missing'
    status?: 'pending' | 'approved' | 'needs_work' | 'dismissed'
  } = {},
): WhyMovedEditorialInboxItem {
  const firstSeenAt =
    overrides.firstSeenAt ?? '2026-08-08T15:30:00.000Z'
  return {
    candidate: {
      reviewKey: '2026-08-08:cash:gainer:AAPL',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      price: 220,
      change: 7,
      changesPercentage: 3.2,
      direction: 'gainer',
      session: 'cash',
      marketDate: '2026-08-08',
    },
    catalyst: {
      symbol: 'AAPL',
      status: 'found',
      displayText: 'Apple rose after a product announcement.',
      headline: 'Apple unveils product update',
      summary: 'Shares advanced after the announcement.',
      bulletPoints: [],
      sentiment: 'positive',
      source: 'finviz',
      sourceTimestamp: '2026-08-08T14:00:00.000Z',
      isCatalyst: true,
      sourceUrl: 'https://example.com/apple',
      fetchedAt:
        overrides.catalystFetchedAt ?? '2026-08-08T15:40:00.000Z',
      errorMessage: null,
    },
    review: {
      id: 'review-1',
      reviewKey: '2026-08-08:cash:gainer:AAPL',
      symbol: 'AAPL',
      marketDate: '2026-08-08',
      session: 'cash',
      direction: 'gainer',
      status: overrides.status ?? 'pending',
      notes: '',
      reviewerId: null,
      reviewedAt: null,
      createdAt: firstSeenAt,
      updatedAt: firstSeenAt,
      candidateSnapshot: {} as never,
      catalystSnapshot: {} as never,
      snapshotState: overrides.snapshotState ?? 'captured',
      discoveryRunId: 'wiim-run-1',
      firstSeenAt,
      lastSeenAt: firstSeenAt,
    },
    current: true,
  }
}

describe('getWhyMovedEditorialFreshness', () => {
  it('keeps a newly captured queue item fresh', () => {
    expect(getWhyMovedEditorialFreshness(item(), now)).toMatchObject({
      queue: { state: 'fresh', ageMinutes: 30 },
      catalyst: { state: 'fresh', ageMinutes: 20 },
      needsAttention: false,
    })
  })

  it('marks an unresolved old queue entry and catalyst stale independently', () => {
    const result = getWhyMovedEditorialFreshness(
      item({
        firstSeenAt: '2026-08-08T10:00:00.000Z',
        catalystFetchedAt: '2026-08-08T09:00:00.000Z',
      }),
      now,
    )

    expect(result.queue).toMatchObject({ state: 'stale', ageMinutes: 360 })
    expect(result.catalyst).toMatchObject({
      state: 'stale',
      ageMinutes: 420,
    })
    expect(result.needsAttention).toBe(true)
  })

  it('fails closed when a legacy review has no discovery-time catalyst', () => {
    const result = getWhyMovedEditorialFreshness(
      item({ snapshotState: 'legacy_missing' }),
      now,
    )

    expect(result.catalyst).toEqual({
      state: 'missing',
      ageMinutes: null,
      label: 'Discovery-time catalyst missing',
    })
    expect(result.needsAttention).toBe(true)
  })

  it('does not raise an attention flag after an item is resolved', () => {
    const result = getWhyMovedEditorialFreshness(
      item({
        status: 'dismissed',
        firstSeenAt: '2026-08-07T10:00:00.000Z',
        catalystFetchedAt: '2026-08-07T10:00:00.000Z',
      }),
      now,
    )

    expect(result.queue.state).toBe('stale')
    expect(result.needsAttention).toBe(false)
  })
})
