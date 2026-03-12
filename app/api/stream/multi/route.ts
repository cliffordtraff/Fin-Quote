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

import { getBroker } from '@/lib/ws/massive-broker'
import type { BrokerEvent } from '@/lib/ws/massive-broker'

const HEARTBEAT_INTERVAL_MS = 15_000
const MAX_SYMBOLS = 30
const SYMBOL_RE = /^[A-Z]{1,5}(=[A-Z])?$/

export async function GET(request: Request) {
  const url = new URL(request.url)

  // Parse symbols
  const symbolsParam = url.searchParams.get('symbols') ?? ''
  const symbols = symbolsParam
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)

  if (symbols.length === 0) {
    return new Response('Missing symbols parameter', { status: 400 })
  }

  if (symbols.length > MAX_SYMBOLS) {
    return new Response(`Too many symbols (max ${MAX_SYMBOLS})`, { status: 400 })
  }

  // Validate each symbol
  for (const sym of symbols) {
    if (!SYMBOL_RE.test(sym)) {
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

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const unsubscribers: (() => void)[] = []

      const close = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        for (const unsub of unsubscribers) {
          unsub()
        }
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      // Heartbeat
      const heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(':keepalive\n\n'))
        } catch {
          close()
        }
      }, HEARTBEAT_INTERVAL_MS)

      // Subscribe to each symbol
      const eventType = timeframe === '1s' ? 'candle_1s' : 'candle_10s'

      for (const symbol of symbols) {
        try {
          const unsub = await broker.subscribe(symbol, (event: BrokerEvent) => {
            if (closed) return

            try {
              if (event.type === 'auth_error') {
                const data = JSON.stringify({ symbol, error: event.error })
                controller.enqueue(
                  encoder.encode(`event: auth_error\ndata: ${data}\n\n`),
                )
                // Don't close entire stream for one symbol's auth error
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
          unsubscribers.push(unsub)
        } catch (err) {
          console.error(`[stream/multi] Broker subscribe error for ${symbol}:`, err)
        }
      }

      // Clean up when client disconnects
      request.signal.addEventListener('abort', close)
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
