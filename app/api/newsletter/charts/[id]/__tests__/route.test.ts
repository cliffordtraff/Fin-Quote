import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
  resolveScope: vi.fn(),
  attachCookie: vi.fn((response: Response) => response),
}))

vi.mock('@/lib/newsletter/chart-library', () => ({
  getNewsletterChartLibraryItem: mocks.get,
  deleteNewsletterChartLibraryItem: mocks.remove,
  updateNewsletterChartLibraryItem: mocks.update,
}))

vi.mock('@/lib/newsletter/draft-session', () => ({
  resolveNewsletterDraftScope: mocks.resolveScope,
  attachNewsletterDraftSessionCookie: mocks.attachCookie,
}))

import { DELETE, GET, OPTIONS, PATCH } from '../route'
import { NewsletterChartLibraryNotFoundError } from '@/lib/newsletter/chart-library-errors'

const CHART_ID = '10000000-0000-4000-8000-000000000001'
const MISSING_CHART_ID = '10000000-0000-4000-8000-000000000002'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_CHARTING_URL', 'https://charts.example')
  vi.stubEnv('NEWSLETTER_PUBLIC_CHARTING_URL', 'https://charts-public.example')
  mocks.resolveScope.mockResolvedValue({
    scope: { ownerId: 'owner-1', sessionId: 'session-1' },
    createdSessionId: null,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('newsletter chart detail API', () => {
  it('loads one full chart in the resolved owner/session scope', async () => {
    const chart = { id: CHART_ID, chartSpec: { symbol: 'AAPL' } }
    mocks.get.mockResolvedValue(chart)
    const request = new NextRequest(
      `https://finquote.example/api/newsletter/charts/${CHART_ID}`,
    )

    const response = await GET(request, {
      params: Promise.resolve({ id: CHART_ID }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(mocks.get).toHaveBeenCalledWith(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      CHART_ID,
      request.signal,
    )
    await expect(response.json()).resolves.toEqual({ chart })
  })

  it('returns 404 instead of leaking a chart outside the resolved scope', async () => {
    mocks.get.mockResolvedValue(null)

    const response = await GET(
      new NextRequest(
        `https://finquote.example/api/newsletter/charts/${MISSING_CHART_ID}`,
      ),
      { params: Promise.resolve({ id: MISSING_CHART_ID }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: `Newsletter chart library item not found: ${MISSING_CHART_ID}`,
    })
  })

  it('maps only the typed library miss to a safe 404', async () => {
    mocks.remove.mockRejectedValue(
      new NewsletterChartLibraryNotFoundError(MISSING_CHART_ID),
    )

    const response = await DELETE(
      new NextRequest(
        `https://finquote.example/api/newsletter/charts/${MISSING_CHART_ID}`,
        { method: 'DELETE' },
      ),
      { params: Promise.resolve({ id: MISSING_CHART_ID }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: `Newsletter chart library item not found: ${MISSING_CHART_ID}`,
    })
  })

  it('rejects every anonymous production method before parsing or data access', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.resolveScope.mockResolvedValue({
      scope: { ownerId: null, sessionId: 'anonymous' },
      createdSessionId: 'anonymous',
    })
    const context = { params: Promise.resolve({ id: CHART_ID }) }

    const getResponse = await GET(
      new NextRequest(`https://finquote.example/api/newsletter/charts/${CHART_ID}`),
      context,
    )
    const patchResponse = await PATCH(
      new NextRequest(`https://finquote.example/api/newsletter/charts/${CHART_ID}`, {
        method: 'PATCH',
        body: 'not-json',
      }),
      context,
    )
    const deleteResponse = await DELETE(
      new NextRequest(`https://finquote.example/api/newsletter/charts/${CHART_ID}`, {
        method: 'DELETE',
      }),
      context,
    )

    expect([getResponse.status, patchResponse.status, deleteResponse.status]).toEqual([
      401,
      401,
      401,
    ])
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.attachCookie).toHaveBeenCalledTimes(3)
  })

  it('rejects malformed ids before touching the library', async () => {
    const response = await GET(
      new NextRequest('https://finquote.example/api/newsletter/charts/not-a-uuid'),
      { params: Promise.resolve({ id: 'not-a-uuid' }) },
    )

    expect(response.status).toBe(400)
    expect(mocks.get).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      error: 'Newsletter chart id must be a valid UUID.',
    })
  })

  it('passes caller cancellation through update and delete mutations', async () => {
    const patchRequest = new NextRequest(
      `https://finquote.example/api/newsletter/charts/${CHART_ID}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Renamed chart' }),
      },
    )
    mocks.update.mockResolvedValue({ id: CHART_ID, title: 'Renamed chart' })
    const patchResponse = await PATCH(patchRequest, {
      params: Promise.resolve({ id: CHART_ID }),
    })

    const deleteRequest = new NextRequest(
      `https://finquote.example/api/newsletter/charts/${CHART_ID}`,
      { method: 'DELETE' },
    )
    mocks.remove.mockResolvedValue(undefined)
    const deleteResponse = await DELETE(deleteRequest, {
      params: Promise.resolve({ id: CHART_ID }),
    })

    expect(patchResponse.status).toBe(200)
    expect(deleteResponse.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      CHART_ID,
      { title: 'Renamed chart' },
      patchRequest.signal,
    )
    expect(mocks.remove).toHaveBeenCalledWith(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      CHART_ID,
      deleteRequest.signal,
    )
  })

  it('rejects foreign detail mutations before session resolution', async () => {
    const response = await PATCH(
      new NextRequest(`https://finquote.example/api/newsletter/charts/${CHART_ID}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://attacker.example',
        },
        body: JSON.stringify({ title: 'Stolen rename' }),
      }),
      { params: Promise.resolve({ id: CHART_ID }) },
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(mocks.resolveScope).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('supports configured-origin preflight without authentication', async () => {
    const response = await OPTIONS(new NextRequest(
      `https://finquote.example/api/newsletter/charts/${CHART_ID}`,
      {
        method: 'OPTIONS',
        headers: { origin: 'https://charts.example' },
      },
    ))

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
      'GET,PATCH,DELETE,OPTIONS',
    )
    expect(mocks.resolveScope).not.toHaveBeenCalled()
  })

  it('preserves abort identity from a detail read', async () => {
    const controller = new AbortController()
    const reason = new Error('detail dialog closed')
    const detailRequest = new NextRequest(
      `https://finquote.example/api/newsletter/charts/${CHART_ID}`,
      { signal: controller.signal },
    )
    mocks.get.mockImplementation(async () => {
      controller.abort(reason)
      throw reason
    })

    await expect(GET(detailRequest, {
      params: Promise.resolve({ id: CHART_ID }),
    })).rejects.toBe(reason)
  })
})
