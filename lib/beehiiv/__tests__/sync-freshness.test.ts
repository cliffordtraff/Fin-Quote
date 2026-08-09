import { describe, expect, it } from 'vitest'
import { beehiivDeliveryNeedsSync } from '../sync-freshness'

describe('Beehiiv delivery source freshness', () => {
  it('treats the exact source draft version as current across ISO offset formats', () => {
    expect(
      beehiivDeliveryNeedsSync('2026-08-07T14:30:00.123456Z', {
        sourceDraftUpdatedAt: '2026-08-07T10:30:00.123456-04:00',
        syncedAt: '2026-08-07T14:31:00.000Z',
      }),
    ).toBe(false)
  })

  it('detects a newer save separated by only one microsecond', () => {
    expect(
      beehiivDeliveryNeedsSync('2026-08-07T14:30:00.123457Z', {
        sourceDraftUpdatedAt: '2026-08-07T14:30:00.123456Z',
        syncedAt: '2026-08-07T14:31:00.000Z',
      }),
    ).toBe(true)
  })

  it('fails closed for legacy receipts whose completion time cannot prove content identity', () => {
    expect(
      beehiivDeliveryNeedsSync('2026-08-07T14:30:00.123457Z', {
        sourceDraftUpdatedAt: null,
        syncedAt: '2026-08-07T14:31:00.000000Z',
      }),
    ).toBe(true)
    expect(
      beehiivDeliveryNeedsSync('2026-08-07T14:30:00.123455Z', {
        sourceDraftUpdatedAt: null,
        syncedAt: '2026-08-07T14:31:00.000000Z',
      }),
    ).toBe(true)
  })

  it('fails closed when receipt timestamps are malformed', () => {
    expect(
      beehiivDeliveryNeedsSync('2026-08-07T14:30:00.123456Z', {
        sourceDraftUpdatedAt: 'not-a-timestamp',
        syncedAt: '2026-08-07T14:31:00.000Z',
      }),
    ).toBe(true)
  })
})
