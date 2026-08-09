import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ subscribe: vi.fn() }))

vi.mock('@/lib/ws/massive-broker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ws/massive-broker')>()
  return {
    ...actual,
    getBroker: () => ({ subscribe: mocks.subscribe }),
  }
})

import { GET } from '@/app/api/stream/[symbol]/route'
import { BrokerCapacityError } from '@/lib/ws/massive-broker'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function streamRequest(signal?: AbortSignal) {
  return new Request('http://localhost/api/stream/AAPL?timeframe=1s', { signal })
}

describe('single-symbol stream route lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not acquire broker capacity for an already-aborted request', async () => {
    const abortController = new AbortController()
    abortController.abort()

    const response = await GET(streamRequest(abortController.signal), {
      params: Promise.resolve({ symbol: 'AAPL' }),
    })

    expect(response.status).toBe(499)
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('releases a subscription that resolves after the request aborts', async () => {
    const subscription = deferred<() => void>()
    const unsubscribe = vi.fn()
    const abortController = new AbortController()
    mocks.subscribe.mockReturnValue(subscription.promise)

    const responsePromise = GET(streamRequest(abortController.signal), {
      params: Promise.resolve({ symbol: 'AAPL' }),
    })
    await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalledTimes(1))

    abortController.abort()
    subscription.resolve(unsubscribe)

    const response = await responsePromise
    expect(response.status).toBe(499)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('uses ReadableStream cancellation for exact-once cleanup', async () => {
    const unsubscribe = vi.fn()
    const abortController = new AbortController()
    mocks.subscribe.mockResolvedValue(unsubscribe)

    const response = await GET(streamRequest(abortController.signal), {
      params: Promise.resolve({ symbol: 'AAPL' }),
    })

    expect(response.status).toBe(200)
    await response.body?.cancel()
    abortController.abort()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('returns a typed retryable response when broker capacity is exhausted', async () => {
    mocks.subscribe.mockRejectedValue(new BrokerCapacityError(
      'BROKER_TOTAL_LISTENER_CAPACITY_EXCEEDED',
      'Live market-data listener capacity is temporarily exhausted.',
      500,
    ))

    const response = await GET(streamRequest(), {
      params: Promise.resolve({ symbol: 'AAPL' }),
    })

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
    expect(await response.json()).toEqual({
      error: 'Live market-data listener capacity is temporarily exhausted.',
      code: 'BROKER_TOTAL_LISTENER_CAPACITY_EXCEEDED',
      limit: 500,
    })
  })
})
