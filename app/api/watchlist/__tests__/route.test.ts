import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthApiError,
  AuthSessionMissingError,
} from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  createStatelessUserClient: vi.fn(),
  createStore: vi.fn(),
  getUser: vi.fn(),
  read: vi.fn(),
  sync: vi.fn(),
}))

vi.mock('@/lib/supabase/stateless-user', () => ({
  createStatelessUserClient: mocks.createStatelessUserClient,
}))

vi.mock('@/lib/dashboard/account-watchlist-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dashboard/account-watchlist-store')>()
  return {
    ...actual,
    createAccountWatchlistStore: vi.fn((client) => {
      mocks.createStore(client)
      return {
        read: mocks.read,
        sync: mocks.sync,
      }
    }),
  }
})

import { GET, PUT } from '@/app/api/watchlist/route'
import { AccountWatchlistStoreError } from '@/lib/dashboard/account-watchlist-store'
import { SUPABASE_ACCESS_TOKEN_MAX_LENGTH } from '@/lib/supabase/access-token'
import {
  ACCOUNT_WATCHLIST_EXPECTED_USER_HEADER,
  WATCHLIST_REQUEST_MAX_BYTES,
} from '@/lib/dashboard/watchlist-http-contract'

const initializedAt = '2026-08-09T13:00:00.000Z'
const OWNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ACCESS_TOKEN = `${'a'.repeat(24)}.${'b'.repeat(48)}.${'c'.repeat(32)}`

function getRequest(
  signal?: AbortSignal,
  requestUserId: string | null = OWNER_ID,
  authorization: string | null = `Bearer ${ACCESS_TOKEN}`,
) {
  const headers = new Headers()
  if (requestUserId !== null) {
    headers.set(ACCOUNT_WATCHLIST_EXPECTED_USER_HEADER, requestUserId)
  }
  if (authorization !== null) headers.set('Authorization', authorization)
  return new Request('https://theintraday.com/api/watchlist', { headers, signal })
}

function putRequest(
  body: unknown,
  options: {
    contentType?: string | null
    authorization?: string | null
    headers?: Record<string, string>
    origin?: string | null
    requestUserId?: string | null
    raw?: boolean
    signal?: AbortSignal
  } = {},
) {
  const headers = new Headers(options.headers)
  if (options.authorization !== null) {
    headers.set(
      'Authorization',
      options.authorization ?? `Bearer ${ACCESS_TOKEN}`,
    )
  }
  if (options.requestUserId !== null) {
    headers.set(
      ACCOUNT_WATCHLIST_EXPECTED_USER_HEADER,
      options.requestUserId ?? OWNER_ID,
    )
  }
  if (options.origin !== null) {
    headers.set('Origin', options.origin ?? 'https://theintraday.com')
  }
  if (options.contentType !== null) {
    headers.set('Content-Type', options.contentType ?? 'application/json')
  }
  return new Request('https://theintraday.com/api/watchlist', {
    method: 'PUT',
    headers,
    body: options.raw ? String(body) : JSON.stringify(body),
    signal: options.signal,
  })
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    expectedUserId: OWNER_ID,
    mode: 'replace',
    symbols: ['AAPL', 'BRK.B'],
    expectedRevision: 2,
    idempotencyKey: 'watchlist-command-0001',
    ...overrides,
  }
}

function expectPrivate(response: Response): void {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(response.headers.get('set-cookie')).toBeNull()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', 'true')
  mocks.createStatelessUserClient.mockReturnValue({
    auth: { getUser: mocks.getUser },
  })
  mocks.getUser.mockResolvedValue({
    data: { user: { id: OWNER_ID } },
    error: null,
  })
  mocks.read.mockResolvedValue({
    symbols: null,
    revision: 0,
    syncInitializedAt: initializedAt,
  })
  mocks.sync.mockResolvedValue({
    disposition: 'applied',
    symbols: ['AAPL', 'BRK.B'],
    revision: 3,
    syncInitializedAt: initializedAt,
    droppedSymbols: [],
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('/api/watchlist', () => {
  it('fails closed behind the exact flag before auth or body work', async () => {
    for (const flag of ['', 'false', 'TRUE', '1']) {
      vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', flag)
      const [readResponse, writeResponse] = await Promise.all([
        GET(getRequest()),
        PUT(putRequest('{', {
          raw: true,
          origin: 'https://attacker.example',
          contentType: 'text/plain',
        })),
      ])
      expect(readResponse.status).toBe(404)
      expect(writeResponse.status).toBe(404)
      expectPrivate(readResponse)
      expectPrivate(writeResponse)
    }
    expect(mocks.createStatelessUserClient).not.toHaveBeenCalled()
  })

  it('rejects missing or malformed principal stamps before auth or body work', async () => {
    const candidates = [
      GET(getRequest(undefined, null)),
      GET(getRequest(undefined, 'not-a-uuid')),
      PUT(putRequest('{', { raw: true, requestUserId: null })),
      PUT(putRequest('{', { raw: true, requestUserId: 'NOT-A-UUID' })),
    ]

    for (const responsePromise of candidates) {
      const response = await responsePromise
      expect(response.status).toBe(400)
      expectPrivate(response)
      await expect(response.json()).resolves.toEqual({
        error: 'The account watchlist principal is invalid.',
        code: 'INVALID_WATCHLIST_PRINCIPAL',
      })
    }
    expect(mocks.createStatelessUserClient).not.toHaveBeenCalled()
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('requires an exact bounded bearer JWT before constructing an auth client', async () => {
    const candidates = [
      GET(getRequest(undefined, OWNER_ID, null)),
      GET(getRequest(undefined, OWNER_ID, `bearer ${ACCESS_TOKEN}`)),
      GET(getRequest(undefined, OWNER_ID, `Bearer  ${ACCESS_TOKEN}`)),
      GET(getRequest(undefined, OWNER_ID, 'Bearer not-a-jwt')),
      GET(getRequest(
        undefined,
        OWNER_ID,
        `Bearer ${ACCESS_TOKEN},Bearer ${ACCESS_TOKEN}`,
      )),
      GET(getRequest(
        undefined,
        OWNER_ID,
        `Bearer ${'a'.repeat(SUPABASE_ACCESS_TOKEN_MAX_LENGTH)}.b.c`,
      )),
      PUT(putRequest(command(), { authorization: null })),
    ]

    for (const responsePromise of candidates) {
      const response = await responsePromise
      expect(response.status).toBe(401)
      expectPrivate(response)
      await expect(response.json()).resolves.toEqual({
        error: 'A valid account access token is required.',
        code: 'WATCHLIST_AUTHORIZATION_REQUIRED',
      })
    }
    expect(mocks.createStatelessUserClient).not.toHaveBeenCalled()
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('returns one authenticated private snapshot and forwards cancellation', async () => {
    const controller = new AbortController()
    const request = getRequest(controller.signal)
    const response = await GET(request)

    expect(response.status).toBe(200)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({
      watchlist: {
        symbols: null,
        revision: 0,
        syncInitializedAt: initializedAt,
      },
    })
    expect(mocks.read).toHaveBeenCalledWith(request.signal)
    expect(mocks.createStatelessUserClient).toHaveBeenCalledWith(
      ACCESS_TOKEN,
      { signal: request.signal },
    )
    expect(mocks.getUser).toHaveBeenCalledWith(ACCESS_TOKEN)
    expect(mocks.createStore).toHaveBeenCalledWith(
      mocks.createStatelessUserClient.mock.results[0]?.value,
    )
  })

  it('requires authentication for reads and mutations before store or body work', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const readResponse = await GET(getRequest())
    const writeResponse = await PUT(putRequest('{', { raw: true }))

    expect(readResponse.status).toBe(401)
    expect(writeResponse.status).toBe(401)
    expectPrivate(readResponse)
    expectPrivate(writeResponse)
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('classifies missing-session errors as signed out and transient auth as unavailable', async () => {
    mocks.getUser
      .mockResolvedValueOnce({
        data: { user: null },
        error: new AuthSessionMissingError(),
      })
      .mockRejectedValueOnce(new TypeError('identity provider offline'))

    const signedOut = await GET(getRequest())
    const unavailable = await PUT(putRequest(command()))

    expect(signedOut.status).toBe(401)
    expect(unavailable.status).toBe(503)
    expectPrivate(signedOut)
    expectPrivate(unavailable)
    await expect(signedOut.json()).resolves.toMatchObject({ code: 'AUTH_REQUIRED' })
    await expect(unavailable.json()).resolves.toEqual({
      error: 'Account authentication is temporarily unavailable.',
      code: 'WATCHLIST_AUTH_UNAVAILABLE',
    })
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('maps expired and revoked bearer API errors to auth-required, not an outage', async () => {
    mocks.getUser
      .mockResolvedValueOnce({
        data: { user: null },
        error: new AuthApiError('expired', 401, 'session_expired'),
      })
      .mockRejectedValueOnce(
        new AuthApiError('revoked', 400, 'session_not_found'),
      )

    const expired = await GET(getRequest())
    const revoked = await PUT(putRequest(command()))

    for (const response of [expired, revoked]) {
      expect(response.status).toBe(401)
      expectPrivate(response)
      await expect(response.json()).resolves.toMatchObject({
        code: 'AUTH_REQUIRED',
      })
    }
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('keeps retryable and upstream auth API failures classified as unavailable', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('upstream unavailable', 503, 'unexpected_failure'),
    })

    const response = await GET(getRequest())

    expect(response.status).toBe(503)
    expectPrivate(response)
    await expect(response.json()).resolves.toMatchObject({
      code: 'WATCHLIST_AUTH_UNAVAILABLE',
    })
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('treats a malformed authenticated principal as unavailable before store access', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'not-a-uuid' } },
      error: null,
    })

    const response = await GET(getRequest())

    expect(response.status).toBe(503)
    expectPrivate(response)
    await expect(response.json()).resolves.toMatchObject({
      code: 'WATCHLIST_AUTH_UNAVAILABLE',
    })
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('rejects expected A with bearer principal B before any store access', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: OTHER_ID } },
      error: null,
    })

    const readResponse = await GET(getRequest())
    const writeResponse = await PUT(putRequest('{', { raw: true }))

    for (const response of [readResponse, writeResponse]) {
      expect(response.status).toBe(409)
      expectPrivate(response)
      await expect(response.json()).resolves.toEqual({
        error: 'Your signed-in account changed. Reload before using the account watchlist.',
        code: 'WATCHLIST_PRINCIPAL_MISMATCH',
      })
    }
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('rejects cross-origin mutations before auth or body work', async () => {
    for (const candidate of [
      putRequest(command(), { origin: null }),
      putRequest(command(), { origin: 'https://attacker.example' }),
      putRequest(command(), { headers: { 'Sec-Fetch-Site': 'cross-site' } }),
    ]) {
      const response = await PUT(candidate)
      expect(response.status).toBe(403)
      expectPrivate(response)
    }
    expect(mocks.createStatelessUserClient).not.toHaveBeenCalled()
  })

  it('bounds and validates JSON only after origin and auth succeed', async () => {
    const candidates: Array<[Request, number]> = [
      [putRequest(command(), { contentType: 'text/plain' }), 415],
      [putRequest('{', { raw: true }), 400],
      [putRequest(command({ extra: true })), 400],
      [putRequest(command({ expectedUserId: 'not-a-uuid' })), 400],
      [putRequest(command({ expectedRevision: -1 })), 400],
      [putRequest(command({ idempotencyKey: 'short' })), 400],
      [putRequest(command({ symbols: ['ES=F'] })), 400],
      [putRequest(command({ symbols: ['BRK-B', 'BRK.B'] })), 400],
      [putRequest(command({
        symbols: Array.from({ length: 21 }, (_, index) => `T${index}`),
      })), 400],
      [putRequest(command(), {
        headers: { 'Content-Length': String(WATCHLIST_REQUEST_MAX_BYTES + 1) },
      }), 413],
      [putRequest(JSON.stringify({
        ...command(),
        padding: 'x'.repeat(WATCHLIST_REQUEST_MAX_BYTES),
      }), { raw: true }), 413],
    ]

    for (const [candidate, status] of candidates) {
      const response = await PUT(candidate)
      expect(response.status).toBe(status)
      expectPrivate(response)
    }
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('rejects disagreement between the authenticated header and mutation envelope', async () => {
    const response = await PUT(putRequest(command({ expectedUserId: OTHER_ID })))

    expect(response.status).toBe(409)
    expectPrivate(response)
    await expect(response.json()).resolves.toMatchObject({
      code: 'WATCHLIST_PRINCIPAL_MISMATCH',
    })
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('canonicalizes aliases while preserving the exact command receipt metadata', async () => {
    const controller = new AbortController()
    const request = putRequest(command({
      mode: 'merge',
      symbols: [' aapl ', 'brk-b'],
      expectedRevision: null,
    }), { signal: controller.signal })
    const response = await PUT(request)

    expect(response.status).toBe(200)
    expectPrivate(response)
    await expect(response.json()).resolves.toEqual({
      watchlist: {
        symbols: ['AAPL', 'BRK.B'],
        revision: 3,
        syncInitializedAt: initializedAt,
      },
      disposition: 'applied',
      droppedSymbols: [],
    })
    expect(mocks.sync).toHaveBeenCalledWith({
      mode: 'merge',
      symbols: ['AAPL', 'BRK.B'],
      expectedRevision: null,
      idempotencyKey: 'watchlist-command-0001',
    }, request.signal)
  })

  it('returns durable replays normally and CAS/key conflicts with the latest receipt', async () => {
    mocks.sync
      .mockResolvedValueOnce({
        disposition: 'replayed',
        symbols: [],
        revision: 4,
        syncInitializedAt: initializedAt,
        droppedSymbols: [],
      })
      .mockResolvedValueOnce({
        disposition: 'conflict',
        symbols: ['MSFT'],
        revision: 5,
        syncInitializedAt: initializedAt,
        droppedSymbols: ['NVDA'],
      })

    const replay = await PUT(putRequest(command()))
    expect(replay.status).toBe(200)
    await expect(replay.json()).resolves.toMatchObject({
      disposition: 'replayed',
      watchlist: { revision: 4, symbols: [] },
    })

    const conflict = await PUT(putRequest(command({
      idempotencyKey: 'watchlist-command-0002',
    })))
    expect(conflict.status).toBe(409)
    expectPrivate(conflict)
    await expect(conflict.json()).resolves.toMatchObject({
      code: 'WATCHLIST_REVISION_CONFLICT',
      disposition: 'conflict',
      watchlist: { revision: 5, symbols: ['MSFT'] },
      droppedSymbols: ['NVDA'],
    })
  })

  it('returns generic bounded failures without exposing RPC diagnostics', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.read.mockRejectedValueOnce(new AccountWatchlistStoreError(
      `Failed to read account watchlist: bearer ${ACCESS_TOKEN}`,
    ))
    mocks.sync.mockRejectedValueOnce(new AccountWatchlistStoreError(
      'Failed to sync account watchlist: internal relation missing',
    ))

    const readResponse = await GET(getRequest())
    const writeResponse = await PUT(putRequest(command()))

    expect(readResponse.status).toBe(503)
    expect(writeResponse.status).toBe(503)
    expectPrivate(readResponse)
    expectPrivate(writeResponse)
    expect(JSON.stringify(await readResponse.json())).not.toContain(ACCESS_TOKEN)
    expect(JSON.stringify(await writeResponse.json())).not.toContain('relation')
    expect(errorSpy).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(ACCESS_TOKEN)
  })
})
