import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const wsMocks = vi.hoisted(() => ({ constructor: vi.fn() }))

vi.mock('ws', () => {
  class MockWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1

    readyState = MockWebSocket.CONNECTING
    on = vi.fn()
    send = vi.fn()
    close = vi.fn(() => {
      this.readyState = 3
    })

    constructor(url: string) {
      wsMocks.constructor(url)
    }
  }

  return { default: MockWebSocket }
})

import {
  BrokerCapacityError,
  MassiveBroker,
} from '@/lib/ws/massive-broker'

describe('MassiveBroker capacity admission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('MASSIVE_API_KEY', 'test-massive-key')
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('rejects a new ticker with a typed error once ticker capacity is active', async () => {
    const broker = new MassiveBroker({
      limits: {
        maxTickers: 1,
        maxListenersPerTicker: 10,
        maxTotalListeners: 10,
      },
      gracePeriodMs: 0,
    })
    const unsubscribe = await broker.subscribe('AAPL', vi.fn())

    await expect(broker.subscribe('MSFT', vi.fn())).rejects.toMatchObject({
      name: 'BrokerCapacityError',
      code: 'BROKER_TICKER_CAPACITY_EXCEEDED',
      limit: 1,
    })

    unsubscribe()
  })

  it('enforces per-ticker and total listener caps independently', async () => {
    const perTickerBroker = new MassiveBroker({
      limits: {
        maxTickers: 10,
        maxListenersPerTicker: 1,
        maxTotalListeners: 10,
      },
      gracePeriodMs: 0,
    })
    const unsubscribe = await perTickerBroker.subscribe('AAPL', vi.fn())

    await expect(perTickerBroker.subscribe('AAPL', vi.fn())).rejects.toMatchObject({
      code: 'BROKER_LISTENER_CAPACITY_EXCEEDED',
      limit: 1,
    })
    unsubscribe()

    const totalBroker = new MassiveBroker({
      limits: {
        maxTickers: 10,
        maxListenersPerTicker: 10,
        maxTotalListeners: 1,
      },
      gracePeriodMs: 0,
    })
    const releaseTotal = await totalBroker.subscribe('AAPL', vi.fn())

    await expect(totalBroker.subscribe('MSFT', vi.fn())).rejects.toEqual(
      expect.objectContaining<Partial<BrokerCapacityError>>({
        code: 'BROKER_TOTAL_LISTENER_CAPACITY_EXCEEDED',
        limit: 1,
      }),
    )
    releaseTotal()
  })

  it('reserves capacity across concurrent initialization and shares one ticker', async () => {
    const broker = new MassiveBroker({
      limits: {
        maxTickers: 1,
        maxListenersPerTicker: 2,
        maxTotalListeners: 2,
      },
      gracePeriodMs: 0,
    })

    const first = broker.subscribe('AAPL', vi.fn())
    const second = broker.subscribe('AAPL', vi.fn())
    const [unsubscribeFirst, unsubscribeSecond] = await Promise.all([first, second])

    expect(wsMocks.constructor).toHaveBeenCalledTimes(1)
    await expect(broker.subscribe('MSFT', vi.fn())).rejects.toMatchObject({
      code: 'BROKER_TICKER_CAPACITY_EXCEEDED',
    })

    unsubscribeFirst()
    unsubscribeFirst()
    unsubscribeSecond()

    const unsubscribeReplacement = await broker.subscribe('MSFT', vi.fn())
    unsubscribeReplacement()
  })
})
