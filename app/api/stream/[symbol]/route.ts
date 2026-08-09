/**
 * SSE bridge: streams real-time candle data from the WebSocket broker.
 *
 * GET /api/stream/:symbol?timeframe=1s|10s
 *
 * Emits:
 *   event: candle   — completed candle (1s or 10s depending on timeframe)
 *   event: aggregate — live/in-progress candle for the current period
 *   :keepalive       — every 15s to prevent proxy/browser timeout
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { BrokerCapacityError, getBroker } from '@/lib/ws/massive-broker'
import type { BrokerEvent } from '@/lib/ws/massive-broker'
import { isValidMarketSymbol, normalizeMarketSymbol } from '@/lib/market-symbol'

const HEARTBEAT_INTERVAL_MS = 15_000
const CAPACITY_RETRY_AFTER_SECONDS = 5

function brokerCapacityResponse(error: BrokerCapacityError): Response {
  return Response.json(
    {
      error: error.message,
      code: error.code,
      limit: error.limit,
    },
    {
      status: 503,
      headers: {
        'Cache-Control': 'private, no-store',
        'Retry-After': String(CAPACITY_RETRY_AFTER_SECONDS),
      },
    },
  )
}

function clientClosedResponse(): Response {
  return new Response(null, {
    status: 499,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params
  const fmpSymbol = normalizeMarketSymbol(decodeURIComponent(symbol))

  const url = new URL(request.url)
  const timeframe = url.searchParams.get('timeframe') ?? '1s'

  if (timeframe !== '1s' && timeframe !== '10s') {
    return new Response('Invalid timeframe. Use 1s or 10s.', { status: 400 })
  }

  // Validate stocks, class shares (BRK.B), and futures (ES=F).
  if (!isValidMarketSymbol(fmpSymbol)) {
    return new Response('Invalid symbol', { status: 400 })
  }

  const broker = getBroker()
  const encoder = new TextEncoder()
  const eventType = timeframe === '1s' ? 'candle_1s' : 'candle_10s'
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let unsubscribe: (() => void) | null = null
  let released = false
  let closed = false

  const releaseSubscription = () => {
    if (released || !unsubscribe) return
    released = true
    const release = unsubscribe
    unsubscribe = null
    try { release() } catch { /* broker cleanup is best-effort */ }
  }

  const close = () => {
    if (closed) return
    closed = true
    request.signal.removeEventListener('abort', close)
    if (heartbeat) {
      clearInterval(heartbeat)
      heartbeat = null
    }
    releaseSubscription()
    try { controller?.close() } catch { /* already closed/cancelled */ }
  }

  // Register before the first await and explicitly handle an already-aborted
  // request. AbortSignal does not replay an abort event to late listeners.
  request.signal.addEventListener('abort', close, { once: true })
  if (request.signal.aborted) close()
  if (closed) return clientClosedResponse()

  try {
    const acquired = await broker.subscribe(fmpSymbol, (event: BrokerEvent) => {
      if (closed || !controller) return

      try {
        if (event.type === 'auth_error') {
          const data = JSON.stringify({ error: event.error })
          controller.enqueue(encoder.encode(`event: auth_error\ndata: ${data}\n\n`))
          close()
        } else if (event.type === eventType) {
          const data = JSON.stringify(event.candle)
          controller.enqueue(encoder.encode(`event: candle\ndata: ${data}\n\n`))
        } else if (timeframe === '10s' && event.type === 'candle_1s') {
          const data = JSON.stringify(event.candle)
          controller.enqueue(encoder.encode(`event: aggregate\ndata: ${data}\n\n`))
        }
      } catch {
        close()
      }
    })
    unsubscribe = acquired
    if (closed) releaseSubscription()
  } catch (error) {
    close()
    if (request.signal.aborted) return clientClosedResponse()
    if (error instanceof BrokerCapacityError) {
      return brokerCapacityResponse(error)
    }
    console.error('[stream] Broker subscribe error:', error)
    return Response.json(
      {
        error: 'Live market-data subscription failed.',
        code: 'BROKER_SUBSCRIPTION_FAILED',
      },
      {
        status: 502,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    )
  }

  if (closed) {
    return clientClosedResponse()
  }

  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController
      heartbeat = setInterval(() => {
        if (closed || !controller) return
        try {
          controller.enqueue(encoder.encode(':keepalive\n\n'))
        } catch {
          close()
        }
      }, HEARTBEAT_INTERVAL_MS)
    },
    cancel() {
      close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx
    },
  })
}
