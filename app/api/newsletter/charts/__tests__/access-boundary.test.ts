import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  resolveScope: vi.fn(),
  attachCookie: vi.fn((response: Response) => response),
  durableAcquire: vi.fn(),
  durableComplete: vi.fn(),
  durableFail: vi.fn(),
}))

vi.mock('@/lib/newsletter/chart-library', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@/lib/newsletter/chart-library')
  >()
  return {
    ...actual,
    listNewsletterChartLibrarySummaries: mocks.list,
    saveNewsletterChartLibraryItem: mocks.save,
  }
})

vi.mock('@/lib/newsletter/draft-session', () => ({
  resolveNewsletterDraftScope: mocks.resolveScope,
  attachNewsletterDraftSessionCookie: mocks.attachCookie,
}))

import { GET, OPTIONS, POST, maxDuration } from '../route'
import {
  MAX_NEWSLETTER_CHART_REQUEST_BYTES,
  MAX_NEWSLETTER_CHART_SERVER_ERROR_LOG_CHARS,
} from '../_shared'
import {
  NEWSLETTER_CHART_POST_LEASE_SECONDS,
  newsletterChartPostAdmissionTestOnly,
} from '@/lib/newsletter/chart-post-admission'

const PAGE = {
  charts: [],
  nextCursor: null,
  total: 0,
}

let requestSequence = 0

function request(
  init: ConstructorParameters<typeof NextRequest>[1] = {},
): NextRequest {
  return new NextRequest('https://finquote.example/api/newsletter/charts', {
    ...init,
    signal: init.signal ?? undefined,
    headers: {
      host: 'finquote.example',
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  })
}

function jsonRequest(
  body: unknown,
  init: ConstructorParameters<typeof NextRequest>[1] = {},
): NextRequest {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (!headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', `chart-test-${++requestSequence}`)
  }
  return request({
    ...init,
    method: init.method ?? 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  newsletterChartPostAdmissionTestOnly.reset()
  mocks.durableAcquire.mockResolvedValue({
    disposition: 'acquired',
    leaseToken: '10000000-0000-4000-8000-000000000001',
    resultReceipt: null,
    retryAfterSeconds: 90,
  })
  mocks.durableComplete.mockResolvedValue({
    disposition: 'completed',
    resultReceipt: null,
  })
  mocks.durableFail.mockResolvedValue('released')
  newsletterChartPostAdmissionTestOnly.setDurableStore({
    acquire: mocks.durableAcquire,
    complete: mocks.durableComplete,
    fail: mocks.durableFail,
  })
  requestSequence = 0
  vi.stubEnv('NEXT_PUBLIC_CHARTING_URL', 'https://charts.example')
  vi.stubEnv('NEWSLETTER_PUBLIC_CHARTING_URL', 'https://charts-public.example')
  mocks.resolveScope.mockResolvedValue({
    scope: { ownerId: 'owner-1', sessionId: 'session-1' },
    createdSessionId: null,
  })
  mocks.list.mockResolvedValue(PAGE)
  mocks.save.mockResolvedValue({ id: 'chart-1' })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('newsletter chart collection access boundary', () => {
  it('rejects anonymous production reads and writes before data or body work', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.resolveScope.mockResolvedValue({
      scope: { ownerId: null, sessionId: 'anonymous' },
      createdSessionId: 'anonymous',
    })

    const getResponse = await GET(request())
    const postResponse = await POST(request({
      method: 'POST',
      body: 'not-json',
    }))

    expect(getResponse.status).toBe(401)
    expect(postResponse.status).toBe(401)
    expect(getResponse.headers.get('Cache-Control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.attachCookie).toHaveBeenCalledTimes(2)
  })

  it('keeps the anonymous session-backed workflow in development', async () => {
    mocks.resolveScope.mockResolvedValue({
      scope: { ownerId: null, sessionId: 'local-session' },
      createdSessionId: 'local-session',
    })

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(mocks.list).toHaveBeenCalledWith(
      { ownerId: null, sessionId: 'local-session' },
      {
        cursor: null,
        limit: undefined,
        query: undefined,
        symbol: undefined,
      },
      expect.any(AbortSignal),
    )
    expect(mocks.attachCookie).toHaveBeenCalledWith(
      expect.any(Response),
      'local-session',
    )
  })

  it('establishes a new anonymous mutation session before any side effect', async () => {
    mocks.resolveScope.mockResolvedValue({
      scope: { ownerId: null, sessionId: 'new-local-session' },
      createdSessionId: 'new-local-session',
    })

    const response = await POST(jsonRequest({
      chartExportSpec: { symbol: 'AAPL' },
    }))

    expect(response.status).toBe(428)
    expect(response.headers.get('Retry-After')).toBe('0')
    expect(response.headers.get('X-Newsletter-Session-Established')).toBe('true')
    await expect(response.json()).resolves.toMatchObject({
      code: 'newsletter_chart_session_established',
      retryable: true,
    })
    expect(mocks.attachCookie).toHaveBeenCalledWith(
      expect.any(Response),
      'new-local-session',
    )
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.durableAcquire).not.toHaveBeenCalled()
  })

  it('attaches a newly created session to post-auth client errors', async () => {
    mocks.resolveScope.mockResolvedValue({
      scope: { ownerId: 'owner-1', sessionId: 'new-local-session' },
      createdSessionId: 'new-local-session',
    })

    const response = await POST(request({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }))

    expect(response.status).toBe(400)
    expect(mocks.attachCookie).toHaveBeenCalledWith(
      expect.any(Response),
      'new-local-session',
    )
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('uses the bounded summary page contract for the legacy collection GET', async () => {
    const page = {
      charts: [{ id: 'chart-summary-1', title: 'Apple' }],
      nextCursor: 'next',
      total: 100,
    }
    mocks.list.mockResolvedValue(page)
    const collectionRequest = request()

    const response = await GET(collectionRequest)

    expect(response.status).toBe(200)
    expect(mocks.list).toHaveBeenCalledWith(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      {
        cursor: null,
        limit: undefined,
        query: undefined,
        symbol: undefined,
      },
      collectionRequest.signal,
    )
    await expect(response.json()).resolves.toEqual(page)
  })

  it('rejects a foreign origin before session resolution and emits no CORS grant', async () => {
    const response = await POST(jsonRequest(
      { chartExportSpec: { symbol: 'AAPL' } },
      { headers: { origin: 'https://attacker.example' } },
    ))

    expect(response.status).toBe(403)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(mocks.resolveScope).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('handles allowed preflight without resolving an authenticated scope', async () => {
    const response = await OPTIONS(request({
      method: 'OPTIONS',
      headers: { origin: 'https://charts.example' },
    }))

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://charts.example',
    )
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
      'GET,POST,OPTIONS',
    )
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'Content-Type,Idempotency-Key',
    )
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe(
      'X-Idempotency-Replay,X-Newsletter-Session-Established,Retry-After',
    )
    expect(mocks.resolveScope).not.toHaveBeenCalled()
  })

  it('passes caller cancellation through the complete save path', async () => {
    const saveRequest = jsonRequest({
      title: 'Apple chart',
      chartExportSpec: { symbol: 'AAPL' },
    })

    const response = await POST(saveRequest)

    expect(response.status).toBe(200)
    expect(mocks.save).toHaveBeenCalledWith(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      {
        title: 'Apple chart',
        chartExportSpec: expect.objectContaining({ symbol: 'AAPL' }),
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(mocks.save.mock.calls[0]?.[2]?.signal).not.toBe(saveRequest.signal)
    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(response.headers.get('X-Idempotency-Replay')).toBe('false')
  })

  it('requires a strict Idempotency-Key before reading the POST body', async () => {
    const missing = await POST(request({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    }))
    const malformed = await POST(jsonRequest(
      { chartExportSpec: { symbol: 'AAPL' } },
      { headers: { 'Idempotency-Key': '_invalid' } },
    ))

    expect(missing.status).toBe(400)
    expect(malformed.status).toBe(400)
    await expect(missing.json()).resolves.toEqual({
      error: 'Idempotency-Key header is required.',
    })
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('replays a successful idempotent save and rejects a changed payload', async () => {
    const headers = { 'Idempotency-Key': 'stable-chart-key' }
    const first = await POST(jsonRequest(
      { title: 'Apple', chartExportSpec: { symbol: 'aapl' } },
      { headers },
    ))
    const replay = await POST(jsonRequest(
      { title: ' Apple ', chartExportSpec: { symbol: 'AAPL' } },
      { headers },
    ))
    const conflict = await POST(jsonRequest(
      { title: 'Microsoft', chartExportSpec: { symbol: 'MSFT' } },
      { headers },
    ))

    expect(first.status).toBe(200)
    expect(first.headers.get('X-Idempotency-Replay')).toBe('false')
    expect(replay.status).toBe(200)
    expect(replay.headers.get('X-Idempotency-Replay')).toBe('true')
    expect(conflict.status).toBe(409)
    expect(mocks.save).toHaveBeenCalledOnce()
  })

  it('uses the configured production renderer even when Host claims localhost', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const response = await POST(jsonRequest(
      { chartExportSpec: { symbol: 'AAPL' } },
      { headers: { host: 'localhost:3000' } },
    ))

    expect(response.status).toBe(200)
    expect(mocks.save.mock.calls[0]?.[2]).toMatchObject({
      chartBaseUrl: 'https://charts.example',
      publicChartBaseUrl: 'https://charts-public.example',
      durableRequest: {
        chartId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
        requestKeyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    })
    expect(NEWSLETTER_CHART_POST_LEASE_SECONDS).toBeGreaterThan(maxDuration)
  })

  it('returns generic unknown 5xx text and bounds the server diagnostic', async () => {
    const secret = `upstream credential not found: ${'x'.repeat(8_000)}`
    mocks.save.mockRejectedValue(new Error(secret))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(jsonRequest({
      chartExportSpec: { symbol: 'AAPL' },
    }))

    expect(response.status).toBe(500)
    const responseBody = await response.text()
    expect(JSON.parse(responseBody)).toEqual({
      error: 'Newsletter chart request failed',
    })
    expect(responseBody).not.toContain(secret)
    expect(log).toHaveBeenCalledOnce()
    expect(String(log.mock.calls[0]?.[1]).length).toBeLessThanOrEqual(
      MAX_NEWSLETTER_CHART_SERVER_ERROR_LOG_CHARS,
    )
  })

  it('requires JSON and maps malformed input to client errors', async () => {
    const wrongType = await POST(request({
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Idempotency-Key': 'wrong-type-key',
      },
      body: '{}',
    }))
    const malformed = await POST(request({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'malformed-json-key',
      },
      body: '{',
    }))

    expect(wrongType.status).toBe(415)
    expect(malformed.status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('rejects declared and streamed bodies above the byte budget', async () => {
    const declared = await POST(request({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(MAX_NEWSLETTER_CHART_REQUEST_BYTES + 1),
        'Idempotency-Key': 'declared-size-key',
      },
      body: '{}',
    }))
    const streamed = await POST(jsonRequest({
      chartExportSpec: { symbol: 'AAPL' },
      padding: 'x'.repeat(MAX_NEWSLETTER_CHART_REQUEST_BYTES),
    }))

    expect(declared.status).toBe(413)
    expect(streamed.status).toBe(413)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('preserves caller abort identity instead of serializing a 500', async () => {
    const controller = new AbortController()
    const reason = new Error('browser left chart editor')
    const saveRequest = jsonRequest(
      { chartExportSpec: { symbol: 'AAPL' } },
      { signal: controller.signal },
    )
    mocks.save.mockImplementation(async () => {
      controller.abort(reason)
      throw reason
    })

    await expect(POST(saveRequest)).rejects.toBe(reason)
  })
})
