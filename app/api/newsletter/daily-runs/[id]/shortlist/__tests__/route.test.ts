import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { NewsletterDailyRun } from '@/lib/newsletter/daily-types'

const mocks = vi.hoisted(() => ({
  attachCookie: vi.fn((response: Response) => response),
  getRun: vi.fn(),
  getShortlist: vi.fn(),
  resolveScope: vi.fn(),
  saveShortlist: vi.fn(),
}))

vi.mock('@/lib/newsletter/draft-session', () => ({
  attachNewsletterDraftSessionCookie: mocks.attachCookie,
  resolveNewsletterDraftScope: mocks.resolveScope,
}))

vi.mock('@/lib/newsletter/daily-runs-read', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/newsletter/daily-runs-read')>()
  return {
    ...actual,
    getNewsletterDailyRun: mocks.getRun,
  }
})

vi.mock('@/lib/newsletter/editorial-shortlist', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/newsletter/editorial-shortlist')>()
  return {
    ...actual,
    getNewsletterEditorialShortlist: mocks.getShortlist,
    saveNewsletterEditorialShortlist: mocks.saveShortlist,
  }
})

import { GET, PUT } from '@/app/api/newsletter/daily-runs/[id]/shortlist/route'
import {
  buildNewsletterEditorialShortlistPresentation,
  NewsletterEditorialShortlistConflictError,
  NewsletterEditorialShortlistNotFoundError,
  NewsletterEditorialShortlistValidationError,
} from '@/lib/newsletter/editorial-shortlist'
import { NewsletterDailyRunNotFoundError } from '@/lib/newsletter/daily-runs-read'

const ownerScope = { ownerId: 'owner-1', sessionId: 'session-1' }

function dailyRun(headline = 'Original headline'): NewsletterDailyRun {
  const items = [1, 2].map((rank) => ({
    id: `item-${rank}`,
    runId: 'run-1',
    rank,
    ticker: rank === 1 ? 'AAPL' : 'MSFT',
    status: 'ready' as const,
    qualityBand: 'strong' as const,
    relevanceScore: 100 - rank,
    confidenceScore: 90 - rank,
    candidateType: 'stock',
    stateLabel: 'cash',
    movePercent: rank,
    reasonType: 'earnings',
    headline: rank === 1 ? headline : `Story ${rank}`,
    summaryText: `Summary ${rank}`,
    keyFact: null,
    sourceRefs: [{ kind: 'news', label: `News ${rank}` }],
    candidateMetadata: {},
    draftId: `draft-${rank}`,
    draftStatus: 'ready' as const,
    chartId: `chart-${rank}`,
    chartImageUrl: `https://assets.example/${rank}.png`,
    subjectLine: `Subject ${rank}`,
    beehiivDelivery: null,
    errorMessage: null,
    retryCount: 0,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
  }))
  return {
    id: 'run-1',
    marketDate: '2026-08-08',
    edition: 'morning',
    status: 'completed',
    targetCount: 40,
    sourceWiimRunId: 'wiim-1',
    sourceGeneratedAt: '2026-08-08T09:00:00.000Z',
    selectedCount: items.length,
    generatedCount: items.length,
    readyCount: items.length,
    attentionCount: 0,
    failedCount: 0,
    errorMessage: null,
    metadata: {},
    startedAt: '2026-08-08T09:00:00.000Z',
    completedAt: '2026-08-08T10:00:00.000Z',
    createdAt: '2026-08-08T09:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    items,
  }
}

function revisionFixture(revision: number) {
  return {
    id: `revision-id-${revision}`,
    runId: 'run-1',
    revision,
    algorithmVersion: 'morning-shortlist-v1',
    baselineFingerprint: 'a'.repeat(64),
    actorId: 'owner-1',
    baselineItemIds: ['item-1', 'item-2'],
    selectedItemIds: ['item-1', 'item-2'],
    entries: [],
    createdAt: `2026-08-08T10:0${revision}:00.000Z`,
  }
}

function putBody(run = dailyRun()) {
  return {
    expectedRevision: 0,
    presentation: buildNewsletterEditorialShortlistPresentation(run),
    selectedItemIds: ['item-1', 'item-2'],
    intents: [],
    idempotencyKey: 'shortlist-save-1',
  }
}

function getRequest(signal?: AbortSignal) {
  return new NextRequest(
    'https://theintraday.com/api/newsletter/daily-runs/run-1/shortlist',
    { signal },
  )
}

function putRequest(body: unknown = putBody(), signal?: AbortSignal) {
  return new NextRequest(
    'https://theintraday.com/api/newsletter/daily-runs/run-1/shortlist',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
  )
}

const context = { params: Promise.resolve({ id: 'run-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveScope.mockResolvedValue({
    scope: ownerScope,
    createdSessionId: null,
  })
  mocks.getRun.mockResolvedValue(dailyRun())
  mocks.getShortlist.mockResolvedValue(revisionFixture(1))
  mocks.saveShortlist.mockResolvedValue({
    shortlist: revisionFixture(1),
    changed: true,
    receiptRevisionId: 'revision-id-1',
    isCurrent: true,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET /api/newsletter/daily-runs/[id]/shortlist', () => {
  it('returns the current presentation and persisted head in the owner scope', async () => {
    const request = getRequest()

    const response = await GET(request, context)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(mocks.getRun).toHaveBeenCalledWith(ownerScope, 'run-1', request.signal)
    expect(mocks.getShortlist).toHaveBeenCalledWith(
      ownerScope,
      'run-1',
      request.signal,
    )
    await expect(response.json()).resolves.toEqual({
      run: dailyRun(),
      presentation: buildNewsletterEditorialShortlistPresentation(dailyRun()),
      shortlist: revisionFixture(1),
      currentRevision: 1,
      currentRevisionId: 'revision-id-1',
    })
  })

  it('uses revision zero when this run has no saved editorial decision', async () => {
    mocks.getShortlist.mockResolvedValue(null)

    const response = await GET(getRequest(), context)

    await expect(response.json()).resolves.toMatchObject({
      shortlist: null,
      currentRevision: 0,
      currentRevisionId: null,
    })
  })

  it('maps an out-of-scope run to a non-leaking 404', async () => {
    mocks.getRun.mockRejectedValue(new NewsletterDailyRunNotFoundError('run-1'))

    const response = await GET(getRequest(), context)

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0',
    )
    await expect(response.json()).resolves.toEqual({
      error: 'Morning Report shortlist not found.',
    })
  })

  it('sanitizes unexpected infrastructure failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getRun.mockRejectedValue(
      new Error('postgres://admin:database-password@private-host'),
    )

    const response = await GET(getRequest(), context)
    const serialized = JSON.stringify(await response.json())

    expect(response.status).toBe(500)
    expect(serialized).toBe(
      JSON.stringify({ error: 'Unable to manage the Morning Report shortlist.' }),
    )
    expect(serialized).not.toContain('database-password')
    expect(consoleError).toHaveBeenCalled()
  })
})

describe('PUT /api/newsletter/daily-runs/[id]/shortlist', () => {
  it('allows a local anonymous editor only inside the resolved session scope', async () => {
    const scope = { ownerId: null, sessionId: 'local-session-1' }
    mocks.resolveScope.mockResolvedValue({
      scope,
      createdSessionId: 'local-session-1',
    })
    const request = putRequest()

    const response = await PUT(request, context)

    expect(response.status).toBe(200)
    expect(mocks.saveShortlist).toHaveBeenCalledWith(scope, {
      runId: 'run-1',
      ...putBody(),
      signal: request.signal,
    })
    expect(mocks.getRun).toHaveBeenCalledWith(scope, 'run-1', request.signal)
    expect(mocks.attachCookie).toHaveBeenCalledWith(
      expect.any(Response),
      'local-session-1',
    )
  })

  it('returns both the replay receipt and the newer current head', async () => {
    mocks.saveShortlist.mockResolvedValue({
      shortlist: revisionFixture(2),
      changed: false,
      receiptRevisionId: 'revision-id-1',
      isCurrent: false,
    })

    const response = await PUT(putRequest(), context)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0',
    )
    await expect(response.json()).resolves.toMatchObject({
      shortlist: { id: 'revision-id-2', revision: 2 },
      currentRevision: 2,
      currentRevisionId: 'revision-id-2',
      changed: false,
      receiptRevisionId: 'revision-id-1',
      isCurrent: false,
    })
  })

  it('rejects malformed JSON and wrong wire types before the domain call', async () => {
    const malformed = new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs/run-1/shortlist',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{not-json',
      },
    )
    const malformedResponse = await PUT(malformed, context)
    const wrongTypeResponse = await PUT(
      putRequest({ ...putBody(), selectedItemIds: 'item-1' }),
      context,
    )

    expect(malformedResponse.status).toBe(400)
    await expect(malformedResponse.json()).resolves.toEqual({
      error: 'Request body must be valid JSON',
    })
    expect(wrongTypeResponse.status).toBe(400)
    await expect(wrongTypeResponse.json()).resolves.toEqual({
      error: 'selectedItemIds must be an array of strings',
    })
    expect(mocks.saveShortlist).not.toHaveBeenCalled()
  })

  it('maps semantic command validation to 400', async () => {
    mocks.saveShortlist.mockRejectedValue(
      new NewsletterEditorialShortlistValidationError(
        'Every “other” shortlist reason needs a note',
      ),
    )

    const response = await PUT(putRequest(), context)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Every “other” shortlist reason needs a note',
    })
  })

  it('returns the latest head and fresh presentation after a stale baseline conflict', async () => {
    const freshRun = dailyRun('Headline changed after it was presented')
    const latest = revisionFixture(2)
    mocks.saveShortlist.mockRejectedValue(
      new NewsletterEditorialShortlistConflictError(
        'The Morning Report changed after this shortlist was presented.',
        1,
      ),
    )
    mocks.getRun.mockResolvedValue(freshRun)
    mocks.getShortlist.mockResolvedValue(latest)
    const request = putRequest()

    const response = await PUT(request, context)

    expect(response.status).toBe(409)
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(mocks.getRun).toHaveBeenCalledWith(ownerScope, 'run-1', request.signal)
    expect(mocks.getShortlist).toHaveBeenCalledWith(
      ownerScope,
      'run-1',
      request.signal,
    )
    await expect(response.json()).resolves.toEqual({
      error: 'The Morning Report changed after this shortlist was presented.',
      code: 'shortlist_conflict',
      currentRevision: 2,
      currentRevisionId: 'revision-id-2',
      conflictSnapshotComplete: true,
      run: freshRun,
      shortlist: latest,
      latest,
      presentation: buildNewsletterEditorialShortlistPresentation(freshRun),
    })
  })

  it('returns a safe partial conflict when refreshing the latest state fails', async () => {
    mocks.saveShortlist.mockRejectedValue(
      new NewsletterEditorialShortlistConflictError('Revision conflict', 3),
    )
    mocks.getRun.mockRejectedValue(new Error('transient run read failure'))
    mocks.getShortlist.mockRejectedValue(new Error('transient head read failure'))

    const response = await PUT(putRequest(), context)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      currentRevision: 3,
      currentRevisionId: null,
      conflictSnapshotComplete: false,
      latest: null,
      presentation: null,
    })
  })

  it('marks a conflict snapshot incomplete when only the head refresh fails', async () => {
    const freshRun = dailyRun('Fresh presentation after conflict')
    mocks.saveShortlist.mockRejectedValue(
      new NewsletterEditorialShortlistConflictError('Presentation conflict'),
    )
    mocks.getRun.mockResolvedValue(freshRun)
    mocks.getShortlist.mockRejectedValue(new Error('transient head read failure'))

    const response = await PUT(putRequest(), context)

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      currentRevision: 0,
      currentRevisionId: null,
      conflictSnapshotComplete: false,
      run: freshRun,
      shortlist: null,
      latest: null,
      presentation: buildNewsletterEditorialShortlistPresentation(freshRun),
    })
  })

  it('maps a shortlist scope miss to 404', async () => {
    mocks.saveShortlist.mockRejectedValue(
      new NewsletterEditorialShortlistNotFoundError('run-1'),
    )

    const response = await PUT(putRequest(), context)

    expect(response.status).toBe(404)
  })

  it('forwards cancellation into the save and rethrows the abort reason', async () => {
    const controller = new AbortController()
    const reason = new Error('editor navigated away')
    const request = putRequest(putBody(), controller.signal)
    mocks.saveShortlist.mockImplementation(async (_scope, input) => {
      expect(input.signal).toBe(request.signal)
      controller.abort(reason)
      input.signal?.throwIfAborted()
    })

    await expect(PUT(request, context)).rejects.toBe(reason)
    expect(mocks.getRun).not.toHaveBeenCalled()
  })
})

describe('production authentication boundary', () => {
  it('requires an authenticated owner for both reads and writes', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.resolveScope.mockResolvedValue({
      scope: { ownerId: null, sessionId: 'anonymous-production-session' },
      createdSessionId: 'anonymous-production-session',
    })

    const [getResponse, putResponse] = await Promise.all([
      GET(getRequest(), context),
      PUT(putRequest(), context),
    ])

    expect(getResponse.status).toBe(401)
    expect(putResponse.status).toBe(401)
    expect(getResponse.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(mocks.getRun).not.toHaveBeenCalled()
    expect(mocks.getShortlist).not.toHaveBeenCalled()
    expect(mocks.saveShortlist).not.toHaveBeenCalled()
    expect(mocks.attachCookie).not.toHaveBeenCalled()
  })
})
