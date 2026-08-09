import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  in: vi.fn(),
  range: vi.fn(),
  abortSignal: vi.fn(),
  then: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import {
  BeehiivDeliveryListLimitError,
  countBeehiivDeliveriesByLifecycle,
  listBeehiivDeliveries,
} from '../store'

interface DeliveryRow {
  id: string
  draft_id: string
  owner_id: string
  publication_id: string
  beehiiv_post_id: string
  title: string
  preview_url: string | null
  editor_url: string
  content_hash: string
  source_draft_updated_at: string | null
  lifecycle_status: string
  lifecycle_applied_status: string | null
  lifecycle_applied_at: string | null
  beehiiv_status: string | null
  scheduled_at: string | null
  published_at: string | null
  web_url: string | null
  stats_json: Record<string, unknown>
  stats_last_fetched_at: string | null
  stats_last_error: string | null
  synced_at: string
  last_reconciled_at: string | null
  last_reconcile_error: string | null
  reconcile_lease_token: string | null
  reconcile_lease_expires_at: string | null
  created_at: string
  updated_at: string
}

function deliveryRow(index: number, id = `delivery-${index}`): DeliveryRow {
  const timestamp = new Date(Date.UTC(2026, 7, 6, 12, 0, index)).toISOString()
  return {
    id,
    draft_id: `draft-${index}`,
    owner_id: 'owner-1',
    publication_id: 'publication-1',
    beehiiv_post_id: `post-${index}`,
    title: `Issue ${index}`,
    preview_url: null,
    editor_url: `https://app.beehiiv.com/posts/post-${index}`,
    content_hash: `hash-${index}`,
    source_draft_updated_at: null,
    lifecycle_status: 'draft',
    lifecycle_applied_status: null,
    lifecycle_applied_at: null,
    beehiiv_status: 'draft',
    scheduled_at: null,
    published_at: null,
    web_url: null,
    stats_json: {},
    stats_last_fetched_at: null,
    stats_last_error: null,
    synced_at: timestamp,
    last_reconciled_at: null,
    last_reconcile_error: null,
    reconcile_lease_token: null,
    reconcile_lease_expires_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.abortSignal.mockReset()
  mocks.then.mockReset()
  const query = {
    eq: mocks.eq,
    order: mocks.order,
    in: mocks.in,
    range: mocks.range,
    abortSignal: mocks.abortSignal,
    then: mocks.then,
  }
  mocks.from.mockReturnValue({ select: mocks.select })
  mocks.select.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
  mocks.order.mockReturnValue(query)
  mocks.in.mockReturnValue(query)
  mocks.abortSignal.mockReturnValue(query)
  mocks.createServiceRoleClient.mockReturnValue({ from: mocks.from })
})

describe('listBeehiivDeliveries', () => {
  it('continues beyond the Supabase 1,000-row response cap', async () => {
    const rows = Array.from({ length: 1_002 }, (_, index) =>
      deliveryRow(index),
    )
    mocks.range.mockImplementation(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }))

    const deliveries = await listBeehiivDeliveries('owner-1')

    expect(deliveries).toHaveLength(1_002)
    expect(new Set(deliveries.map((delivery) => delivery.id)).size).toBe(1_002)
    expect(mocks.range.mock.calls).toEqual([
      [0, 999],
      [1_000, 1_999],
    ])
    expect(mocks.order).toHaveBeenCalledWith('updated_at', {
      ascending: false,
    })
    expect(mocks.order).toHaveBeenCalledWith('id', { ascending: false })
  })

  it('de-duplicates a row repeated across page boundaries', async () => {
    const firstPage = Array.from({ length: 1_000 }, (_, index) =>
      deliveryRow(index),
    )
    mocks.range
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({
        data: [deliveryRow(999), deliveryRow(1_000)],
        error: null,
      })

    const deliveries = await listBeehiivDeliveries('owner-1', [
      'draft-1',
      'draft-1',
      '',
    ])

    expect(deliveries).toHaveLength(1_001)
    expect(
      deliveries.filter((delivery) => delivery.id === 'delivery-999'),
    ).toHaveLength(1)
    expect(mocks.in).toHaveBeenCalledWith('draft_id', ['draft-1'])
  })

  it('fails explicitly when a continuation exists beyond the hard ceiling', async () => {
    mocks.range.mockImplementation(async (from: number, to: number) => ({
      data: Array.from({ length: to - from + 1 }, (_, index) =>
        deliveryRow(from + index),
      ),
      error: null,
    }))

    const result = listBeehiivDeliveries('owner-1')

    await expect(result).rejects.toMatchObject({
      name: 'BeehiivDeliveryListLimitError',
      limit: 10_000,
      continuationOffset: 10_000,
    })
    await expect(result).rejects.toBeInstanceOf(BeehiivDeliveryListLimitError)
    expect(mocks.range).toHaveBeenLastCalledWith(10_000, 10_000)
  })

  it('returns an exact hard-ceiling result when the continuation probe is empty', async () => {
    mocks.range.mockImplementation(async (from: number, to: number) => ({
      data:
        from >= 10_000
          ? []
          : Array.from({ length: to - from + 1 }, (_, index) =>
              deliveryRow(from + index),
            ),
      error: null,
    }))

    const deliveries = await listBeehiivDeliveries('owner-1')

    expect(deliveries).toHaveLength(10_000)
    expect(mocks.range).toHaveBeenLastCalledWith(10_000, 10_000)
  })

  it('propagates a later page failure instead of returning a partial list', async () => {
    mocks.range
      .mockResolvedValueOnce({
        data: Array.from({ length: 1_000 }, (_, index) => deliveryRow(index)),
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'page query failed' },
      })

    await expect(listBeehiivDeliveries('owner-1')).rejects.toThrow(
      'Failed to load Beehiiv deliveries: page query failed',
    )
  })
})

describe('countBeehiivDeliveriesByLifecycle', () => {
  it('loads fixed count-only facets without hydrating delivery rows', async () => {
    const responses = [2, 3, 5, 7, 11].map((count) => ({
      count,
      data: null,
      error: null,
    }))
    mocks.then.mockImplementation((onFulfilled, onRejected) =>
      Promise.resolve(responses.shift()).then(onFulfilled, onRejected),
    )
    const controller = new AbortController()

    await expect(
      countBeehiivDeliveriesByLifecycle(
        'owner-1',
        controller.signal,
      ),
    ).resolves.toEqual({
      draft: 2,
      scheduled: 3,
      published: 5,
      archived: 7,
      unknown: 11,
    })

    expect(mocks.select).toHaveBeenCalledTimes(5)
    for (const call of mocks.select.mock.calls) {
      expect(call).toEqual(['id', { count: 'exact', head: true }])
    }
    expect(mocks.eq.mock.calls.filter(([column]) => column === 'owner_id')).toEqual(
      Array.from({ length: 5 }, () => ['owner_id', 'owner-1']),
    )
    expect(
      mocks.eq.mock.calls
        .filter(([column]) => column === 'lifecycle_status')
        .map(([, status]) => status),
    ).toEqual(['draft', 'scheduled', 'published', 'archived', 'unknown'])
    expect(mocks.abortSignal).toHaveBeenCalledTimes(5)
  })

  it('fails closed when a lifecycle facet query fails', async () => {
    const responses = [
      { count: null, data: null, error: { message: 'count unavailable' } },
      ...Array.from({ length: 4 }, () => ({
        count: 0,
        data: null,
        error: null,
      })),
    ]
    mocks.then.mockImplementation((onFulfilled, onRejected) =>
      Promise.resolve(responses.shift()).then(onFulfilled, onRejected),
    )

    await expect(
      countBeehiivDeliveriesByLifecycle('owner-1'),
    ).rejects.toThrow(
      'Failed to count draft Beehiiv deliveries: count unavailable',
    )
  })

  it('does not start database work for an already-aborted request', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      countBeehiivDeliveriesByLifecycle(
        'owner-1',
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
