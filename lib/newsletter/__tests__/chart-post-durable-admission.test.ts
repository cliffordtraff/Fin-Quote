import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsletterChartLibraryItem } from '@/lib/newsletter/chart-library'
import { NewsletterChartLibraryRequestConflictError } from '@/lib/newsletter/chart-library-errors'
import {
  NEWSLETTER_CHART_POST_BACKGROUND_ERROR_MAX_CHARS,
  buildNewsletterChartPostPersistenceIdentity,
  NEWSLETTER_CHART_POST_DEADLINE_MS,
  NEWSLETTER_CHART_POST_LEASE_SECONDS,
  NEWSLETTER_CHART_POST_RPC_DEADLINE_MS,
  newsletterChartPostAdmissionTestOnly,
  runNewsletterChartPost,
  type NewsletterChartPostDurableStore,
} from '@/lib/newsletter/chart-post-admission'

const OWNER_ID = '10000000-0000-4000-8000-000000000001'
const LEASE_TOKEN = '20000000-0000-4000-8000-000000000002'
const FINGERPRINT = 'a'.repeat(64)

function item(
  id = '30000000-0000-4000-8000-000000000003',
  symbol = 'AAPL',
): NewsletterChartLibraryItem {
  return {
    id,
    ownerId: OWNER_ID,
    sessionId: 'stable-session',
    title: 'Apple chart',
    symbol,
    chartSpec: {
      mode: 'price',
      symbol,
      range: '1y',
      interval: 'D',
      chartType: 'candles',
    },
    chartImageUrl: 'https://assets.example/chart.png',
    thumbnailUrl: 'https://assets.example/chart.png',
    chartExportUrl: 'https://charts.example/chart',
    capturedAt: '2026-08-09T00:00:00.000Z',
    rendererContract: 'test-v1',
    sceneHash: 'b'.repeat(64),
    imageSha256: 'c'.repeat(64),
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function baseStore(): NewsletterChartPostDurableStore {
  return {
    acquire: vi.fn(async () => ({
      disposition: 'acquired' as const,
      leaseToken: LEASE_TOKEN,
      resultReceipt: null,
      retryAfterSeconds: NEWSLETTER_CHART_POST_LEASE_SECONDS,
    })),
    complete: vi.fn(async ({ resultReceipt }) => ({
      disposition: 'completed' as const,
      resultReceipt,
    })),
    fail: vi.fn(async () => 'released' as const),
  }
}

function run(input: {
  store: NewsletterChartPostDurableStore
  ownerId?: string
  scopeKey?: string
  idempotencyKey?: string
  fingerprint?: string
  callerSignal?: AbortSignal
  operation: (signal: AbortSignal) => Promise<NewsletterChartLibraryItem>
  registerBackgroundTask?: (task: Promise<void>) => void
}) {
  const ownerId = input.ownerId ?? OWNER_ID
  return runNewsletterChartPost({
    scopeKey: input.scopeKey ?? `owner:${ownerId}`,
    idempotencyKey: input.idempotencyKey ?? 'durable-chart-key',
    fingerprint: input.fingerprint ?? FINGERPRINT,
    callerSignal: input.callerSignal ?? new AbortController().signal,
    durableOwnerId: ownerId,
    durableStore: input.store,
    registerBackgroundTask: input.registerBackgroundTask,
    operation: input.operation,
  })
}

beforeEach(() => {
  newsletterChartPostAdmissionTestOnly.reset()
})

afterEach(() => {
  newsletterChartPostAdmissionTestOnly.reset()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('durable newsletter chart POST admission', () => {
  it('derives a stable non-secret chart-row identity from owner and idempotency key', () => {
    const first = buildNewsletterChartPostPersistenceIdentity({
      ownerId: OWNER_ID,
      idempotencyKey: 'durable-chart-key',
    })
    expect(buildNewsletterChartPostPersistenceIdentity({
      ownerId: OWNER_ID,
      idempotencyKey: 'durable-chart-key',
    })).toEqual(first)
    expect(first.chartId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(first.requestKeyHash).toMatch(/^[0-9a-f]{64}$/)
    expect(first.requestKeyHash).not.toContain('durable-chart-key')
    expect(buildNewsletterChartPostPersistenceIdentity({
      ownerId: '10000000-0000-4000-8000-000000000009',
      idempotencyKey: 'durable-chart-key',
    })).not.toEqual(first)
  })

  it('persists the success receipt before resolving and replays it after an isolate restart', async () => {
    let receipt: NewsletterChartLibraryItem | null = null
    const store: NewsletterChartPostDurableStore = {
      acquire: vi.fn(async () => receipt
        ? {
          disposition: 'replay' as const,
          leaseToken: null,
          resultReceipt: receipt,
          retryAfterSeconds: 1,
        }
        : {
          disposition: 'acquired' as const,
          leaseToken: LEASE_TOKEN,
          resultReceipt: null,
          retryAfterSeconds: 90,
        }),
      complete: vi.fn(async ({ resultReceipt }) => {
        receipt = resultReceipt
        return {
          disposition: 'completed' as const,
          resultReceipt,
        }
      }),
      fail: vi.fn(async () => 'released' as const),
    }
    const firstOperation = vi.fn(async () => item())

    await expect(run({ store, operation: firstOperation })).resolves.toMatchObject({
      replayed: false,
      value: { id: item().id },
    })
    expect(store.complete).toHaveBeenCalledOnce()
    expect(store.acquire).toHaveBeenCalledWith(expect.objectContaining({
      leaseSeconds: 180,
      signal: expect.any(AbortSignal),
    }))

    // A new isolate has no process-local success cache.
    newsletterChartPostAdmissionTestOnly.reset()
    const duplicateOperation = vi.fn(async () => item())
    await expect(run({ store, operation: duplicateOperation })).resolves.toMatchObject({
      replayed: true,
      value: { id: item().id },
    })
    expect(duplicateOperation).not.toHaveBeenCalled()
  })

  it('replays a valid segmented capture symbol longer than fifteen characters', async () => {
    const symbol = 'LONG.SYMBOL-CLASS1'
    let receipt: NewsletterChartLibraryItem | null = null
    const store = baseStore()
    vi.mocked(store.acquire).mockImplementation(async () => receipt
      ? {
        disposition: 'replay',
        leaseToken: null,
        resultReceipt: receipt,
        retryAfterSeconds: 1,
      }
      : {
        disposition: 'acquired',
        leaseToken: LEASE_TOKEN,
        resultReceipt: null,
        retryAfterSeconds: NEWSLETTER_CHART_POST_LEASE_SECONDS,
      })
    vi.mocked(store.complete).mockImplementation(async ({ resultReceipt }) => {
      receipt = resultReceipt
      return { disposition: 'completed', resultReceipt }
    })

    await expect(run({
      store,
      operation: async () => item(undefined, symbol),
    })).resolves.toMatchObject({ value: { symbol } })
    newsletterChartPostAdmissionTestOnly.reset()
    const duplicate = vi.fn(async () => item())
    await expect(run({ store, operation: duplicate })).resolves.toMatchObject({
      replayed: true,
      value: { symbol },
    })
    expect(duplicate).not.toHaveBeenCalled()
  })

  it('replays a materialized near-request-limit chart scene under the 512 KiB receipt cap', async () => {
    const chartExportSpec = {
      symbol: 'AAPL',
      range: '1y',
      interval: 'D',
      chartType: 'candles',
      customPayload: '',
    }
    const requestEnvelope = { chartExportSpec }
    const baseRequestBytes = Buffer.byteLength(
      JSON.stringify(requestEnvelope),
      'utf8',
    )
    chartExportSpec.customPayload = 'x'.repeat(
      (256 * 1_024) - baseRequestBytes - 16,
    )
    expect(Buffer.byteLength(JSON.stringify(requestEnvelope), 'utf8'))
      .toBeLessThanOrEqual(256 * 1_024)

    const receipt = item()
    receipt.chartSpec = {
      ...receipt.chartSpec,
      chartExportSpec,
    }
    expect(Buffer.byteLength(JSON.stringify(receipt.chartSpec), 'utf8'))
      .toBeGreaterThan(256 * 1_024)
    expect(Buffer.byteLength(JSON.stringify(receipt), 'utf8'))
      .toBeLessThanOrEqual(512 * 1_024)
    const store = baseStore()
    vi.mocked(store.acquire).mockResolvedValue({
      disposition: 'replay',
      leaseToken: null,
      resultReceipt: receipt,
      retryAfterSeconds: 1,
    })
    const duplicate = vi.fn(async () => item())

    await expect(run({ store, operation: duplicate })).resolves.toMatchObject({
      replayed: true,
      value: { id: receipt.id },
    })
    expect(duplicate).not.toHaveBeenCalled()
  })

  it('does not return the chart until the durable completion receipt settles', async () => {
    const completion = deferred<{
      disposition: 'completed'
      resultReceipt: NewsletterChartLibraryItem
    }>()
    const store = baseStore()
    vi.mocked(store.complete).mockImplementation(() => completion.promise)
    let settled = false
    const request = run({ store, operation: async () => item() })
      .finally(() => { settled = true })

    await vi.waitFor(() => expect(store.complete).toHaveBeenCalledOnce())
    expect(settled).toBe(false)

    completion.resolve({ disposition: 'completed', resultReceipt: item() })
    await expect(request).resolves.toMatchObject({ replayed: false })
  })

  it('registers physical work and lets the creator detach without aborting a joined waiter', async () => {
    const store = baseStore()
    const controller = new AbortController()
    const reason = new Error('creator disconnected')
    const render = deferred<NewsletterChartLibraryItem>()
    const registered: Promise<void>[] = []
    const operationSignal: { current?: AbortSignal } = {}
    const operation = vi.fn((signal: AbortSignal) => {
      operationSignal.current = signal
      return render.promise
    })
    const creator = run({
      store,
      callerSignal: controller.signal,
      operation,
      registerBackgroundTask: (task) => registered.push(task),
    })
    const joined = run({ store, operation })

    expect(registered).toHaveLength(1)
    controller.abort(reason)
    await expect(creator).rejects.toBe(reason)
    expect(operationSignal.current?.aborted).toBe(false)

    render.resolve(item())
    await expect(joined).resolves.toMatchObject({
      replayed: true,
      value: { id: item().id },
    })
    await expect(registered[0]).resolves.toBeUndefined()
    expect(operation).toHaveBeenCalledOnce()
    expect(store.complete).toHaveBeenCalledOnce()
    expect(store.fail).not.toHaveBeenCalled()
  })

  it('persists an abort-ignoring late success after the logical 55-second timeout', async () => {
    vi.useFakeTimers()
    let receipt: NewsletterChartLibraryItem | null = null
    const store = baseStore()
    vi.mocked(store.acquire).mockImplementation(async () => receipt
      ? {
        disposition: 'replay',
        leaseToken: null,
        resultReceipt: receipt,
        retryAfterSeconds: 1,
      }
      : {
        disposition: 'acquired',
        leaseToken: LEASE_TOKEN,
        resultReceipt: null,
        retryAfterSeconds: NEWSLETTER_CHART_POST_LEASE_SECONDS,
      })
    vi.mocked(store.complete).mockImplementation(async (input) => {
      expect(input.signal.aborted).toBe(false)
      receipt = input.resultReceipt
      return { disposition: 'completed', resultReceipt: receipt }
    })
    const render = deferred<NewsletterChartLibraryItem>()
    const registered: Promise<void>[] = []
    const operationSignal: { current?: AbortSignal } = {}
    const request = run({
      store,
      operation: (signal) => {
        operationSignal.current = signal
        return render.promise
      },
      registerBackgroundTask: (task) => registered.push(task),
    })
    const requestOutcome = request.catch((error: unknown) => error)

    await vi.advanceTimersByTimeAsync(NEWSLETTER_CHART_POST_DEADLINE_MS)
    await expect(requestOutcome).resolves.toMatchObject({ status: 504 })
    expect(operationSignal.current?.aborted).toBe(true)

    render.resolve(item())
    await expect(registered[0]).resolves.toBeUndefined()
    expect(store.complete).toHaveBeenCalledOnce()
    expect(store.fail).not.toHaveBeenCalled()

    newsletterChartPostAdmissionTestOnly.reset()
    const duplicate = vi.fn(async () => item())
    await expect(run({ store, operation: duplicate })).resolves.toMatchObject({
      replayed: true,
      value: { id: item().id },
    })
    expect(duplicate).not.toHaveBeenCalled()
  })

  it('bounds an abort-ignoring acquire RPC with the persistence deadline', async () => {
    vi.useFakeTimers()
    const hangingAcquire = deferred<never>()
    const store = baseStore()
    const acquireSignal: { current?: AbortSignal } = {}
    vi.mocked(store.acquire).mockImplementation((input) => {
      acquireSignal.current = input.signal
      return hangingAcquire.promise
    })
    const operation = vi.fn(async () => item())
    const registered: Promise<void>[] = []
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const request = run({
      store,
      operation,
      registerBackgroundTask: (task) => registered.push(task),
    })
    const requestOutcome = request.catch((error: unknown) => error)

    await vi.advanceTimersByTimeAsync(NEWSLETTER_CHART_POST_RPC_DEADLINE_MS)

    await expect(requestOutcome).resolves.toMatchObject({ status: 503 })
    expect(acquireSignal.current?.aborted).toBe(true)
    await expect(registered[0]).resolves.toBeUndefined()
    expect(operation).not.toHaveBeenCalled()
    expect(newsletterChartPostAdmissionTestOnly.snapshot()).toEqual({
      activeGlobal: 0,
      activeByScope: {},
      entryCount: 0,
    })
    errorLog.mockRestore()
  })

  it('caps simultaneous pre-lease RPC work during a database outage', async () => {
    vi.useFakeTimers()
    const hangingAcquire = deferred<never>()
    const store = baseStore()
    vi.mocked(store.acquire).mockImplementation(() => hangingAcquire.promise)
    const registered: Promise<void>[] = []
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const owners = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002',
    ]
    const running = owners.map((ownerId, index) => run({
      store,
      ownerId,
      idempotencyKey: `outage-key-${index}`,
      fingerprint: String(index).repeat(64),
      operation: vi.fn(async () => item()),
      registerBackgroundTask: (task) => registered.push(task),
    }).catch((error: unknown) => error))

    expect(store.acquire).toHaveBeenCalledTimes(4)
    expect(newsletterChartPostAdmissionTestOnly.snapshot().activeGlobal).toBe(4)
    await expect(run({
      store,
      ownerId: '10000000-0000-4000-8000-000000000003',
      idempotencyKey: 'outage-key-overflow',
      fingerprint: 'f'.repeat(64),
      operation: vi.fn(async () => item()),
    })).rejects.toMatchObject({ status: 503 })
    expect(store.acquire).toHaveBeenCalledTimes(4)

    await vi.advanceTimersByTimeAsync(NEWSLETTER_CHART_POST_RPC_DEADLINE_MS)
    await expect(Promise.all(running)).resolves.toEqual([
      expect.objectContaining({ status: 503 }),
      expect.objectContaining({ status: 503 }),
      expect.objectContaining({ status: 503 }),
      expect.objectContaining({ status: 503 }),
    ])
    await Promise.all(registered)
    expect(newsletterChartPostAdmissionTestOnly.snapshot()).toEqual({
      activeGlobal: 0,
      activeByScope: {},
      entryCount: 0,
    })
    errorLog.mockRestore()
  })

  it('bounds completion with an independent persistence deadline', async () => {
    vi.useFakeTimers()
    const hangingCompletion = deferred<never>()
    const store = baseStore()
    const completionSignal: { current?: AbortSignal } = {}
    vi.mocked(store.complete).mockImplementation((input) => {
      completionSignal.current = input.signal
      return hangingCompletion.promise
    })
    const registered: Promise<void>[] = []
    const request = run({
      store,
      operation: async () => item(),
      registerBackgroundTask: (task) => registered.push(task),
    })
    const requestOutcome = request.catch((error: unknown) => error)
    for (let index = 0; index < 8; index += 1) await Promise.resolve()
    expect(store.complete).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(NEWSLETTER_CHART_POST_RPC_DEADLINE_MS)
    await expect(requestOutcome).resolves.toMatchObject({ status: 503 })
    expect(completionSignal.current?.aborted).toBe(true)
    expect(store.fail).not.toHaveBeenCalled()
    await expect(registered[0]).resolves.toBeUndefined()
  })

  it('bounds lease release independently while preserving the renderer error', async () => {
    vi.useFakeTimers()
    const hangingRelease = deferred<never>()
    const store = baseStore()
    const releaseSignal: { current?: AbortSignal } = {}
    vi.mocked(store.fail).mockImplementation((input) => {
      releaseSignal.current = input.signal
      return hangingRelease.promise
    })
    const rendererError = new Error('renderer failed before upload')
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const request = run({
      store,
      operation: async () => { throw rendererError },
    })
    const requestOutcome = request.catch((error: unknown) => error)
    for (let index = 0; index < 8; index += 1) await Promise.resolve()
    expect(store.fail).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(NEWSLETTER_CHART_POST_RPC_DEADLINE_MS)
    await expect(requestOutcome).resolves.toBe(rendererError)
    expect(releaseSignal.current?.aborted).toBe(true)
    expect(store.complete).not.toHaveBeenCalled()
    errorLog.mockRestore()
  })

  it('releases only renderer failures and leaves ambiguous completion fenced', async () => {
    const rendererStore = baseStore()
    const rendererError = new Error('renderer failed')
    await expect(run({
      store: rendererStore,
      operation: async () => { throw rendererError },
    })).rejects.toBe(rendererError)
    expect(rendererStore.fail).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: OWNER_ID,
      idempotencyKey: 'durable-chart-key',
      fingerprint: FINGERPRINT,
      leaseToken: LEASE_TOKEN,
      signal: expect.any(AbortSignal),
    }))

    newsletterChartPostAdmissionTestOnly.reset()
    const ambiguousStore = baseStore()
    vi.mocked(ambiguousStore.complete).mockRejectedValue(
      new Error('database response lost'),
    )
    await expect(run({
      store: ambiguousStore,
      operation: async () => item(),
    })).rejects.toThrow('database response lost')
    expect(ambiguousStore.fail).not.toHaveBeenCalled()
  })

  it('maps a durable chart-row identity conflict to the public 409 contract', async () => {
    const store = baseStore()

    await expect(run({
      store,
      operation: async () => {
        throw new NewsletterChartLibraryRequestConflictError()
      },
    })).rejects.toMatchObject({ status: 409 })
    expect(store.fail).toHaveBeenCalledOnce()
  })

  it('logs a bounded diagnostic when the last caller detaches before late failure', async () => {
    const store = baseStore()
    const controller = new AbortController()
    const render = deferred<NewsletterChartLibraryItem>()
    const tasks: Promise<void>[] = []
    const operation = vi.fn(() => render.promise)
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const request = run({
      store,
      callerSignal: controller.signal,
      operation,
      registerBackgroundTask: (task) => tasks.push(task),
    })
    await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce())

    const detachReason = new Error('browser disconnected')
    controller.abort(detachReason)
    await expect(request).rejects.toBe(detachReason)
    render.reject(new Error(`late renderer failure ${'x'.repeat(4_096)}`))
    await expect(tasks[0]).resolves.toBeUndefined()

    expect(log).toHaveBeenCalledWith(
      '[newsletter-chart-admission] Detached background save failed:',
      expect.any(String),
    )
    expect(String(log.mock.calls[0]?.[1]).length).toBeLessThanOrEqual(
      NEWSLETTER_CHART_POST_BACKGROUND_ERROR_MAX_CHARS,
    )
  })

  it('rejects malformed durable receipts before returning a replay', async () => {
    const invalidReceipts: unknown[] = [
      { ...item(), id: 'not-a-uuid' },
      { ...item(), title: '' },
      { ...item(), chartImageUrl: 'javascript:alert(1)' },
      { ...item(), capturedAt: 'not-a-date' },
      { ...item(), sceneHash: 'short' },
      { ...item(), chartSpec: { ...item().chartSpec, symbol: 'MSFT' } },
      { ...item(), chartSpec: { ...item().chartSpec, range: 'forever' } },
    ]

    for (const resultReceipt of invalidReceipts) {
      newsletterChartPostAdmissionTestOnly.reset()
      const store = baseStore()
      vi.mocked(store.acquire).mockResolvedValue({
        disposition: 'replay',
        leaseToken: null,
        resultReceipt,
        retryAfterSeconds: 1,
      })
      const operation = vi.fn(async () => item())

      await expect(run({ store, operation })).rejects.toMatchObject({
        status: 503,
      })
      expect(operation).not.toHaveBeenCalled()
    }
  })

  it.each([
    ['conflict', 409],
    ['owner_capacity', 429],
    ['rate_limited', 429],
    ['global_capacity', 503],
    ['in_progress', 503],
  ] as const)('maps durable %s without starting renderer work', async (
    disposition,
    status,
  ) => {
    const store = baseStore()
    vi.mocked(store.acquire).mockResolvedValue({
      disposition,
      leaseToken: null,
      resultReceipt: null,
      retryAfterSeconds: 10,
    })
    const operation = vi.fn(async () => item())

    await expect(run({ store, operation })).rejects.toMatchObject({ status })
    expect(operation).not.toHaveBeenCalled()
    expect(store.complete).not.toHaveBeenCalled()
  })
})
