import {
  parsePulseLiveStreamBackfillPayload,
  type PulseLiveStreamBackfillPayload,
} from '@/lib/pulse-market-data-contract'

export type LiveStreamBackfillPayload = PulseLiveStreamBackfillPayload

export interface LiveStreamBackfillIssue {
  code: string
  message: string
  status: number | null
}

export class LiveStreamBackfillError extends Error {
  readonly name = 'LiveStreamBackfillError'

  constructor(readonly issue: LiveStreamBackfillIssue) {
    super(issue.message)
  }
}

async function errorPayload(response: Response): Promise<{
  error?: unknown
  code?: unknown
}> {
  try {
    return await response.json() as { error?: unknown; code?: unknown }
  } catch {
    return {}
  }
}

function boundedMessage(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maximumLength) : null
}

function waitForSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason)

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

export async function fetchLiveStreamBackfill(
  symbol: string,
  timeframe: '1s' | '10s',
  lookback: number,
  signal?: AbortSignal,
): Promise<LiveStreamBackfillPayload> {
  signal?.throwIfAborted()
  const response = await waitForSignal(
    fetch(
      `/api/stream/backfill/${encodeURIComponent(symbol)}?timeframe=${timeframe}&lookback=${lookback}`,
      { signal },
    ),
    signal,
  )
  signal?.throwIfAborted()

  if (!response.ok) {
    const payload = await waitForSignal(errorPayload(response), signal)
    signal?.throwIfAborted()
    throw new LiveStreamBackfillError({
      code:
        boundedMessage(payload.code, 80) ?? `BACKFILL_HTTP_${response.status}`,
      message:
        boundedMessage(payload.error, 240) ??
        'Historical backfill is unavailable; live streaming will continue.',
      status: response.status,
    })
  }

  const rawPayload: unknown = await waitForSignal(response.json(), signal)
  signal?.throwIfAborted()
  const parsed = parsePulseLiveStreamBackfillPayload(rawPayload, symbol)
  if (!parsed) {
    throw new LiveStreamBackfillError({
      code: 'BACKFILL_MALFORMED_RESPONSE',
      message: 'Historical backfill returned malformed market data.',
      status: response.status,
    })
  }
  return parsed
}

export function toLiveStreamBackfillIssue(error: unknown): LiveStreamBackfillIssue {
  if (error instanceof LiveStreamBackfillError) return error.issue

  return {
    code: 'BACKFILL_REQUEST_FAILED',
    message: 'Historical backfill is unavailable; live streaming will continue.',
    status: null,
  }
}
