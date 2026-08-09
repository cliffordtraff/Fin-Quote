import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACCOUNT_WATCHLIST_CACHE_KEY,
  readCachedAccountWatchlist,
  writeCachedAccountWatchlist,
} from '@/lib/dashboard/account-watchlist-client'

const auth = vi.hoisted(() => ({
  accessToken: `${'a'.repeat(24)}.${'b'.repeat(48)}.${'c'.repeat(32)}` as string | null,
  user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as { id: string } | null,
  loading: false,
  status: 'authenticated' as 'loading' | 'authenticated' | 'signed_out' | 'unavailable',
  retry: vi.fn(),
}))

vi.mock('@/components/CurrentUserProvider', () => ({
  useCurrentUser: () => ({
    accessToken: auth.accessToken,
    user: auth.user,
    loading: auth.loading,
    status: auth.status,
    retry: auth.retry,
    signOut: vi.fn(),
  }),
}))

import {
  ACCOUNT_WATCHLIST_CLIENT_DEADLINE_MS,
  useAccountWatchlist,
} from '@/components/useAccountWatchlist'
import { ACCOUNT_WATCHLIST_EXPECTED_USER_HEADER } from '@/lib/dashboard/watchlist-http-contract'

const initializedAt = '2026-08-09T13:00:00.000Z'
const USER_1_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const USER_2_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const USER_3_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TOKEN_1 = `${'a'.repeat(24)}.${'b'.repeat(48)}.${'c'.repeat(32)}`
const TOKEN_2 = `${'d'.repeat(24)}.${'e'.repeat(48)}.${'f'.repeat(32)}`
const TOKEN_3 = `${'g'.repeat(24)}.${'h'.repeat(48)}.${'i'.repeat(32)}`

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function readResponse(symbols: string[] | null, revision: number) {
  return new Response(JSON.stringify({
    watchlist: { symbols, revision, syncInitializedAt: initializedAt },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function syncResponse(
  symbols: string[] | null,
  revision: number,
  disposition: 'applied' | 'unchanged' | 'replayed' | 'conflict' = 'applied',
) {
  const conflict = disposition === 'conflict'
  return new Response(JSON.stringify({
    ...(conflict ? {
      error: 'The account watchlist changed before this command was applied.',
      code: 'WATCHLIST_REVISION_CONFLICT',
    } : {}),
    watchlist: { symbols, revision, syncInitializedAt: initializedAt },
    disposition,
    droppedSymbols: [],
  }), {
    status: conflict ? 409 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function principalMismatchResponse() {
  return new Response(JSON.stringify({
    error: 'Your signed-in account changed. Reload before using the account watchlist.',
    code: 'WATCHLIST_PRINCIPAL_MISMATCH',
  }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  })
}

function authRequiredResponse() {
  return new Response(JSON.stringify({
    error: 'Sign in to load your account watchlist.',
    code: 'AUTH_REQUIRED',
  }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestMethod(call: unknown[]): string {
  return ((call[1] as RequestInit | undefined)?.method ?? 'GET').toString()
}

function requestBody(call: unknown[]) {
  return JSON.parse((call[1] as RequestInit).body as string) as {
    expectedUserId: string
    mode: string
    symbols: string[] | null
    expectedRevision: number | null
    idempotencyKey: string
  }
}

function expectedUserHeader(call: unknown[]): string | null {
  return new Headers((call[1] as RequestInit | undefined)?.headers)
    .get(ACCOUNT_WATCHLIST_EXPECTED_USER_HEADER)
}

function authorizationHeader(call: unknown[]): string | null {
  return new Headers((call[1] as RequestInit | undefined)?.headers)
    .get('Authorization')
}

function requestCredentials(call: unknown[]): RequestCredentials | undefined {
  return (call[1] as RequestInit | undefined)?.credentials
}

describe('useAccountWatchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', 'true')
    auth.accessToken = TOKEN_1
    auth.user = { id: USER_1_ID }
    auth.loading = false
    auth.status = 'authenticated'
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('loads the account, then merges a nonempty local watchlist account-first once', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(readResponse(['AAPL'], 1))
      .mockResolvedValueOnce(syncResponse(['AAPL', 'MSFT'], 2))
      .mockResolvedValueOnce(readResponse(['AAPL', 'MSFT'], 2))
    vi.stubGlobal('fetch', fetchMock)
    const onLocalSymbolsChange = vi.fn()

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: ['MSFT'],
      localLoaded: true,
      onLocalSymbolsChange,
    }))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.symbols).toEqual(['AAPL', 'MSFT'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestMethod(fetchMock.mock.calls[0])).toBe('GET')
    expect(expectedUserHeader(fetchMock.mock.calls[0])).toBe(USER_1_ID)
    expect(expectedUserHeader(fetchMock.mock.calls[1])).toBe(USER_1_ID)
    expect(authorizationHeader(fetchMock.mock.calls[0])).toBe(`Bearer ${TOKEN_1}`)
    expect(authorizationHeader(fetchMock.mock.calls[1])).toBe(`Bearer ${TOKEN_1}`)
    expect(requestCredentials(fetchMock.mock.calls[0])).toBe('omit')
    expect(requestCredentials(fetchMock.mock.calls[1])).toBe('omit')
    expect(requestBody(fetchMock.mock.calls[1])).toMatchObject({
      expectedUserId: USER_1_ID,
      mode: 'merge',
      symbols: ['MSFT'],
      expectedRevision: 1,
    })
    expect(onLocalSymbolsChange).not.toHaveBeenCalled()

    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(fetchMock.mock.calls.filter((call) => requestMethod(call) === 'PUT'))
      .toHaveLength(1)
    expect(auth.retry).not.toHaveBeenCalled()
  })

  it('keeps account results out of anonymous dashboard preferences', async () => {
    const fetchMock = vi.fn().mockResolvedValue(readResponse(['NVDA'], 4))
    vi.stubGlobal('fetch', fetchMock)
    const onLocalSymbolsChange = vi.fn()

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange,
    }))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    expect(result.current.source).toBe('account')
    expect(result.current.symbols).toEqual(['NVDA'])
    expect(onLocalSymbolsChange).not.toHaveBeenCalled()
  })

  it('persists a lost-response command and replays its exact body before any GET', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(readResponse(['AAPL'], 1))
      .mockRejectedValueOnce(new TypeError('connection reset'))
    vi.stubGlobal('fetch', fetchMock)
    const onLocalSymbolsChange = vi.fn()

    const first = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange,
    }))
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    act(() => first.result.current.setSymbols(['AAPL', 'MSFT']))
    await waitFor(() => expect(first.result.current.status).toBe('uncertain'))

    const lostBody = requestBody(fetchMock.mock.calls[1])
    const { expectedUserId: lostExpectedUserId, ...lostCommand } = lostBody
    expect(lostExpectedUserId).toBe(USER_1_ID)
    expect(JSON.stringify(lostBody)).not.toContain(TOKEN_1)
    expect(window.localStorage.getItem(ACCOUNT_WATCHLIST_CACHE_KEY) ?? '')
      .not.toContain(TOKEN_1)
    expect(readCachedAccountWatchlist(window.localStorage, USER_1_ID)?.pendingCommand)
      .toEqual(lostCommand)
    first.unmount()

    fetchMock.mockResolvedValueOnce(syncResponse(['AAPL', 'MSFT'], 2, 'replayed'))
    const second = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange,
    }))
    await waitFor(() => expect(second.result.current.status).toBe('ready'))

    expect(requestMethod(fetchMock.mock.calls[2])).toBe('PUT')
    expect(requestBody(fetchMock.mock.calls[2])).toEqual(lostBody)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(second.result.current.symbols).toEqual(['AAPL', 'MSFT'])
  })

  it('adopts an authoritative conflict without resubmitting the rejected replace', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(readResponse(['AAPL'], 2))
      .mockResolvedValueOnce(syncResponse(['NVDA'], 3, 'conflict'))
      .mockResolvedValueOnce(readResponse(['NVDA'], 3))
    vi.stubGlobal('fetch', fetchMock)
    const onLocalSymbolsChange = vi.fn()

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange,
    }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.setSymbols(['MSFT']))
    await waitFor(() => expect(result.current.status).toBe('conflict'))

    expect(result.current.symbols).toEqual(['NVDA'])
    expect(result.current.canEdit).toBe(false)
    expect(result.current.canRetry).toBe(true)
    expect(onLocalSymbolsChange).not.toHaveBeenCalled()

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(requestMethod(fetchMock.mock.calls[2])).toBe('GET')
    expect(fetchMock.mock.calls.filter((call) => requestMethod(call) === 'PUT'))
      .toHaveLength(1)
    expect(auth.retry).not.toHaveBeenCalled()
  })

  it('does not mark a rejected local merge complete and retries it after a fresh read', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(readResponse(['AAPL'], 1))
      .mockResolvedValueOnce(syncResponse(['NVDA'], 2, 'conflict'))
      .mockResolvedValueOnce(readResponse(['NVDA'], 2))
      .mockResolvedValueOnce(syncResponse(['NVDA', 'MSFT'], 3))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: ['MSFT'],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(result.current.status).toBe('conflict'))

    const rejectedMerge = requestBody(fetchMock.mock.calls[1])
    expect(rejectedMerge).toMatchObject({
      mode: 'merge',
      symbols: ['MSFT'],
      expectedRevision: 1,
    })
    expect(readCachedAccountWatchlist(
      window.localStorage,
      USER_1_ID,
    )?.mergedLocalFingerprint).toBeNull()

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.symbols).toEqual(['NVDA', 'MSFT'])
    const retriedMerge = requestBody(fetchMock.mock.calls[3])
    expect(retriedMerge).toMatchObject({
      mode: 'merge',
      symbols: ['MSFT'],
      expectedRevision: 2,
    })
    expect(retriedMerge.idempotencyKey).not.toBe(rejectedMerge.idempotencyKey)
  })

  it('preserves and replays a cross-tab receipt adopted during a deferred GET', async () => {
    const initialRead = deferred<Response>()
    const replay = deferred<Response>()
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => initialRead.promise)
      .mockImplementationOnce(() => replay.promise)
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const pendingCommand = {
      mode: 'replace' as const,
      symbols: ['MSFT'],
      expectedRevision: 1,
      idempotencyKey: 'watchlist:cross-tab-command-1',
    }
    expect(writeCachedAccountWatchlist(window.localStorage, {
      userId: USER_1_ID,
      snapshot: {
        symbols: ['AAPL'],
        revision: 1,
        syncInitializedAt: initializedAt,
      },
      mergedLocalFingerprint: null,
      pendingCommand,
      touchedAt: 2,
    })).toBe(true)
    act(() => window.dispatchEvent(new StorageEvent('storage', {
      key: ACCOUNT_WATCHLIST_CACHE_KEY,
    })))

    await act(async () => initialRead.resolve(readResponse(['AAPL'], 1)))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(requestMethod(fetchMock.mock.calls[1])).toBe('PUT')
    expect(requestBody(fetchMock.mock.calls[1])).toEqual({
      expectedUserId: USER_1_ID,
      ...pendingCommand,
    })
    expect(readCachedAccountWatchlist(
      window.localStorage,
      USER_1_ID,
    )?.pendingCommand).toEqual(pendingCommand)

    await act(async () => replay.resolve(syncResponse(['MSFT'], 2, 'replayed')))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.symbols).toEqual(['MSFT'])
  })

  it('stamps every read with its controller principal and fences a stale mismatch', async () => {
    const firstRead = deferred<Response>()
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => firstRead.promise)
      .mockResolvedValueOnce(readResponse(['NVDA'], 7))
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(expectedUserHeader(fetchMock.mock.calls[0])).toBe(USER_1_ID)

    auth.user = { id: USER_2_ID }
    auth.accessToken = TOKEN_2
    rerender()
    auth.user = { id: USER_3_ID }
    auth.accessToken = TOKEN_3
    rerender()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.symbols).toBeNull()

    await act(async () => firstRead.resolve(principalMismatchResponse()))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(expectedUserHeader(fetchMock.mock.calls[1])).toBe(USER_3_ID)
    expect(authorizationHeader(fetchMock.mock.calls[1])).toBe(`Bearer ${TOKEN_3}`)
    await waitFor(() => expect(result.current.symbols).toEqual(['NVDA']))
    expect(readCachedAccountWatchlist(window.localStorage, USER_1_ID)).toBeNull()
    expect(readCachedAccountWatchlist(window.localStorage, USER_2_ID)).toBeNull()
    expect(readCachedAccountWatchlist(window.localStorage, USER_3_ID)?.snapshot.symbols)
      .toEqual(['NVDA'])
  })

  it('keeps a stale mutation bound to A while B waits for the physical lane', async () => {
    const stalePut = deferred<Response>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(readResponse(['AAPL'], 1))
      // Model a transport that ignores the controller abort after auth changes.
      .mockImplementationOnce(() => stalePut.promise)
      .mockResolvedValueOnce(readResponse(['NVDA'], 7))
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.setSymbols(['MSFT']))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(requestMethod(fetchMock.mock.calls[1])).toBe('PUT')
    expect(expectedUserHeader(fetchMock.mock.calls[1])).toBe(USER_1_ID)
    expect(requestBody(fetchMock.mock.calls[1])).toMatchObject({
      expectedUserId: USER_1_ID,
      mode: 'replace',
      symbols: ['MSFT'],
    })

    auth.user = { id: USER_2_ID }
    auth.accessToken = TOKEN_2
    rerender()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.symbols).toBeNull()

    await act(async () => stalePut.resolve(syncResponse(['MSFT'], 2)))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(requestMethod(fetchMock.mock.calls[2])).toBe('GET')
    expect(expectedUserHeader(fetchMock.mock.calls[2])).toBe(USER_2_ID)
    expect(authorizationHeader(fetchMock.mock.calls[2])).toBe(`Bearer ${TOKEN_2}`)
    await waitFor(() => expect(result.current.symbols).toEqual(['NVDA']))

    expect(readCachedAccountWatchlist(window.localStorage, USER_1_ID))
      .toMatchObject({
        snapshot: { symbols: ['AAPL'], revision: 1 },
        pendingCommand: { symbols: ['MSFT'] },
      })
    expect(readCachedAccountWatchlist(window.localStorage, USER_2_ID)?.snapshot)
      .toMatchObject({ symbols: ['NVDA'], revision: 7 })
  })

  it('disposes a same-user controller when its bearer token rotates', async () => {
    const staleRead = deferred<Response>()
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => staleRead.promise)
      .mockResolvedValueOnce(readResponse(['NVDA'], 2))
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(authorizationHeader(fetchMock.mock.calls[0])).toBe(`Bearer ${TOKEN_1}`)

    auth.accessToken = TOKEN_2
    rerender()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => staleRead.resolve(readResponse(['STALE'], 1)))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(authorizationHeader(fetchMock.mock.calls[1])).toBe(`Bearer ${TOKEN_2}`)
    expect(requestCredentials(fetchMock.mock.calls[1])).toBe('omit')
    await waitFor(() => expect(result.current.symbols).toEqual(['NVDA']))

    const serializedCache = window.localStorage.getItem(ACCOUNT_WATCHLIST_CACHE_KEY)
    expect(serializedCache).not.toBeNull()
    expect(serializedCache ?? '').not.toContain(TOKEN_1)
    expect(serializedCache ?? '').not.toContain(TOKEN_2)
    expect(readCachedAccountWatchlist(window.localStorage, USER_1_ID)?.snapshot)
      .toMatchObject({ symbols: ['NVDA'], revision: 2 })
  })

  it('makes a ready controller non-editable immediately when its token rotates', async () => {
    const refreshedRead = deferred<Response>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(readResponse(['AAPL'], 1))
      .mockImplementationOnce(() => refreshedRead.promise)
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    auth.accessToken = TOKEN_2
    rerender()
    expect(result.current.canEdit).toBe(false)
    act(() => result.current.setSymbols(['MSFT']))
    expect(fetchMock.mock.calls.filter((call) => requestMethod(call) === 'PUT'))
      .toHaveLength(0)

    await act(async () => refreshedRead.resolve(readResponse(['NVDA'], 2)))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.symbols).toEqual(['NVDA'])
  })

  it('replays a pending same-user command with the rotated token and exact receipt', async () => {
    const stalePut = deferred<Response>()
    const replayPut = deferred<Response>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(readResponse(['AAPL'], 1))
      // Both transports deliberately ignore abort to exercise the physical lane.
      .mockImplementationOnce(() => stalePut.promise)
      .mockImplementationOnce(() => replayPut.promise)
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.setSymbols(['MSFT']))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const originalBody = requestBody(fetchMock.mock.calls[1])
    expect(authorizationHeader(fetchMock.mock.calls[1])).toBe(`Bearer ${TOKEN_1}`)

    auth.accessToken = TOKEN_2
    rerender()
    expect(result.current.canEdit).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(async () => stalePut.resolve(syncResponse(['MSFT'], 2)))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(requestMethod(fetchMock.mock.calls[2])).toBe('PUT')
    expect(authorizationHeader(fetchMock.mock.calls[2])).toBe(`Bearer ${TOKEN_2}`)
    expect(requestBody(fetchMock.mock.calls[2])).toEqual(originalBody)

    await act(async () => replayPut.resolve(syncResponse(['MSFT'], 2, 'replayed')))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.symbols).toEqual(['MSFT'])
    expect(readCachedAccountWatchlist(window.localStorage, USER_1_ID)?.pendingCommand)
      .toBeNull()
    const serializedCache = window.localStorage.getItem(ACCOUNT_WATCHLIST_CACHE_KEY) ?? ''
    expect(serializedCache).not.toContain(TOKEN_1)
    expect(serializedCache).not.toContain(TOKEN_2)
  })

  it('revalidates auth on a 401 read instead of retrying the rejected token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(authRequiredResponse())
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))

    await waitFor(() => expect(auth.retry).toHaveBeenCalledOnce())
    expect(result.current.status).toBe('unavailable')
    expect(result.current.message).toContain('Rechecking sign-in')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(ACCOUNT_WATCHLIST_CACHE_KEY)).toBeNull()
  })

  it('revalidates auth on a principal-mismatch save and retains its receipt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(readResponse(['AAPL'], 1))
      .mockResolvedValueOnce(principalMismatchResponse())
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => result.current.setSymbols(['MSFT']))

    await waitFor(() => expect(auth.retry).toHaveBeenCalledOnce())
    expect(result.current.status).toBe('unavailable')
    expect(result.current.message).toContain('Rechecking sign-in')
    expect(readCachedAccountWatchlist(window.localStorage, USER_1_ID)?.pendingCommand)
      .toMatchObject({ mode: 'replace', symbols: ['MSFT'] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('serializes and deduplicates cross-tab cache refreshes', async () => {
    const secondRead = deferred<Response>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(readResponse(['AAPL'], 1))
      .mockImplementationOnce(() => secondRead.promise)
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: ACCOUNT_WATCHLIST_CACHE_KEY,
      }))
      window.dispatchEvent(new StorageEvent('storage', {
        key: ACCOUNT_WATCHLIST_CACHE_KEY,
      }))
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(result.current.status).toBe('loading')

    await act(async () => secondRead.resolve(readResponse(['AAPL', 'MSFT'], 2)))
    await waitFor(() => expect(result.current.symbols).toEqual(['AAPL', 'MSFT']))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps an in-memory exact retry when browser storage is denied', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(readResponse(['AAPL'], 1))
      .mockRejectedValueOnce(new TypeError('lost response'))
      .mockResolvedValueOnce(syncResponse(['MSFT'], 2, 'replayed'))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.cacheAvailable).toBe(false)

    act(() => result.current.setSymbols(['MSFT']))
    await waitFor(() => expect(result.current.status).toBe('uncertain'))
    const firstBody = requestBody(fetchMock.mock.calls[1])
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(requestBody(fetchMock.mock.calls[2])).toEqual(firstBody)
  })

  it('times out a stalled PUT but retains its physical slot until an exact retry is safe', async () => {
    const stalledPut = deferred<Response>()
    const retryPut = deferred<Response>()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(readResponse(['AAPL'], 1))
      // Deliberately ignore AbortSignal to model a broken transport.
      .mockImplementationOnce(() => stalledPut.promise)
      .mockImplementationOnce(() => retryPut.promise)
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    vi.useFakeTimers()
    act(() => result.current.setSymbols(['MSFT']))
    await act(async () => { await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstBody = requestBody(fetchMock.mock.calls[1])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACCOUNT_WATCHLIST_CLIENT_DEADLINE_MS)
    })
    expect(result.current.status).toBe('uncertain')

    act(() => result.current.retry())
    await act(async () => { await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(async () => stalledPut.resolve(syncResponse(['MSFT'], 2)))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(requestBody(fetchMock.mock.calls[2])).toEqual(firstBody)
    expect(result.current.symbols).toEqual(['AAPL'])

    await act(async () => retryPut.resolve(syncResponse(['MSFT'], 2, 'replayed')))
    expect(result.current.status).toBe('ready')
    expect(result.current.symbols).toEqual(['MSFT'])
  })

  it('times out a stalled GET and ignores its late snapshot before the queued refresh', async () => {
    vi.useFakeTimers()
    const stalledRead = deferred<Response>()
    const retryRead = deferred<Response>()
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => stalledRead.promise)
      .mockImplementationOnce(() => retryRead.promise)
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await act(async () => { await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACCOUNT_WATCHLIST_CLIENT_DEADLINE_MS)
    })
    expect(result.current.status).toBe('unavailable')
    act(() => result.current.retry())
    await act(async () => { await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => stalledRead.resolve(readResponse(['STALE'], 1)))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.symbols).toBeNull()

    await act(async () => retryRead.resolve(readResponse(['NVDA'], 2)))
    expect(result.current.status).toBe('ready')
    expect(result.current.symbols).toEqual(['NVDA'])
  })

  it('does not commit an older authoritative response over a newer account cache', async () => {
    expect(writeCachedAccountWatchlist(window.localStorage, {
      userId: USER_1_ID,
      snapshot: {
        symbols: ['NVDA'],
        revision: 5,
        syncInitializedAt: initializedAt,
      },
      mergedLocalFingerprint: null,
      pendingCommand: null,
      touchedAt: 1,
    })).toBe(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(readResponse(['AAPL'], 4)))

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: [],
      localLoaded: true,
      onLocalSymbolsChange: vi.fn(),
    }))
    await waitFor(() => expect(result.current.status).toBe('unavailable'))

    expect(result.current.symbols).toEqual(['NVDA'])
    expect(readCachedAccountWatchlist(window.localStorage, USER_1_ID)?.snapshot)
      .toMatchObject({ symbols: ['NVDA'], revision: 5 })
  })

  it('leaves the anonymous path exactly local when the feature flag is off', () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC', 'false')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onLocalSymbolsChange = vi.fn()

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: ['AAPL'],
      localLoaded: true,
      onLocalSymbolsChange,
    }))
    act(() => result.current.setSymbols([' brk-b ', 'ES=F']))

    expect(result.current).toMatchObject({
      symbols: ['AAPL'],
      source: 'local',
      status: 'local',
      canEdit: true,
      canRetry: false,
    })
    expect(onLocalSymbolsChange).toHaveBeenCalledWith(['BRK.B'])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(ACCOUNT_WATCHLIST_CACHE_KEY)).toBeNull()
  })

  it('does not fall back to editable local state while account identity is unavailable', () => {
    auth.user = null
    auth.loading = false
    auth.status = 'unavailable'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onLocalSymbolsChange = vi.fn()

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: ['AAPL'],
      localLoaded: true,
      onLocalSymbolsChange,
    }))

    expect(result.current).toMatchObject({
      symbols: ['AAPL'],
      source: 'local',
      status: 'unavailable',
      canEdit: false,
      canRetry: true,
    })
    act(() => result.current.setSymbols(['MSFT']))
    expect(onLocalSymbolsChange).not.toHaveBeenCalled()
    act(() => result.current.retry())
    expect(auth.retry).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed and revalidates auth when an authenticated user has no bearer token', () => {
    auth.accessToken = null
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const onLocalSymbolsChange = vi.fn()

    const { result } = renderHook(() => useAccountWatchlist({
      localSymbols: ['AAPL'],
      localLoaded: true,
      onLocalSymbolsChange,
    }))

    expect(result.current).toMatchObject({
      symbols: ['AAPL'],
      status: 'unavailable',
      canEdit: false,
      canRetry: true,
    })
    act(() => result.current.setSymbols(['MSFT']))
    expect(onLocalSymbolsChange).not.toHaveBeenCalled()
    act(() => result.current.retry())
    expect(auth.retry).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
