/**
 * Client hook for real-time streaming via SSE.
 *
 * On mount / symbol / timeframe change:
 *   1. Fetches backfill candles from REST endpoint
 *   2. Opens EventSource to SSE stream
 *   3. Manages candle state with sliding window (~500 candles max)
 *   4. Computes change/changePct from previousClose
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export interface StreamCandle {
  time: number   // unix seconds
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface LiveStreamState {
  /** Committed (historical + completed) candles */
  candles: StreamCandle[]
  /** In-progress candle for the current period */
  liveCandle: StreamCandle | undefined
  /** Last known price */
  lastPrice: number | null
  /** Absolute price change from previous close */
  lastChange: number | null
  /** Percentage change from previous close */
  lastChangePct: number | null
  /** Previous trading session close price */
  previousClose: number | null
  /** Running high of day */
  dayHigh: number | null
  /** Running low of day */
  dayLow: number | null
  /** Whether EventSource is connected */
  connected: boolean
  /** Error message if connection failed */
  error: string | null
}

const MAX_CANDLES = 500
const BACKFILL_LOOKBACK: Record<string, number> = {
  '1s': 300,    // 5 minutes of 1s candles
  '10s': 1800,  // 30 minutes of 10s candles
}

export function useLiveStream(
  symbol: string | null,
  timeframe: '1s' | '10s',
): LiveStreamState {
  const [candles, setCandles] = useState<StreamCandle[]>([])
  const [liveCandle, setLiveCandle] = useState<StreamCandle | undefined>()
  const [previousClose, setPreviousClose] = useState<number | null>(null)
  const [dayHigh, setDayHigh] = useState<number | null>(null)
  const [dayLow, setDayLow] = useState<number | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const candlesRef = useRef<StreamCandle[]>([])

  // Keep candlesRef in sync
  candlesRef.current = candles

  // Derived values
  const lastPrice = liveCandle?.close ?? (candles.length > 0 ? candles[candles.length - 1].close : null)
  const lastChange = lastPrice !== null && previousClose !== null
    ? lastPrice - previousClose
    : null
  const lastChangePct = lastChange !== null && previousClose !== null && previousClose !== 0
    ? (lastChange / previousClose) * 100
    : null

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setConnected(false)
  }, [])

  useEffect(() => {
    if (!symbol) {
      cleanup()
      setCandles([])
      setLiveCandle(undefined)
      setPreviousClose(null)
      setDayHigh(null)
      setDayLow(null)
      setError(null)
      return
    }

    let cancelled = false

    async function init() {
      // Reset state for new symbol/timeframe
      setCandles([])
      setLiveCandle(undefined)
      setError(null)
      setConnected(false)
      setDayHigh(null)
      setDayLow(null)
      cleanup()

      // Step 1: Fetch backfill
      try {
        const lookback = BACKFILL_LOOKBACK[timeframe] ?? 300
        const res = await fetch(
          `/api/stream/backfill/${encodeURIComponent(symbol!)}?timeframe=${timeframe}&lookback=${lookback}`,
        )
        if (!res.ok) {
          throw new Error(`Backfill failed: ${res.status}`)
        }
        const data = await res.json()
        if (cancelled) return

        const backfillCandles: StreamCandle[] = data.candles ?? []
        setCandles(backfillCandles)
        candlesRef.current = backfillCandles
        setPreviousClose(data.previousClose || null)
        setDayHigh(data.dayHigh ?? null)
        setDayLow(data.dayLow ?? null)
      } catch (err) {
        if (cancelled) return
        console.error('[useLiveStream] Backfill error:', err)
        setError('Failed to load historical data')
        // Continue to try streaming even if backfill fails
      }

      // Step 2: Open EventSource
      if (cancelled) return

      const encodedSymbol = encodeURIComponent(symbol!)
      const es = new EventSource(
        `/api/stream/${encodedSymbol}?timeframe=${timeframe}`,
      )
      eventSourceRef.current = es

      es.onopen = () => {
        if (!cancelled) {
          setConnected(true)
          setError(null)
        }
      }

      // Committed candle events
      es.addEventListener('candle', (e: MessageEvent) => {
        if (cancelled) return
        try {
          const candle: StreamCandle = JSON.parse(e.data)

          setCandles(prev => {
            // Avoid duplicate candles (same time)
            const last = prev.length > 0 ? prev[prev.length - 1] : null
            if (last && last.time === candle.time) {
              // Update in place
              const updated = [...prev]
              updated[updated.length - 1] = candle
              return updated
            }

            const next = [...prev, candle]
            // Sliding window
            if (next.length > MAX_CANDLES) {
              return next.slice(next.length - MAX_CANDLES)
            }
            return next
          })

          // Clear live candle since a new period started
          setLiveCandle(undefined)

          // Update running HOD/LOD
          setDayHigh(prev => prev !== null ? Math.max(prev, candle.high) : candle.high)
          setDayLow(prev => prev !== null ? Math.min(prev, candle.low) : candle.low)
        } catch { /* ignore parse error */ }
      })

      // In-progress aggregate events
      es.addEventListener('aggregate', (e: MessageEvent) => {
        if (cancelled) return
        try {
          const candle: StreamCandle = JSON.parse(e.data)
          setLiveCandle(candle)

          // Update running HOD/LOD
          setDayHigh(prev => prev !== null ? Math.max(prev, candle.high) : candle.high)
          setDayLow(prev => prev !== null ? Math.min(prev, candle.low) : candle.low)
        } catch { /* ignore parse error */ }
      })

      // Auth error from broker (circuit breaker tripped)
      es.addEventListener('auth_error', (e: MessageEvent) => {
        if (cancelled) return
        try {
          const { error } = JSON.parse(e.data)
          setError(error ?? 'Authentication failed')
        } catch {
          setError('Authentication failed')
        }
        setConnected(false)
        // Close — no point auto-reconnecting on auth failure
        es.close()
        eventSourceRef.current = null
      })

      es.onerror = () => {
        if (cancelled) return
        setConnected(false)
        setError('Stream disconnected')
        // EventSource auto-reconnects by default
      }
    }

    init()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [symbol, timeframe, cleanup])

  return {
    candles,
    liveCandle,
    lastPrice,
    lastChange,
    lastChangePct,
    previousClose,
    dayHigh,
    dayLow,
    connected,
    error,
  }
}
