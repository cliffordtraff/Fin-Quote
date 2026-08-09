import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BeehiivDeliveryRecord } from '@/lib/beehiiv/types'

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  abortSignal: vi.fn(),
  then: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import { __testOnly } from '../operations'

function delivery(
  id: string,
  draftId: string,
  lifecycleStatus: BeehiivDeliveryRecord['lifecycleStatus'],
): BeehiivDeliveryRecord {
  return {
    id,
    draftId,
    ownerId: 'owner-1',
    publicationId: 'publication-1',
    postId: `post-${id}`,
    title: `Issue ${id}`,
    previewUrl: null,
    editorUrl: `https://app.beehiiv.com/posts/post-${id}`,
    webUrl: null,
    contentHash: `hash-${id}`,
    sourceDraftUpdatedAt: null,
    lifecycleStatus,
    lifecycleAppliedStatus: null,
    lifecycleAppliedAt: null,
    beehiivStatus: lifecycleStatus,
    scheduledAt: null,
    publishedAt: null,
    stats: {},
    statsLastFetchedAt: null,
    statsLastError: null,
    syncedAt: '2026-08-06T12:00:00.000Z',
    lastReconciledAt: null,
    lastReconcileError: null,
    createdAt: '2026-08-06T12:00:00.000Z',
    updatedAt: '2026-08-06T12:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.then.mockReset()
  const query = {
    eq: mocks.eq,
    is: mocks.is,
    order: mocks.order,
    limit: mocks.limit,
    abortSignal: mocks.abortSignal,
    then: mocks.then,
  }
  mocks.from.mockReturnValue({ select: mocks.select })
  mocks.select.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
  mocks.is.mockReturnValue(query)
  mocks.order.mockReturnValue(query)
  mocks.limit.mockReturnValue(query)
  mocks.abortSignal.mockReturnValue(query)
  mocks.createServiceRoleClient.mockReturnValue({ from: mocks.from })
})

describe('newsletter operations bounded Beehiiv queries', () => {
  it('loads only current-date scalar draft IDs and their filtered deliveries', async () => {
    mocks.then.mockImplementation((onFulfilled, onRejected) =>
      Promise.resolve({
        data: [{ id: 'draft-today-2' }, { id: 'draft-today-1' }],
        error: null,
      }).then(onFulfilled, onRejected),
    )
    const marketDateDeliveries = [
      delivery('delivery-2', 'draft-today-2', 'published'),
      delivery('delivery-1', 'draft-today-1', 'draft'),
    ]
    const listDeliveries = vi.fn().mockResolvedValue(marketDateDeliveries)
    const countByLifecycle = vi.fn().mockResolvedValue({
      draft: 1_000,
      scheduled: 2_000,
      published: 3_000,
      archived: 3_999,
      unknown: 1,
    })
    const controller = new AbortController()

    const result = await __testOnly.loadNewsletterOperationsBeehiivData(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      '2026-08-06',
      controller.signal,
      { listDeliveries, countByLifecycle },
    )

    expect(mocks.from).toHaveBeenCalledOnce()
    expect(mocks.from).toHaveBeenCalledWith('newsletter_drafts')
    expect(mocks.select).toHaveBeenCalledWith('id')
    expect(mocks.select).not.toHaveBeenCalledWith(
      expect.stringContaining('draft_json'),
    )
    expect(mocks.eq).toHaveBeenCalledWith(
      'source_market_date',
      '2026-08-06',
    )
    expect(mocks.limit).toHaveBeenCalledWith(
      __testOnly.NEWSLETTER_OPERATIONS_CURRENT_DRAFT_LIMIT + 1,
    )
    expect(mocks.abortSignal).toHaveBeenCalledWith(controller.signal)
    expect(listDeliveries).toHaveBeenCalledWith(
      'owner-1',
      ['draft-today-2', 'draft-today-1'],
      controller.signal,
    )
    expect(countByLifecycle).toHaveBeenCalledWith(
      'owner-1',
      controller.signal,
    )
    expect(result).toEqual({
      marketDateDeliveries,
      overallCounts: {
        draft: 1_000,
        scheduled: 2_000,
        published: 3_000,
        archived: 3_999,
        unknown: 1,
      },
      overallTotal: 10_000,
    })
  })

  it('does not run a delivery query when the current date has no drafts', async () => {
    mocks.then.mockImplementation((onFulfilled, onRejected) =>
      Promise.resolve({ data: [], error: null }).then(
        onFulfilled,
        onRejected,
      ),
    )
    const listDeliveries = vi.fn()
    const countByLifecycle = vi.fn().mockResolvedValue({
      draft: 2,
      scheduled: 0,
      published: 8,
      archived: 1,
      unknown: 0,
    })

    await expect(
      __testOnly.loadNewsletterOperationsBeehiivData(
        { ownerId: 'owner-1', sessionId: 'session-1' },
        '2026-08-06',
        undefined,
        { listDeliveries, countByLifecycle },
      ),
    ).resolves.toEqual({
      marketDateDeliveries: [],
      overallCounts: {
        draft: 2,
        scheduled: 0,
        published: 8,
        archived: 1,
        unknown: 0,
      },
      overallTotal: 11,
    })
    expect(listDeliveries).not.toHaveBeenCalled()
  })

  it('propagates a current-date query failure without returning partial data', async () => {
    mocks.then.mockImplementation((onFulfilled, onRejected) =>
      Promise.resolve({
        data: null,
        error: { message: 'draft lookup unavailable' },
      }).then(onFulfilled, onRejected),
    )
    const listDeliveries = vi.fn()
    const countByLifecycle = vi.fn().mockResolvedValue({
      draft: 0,
      scheduled: 0,
      published: 0,
      archived: 0,
      unknown: 0,
    })

    await expect(
      __testOnly.loadNewsletterOperationsBeehiivData(
        { ownerId: 'owner-1', sessionId: 'session-1' },
        '2026-08-06',
        undefined,
        { listDeliveries, countByLifecycle },
      ),
    ).rejects.toThrow(
      'Failed to load current newsletter operation drafts: draft lookup unavailable',
    )
    expect(listDeliveries).not.toHaveBeenCalled()
  })

  it('fails closed instead of presenting exact-looking counts from a truncated day', async () => {
    mocks.then.mockImplementation((onFulfilled, onRejected) =>
      Promise.resolve({
        data: Array.from(
          {
            length: __testOnly.NEWSLETTER_OPERATIONS_CURRENT_DRAFT_LIMIT + 1,
          },
          (_, index) => ({ id: `draft-${index}` }),
        ),
        error: null,
      }).then(onFulfilled, onRejected),
    )
    const listDeliveries = vi.fn()
    const countByLifecycle = vi.fn().mockResolvedValue({
      draft: 1,
      scheduled: 2,
      published: 3,
      archived: 4,
      unknown: 5,
    })

    await expect(
      __testOnly.loadNewsletterOperationsBeehiivData(
        { ownerId: 'owner-1', sessionId: 'session-1' },
        '2026-08-06',
        undefined,
        { listDeliveries, countByLifecycle },
      ),
    ).rejects.toThrow('Refusing to show partial Beehiiv counts')
    expect(listDeliveries).not.toHaveBeenCalled()
  })

  it('stops before any query when the polling request is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const listDeliveries = vi.fn()
    const countByLifecycle = vi.fn()

    await expect(
      __testOnly.loadNewsletterOperationsBeehiivData(
        { ownerId: 'owner-1', sessionId: 'session-1' },
        '2026-08-06',
        controller.signal,
        { listDeliveries, countByLifecycle },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
    expect(listDeliveries).not.toHaveBeenCalled()
    expect(countByLifecycle).not.toHaveBeenCalled()
  })
})
