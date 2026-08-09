import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FOREX_BOND_PANEL } from '@/lib/forex-bonds-panel'

const mocks = vi.hoisted(() => ({
  getForexBondsData: vi.fn(),
}))

vi.mock('@/app/actions/forex-bonds', () => ({
  getForexBondsData: mocks.getForexBondsData,
}))

import {
  getSlowSnapshotForexRecoveryStateForTests,
  recoverSlowSnapshotForexBonds,
  resetSlowSnapshotForexRecoveryForTests,
  SLOW_FOREX_RECOVERY_COOLDOWN_MS,
  SLOW_FOREX_RECOVERY_MAX_ABANDONED_LOADS,
  SLOW_FOREX_RECOVERY_TIMEOUT_MS,
} from '@/lib/slow-snapshot-forex-recovery'
import type { QuoteRequestOptions } from '@/lib/providers/types'

function forexPanel(price = 100) {
  return FOREX_BOND_PANEL.map(({ symbol, name }, index) => ({
    symbol,
    name,
    price: price + index,
    change: 0.01,
    changesPercentage: 0.8,
  }))
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function flushMicrotasks(turns = 4): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime('2026-08-08T14:00:00.000Z')
  resetSlowSnapshotForexRecoveryForTests()
})

afterEach(() => {
  resetSlowSnapshotForexRecoveryForTests()
  vi.useRealTimers()
})

describe('slow snapshot forex recovery lease', () => {
  it('coalesces concurrent recovery callers into one true-live provider request', async () => {
    const load = deferred<{ forexBonds: ReturnType<typeof forexPanel> }>()
    mocks.getForexBondsData.mockReturnValue(load.promise)

    const requests = Array.from(
      { length: 50 },
      () => recoverSlowSnapshotForexBonds(),
    )
    await flushMicrotasks()

    expect(mocks.getForexBondsData).toHaveBeenCalledTimes(1)
    const options = mocks.getForexBondsData.mock.calls[0][0] as QuoteRequestOptions
    expect(options).toMatchObject({ freshness: 'live' })
    expect(options.signal).toBeInstanceOf(AbortSignal)
    load.resolve({ forexBonds: forexPanel() })

    const results = await Promise.all(requests)
    expect(
      results.every(
        (snapshot) => snapshot?.forexBonds[0]?.symbol === 'EURUSD',
      ),
    ).toBe(true)
    expect(results[0]?.capturedAt).toBe('2026-08-08T14:00:00.000Z')
    expect(getSlowSnapshotForexRecoveryStateForTests().hasInFlight).toBe(false)
  })

  it('preserves the recovery source timestamp on a positive cache hit', async () => {
    mocks.getForexBondsData.mockResolvedValue({ forexBonds: forexPanel() })

    const first = await recoverSlowSnapshotForexBonds()
    expect(first).toEqual({
      forexBonds: forexPanel(),
      capturedAt: '2026-08-08T14:00:00.000Z',
    })

    await vi.advanceTimersByTimeAsync(SLOW_FOREX_RECOVERY_COOLDOWN_MS - 1)
    const hit = await recoverSlowSnapshotForexBonds()
    expect(hit?.capturedAt).toBe(first?.capturedAt)
    expect(hit?.forexBonds).toEqual(first?.forexBonds)
    expect(mocks.getForexBondsData).toHaveBeenCalledTimes(1)
  })

  it('uses a completion-based negative cooldown before retrying an empty result', async () => {
    const startedAt = Date.now()
    mocks.getForexBondsData
      .mockImplementationOnce(async () => {
        vi.setSystemTime(startedAt + 5_000)
        return { forexBonds: [] }
      })
      .mockResolvedValueOnce({ forexBonds: forexPanel(110) })

    await expect(recoverSlowSnapshotForexBonds()).resolves.toBeNull()
    expect(mocks.getForexBondsData).toHaveBeenCalledTimes(1)

    vi.setSystemTime(startedAt + 5_000 + SLOW_FOREX_RECOVERY_COOLDOWN_MS - 1)
    await expect(recoverSlowSnapshotForexBonds()).resolves.toBeNull()
    expect(mocks.getForexBondsData).toHaveBeenCalledTimes(1)

    vi.setSystemTime(startedAt + 5_000 + SLOW_FOREX_RECOVERY_COOLDOWN_MS)
    await expect(recoverSlowSnapshotForexBonds()).resolves.toMatchObject({
      forexBonds: forexPanel(110),
      capturedAt: new Date().toISOString(),
    })
    expect(mocks.getForexBondsData).toHaveBeenCalledTimes(2)
  })

  it('times out provider work, aborts it, and fences a late result from its retry', async () => {
    const expiredLoad = deferred<{ forexBonds: ReturnType<typeof forexPanel> }>()
    const replacementLoad = deferred<{ forexBonds: ReturnType<typeof forexPanel> }>()
    mocks.getForexBondsData
      .mockReturnValueOnce(expiredLoad.promise)
      .mockReturnValueOnce(replacementLoad.promise)

    const expiredRequest = recoverSlowSnapshotForexBonds()
    await flushMicrotasks()
    const expiredSignal = (
      mocks.getForexBondsData.mock.calls[0][0] as QuoteRequestOptions
    ).signal!
    await vi.advanceTimersByTimeAsync(SLOW_FOREX_RECOVERY_TIMEOUT_MS)

    await expect(expiredRequest).resolves.toBeNull()
    expect(expiredSignal.aborted).toBe(true)
    expect(getSlowSnapshotForexRecoveryStateForTests().hasInFlight).toBe(false)

    await vi.advanceTimersByTimeAsync(SLOW_FOREX_RECOVERY_COOLDOWN_MS)
    const replacementRequest = recoverSlowSnapshotForexBonds()
    await flushMicrotasks()
    expect(getSlowSnapshotForexRecoveryStateForTests().hasInFlight).toBe(true)

    expiredLoad.resolve({ forexBonds: forexPanel(90) })
    await flushMicrotasks()
    expect(getSlowSnapshotForexRecoveryStateForTests().hasInFlight).toBe(true)
    expect(getSlowSnapshotForexRecoveryStateForTests().recentValue).toBeNull()

    replacementLoad.resolve({ forexBonds: forexPanel(120) })
    await expect(replacementRequest).resolves.toMatchObject({
      forexBonds: forexPanel(120),
    })
    expect(
      getSlowSnapshotForexRecoveryStateForTests().recentValue?.forexBonds,
    ).toEqual(forexPanel(120))
    expect(mocks.getForexBondsData).toHaveBeenCalledTimes(2)
  })

  it('hard-caps timed-out physical loads and recovers capacity after one settles', async () => {
    const abandoned = Array.from(
      { length: SLOW_FOREX_RECOVERY_MAX_ABANDONED_LOADS },
      () => deferred<{ forexBonds: ReturnType<typeof forexPanel> }>(),
    )
    const recovered = deferred<{ forexBonds: ReturnType<typeof forexPanel> }>()
    mocks.getForexBondsData
      .mockReturnValueOnce(abandoned[0].promise)
      .mockReturnValueOnce(abandoned[1].promise)
      .mockReturnValueOnce(recovered.promise)

    for (const load of abandoned) {
      const request = recoverSlowSnapshotForexBonds()
      await flushMicrotasks()
      await vi.advanceTimersByTimeAsync(SLOW_FOREX_RECOVERY_TIMEOUT_MS)
      await expect(request).resolves.toBeNull()
      await vi.advanceTimersByTimeAsync(SLOW_FOREX_RECOVERY_COOLDOWN_MS)
      expect(load.promise).toBeDefined()
    }

    expect(getSlowSnapshotForexRecoveryStateForTests().abandonedCount).toBe(
      SLOW_FOREX_RECOVERY_MAX_ABANDONED_LOADS,
    )
    await expect(recoverSlowSnapshotForexBonds()).resolves.toBeNull()
    expect(mocks.getForexBondsData).toHaveBeenCalledTimes(2)

    abandoned[0].resolve({ forexBonds: forexPanel(90) })
    await flushMicrotasks()
    expect(getSlowSnapshotForexRecoveryStateForTests().abandonedCount).toBe(1)
    await vi.advanceTimersByTimeAsync(SLOW_FOREX_RECOVERY_COOLDOWN_MS)

    const retry = recoverSlowSnapshotForexBonds()
    await flushMicrotasks()
    expect(mocks.getForexBondsData).toHaveBeenCalledTimes(3)
    recovered.resolve({ forexBonds: forexPanel(120) })
    await expect(retry).resolves.toMatchObject({ forexBonds: forexPanel(120) })
  })

  it('treats partial, duplicate, empty, or malformed panels as negative results', async () => {
    const duplicate = forexPanel()
    duplicate[5] = { ...duplicate[0] }
    mocks.getForexBondsData.mockResolvedValue({
      forexBonds: forexPanel().slice(0, 1),
    })

    await expect(recoverSlowSnapshotForexBonds()).resolves.toBeNull()
    expect(getSlowSnapshotForexRecoveryStateForTests().recentValue).toBeNull()

    await vi.advanceTimersByTimeAsync(SLOW_FOREX_RECOVERY_COOLDOWN_MS)
    mocks.getForexBondsData.mockResolvedValueOnce({ forexBonds: duplicate })
    await expect(recoverSlowSnapshotForexBonds()).resolves.toBeNull()

    await vi.advanceTimersByTimeAsync(SLOW_FOREX_RECOVERY_COOLDOWN_MS)
    mocks.getForexBondsData.mockResolvedValueOnce({ forexBonds: [] })
    await expect(recoverSlowSnapshotForexBonds()).resolves.toBeNull()

    await vi.advanceTimersByTimeAsync(SLOW_FOREX_RECOVERY_COOLDOWN_MS)
    const zero = forexPanel()
    zero[0] = { ...zero[0], price: 0 }
    mocks.getForexBondsData.mockResolvedValueOnce({ forexBonds: zero })
    await expect(recoverSlowSnapshotForexBonds()).resolves.toBeNull()
  })

  it('detaches an aborted waiter without canceling the shared recovery', async () => {
    const load = deferred<{ forexBonds: ReturnType<typeof forexPanel> }>()
    mocks.getForexBondsData.mockReturnValue(load.promise)
    const firstController = new AbortController()
    const secondController = new AbortController()

    const first = recoverSlowSnapshotForexBonds(firstController.signal)
    const second = recoverSlowSnapshotForexBonds(secondController.signal)
    await flushMicrotasks()
    firstController.abort(new DOMException('left', 'AbortError'))

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(getSlowSnapshotForexRecoveryStateForTests().hasInFlight).toBe(true)
    load.resolve({ forexBonds: forexPanel() })
    await expect(second).resolves.toMatchObject({ forexBonds: forexPanel() })
    expect(mocks.getForexBondsData).toHaveBeenCalledTimes(1)
  })
})
