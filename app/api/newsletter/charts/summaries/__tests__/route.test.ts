import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class PageInputError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'NewsletterChartLibraryPageInputError'
    }
  }
  return {
    PageInputError,
    list: vi.fn(),
    resolveScope: vi.fn(),
    attachCookie: vi.fn((response: Response) => response),
    allowedOrigin: vi.fn(() => true),
  }
})

vi.mock('@/lib/newsletter/chart-library', () => ({
  listNewsletterChartLibrarySummaries: mocks.list,
  NewsletterChartLibraryPageInputError: mocks.PageInputError,
}))

vi.mock('@/lib/newsletter/draft-session', () => ({
  resolveNewsletterDraftScope: mocks.resolveScope,
  attachNewsletterDraftSessionCookie: mocks.attachCookie,
}))

vi.mock('@/lib/newsletter/chart-api-origin', () => ({
  isAllowedNewsletterChartOrigin: mocks.allowedOrigin,
}))

import { GET, OPTIONS } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.allowedOrigin.mockReturnValue(true)
  mocks.resolveScope.mockResolvedValue({
    scope: { ownerId: 'owner-1', sessionId: 'session-1' },
    createdSessionId: null,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('newsletter chart summary API', () => {
  it('passes bounded keyset and filter inputs without invoking the legacy list', async () => {
    mocks.list.mockResolvedValue({
      charts: [{ id: 'chart-1', title: 'Apple chart' }],
      nextCursor: 'next-page',
      total: 42,
    })
    const request = new NextRequest(
      'https://finquote.example/api/newsletter/charts/summaries?limit=12&q=earnings&symbol=aapl&cursor=cursor-1',
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(mocks.list).toHaveBeenCalledWith(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      {
        cursor: 'cursor-1',
        limit: 12,
        query: 'earnings',
        symbol: 'aapl',
      },
      request.signal,
    )
    await expect(response.json()).resolves.toMatchObject({
      nextCursor: 'next-page',
      total: 42,
    })
  })

  it('returns a client error for an invalid page contract', async () => {
    mocks.list.mockRejectedValue(
      new mocks.PageInputError('Chart library cursor is invalid'),
    )

    const response = await GET(new NextRequest(
      'https://finquote.example/api/newsletter/charts/summaries?cursor=bad',
    ))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Chart library cursor is invalid',
    })
  })

  it('rejects anonymous production reads before querying summaries', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.resolveScope.mockResolvedValue({
      scope: { ownerId: null, sessionId: 'anonymous' },
      createdSessionId: 'anonymous',
    })

    const response = await GET(new NextRequest(
      'https://finquote.example/api/newsletter/charts/summaries',
    ))

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.attachCookie).toHaveBeenCalledOnce()
  })

  it('rejects a foreign origin before resolving owner/session scope', async () => {
    mocks.allowedOrigin.mockReturnValue(false)
    const response = await GET(new NextRequest(
      'https://finquote.example/api/newsletter/charts/summaries',
      { headers: { origin: 'https://attacker.example' } },
    ))

    expect(response.status).toBe(403)
    expect(mocks.resolveScope).not.toHaveBeenCalled()
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('handles summary preflight without resolving owner/session scope', async () => {
    const response = await OPTIONS(new NextRequest(
      'https://finquote.example/api/newsletter/charts/summaries',
      {
        method: 'OPTIONS',
        headers: { origin: 'https://charts.example' },
      },
    ))

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
      'GET,OPTIONS',
    )
    expect(mocks.resolveScope).not.toHaveBeenCalled()
  })
})
