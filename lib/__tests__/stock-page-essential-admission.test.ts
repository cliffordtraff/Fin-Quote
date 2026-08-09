import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCompanyProfile: vi.fn(),
  getStockOverview: vi.fn(),
}))

vi.mock('@/app/actions/get-company-profile', () => ({
  getCompanyProfile: mocks.getCompanyProfile,
}))

vi.mock('@/app/actions/stock-overview', () => ({
  getStockOverview: mocks.getStockOverview,
}))

import {
  getBoundedStockPageEssentials,
  getStockPageEssentialAdmissionStateForTests,
  resetStockPageEssentialAdmissionForTests,
  STOCK_PAGE_ESSENTIAL_CACHE_TTL_MS,
  STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES,
  STOCK_PAGE_ESSENTIAL_LOAD_TIMEOUT_MS,
} from '@/lib/stock-page-essential-admission'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function flushMicrotasks(turns = 6): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

const overview = {
  company: {
    name: 'Apple Inc.',
    symbol: 'AAPL',
    sector: 'Technology',
    industry: 'Consumer Electronics',
  },
  currentPrice: 210,
  priceChange: 1,
  priceChangePercent: 0.48,
  marketStatus: 'open' as const,
}

const profile = {
  symbol: 'AAPL',
  companyName: 'Apple Inc.',
  description: '',
  ceo: null,
  sector: null,
  industry: null,
  website: null,
  image: null,
  ipoDate: null,
  employees: null,
  country: null,
  exchange: null,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime('2026-08-08T15:00:00.000Z')
  resetStockPageEssentialAdmissionForTests()
  vi.clearAllMocks()
})

afterEach(() => {
  resetStockPageEssentialAdmissionForTests()
  vi.useRealTimers()
})

describe('bounded stock-page essential admission', () => {
  it('rejects derivative symbols before any essential provider work', async () => {
    await expect(getBoundedStockPageEssentials('ES=F')).resolves.toBeNull()
    expect(mocks.getStockOverview).not.toHaveBeenCalled()
    expect(mocks.getCompanyProfile).not.toHaveBeenCalled()
  })

  it('coalesces page and metadata confirmation and starts TTL at completion', async () => {
    const overviewLoad = deferred<typeof overview>()
    const profileLoad = deferred<typeof profile>()
    mocks.getStockOverview.mockReturnValue(overviewLoad.promise)
    mocks.getCompanyProfile.mockReturnValue(profileLoad.promise)

    const first = getBoundedStockPageEssentials('aapl')
    const second = getBoundedStockPageEssentials('AAPL')
    await flushMicrotasks()

    expect(mocks.getStockOverview).toHaveBeenCalledTimes(1)
    expect(mocks.getCompanyProfile).toHaveBeenCalledTimes(1)

    vi.setSystemTime('2026-08-08T15:00:03.000Z')
    overviewLoad.resolve(overview)
    profileLoad.resolve(profile)
    await expect(Promise.all([first, second])).resolves.toEqual([
      { overview, profile },
      { overview, profile },
    ])

    const completedAt = Date.now()
    await expect(getBoundedStockPageEssentials('AAPL')).resolves.toEqual({
      overview,
      profile,
    })
    expect(mocks.getStockOverview).toHaveBeenCalledTimes(1)

    vi.setSystemTime(completedAt + STOCK_PAGE_ESSENTIAL_CACHE_TTL_MS)
    mocks.getStockOverview.mockResolvedValue(overview)
    mocks.getCompanyProfile.mockResolvedValue(profile)
    await expect(getBoundedStockPageEssentials('AAPL')).resolves.toEqual({
      overview,
      profile,
    })
    expect(mocks.getStockOverview).toHaveBeenCalledTimes(2)
  })

  it('bounds a thousand unique outage requests and does not amplify repeated timeout waves', async () => {
    const overviewLoads = Array.from(
      { length: STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES },
      () => deferred<typeof overview>(),
    )
    const profileLoads = Array.from(
      { length: STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES },
      () => deferred<typeof profile>(),
    )
    overviewLoads.forEach((load) => mocks.getStockOverview.mockReturnValueOnce(load.promise))
    profileLoads.forEach((load) => mocks.getCompanyProfile.mockReturnValueOnce(load.promise))

    const firstWave = Array.from({ length: 1_000 }, (_, index) =>
      getBoundedStockPageEssentials(`S${index}`),
    )
    await flushMicrotasks()

    expect(mocks.getStockOverview).toHaveBeenCalledTimes(
      STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES,
    )
    expect(mocks.getCompanyProfile).toHaveBeenCalledTimes(
      STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES,
    )
    expect(getStockPageEssentialAdmissionStateForTests()).toMatchObject({
      outstandingCount: STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES,
      abandonedCount: 0,
    })

    await vi.advanceTimersByTimeAsync(STOCK_PAGE_ESSENTIAL_LOAD_TIMEOUT_MS)
    await expect(Promise.all(firstWave)).resolves.toEqual(
      Array.from({ length: 1_000 }, () => null),
    )
    expect(getStockPageEssentialAdmissionStateForTests()).toMatchObject({
      inFlightKeys: [],
      outstandingCount: STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES,
      abandonedCount: STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES,
    })

    const secondWave = await Promise.all(
      Array.from({ length: 1_000 }, (_, index) =>
        getBoundedStockPageEssentials(`R${index}`),
      ),
    )
    expect(secondWave.every((result) => result === null)).toBe(true)
    expect(mocks.getStockOverview).toHaveBeenCalledTimes(
      STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES,
    )

    // Capacity recovers only after the underlying abandoned pair really ends.
    overviewLoads[0].resolve(overview)
    profileLoads[0].resolve(profile)
    await flushMicrotasks()
    mocks.getStockOverview.mockResolvedValueOnce(overview)
    mocks.getCompanyProfile.mockResolvedValueOnce(profile)
    await expect(getBoundedStockPageEssentials('RECOVER')).resolves.toEqual({
      overview,
      profile,
    })
    expect(mocks.getStockOverview).toHaveBeenCalledTimes(
      STOCK_PAGE_ESSENTIAL_INFLIGHT_MAX_ENTRIES + 1,
    )
  })

  it('fences a timed-out late result from a replacement lease and cache write', async () => {
    const expiredOverview = deferred<typeof overview>()
    const expiredProfile = deferred<typeof profile>()
    const replacementOverview = deferred<typeof overview>()
    const replacementProfile = deferred<typeof profile>()
    mocks.getStockOverview
      .mockReturnValueOnce(expiredOverview.promise)
      .mockReturnValueOnce(replacementOverview.promise)
    mocks.getCompanyProfile
      .mockReturnValueOnce(expiredProfile.promise)
      .mockReturnValueOnce(replacementProfile.promise)

    const expired = getBoundedStockPageEssentials('AAPL')
    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(STOCK_PAGE_ESSENTIAL_LOAD_TIMEOUT_MS)
    await expect(expired).resolves.toBeNull()

    const replacement = getBoundedStockPageEssentials('AAPL')
    await flushMicrotasks()
    expect(getStockPageEssentialAdmissionStateForTests().inFlightKeys).toEqual([
      'AAPL',
    ])

    expiredOverview.resolve(overview)
    expiredProfile.resolve(profile)
    await flushMicrotasks()
    expect(getStockPageEssentialAdmissionStateForTests()).toMatchObject({
      cacheKeys: [],
      inFlightKeys: ['AAPL'],
      outstandingCount: 1,
    })

    const replacementValue = {
      overview: { ...overview, currentPrice: 211 },
      profile: { ...profile, companyName: 'Replacement Apple' },
    }
    replacementOverview.resolve(replacementValue.overview)
    replacementProfile.resolve(replacementValue.profile)
    await expect(replacement).resolves.toEqual(replacementValue)
    expect(getStockPageEssentialAdmissionStateForTests()).toMatchObject({
      cacheKeys: ['AAPL'],
      inFlightKeys: [],
      outstandingCount: 0,
      abandonedCount: 0,
    })
  })
})
