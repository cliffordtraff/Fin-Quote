import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BeehiivDeliveryRecord } from '@/lib/beehiiv/types'

const mocks = vi.hoisted(() => ({
  appendNewsletterDraftEvent: vi.fn(),
  claimBeehiivDeliveriesForReconciliation: vi.fn(),
  createServiceRoleClient: vi.fn(),
  createNewsletterNotification: vi.fn(),
  getBeehiivPostState: vi.fn(),
  getNewsletterDraft: vi.fn(),
  markBeehiivLifecycleApplied: vi.fn(),
  recordBeehiivReconciliationError: vi.fn(),
  recordNewsletterPublication: vi.fn(),
  releaseBeehiivReconciliationLease: vi.fn(),
  renewBeehiivReconciliationLease: vi.fn(),
  updateBeehiivDeliveryLifecycle: vi.fn(),
}))

vi.mock('@/lib/beehiiv/client', () => ({
  getBeehiivPostState: mocks.getBeehiivPostState,
}))

vi.mock('@/lib/beehiiv/store', () => ({
  claimBeehiivDeliveriesForReconciliation:
    mocks.claimBeehiivDeliveriesForReconciliation,
  markBeehiivLifecycleApplied: mocks.markBeehiivLifecycleApplied,
  recordBeehiivReconciliationError:
    mocks.recordBeehiivReconciliationError,
  releaseBeehiivReconciliationLease:
    mocks.releaseBeehiivReconciliationLease,
  renewBeehiivReconciliationLease:
    mocks.renewBeehiivReconciliationLease,
  updateBeehiivDeliveryLifecycle:
    mocks.updateBeehiivDeliveryLifecycle,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

vi.mock('@/lib/newsletter/drafts', () => ({
  appendNewsletterDraftEvent: mocks.appendNewsletterDraftEvent,
  getNewsletterDraft: mocks.getNewsletterDraft,
}))

vi.mock('@/lib/newsletter/publication', () => ({
  recordNewsletterPublication: mocks.recordNewsletterPublication,
}))

vi.mock('@/lib/newsletter/notifications', () => ({
  createNewsletterNotification: mocks.createNewsletterNotification,
}))

import {
  reconcileBeehiivDelivery,
  reconcileBeehiivDeliveryQueue,
} from '../beehiiv-lifecycle'

const OWNER_ID = '00000000-0000-4000-8000-000000000001'
const LEASE_TOKEN = '00000000-0000-4000-8000-000000000099'

function deliveryFixture(
  overrides: Partial<BeehiivDeliveryRecord> = {},
): BeehiivDeliveryRecord {
  return {
    id: 'delivery-1',
    draftId: '00000000-0000-4000-8000-000000000002',
    ownerId: OWNER_ID,
    publicationId: 'pub_00000000-0000-0000-0000-000000000003',
    postId: 'post_00000000-0000-0000-0000-000000000004',
    title: 'Morning setup',
    previewUrl: null,
    editorUrl: 'https://app.beehiiv.com/posts/post-1',
    webUrl: null,
    contentHash: 'hash',
    lifecycleStatus: 'draft',
    lifecycleAppliedStatus: 'draft',
    lifecycleAppliedAt: '2026-08-06T12:00:00.000Z',
    beehiivStatus: 'draft',
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
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createNewsletterNotification.mockResolvedValue({
    notification: {},
    created: true,
  })
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.maybeSingle.mockResolvedValue({
    data: { session_id: 'session-1', status: 'ready' },
    error: null,
  })
  mocks.createServiceRoleClient.mockReturnValue({
    from: vi.fn().mockReturnValue(builder),
  })
  mocks.getBeehiivPostState.mockResolvedValue({
    postId: 'post_00000000-0000-0000-0000-000000000004',
    status: 'published',
    publishDate: '2026-08-06T13:00:00.000Z',
    webUrl: 'https://theintraday.beehiiv.com/p/morning-setup',
    stats: {},
  })
  mocks.updateBeehiivDeliveryLifecycle.mockImplementation(async (input) =>
    deliveryFixture({
      lifecycleStatus: input.lifecycleStatus,
      lifecycleAppliedStatus: 'draft',
      beehiivStatus: input.beehiivStatus,
      scheduledAt: input.scheduledAt,
      publishedAt: input.publishedAt,
      webUrl: input.webUrl,
    }),
  )
  mocks.markBeehiivLifecycleApplied.mockImplementation(async (input) =>
    deliveryFixture({
      lifecycleStatus: input.lifecycleStatus,
      lifecycleAppliedStatus: input.lifecycleStatus,
      lifecycleAppliedAt: '2026-08-06T13:01:00.000Z',
      beehiivStatus: 'published',
      publishedAt: '2026-08-06T13:00:00.000Z',
      webUrl: 'https://theintraday.beehiiv.com/p/morning-setup',
    }),
  )
  mocks.recordBeehiivReconciliationError.mockResolvedValue(undefined)
  mocks.releaseBeehiivReconciliationLease.mockResolvedValue(undefined)
  mocks.renewBeehiivReconciliationLease.mockImplementation(async () =>
    deliveryFixture(),
  )
})

describe('Beehiiv lifecycle orchestration', () => {
  it('accepts a publication write that persisted before its history write failed', async () => {
    mocks.recordNewsletterPublication.mockRejectedValueOnce(
      new Error('history insert failed'),
    )
    mocks.getNewsletterDraft.mockResolvedValue({
      status: 'published',
      beehiivUrl: 'https://theintraday.beehiiv.com/p/morning-setup',
    })

    const result = await reconcileBeehiivDelivery(deliveryFixture(), {
      leaseToken: LEASE_TOKEN,
    })

    expect(result.lifecycleAppliedStatus).toBe('published')
    expect(mocks.appendNewsletterDraftEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.objectContaining({
        type: 'beehiiv_published',
        dedupeKey: expect.stringContaining('beehiiv-lifecycle:'),
      }),
    )
    expect(mocks.markBeehiivLifecycleApplied).toHaveBeenCalledTimes(1)
    expect(mocks.recordBeehiivReconciliationError).not.toHaveBeenCalled()
  })

  it('leaves a transition unapplied after a side-effect failure so retry completes it', async () => {
    mocks.recordNewsletterPublication.mockResolvedValue({})
    mocks.appendNewsletterDraftEvent.mockRejectedValueOnce(
      new Error('event insert unavailable'),
    )

    await expect(
      reconcileBeehiivDelivery(deliveryFixture(), {
        leaseToken: LEASE_TOKEN,
      }),
    ).rejects.toThrow('event insert unavailable')
    expect(mocks.markBeehiivLifecycleApplied).not.toHaveBeenCalled()
    expect(mocks.recordBeehiivReconciliationError).toHaveBeenCalledTimes(1)

    mocks.appendNewsletterDraftEvent.mockResolvedValue({})
    const retry = await reconcileBeehiivDelivery(
      deliveryFixture({
        lifecycleStatus: 'published',
        lifecycleAppliedStatus: 'draft',
        lastReconcileError: 'event insert unavailable',
      }),
      { leaseToken: LEASE_TOKEN },
    )
    expect(retry.lifecycleAppliedStatus).toBe('published')
    expect(mocks.markBeehiivLifecycleApplied).toHaveBeenCalledTimes(1)
  })

  it('refreshes published stats without repeating lifecycle side effects', async () => {
    const previousStats = {
      email: { recipients: 10, delivered: 9, unique_opens: 2 },
    }
    mocks.getBeehiivPostState.mockResolvedValueOnce({
      postId: 'post_00000000-0000-0000-0000-000000000004',
      status: 'published',
      publishDate: '2026-08-06T13:00:00.000Z',
      webUrl: 'https://theintraday.beehiiv.com/p/morning-setup',
      stats: null,
    })
    mocks.updateBeehiivDeliveryLifecycle.mockImplementationOnce(async (input) =>
      deliveryFixture({
        lifecycleStatus: input.lifecycleStatus,
        lifecycleAppliedStatus: 'published',
        stats: input.stats,
        beehiivStatus: input.beehiivStatus,
        publishedAt: input.publishedAt,
        webUrl: input.webUrl,
      }),
    )

    const result = await reconcileBeehiivDelivery(
      deliveryFixture({
        lifecycleStatus: 'published',
        lifecycleAppliedStatus: 'published',
        publishedAt: '2026-08-06T13:00:00.000Z',
        webUrl: 'https://theintraday.beehiiv.com/p/morning-setup',
        stats: previousStats,
      }),
      { leaseToken: LEASE_TOKEN },
    )

    expect(result.stats).toEqual(previousStats)
    expect(mocks.updateBeehiivDeliveryLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ stats: previousStats }),
    )
    expect(mocks.recordNewsletterPublication).not.toHaveBeenCalled()
    expect(mocks.appendNewsletterDraftEvent).not.toHaveBeenCalled()
    expect(mocks.markBeehiivLifecycleApplied).not.toHaveBeenCalled()
  })

  it('fences every lifecycle mutation with the active lease', async () => {
    mocks.recordNewsletterPublication.mockResolvedValue({})
    mocks.appendNewsletterDraftEvent.mockResolvedValue({})

    await reconcileBeehiivDelivery(deliveryFixture(), {
      leaseToken: LEASE_TOKEN,
    })

    expect(mocks.updateBeehiivDeliveryLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: expect.stringMatching(/^post_/),
        leaseToken: LEASE_TOKEN,
      }),
    )
    expect(mocks.renewBeehiivReconciliationLease).toHaveBeenCalledWith(
      expect.objectContaining({ leaseToken: LEASE_TOKEN }),
    )
    expect(mocks.markBeehiivLifecycleApplied).toHaveBeenCalledWith(
      expect.objectContaining({ leaseToken: LEASE_TOKEN }),
    )
  })

  it('does not run stale lifecycle side effects after its lease is rejected', async () => {
    mocks.updateBeehiivDeliveryLifecycle.mockRejectedValueOnce(
      new Error('Beehiiv reconciliation lease expired'),
    )

    await expect(
      reconcileBeehiivDelivery(deliveryFixture(), {
        leaseToken: LEASE_TOKEN,
      }),
    ).rejects.toThrow('lease expired')

    expect(mocks.recordNewsletterPublication).not.toHaveBeenCalled()
    expect(mocks.appendNewsletterDraftEvent).not.toHaveBeenCalled()
    expect(mocks.markBeehiivLifecycleApplied).not.toHaveBeenCalled()
    expect(mocks.recordBeehiivReconciliationError).toHaveBeenCalledWith(
      expect.objectContaining({ leaseToken: LEASE_TOKEN }),
    )
  })

  it('claims a leased batch, processes concurrently, and releases every row', async () => {
    const deliveries = [1, 2, 3, 4].map((index) =>
      deliveryFixture({
        id: `delivery-${index}`,
        draftId: `00000000-0000-4000-8000-00000000000${index + 1}`,
        lifecycleAppliedStatus: 'draft',
      }),
    )
    mocks.claimBeehiivDeliveriesForReconciliation.mockResolvedValue(deliveries)
    mocks.recordNewsletterPublication.mockResolvedValue({})
    mocks.appendNewsletterDraftEvent.mockResolvedValue({})

    const result = await reconcileBeehiivDeliveryQueue(12, 4)

    expect(result).toMatchObject({ attempted: 4, updated: 4, failed: [] })
    expect(mocks.claimBeehiivDeliveriesForReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 12, leaseToken: expect.any(String) }),
    )
    expect(mocks.releaseBeehiivReconciliationLease).toHaveBeenCalledTimes(4)
  })
})
