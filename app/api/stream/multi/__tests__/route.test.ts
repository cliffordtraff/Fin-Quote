import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ subscribe: vi.fn() }))

vi.mock('@/lib/ws/massive-broker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ws/massive-broker')>()
  return {
    ...actual,
    getBroker: () => ({ subscribe: mocks.subscribe }),
  }
})

import { GET } from '@/app/api/stream/multi/route'
import { BrokerCapacityError } from '@/lib/ws/massive-broker'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function streamRequest(symbols: string, signal?: AbortSignal) {
  return new Request(
    `http://localhost/api/stream/multi?symbols=${symbols}&timeframe=1s`,
    { signal },
  )
}

describe('multi-symbol stream route lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not acquire subscriptions for an already-aborted request', async () => {
    const abortController = new AbortController()
    abortController.abort()

    const response = await GET(
      streamRequest('AAPL,MSFT', abortController.signal),
    )

    expect(response.status).toBe(499)
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('releases earlier and post-abort subscriptions exactly once', async () => {
    const unsubscribeAapl = vi.fn()
    const unsubscribeMsft = vi.fn()
    const pendingMsft = deferred<() => void>()
    const abortController = new AbortController()
    mocks.subscribe
      .mockResolvedValueOnce(unsubscribeAapl)
      .mockReturnValueOnce(pendingMsft.promise)

    const responsePromise = GET(
      streamRequest('AAPL,MSFT', abortController.signal),
    )
    await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalledTimes(2))

    abortController.abort()
    pendingMsft.resolve(unsubscribeMsft)

    const response = await responsePromise
    expect(response.status).toBe(499)
    expect(unsubscribeAapl).toHaveBeenCalledTimes(1)
    expect(unsubscribeMsft).toHaveBeenCalledTimes(1)
  })

  it('deduplicates symbols and cleans every acquired subscription on cancel', async () => {
    const unsubscribeAapl = vi.fn()
    const unsubscribeMsft = vi.fn()
    mocks.subscribe
      .mockResolvedValueOnce(unsubscribeAapl)
      .mockResolvedValueOnce(unsubscribeMsft)

    const response = await GET(streamRequest('AAPL,AAPL,MSFT,AAPL'))

    expect(response.status).toBe(200)
    expect(mocks.subscribe.mock.calls.map(([symbol]) => symbol)).toEqual([
      'AAPL',
      'MSFT',
    ])

    await response.body?.cancel()
    expect(unsubscribeAapl).toHaveBeenCalledTimes(1)
    expect(unsubscribeMsft).toHaveBeenCalledTimes(1)
  })

  it('releases partial acquisition before returning a typed capacity error', async () => {
    const unsubscribeAapl = vi.fn()
    mocks.subscribe
      .mockResolvedValueOnce(unsubscribeAapl)
      .mockRejectedValueOnce(new BrokerCapacityError(
        'BROKER_TICKER_CAPACITY_EXCEEDED',
        'Live market-data ticker capacity is temporarily exhausted.',
        200,
      ))

    const response = await GET(streamRequest('AAPL,MSFT'))

    expect(response.status).toBe(503)
    expect(unsubscribeAapl).toHaveBeenCalledTimes(1)
    expect(await response.json()).toMatchObject({
      code: 'BROKER_TICKER_CAPACITY_EXCEEDED',
      limit: 200,
    })
  })
})
