import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  attachCookie: vi.fn((response: Response) => response),
  listArchive: vi.fn(),
  resolveScope: vi.fn(),
}))

vi.mock('@/lib/newsletter/draft-session', () => ({
  attachNewsletterDraftSessionCookie: mocks.attachCookie,
  resolveNewsletterDraftScope: mocks.resolveScope,
}))

vi.mock('@/lib/newsletter/drafts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/newsletter/drafts')>()
  return {
    ...actual,
    listNewsletterDraftArchivePage: mocks.listArchive,
  }
})

import { GET } from '@/app/api/newsletter/drafts/route'
import { NewsletterDraftArchiveValidationError } from '@/lib/newsletter/drafts'

const emptyPage = {
  drafts: [],
  pageSize: 25,
  total: 0,
  nextCursor: null,
  hasMore: false,
  facets: {
    statuses: { draft: 0, review: 0, ready: 0, published: 0 },
    active: 0,
    archived: 0,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveScope.mockResolvedValue({
    scope: { ownerId: 'user-1', sessionId: 'session-1' },
    createdSessionId: null,
  })
  mocks.listArchive.mockResolvedValue(emptyPage)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('newsletter archive collection API', () => {
  it('forwards validated archive filters and the request signal', async () => {
    const request = new NextRequest(
      'https://theintraday.com/api/newsletter/drafts?q=apple&status=ready&ticker=brk.b&from=2026-07-01&to=2026-07-31&archive=all&limit=50&cursor=abc',
    )
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(mocks.listArchive).toHaveBeenCalledWith(
      { ownerId: 'user-1', sessionId: 'session-1' },
      {
        search: 'apple',
        status: 'ready',
        ticker: 'brk.b',
        from: '2026-07-01',
        to: '2026-07-31',
        visibility: 'all',
        cursor: 'abc',
        pageSize: 50,
      },
      request.signal,
    )
    await expect(response.json()).resolves.toEqual(emptyPage)
  })

  it('returns 400 for malformed archive inputs', async () => {
    mocks.listArchive.mockRejectedValue(
      new NewsletterDraftArchiveValidationError('Invalid archive cursor'),
    )
    const response = await GET(
      new NextRequest(
        'https://theintraday.com/api/newsletter/drafts?cursor=broken!',
      ),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid archive cursor',
    })
  })

  it('does not disguise a production authentication failure as an empty archive', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.resolveScope.mockResolvedValue({
      scope: { ownerId: null, sessionId: 'anonymous' },
      createdSessionId: null,
    })
    const response = await GET(
      new NextRequest('https://theintraday.com/api/newsletter/drafts'),
    )

    expect(response.status).toBe(401)
    expect(mocks.listArchive).not.toHaveBeenCalled()
  })
})
