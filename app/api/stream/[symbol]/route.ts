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

import { getBroker } from '@/lib/ws/massive-broker'
import type { BrokerEvent } from '@/lib/ws/massive-broker'

const HEARTBEAT_INTERVAL_MS = 15_000

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params
  const fmpSymbol = decodeURIComponent(symbol).toUpperCase()

  const url = new URL(request.url)
  const timeframe = url.searchParams.get('timeframe') ?? '1s'

  if (timeframe !== '1s' && timeframe !== '10s') {
    return new Response('Invalid timeframe. Use 1s or 10s.', { status: 400 })
  }

  // Validate symbol format: stocks (1-5 alpha), futures (1-4 alpha + =F)
  if (!/^[A-Z]{1,5}(=[A-Z])?$/.test(fmpSymbol)) {
    return new Response('Invalid symbol', { status: 400 })
  }

  const broker = getBroker()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Track if stream is still open
      let closed = false

      const close = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        try { controller.close() } catch { /* already closed */ }
      }

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(':keepalive\n\n'))
        } catch {
          close()
        }
      }, HEARTBEAT_INTERVAL_MS)

      // Subscribe to broker
      const eventType = timeframe === '1s' ? 'candle_1s' : 'candle_10s'
      let unsubscribe = () => {}

      try {
        const unsub = await broker.subscribe(fmpSymbol, (event: BrokerEvent) => {
          if (closed) return

          try {
            if (event.type === 'auth_error') {
              // Forward auth failure to client
              const data = JSON.stringify({ error: event.error })
              controller.enqueue(encoder.encode(`event: auth_error\ndata: ${data}\n\n`))
              close()
            } else if (event.type === eventType) {
              // Committed candle
              const data = JSON.stringify(event.candle)
              controller.enqueue(encoder.encode(`event: candle\ndata: ${data}\n\n`))
            } else if (timeframe === '10s' && event.type === 'candle_1s') {
              // In-progress aggregate update (1s ticks within a 10s window)
              const data = JSON.stringify(event.candle)
              controller.enqueue(encoder.encode(`event: aggregate\ndata: ${data}\n\n`))
            }
          } catch {
            close()
          }
        })
        unsubscribe = unsub
      } catch (err) {
        console.error('[stream] Broker subscribe error:', err)
        close()
        return
      }

      // Clean up when the client disconnects
      request.signal.addEventListener('abort', close)
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
