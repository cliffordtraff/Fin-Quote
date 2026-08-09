import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsletterChartLibraryItem } from '@/lib/newsletter/chart-library'
import {
  buildNewsletterChartPostFingerprint,
  buildNewsletterChartPostPersistenceIdentity,
  NEWSLETTER_CHART_POST_DEADLINE_MS,
  NEWSLETTER_CHART_POST_LEASE_SECONDS,
  NEWSLETTER_CHART_POST_REPLAY_TTL_MS,
  newsletterChartPostAdmissionTestOnly,
  requireNewsletterChartIdempotencyKey,
  runNewsletterChartPost,
} from '@/lib/newsletter/chart-post-admission'

function item(id: string): NewsletterChartLibraryItem {
  return {
    id,
    ownerId: 'owner',
    sessionId: 'session',
    title: id,
    symbol: 'AAPL',
    chartSpec: {
      mode: 'price',
      symbol: 'AAPL',
      range: '1y',
      interval: 'D',
      chartType: 'candles',
    },
    chartImageUrl: `/newsletter-charts/${id}.png`,
    thumbnailUrl: `/newsletter-charts/${id}.png`,
    chartExportUrl: `https://charts.example/${id}`,
    capturedAt: '2026-08-09T00:00:00.000Z',
    rendererContract: 'test',
    sceneHash: `scene-${id}`,
    imageSha256: null,
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

function run(input: {
  scopeKey?: string
  idempotencyKey?: string
  fingerprint?: string
  callerSignal?: AbortSignal
  registerBackgroundTask?: (task: Promise<void>) => void
  operation: (signal: AbortSignal) => Promise<NewsletterChartLibraryItem>
}) {
  return runNewsletterChartPost({
    scopeKey: input.scopeKey ?? 'owner:one',
    idempotencyKey: input.idempotencyKey ?? 'chart-key-0001',
    fingerprint: input.fingerprint ?? 'fingerprint-one',
    callerSignal: input.callerSignal ?? new AbortController().signal,
    registerBackgroundTask: input.registerBackgroundTask,
    operation: input.operation,
  })
}

beforeEach(() => {
  newsletterChartPostAdmissionTestOnly.reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('newsletter chart POST admission', () => {
  it('requires the documented idempotency-key grammar', () => {
    expect(requireNewsletterChartIdempotencyKey('A2345678')).toBe('A2345678')
    expect(
      requireNewsletterChartIdempotencyKey(`a${'b'.repeat(127)}`),
    ).toHaveLength(128)
    for (const invalid of [
      null,
      'short',
      '_2345678',
      'A234567!',
      `a${'b'.repeat(128)}`,
    ]) {
      expect(() => requireNewsletterChartIdempotencyKey(invalid)).toThrow()
    }
  })

  it('fingerprints normalized content independent of object key order', () => {
    const common = {
      scopeKey: 'owner:one',
      renderOrigin: 'https://charts.example/arbitrary/path',
    }
    const first = buildNewsletterChartPostFingerprint({
      ...common,
      saveInput: {
        title: 'Apple',
        chartExportSpec: { symbol: 'AAPL', range: '1y', interval: 'D' },
      },
    })
    const second = buildNewsletterChartPostFingerprint({
      ...common,
      saveInput: {
        title: 'Apple',
        chartExportSpec: { interval: 'D', range: '1y', symbol: 'AAPL' },
      },
    })

    expect(second).toBe(first)
    expect(buildNewsletterChartPostFingerprint({
      ...common,
      scopeKey: 'owner:two',
      saveInput: {
        title: 'Apple',
        chartExportSpec: { symbol: 'AAPL', range: '1y', interval: 'D' },
      },
    })).not.toBe(first)
  })

  it('derives one opaque deterministic chart identity per owner and key', () => {
    const first = buildNewsletterChartPostPersistenceIdentity({
      ownerId: '10000000-0000-4000-8000-000000000001',
      idempotencyKey: 'stable-chart-key',
    })
    const replay = buildNewsletterChartPostPersistenceIdentity({
      ownerId: '10000000-0000-4000-8000-000000000001',
      idempotencyKey: 'stable-chart-key',
    })
    const otherOwner = buildNewsletterChartPostPersistenceIdentity({
      ownerId: '10000000-0000-4000-8000-000000000002',
      idempotencyKey: 'stable-chart-key',
    })

    expect(replay).toEqual(first)
    expect(first.chartId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(first.requestKeyHash).toMatch(/^[0-9a-f]{64}$/)
    expect(otherOwner).not.toEqual(first)
    expect(NEWSLETTER_CHART_POST_LEASE_SECONDS).toBe(180)
  })

  it('joins in-flight work, replays success, and conflicts on changed input', async () => {
    const pending = deferred<NewsletterChartLibraryItem>()
    const operation = vi.fn(() => pending.promise)

    const first = run({ operation })
    const joined = run({ operation })
    pending.resolve(item('shared'))

    await expect(first).resolves.toMatchObject({ replayed: false })
    await expect(joined).resolves.toMatchObject({ replayed: true })
    await expect(run({ operation })).resolves.toMatchObject({
      replayed: true,
      value: { id: 'shared' },
    })
    await expect(run({
      fingerprint: 'changed',
      operation,
    })).rejects.toMatchObject({ status: 409 })
    expect(operation).toHaveBeenCalledOnce()
  })

  it('returns owner and global capacity errors without queueing', async () => {
    const pending = Array.from({ length: 4 }, () =>
      deferred<NewsletterChartLibraryItem>(),
    )
    const operations = pending.map((job) => vi.fn(() => job.promise))
    const running = [
      run({ idempotencyKey: 'owner-a-key-01', operation: operations[0] }),
      run({ idempotencyKey: 'owner-a-key-02', operation: operations[1] }),
      run({
        scopeKey: 'owner:two',
        idempotencyKey: 'owner-b-key-01',
        operation: operations[2],
      }),
      run({
        scopeKey: 'owner:two',
        idempotencyKey: 'owner-b-key-02',
        operation: operations[3],
      }),
    ]

    await expect(run({
      idempotencyKey: 'owner-a-key-03',
      operation: vi.fn(async () => item('not-started')),
    })).rejects.toMatchObject({ status: 429, retryAfterSeconds: 10 })
    await expect(run({
      scopeKey: 'owner:three',
      idempotencyKey: 'owner-c-key-01',
      operation: vi.fn(async () => item('not-started')),
    })).rejects.toMatchObject({ status: 503, retryAfterSeconds: 10 })

    pending.forEach((job, index) => job.resolve(item(`settled-${index}`)))
    await Promise.all(running)
  })

  it('limits each scope to twelve new jobs per rolling ten minutes while replays remain free', async () => {
    const operation = vi.fn(async () => item('rate-result'))
    for (let index = 0; index < 12; index += 1) {
      await run({
        idempotencyKey: `rate-key-${String(index).padStart(3, '0')}`,
        fingerprint: `rate-fingerprint-${index}`,
        operation,
      })
    }

    await expect(run({
      idempotencyKey: 'rate-key-000',
      fingerprint: 'rate-fingerprint-0',
      operation,
    })).resolves.toMatchObject({ replayed: true })
    await expect(run({
      idempotencyKey: 'rate-key-012',
      fingerprint: 'rate-fingerprint-12',
      operation,
    })).rejects.toMatchObject({ status: 429, retryAfterSeconds: 10 })
    expect(operation).toHaveBeenCalledTimes(12)
  })

  it('removes failed keys so a retry can start a new operation', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('renderer unavailable'))
      .mockResolvedValueOnce(item('retry-success'))

    await expect(run({ operation })).rejects.toThrow('renderer unavailable')
    await expect(run({ operation })).resolves.toMatchObject({
      replayed: false,
      value: { id: 'retry-success' },
    })
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('cleans up admission state when a local operation throws synchronously', async () => {
    const error = new Error('synchronous renderer setup failed')
    const operation = vi.fn(() => { throw error })

    await expect(run({ operation })).rejects.toBe(error)
    expect(newsletterChartPostAdmissionTestOnly.snapshot()).toEqual({
      activeGlobal: 0,
      activeByScope: {},
      entryCount: 0,
    })

    await expect(run({
      operation: async () => item('retry-after-sync-throw'),
    })).resolves.toMatchObject({
      replayed: false,
      value: { id: 'retry-after-sync-throw' },
    })
  })

  it('keeps timed-out physical slots until settlement and caches a late success for replay', async () => {
    vi.useFakeTimers()
    const firstWaveJobs = Array.from({ length: 4 }, () =>
      deferred<NewsletterChartLibraryItem>(),
    )
    const backgroundTasks: Promise<void>[] = []
    const firstWave = firstWaveJobs.map((job, index) =>
      run({
        scopeKey: `owner:${Math.floor(index / 2)}`,
        idempotencyKey: `timeout-key-${index}`,
        fingerprint: `timeout-fingerprint-${index}`,
        registerBackgroundTask: (task) => backgroundTasks.push(task),
        operation: () => job.promise,
      }).catch((error: unknown) => error),
    )
    await Promise.resolve()

    await vi.advanceTimersByTimeAsync(NEWSLETTER_CHART_POST_DEADLINE_MS)
    const timedOut = await Promise.all(firstWave)
    expect(timedOut).toEqual([
      expect.objectContaining({ status: 504 }),
      expect.objectContaining({ status: 504 }),
      expect.objectContaining({ status: 504 }),
      expect.objectContaining({ status: 504 }),
    ])
    expect(newsletterChartPostAdmissionTestOnly.snapshot().activeGlobal).toBe(4)

    const secondWaveOperation = vi.fn(async () => item('second-wave'))
    await expect(run({
      scopeKey: 'owner:new',
      idempotencyKey: 'second-wave-key',
      fingerprint: 'second-wave-fingerprint',
      operation: secondWaveOperation,
    })).rejects.toMatchObject({ status: 503, retryAfterSeconds: 10 })
    expect(secondWaveOperation).not.toHaveBeenCalled()

    firstWaveJobs.forEach((job, index) => job.resolve(item(`late-${index}`)))
    await Promise.all(backgroundTasks)
    expect(newsletterChartPostAdmissionTestOnly.snapshot().activeGlobal).toBe(0)

    const retryOperation = vi.fn(async () => item('duplicate'))
    await expect(run({
      scopeKey: 'owner:0',
      idempotencyKey: 'timeout-key-0',
      fingerprint: 'timeout-fingerprint-0',
      operation: retryOperation,
    })).resolves.toMatchObject({
      replayed: true,
      value: { id: 'late-0' },
    })
    expect(retryOperation).not.toHaveBeenCalled()
  })

  it('detaches an aborted creator without cancelling the admission-owned operation or joined waiter', async () => {
    const controller = new AbortController()
    const reason = new Error('browser disconnected')
    const pending = deferred<NewsletterChartLibraryItem>()
    let operationSignal: AbortSignal | undefined
    const request = run({
      callerSignal: controller.signal,
      operation: (signal) => {
        operationSignal = signal
        return pending.promise
      },
    })
    await Promise.resolve()
    const joined = run({
      callerSignal: new AbortController().signal,
      operation: vi.fn(async () => item('duplicate')),
    })

    controller.abort(reason)
    await expect(request).rejects.toBe(reason)
    expect(operationSignal?.aborted).toBe(false)
    expect(newsletterChartPostAdmissionTestOnly.snapshot().activeGlobal).toBe(1)

    pending.resolve(item('late-after-abort'))
    await expect(joined).resolves.toMatchObject({
      replayed: true,
      value: { id: 'late-after-abort' },
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(newsletterChartPostAdmissionTestOnly.snapshot().activeGlobal).toBe(0)

    const retry = vi.fn(async () => item('after-abort'))
    await expect(run({ operation: retry })).resolves.toMatchObject({
      replayed: true,
      value: { id: 'late-after-abort' },
    })
    expect(retry).not.toHaveBeenCalled()
  })

  it('keeps only 64 successful replays and expires them after ten minutes', async () => {
    vi.useFakeTimers()
    const operation = vi.fn(async () => item('cached'))
    for (let index = 0; index < 65; index += 1) {
      await run({
        scopeKey: `owner:lru-${index}`,
        idempotencyKey: `lru-key-${String(index).padStart(3, '0')}`,
        fingerprint: `lru-fingerprint-${index}`,
        operation,
      })
    }

    const oldestRetry = vi.fn(async () => item('oldest-evicted'))
    await expect(run({
      scopeKey: 'owner:lru-0',
      idempotencyKey: 'lru-key-000',
      fingerprint: 'lru-fingerprint-0',
      operation: oldestRetry,
    })).resolves.toMatchObject({ replayed: false })
    expect(oldestRetry).toHaveBeenCalledOnce()

    await expect(run({
      scopeKey: 'owner:lru-64',
      idempotencyKey: 'lru-key-064',
      fingerprint: 'lru-fingerprint-64',
      operation,
    })).resolves.toMatchObject({ replayed: true })

    await vi.advanceTimersByTimeAsync(NEWSLETTER_CHART_POST_REPLAY_TTL_MS + 1)
    const expiredRetry = vi.fn(async () => item('expired'))
    await expect(run({
      scopeKey: 'owner:lru-64',
      idempotencyKey: 'lru-key-064',
      fingerprint: 'lru-fingerprint-64',
      operation: expiredRetry,
    })).resolves.toMatchObject({ replayed: false })
    expect(expiredRetry).toHaveBeenCalledOnce()
  })
})
