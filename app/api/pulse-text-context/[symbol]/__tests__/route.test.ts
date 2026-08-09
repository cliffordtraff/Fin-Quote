import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderNews, ProviderRequestOptions } from '@/lib/providers/types'

const mocks = vi.hoisted(() => ({
  getCompanyProfile: vi.fn(),
  getNews: vi.fn(),
  getProvider: vi.fn(),
}))

vi.mock('@/lib/providers', () => ({
  getProvider: mocks.getProvider,
}))

vi.mock('@/app/actions/get-company-profile', () => ({
  getCompanyProfile: mocks.getCompanyProfile,
}))

import { GET } from '@/app/api/pulse-text-context/[symbol]/route'
import {
  getPulseTextContextCacheStateForTests,
  PULSE_TEXT_CONTEXT_LOAD_TIMEOUT_MS,
  resetPulseTextContextCacheForTests,
} from '@/lib/pulse-text-context-cache'

const SUCCESS_CACHE_CONTROL =
  'public, max-age=60, s-maxage=300, stale-while-revalidate=300'

function news(symbol: string, suffix = ''): ProviderNews {
  return {
    title: `${symbol} headline${suffix}`,
    text: 'Article body',
    url: `https://example.com/${symbol.toLowerCase()}${suffix}`,
    image: null,
    publishedDate: '2026-08-09T12:00:00.000Z',
    site: 'The Intraday',
    symbol,
  }
}

function profile(symbol: string, suffix = '') {
  return {
    symbol,
    companyName: `${symbol} Company${suffix}`,
    description: 'Company description',
    ceo: null,
    sector: 'Technology',
    industry: 'Software',
    exchange: 'NASDAQ',
    website: null,
    fullTimeEmployees: 10_000,
    ipoDate: '2004-08-19',
    country: 'US',
    city: 'New York',
    state: null,
    address: null,
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function flushMicrotasks(turns = 5): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

function routeRequest(symbol: string, signal?: AbortSignal) {
  const request = new Request(
    `https://theintraday.com/api/pulse-text-context/${encodeURIComponent(symbol)}`,
    { signal },
  )
  return GET(request, { params: Promise.resolve({ symbol }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  resetPulseTextContextCacheForTests()
  mocks.getProvider.mockImplementation(() => ({ getNews: mocks.getNews }))
  mocks.getNews.mockImplementation(async (symbol: string) => [news(symbol)])
  mocks.getCompanyProfile.mockImplementation(async (symbol: string) => profile(symbol))
})

afterEach(() => {
  resetPulseTextContextCacheForTests()
  vi.useRealTimers()
})

describe('GET /api/pulse-text-context/[symbol]', () => {
  it('rejects every symbol outside the shared four-name allowlist before upstream access', async () => {
    for (const symbol of ['', 'MSFT', 'BRK.B', '../AAPL', '%', 'AAPL ']) {
      const response = await routeRequest(symbol)
      expect(response.status).toBe(400)
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.json()).resolves.toEqual({ error: 'Invalid symbol' })
    }

    expect(mocks.getProvider).not.toHaveBeenCalled()
    expect(mocks.getNews).not.toHaveBeenCalled()
    expect(mocks.getCompanyProfile).not.toHaveBeenCalled()
  })

  it('coalesces concurrent callers and threads one detached strict signal through both reads', async () => {
    const newsLoad = deferred<ProviderNews[]>()
    const profileLoad = deferred<ReturnType<typeof profile>>()
    mocks.getNews.mockReturnValue(newsLoad.promise)
    mocks.getCompanyProfile.mockReturnValue(profileLoad.promise)
    const firstController = new AbortController()

    const first = routeRequest('AAPL', firstController.signal).then(
      () => null,
      (error) => error,
    )
    const second = routeRequest('aapl')
    await flushMicrotasks()

    expect(mocks.getProvider).toHaveBeenCalledTimes(1)
    expect(mocks.getNews).toHaveBeenCalledTimes(1)
    expect(mocks.getCompanyProfile).toHaveBeenCalledTimes(1)
    const newsOptions = mocks.getNews.mock.calls[0][2] as ProviderRequestOptions
    const profileOptions = mocks.getCompanyProfile.mock.calls[0][1] as ProviderRequestOptions
    expect(newsOptions).toMatchObject({ failureMode: 'throw' })
    expect(profileOptions).toMatchObject({ failureMode: 'throw' })
    expect(newsOptions.signal).toBe(profileOptions.signal)
    expect(newsOptions.signal).not.toBe(firstController.signal)

    const reason = new DOMException('Caller left.', 'AbortError')
    firstController.abort(reason)
    expect(await first).toBe(reason)
    expect(newsOptions.signal?.aborted).toBe(false)

    newsLoad.resolve([news('AAPL')])
    profileLoad.resolve(profile('AAPL'))
    const response = await second
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(SUCCESS_CACHE_CONTROL)
    expect(response.headers.get('x-cache')).toBe('MISS')
    await expect(response.json()).resolves.toMatchObject({
      news: [{ title: 'AAPL headline' }],
      profile: { symbol: 'AAPL', companyName: 'AAPL Company' },
    })

    const hit = await routeRequest('AAPL')
    expect(hit.headers.get('x-cache')).toBe('HIT')
    expect(mocks.getNews).toHaveBeenCalledTimes(1)
  })

  it('bounds runtime output even when mocked providers ignore their requested limit', async () => {
    mocks.getNews.mockResolvedValue(Array.from({ length: 9 }, (_, index) => ({
      ...news('NVDA', `-${index}`),
      title: `${index}-${'x'.repeat(400)}`,
      publishedDate: 'p'.repeat(100),
      site: 's'.repeat(200),
    })))
    mocks.getCompanyProfile.mockResolvedValue({
      ...profile('NVDA'),
      companyName: 'c'.repeat(300),
      description: 'd'.repeat(5_000),
    })

    const response = await routeRequest('NVDA')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.news).toHaveLength(3)
    expect(body.news[0].title).toHaveLength(240)
    expect(body.news[0].publishedDate).toHaveLength(64)
    expect(body.news[0].site).toHaveLength(120)
    expect(body.profile.companyName).toHaveLength(160)
    expect(body.profile.description).toHaveLength(4_000)
  })

  it('times out waiters but retains the symbol slot until every ignored-abort read settles', async () => {
    vi.useFakeTimers()
    const newsLoad = deferred<ProviderNews[]>()
    const profileLoad = deferred<ReturnType<typeof profile>>()
    mocks.getNews.mockReturnValue(newsLoad.promise)
    mocks.getCompanyProfile.mockReturnValue(profileLoad.promise)
    const timedOutRequest = routeRequest('GOOGL')
    await flushMicrotasks()
    const internalSignal = (
      mocks.getNews.mock.calls[0][2] as ProviderRequestOptions
    ).signal!

    await vi.advanceTimersByTimeAsync(PULSE_TEXT_CONTEXT_LOAD_TIMEOUT_MS)
    const timeoutResponse = await timedOutRequest
    expect(timeoutResponse.status).toBe(503)
    expect(timeoutResponse.headers.get('cache-control')).toBe('no-store')
    expect(internalSignal.aborted).toBe(true)
    expect(getPulseTextContextCacheStateForTests()).toEqual({
      cacheKeys: [],
      physicalKeys: ['GOOGL'],
      timedOutKeys: ['GOOGL'],
    })

    const joinedTimeout = await routeRequest('GOOGL')
    expect(joinedTimeout.status).toBe(503)
    expect(mocks.getNews).toHaveBeenCalledTimes(1)
    expect(mocks.getCompanyProfile).toHaveBeenCalledTimes(1)

    newsLoad.resolve([news('GOOGL', '-late')])
    await flushMicrotasks()
    expect(getPulseTextContextCacheStateForTests().physicalKeys).toEqual(['GOOGL'])
    profileLoad.resolve(profile('GOOGL', '-late'))
    await flushMicrotasks()
    expect(getPulseTextContextCacheStateForTests()).toEqual({
      cacheKeys: [],
      physicalKeys: [],
      timedOutKeys: [],
    })

    mocks.getNews.mockResolvedValue([news('GOOGL', '-fresh')])
    mocks.getCompanyProfile.mockResolvedValue(profile('GOOGL', '-fresh'))
    const retry = await routeRequest('GOOGL')
    expect(retry.status).toBe(200)
    await expect(retry.json()).resolves.toMatchObject({
      news: [{ title: 'GOOGL headline-fresh' }],
      profile: { companyName: 'GOOGL Company-fresh' },
    })
    expect(mocks.getNews).toHaveBeenCalledTimes(2)
  })

  it('treats authoritative empty news/profile as complete and publicly cacheable', async () => {
    mocks.getNews.mockResolvedValue([])
    mocks.getCompanyProfile.mockResolvedValue(null)

    const response = await routeRequest('TSLA')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(SUCCESS_CACHE_CONTROL)
    await expect(response.json()).resolves.toEqual({ news: [], profile: null })
    expect((await routeRequest('TSLA')).headers.get('x-cache')).toBe('HIT')
  })

  it('does not cache transient, malformed, wrong-symbol, or unsafe-url failures', async () => {
    mocks.getNews
      .mockRejectedValueOnce(new Error('upstream unavailable'))
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([news('AAPL')])
      .mockResolvedValueOnce([{ ...news('AAPL'), url: 'javascript:alert(1)' }])
      .mockResolvedValueOnce([news('AAPL', '-good')])
    mocks.getCompanyProfile
      .mockResolvedValueOnce(profile('AAPL'))
      .mockResolvedValueOnce(profile('AAPL'))
      .mockResolvedValueOnce(profile('NVDA'))
      .mockResolvedValueOnce(profile('AAPL'))
      .mockResolvedValueOnce(profile('AAPL', '-good'))

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await routeRequest('AAPL')
      expect(response.status).toBe(503)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('retry-after')).toBe('5')
      expect(getPulseTextContextCacheStateForTests().cacheKeys).toEqual([])
    }

    const recovered = await routeRequest('AAPL')
    expect(recovered.status).toBe(200)
    expect(recovered.headers.get('x-cache')).toBe('MISS')
    await expect(recovered.json()).resolves.toMatchObject({
      news: [{ title: 'AAPL headline-good' }],
      profile: { companyName: 'AAPL Company-good' },
    })
    expect(mocks.getNews).toHaveBeenCalledTimes(5)
  })
})
