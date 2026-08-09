import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCompanyProfile } from '@/app/actions/get-company-profile'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function profile() {
  return {
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    description: 'Consumer technology company.',
    sector: 'Technology',
    industry: 'Consumer Electronics',
    exchange: 'NASDAQ',
    fullTimeEmployees: 164_000,
    ipoDate: '1980-12-12',
    country: 'US',
    city: 'Cupertino',
  }
}

beforeEach(() => {
  process.env.FMP_API_KEY = 'test-key'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.FMP_API_KEY
})

describe('getCompanyProfile strict reads', () => {
  it('distinguishes transient and malformed failures from authoritative empty profiles', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ profile: [] }))
      .mockResolvedValueOnce(jsonResponse([{ symbol: 'AAPL' }]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([profile()]))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await expect(getCompanyProfile('AAPL', {
      failureMode: 'throw',
      signal: controller.signal,
    })).rejects.toThrow('status 503')
    await expect(getCompanyProfile('AAPL', { failureMode: 'throw' }))
      .rejects.toThrow('invalid profile payload')
    await expect(getCompanyProfile('AAPL', { failureMode: 'throw' }))
      .rejects.toThrow('invalid profile payload')
    await expect(getCompanyProfile('AAPL', { failureMode: 'throw' }))
      .resolves.toBeNull()
    await expect(getCompanyProfile('AAPL', {
      failureMode: 'throw',
      signal: controller.signal,
    })).resolves.toMatchObject({ symbol: 'AAPL', companyName: 'Apple Inc.' })

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      next: { revalidate: 86400 },
      signal: controller.signal,
    })
  })

  it('preserves legacy null behavior for configuration, transport, and malformed payloads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    delete process.env.FMP_API_KEY
    await expect(getCompanyProfile('AAPL')).resolves.toBeNull()
    await expect(getCompanyProfile('AAPL', { failureMode: 'throw' }))
      .rejects.toThrow('FMP_API_KEY not configured')

    process.env.FMP_API_KEY = 'test-key'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({ profile: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getCompanyProfile('AAPL')).resolves.toBeNull()
    await expect(getCompanyProfile('AAPL')).resolves.toBeNull()
  })

  it('propagates cancellation after a profile transport ignores abort', async () => {
    let resolveFetch!: (response: Response) => void
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pendingFetch))
    const controller = new AbortController()
    const request = getCompanyProfile('AAPL', {
      failureMode: 'throw',
      signal: controller.signal,
    })
    const reason = new DOMException('Deadline elapsed.', 'TimeoutError')

    controller.abort(reason)
    resolveFetch(jsonResponse([profile()]))

    await expect(request).rejects.toBe(reason)
  })
})
