import { beforeEach, describe, expect, it, vi } from 'vitest'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  getCurrentUserAdminContext: vi.fn(),
  getMarketStatus: vi.fn(),
  getTradingDate: vi.fn(),
  getProvider: vi.fn(),
  getGainers: vi.fn(),
  getLosers: vi.fn(),
  selectWhyMovedCandidates: vi.fn(),
  listWhyMovedEditorialInbox: vi.fn(),
  listDraftSummaries: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/lib/auth/admin', () => ({
  getCurrentUserAdminContext: mocks.getCurrentUserAdminContext,
}))
vi.mock('@/lib/market-hours', () => ({
  getMarketStatus: mocks.getMarketStatus,
  getTradingDate: mocks.getTradingDate,
}))
vi.mock('@/lib/providers', () => ({
  getProvider: mocks.getProvider,
}))
vi.mock('@/lib/why-moved-review', () => ({
  listWhyMovedEditorialInbox: mocks.listWhyMovedEditorialInbox,
  selectWhyMovedCandidates: mocks.selectWhyMovedCandidates,
  WhyMovedReviewValidationError: class WhyMovedReviewValidationError extends Error {},
}))
vi.mock('@/lib/newsletter/draft-summary-read', () => ({
  listNewsletterDraftSummariesBySourceReviewKeys: mocks.listDraftSummaries,
}))
vi.mock('@/components/WhyMovedReviewQueue', () => ({
  default: vi.fn(),
}))

import WhyMovedReviewPage from '@/app/admin/why-moved/page'

describe('Why Moved admin page reads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentUserAdminContext.mockResolvedValue({
      user: { id: 'admin-1' },
      isAdmin: true,
    })
    mocks.getTradingDate.mockReturnValue('2026-08-08')
    mocks.getMarketStatus.mockReturnValue({ session: 'cash' })
    mocks.getProvider.mockReturnValue({
      getGainers: mocks.getGainers,
      getLosers: mocks.getLosers,
    })
    mocks.selectWhyMovedCandidates.mockReturnValue([
      { reviewKey: 'market:2026-08-08:AAPL' },
    ])
    mocks.listDraftSummaries.mockResolvedValue([])
  })

  it('starts independent reads together and starts draft lookup as soon as inbox keys exist', async () => {
    const searchParams = deferred<Record<string, string>>()
    const gainers = deferred<unknown[]>()
    const losers = deferred<unknown[]>()
    const inbox = deferred<Record<string, unknown>>()
    const globalFacets = deferred<Record<string, unknown>>()
    mocks.getGainers.mockReturnValue(gainers.promise)
    mocks.getLosers.mockReturnValue(losers.promise)
    mocks.listWhyMovedEditorialInbox
      .mockReturnValueOnce(globalFacets.promise)
      .mockReturnValueOnce(inbox.promise)

    const pagePromise = WhyMovedReviewPage({
      searchParams: searchParams.promise,
    })

    await vi.waitFor(() => {
      expect(mocks.getGainers).toHaveBeenCalledTimes(1)
      expect(mocks.getLosers).toHaveBeenCalledTimes(1)
    })
    expect(mocks.listWhyMovedEditorialInbox).not.toHaveBeenCalled()

    searchParams.resolve({ status: 'pending' })
    await vi.waitFor(() => {
      expect(mocks.listWhyMovedEditorialInbox).toHaveBeenCalledTimes(1)
    })
    expect(mocks.listWhyMovedEditorialInbox.mock.calls[0]?.[0]).toMatchObject({
      status: 'all',
      pageSize: 1,
      currentReviewKeys: [],
    })

    gainers.resolve([])
    losers.resolve([])
    await vi.waitFor(() => {
      expect(mocks.listWhyMovedEditorialInbox).toHaveBeenCalledTimes(2)
    })
    expect(mocks.listWhyMovedEditorialInbox.mock.calls[1]?.[0]).toMatchObject({
      status: 'pending',
      pageSize: 25,
      currentReviewKeys: ['market:2026-08-08:AAPL'],
    })

    inbox.resolve({
      items: [
        {
          review: { reviewKey: 'market:2026-08-08:AAPL' },
        },
      ],
      total: 1,
      statusCounts: {},
    })
    await vi.waitFor(() => {
      expect(mocks.listDraftSummaries).toHaveBeenCalledWith(
        { ownerId: 'admin-1' },
        ['market:2026-08-08:AAPL'],
      )
    })

    globalFacets.resolve({ total: 1, statusCounts: {} })
    await expect(pagePromise).resolves.toBeTruthy()
  })
})
