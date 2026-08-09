/**
 * Multiplexed SSE bridge: streams real-time candle data for N symbols
 * over a single connection.
 *
 * GET /api/stream/multi?symbols=AAPL,GOOGL,NVDA,TSLA&timeframe=1s|10s
 *
 * Emits:
 *   event: candle    — completed candle, payload includes "symbol" field
 *   event: aggregate — in-progress candle, payload includes "symbol" field
 *   event: auth_error — auth failure, payload includes "symbol" field
 *   :keepalive        — every 15s to prevent proxy/browser timeout
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { BrokerCapacityError, getBroker } from '@/lib/ws/massive-broker'
import type { BrokerEvent } from '@/lib/ws/massive-broker'
import { isValidMarketSymbol, normalizeMarketSymbol } from '@/lib/market-symbol'

const HEARTBEAT_INTERVAL_MS = 15_000
const MAX_SYMBOLS = 30
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

export async function GET(request: Request) {
  const url = new URL(request.url)

  // Parse symbols
  const symbolsParam = url.searchParams.get('symbols') ?? ''
  const symbols = Array.from(new Set(
    symbolsParam
      .split(',')
      .map(normalizeMarketSymbol)
      .filter(Boolean),
  ))

  if (symbols.length === 0) {
    return new Response('Missing symbols parameter', { status: 400 })
  }

  if (symbols.length > MAX_SYMBOLS) {
    return new Response(`Too many symbols (max ${MAX_SYMBOLS})`, { status: 400 })
  }

  // Validate each symbol
  for (const sym of symbols) {
    if (!isValidMarketSymbol(sym)) {
      return new Response(`Invalid symbol: ${sym}`, { status: 400 })
    }
  }

  // Parse timeframe
  const timeframe = url.searchParams.get('timeframe') ?? '1s'
  if (timeframe !== '1s' && timeframe !== '10s') {
    return new Response('Invalid timeframe. Use 1s or 10s.', { status: 400 })
  }

  const broker = getBroker()
  const encoder = new TextEncoder()
  const eventType = timeframe === '1s' ? 'candle_1s' : 'candle_10s'
  const unsubscribers: Array<() => void> = []
  const failedSymbols: string[] = []
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let closed = false

  const releaseAll = () => {
    while (unsubscribers.length > 0) {
      const unsubscribe = unsubscribers.pop()!
      try { unsubscribe() } catch { /* broker cleanup is best-effort */ }
    }
  }

  const close = () => {
    if (closed) return
    closed = true
    request.signal.removeEventListener('abort', close)
    if (heartbeat) {
      clearInterval(heartbeat)
      heartbeat = null
    }
    releaseAll()
    try { controller?.close() } catch { /* already closed/cancelled */ }
  }

  request.signal.addEventListener('abort', close, { once: true })
  if (request.signal.aborted) close()

  for (const symbol of symbols) {
    if (closed) break

    try {
      let released = false
      const acquired = await broker.subscribe(symbol, (event: BrokerEvent) => {
        if (closed || !controller) return

        try {
          if (event.type === 'auth_error') {
            const data = JSON.stringify({ symbol, error: event.error })
            controller.enqueue(
              encoder.encode(`event: auth_error\ndata: ${data}\n\n`),
            )
          } else if (event.type === eventType) {
            const data = JSON.stringify({ symbol, ...event.candle })
            controller.enqueue(
              encoder.encode(`event: candle\ndata: ${data}\n\n`),
            )
          } else if (timeframe === '10s' && event.type === 'candle_1s') {
            const data = JSON.stringify({ symbol, ...event.candle })
            controller.enqueue(
              encoder.encode(`event: aggregate\ndata: ${data}\n\n`),
            )
          }
        } catch {
          close()
        }
      })
      const unsubscribe = () => {
        if (released) return
        released = true
        acquired()
      }

      if (closed) {
        unsubscribe()
        break
      }
      unsubscribers.push(unsubscribe)
    } catch (error) {
      if (closed || request.signal.aborted) {
        close()
        return clientClosedResponse()
      }
      if (error instanceof BrokerCapacityError) {
        close()
        return brokerCapacityResponse(error)
      }
      failedSymbols.push(symbol)
      console.error(`[stream/multi] Broker subscribe error for ${symbol}:`, error)
    }
  }

  if (closed) {
    return clientClosedResponse()
  }

  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController

      for (const symbol of failedSymbols) {
        const data = JSON.stringify({
          symbol,
          error: 'Live market-data subscription failed.',
          code: 'BROKER_SUBSCRIPTION_FAILED',
        })
        controller.enqueue(
          encoder.encode(`event: subscription_error\ndata: ${data}\n\n`),
        )
      }

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
      'X-Accel-Buffering': 'no',
    },
  })
}
