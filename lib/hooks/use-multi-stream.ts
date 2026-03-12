/**
 * Client hook for multiplexed real-time streaming via a single SSE connection.
 *
 * Opens one EventSource to /api/stream/multi?symbols=... and routes incoming
 * events by symbol to per-symbol state. Fetches backfill for each symbol
 * in parallel on mount.
 *
 * Returns Record<string, LiveStreamState> keyed by symbol.
 */

'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { StreamCandle, LiveStreamState } from './use-live-stream'

const MAX_CANDLES = 500
const BACKFILL_LOOKBACK: Record<string, number> = {
  '1s': 300,
  '10s': 1800,
}

/**
 * Stable key for a sorted set of symbols — avoids reconnects when
 * the array reference changes but the contents are the same.
 */
function symbolsKey(symbols: string[]): string {
  return [...symbols].sort().join(',')
}

export function useMultiStream(
  symbols: string[],
  timeframe: '1s' | '10s',
): Record<string, LiveStreamState> {
  // Memoize the sorted key to detect real changes
  const key = useMemo(() => symbolsKey(symbols), [symbols])

  // Per-symbol state stored in a single object to batch updates
  const [stateMap, setStateMap] = useState<
    Record<string, {
      candles: StreamCandle[]
      liveCandle: StreamCandle | undefined
      previousClose: number | null
      dayHigh: number | null
      dayLow: number | null
      connected: boolean
      error: string | null
    }>
  >({})

  const eventSourceRef = useRef<EventSource | null>(null)

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (symbols.length === 0) {
      cleanup()
      setStateMap({})
      return
    }

    let cancelled = false

    async function init() {
      // Reset state
      cleanup()
      const initial: typeof stateMap = {}
      for (const sym of symbols) {
        initial[sym] = {
          candles: [],
          liveCandle: undefined,
          previousClose: null,
          dayHigh: null,
          dayLow: null,
          connected: false,
          error: null,
        }
      }
      setStateMap(initial)

      // Step 1: Fetch backfill for all symbols in parallel
      const lookback = BACKFILL_LOOKBACK[timeframe] ?? 300
      const backfillResults = await Promise.allSettled(
        symbols.map(async (sym) => {
          const res = await fetch(
            `/api/stream/backfill/${encodeURIComponent(sym)}?timeframe=${timeframe}&lookback=${lookback}`,
          )
          if (!res.ok) throw new Error(`Backfill failed: ${res.status}`)
          return { symbol: sym, data: await res.json() }
        }),
      )

      if (cancelled) return

      // Apply backfill results
      setStateMap((prev) => {
        const next = { ...prev }
        for (const result of backfillResults) {
          if (result.status === 'fulfilled') {
            const { symbol: sym, data } = result.value
            next[sym] = {
              ...next[sym],
              candles: data.candles ?? [],
              previousClose: data.previousClose || null,
              dayHigh: data.dayHigh ?? null,
              dayLow: data.dayLow ?? null,
            }
          } else {
            // Backfill failed for this symbol — continue anyway
            console.error('[useMultiStream] Backfill error:', result.reason)
          }
        }
        return next
      })

      if (cancelled) return

      // Step 2: Open single multiplexed EventSource
      const encodedSymbols = symbols.map((s) => encodeURIComponent(s)).join(',')
      const es = new EventSource(
        `/api/stream/multi?symbols=${encodedSymbols}&timeframe=${timeframe}`,
      )
      eventSourceRef.current = es

      es.onopen = () => {
        if (cancelled) return
        setStateMap((prev) => {
          const next = { ...prev }
          for (const sym of symbols) {
            if (next[sym]) {
              next[sym] = { ...next[sym], connected: true, error: null }
            }
          }
          return next
        })
      }

      // Committed candle events
      es.addEventListener('candle', (e: MessageEvent) => {
        if (cancelled) return
        try {
          const { symbol: sym, ...candle } = JSON.parse(e.data) as StreamCandle & { symbol: string }

          setStateMap((prev) => {
            const entry = prev[sym]
            if (!entry) return prev

            let nextCandles: StreamCandle[]
            const last = entry.candles.length > 0 ? entry.candles[entry.candles.length - 1] : null
            if (last && last.time === candle.time) {
              nextCandles = [...entry.candles]
              nextCandles[nextCandles.length - 1] = candle
            } else {
              nextCandles = [...entry.candles, candle]
              if (nextCandles.length > MAX_CANDLES) {
                nextCandles = nextCandles.slice(nextCandles.length - MAX_CANDLES)
              }
            }

            return {
              ...prev,
              [sym]: {
                ...entry,
                candles: nextCandles,
                liveCandle: undefined,
                dayHigh: entry.dayHigh !== null ? Math.max(entry.dayHigh, candle.high) : candle.high,
                dayLow: entry.dayLow !== null ? Math.min(entry.dayLow, candle.low) : candle.low,
              },
            }
          })
        } catch {
          /* ignore parse error */
        }
      })

      // In-progress aggregate events
      es.addEventListener('aggregate', (e: MessageEvent) => {
        if (cancelled) return
        try {
          const { symbol: sym, ...candle } = JSON.parse(e.data) as StreamCandle & { symbol: string }

          setStateMap((prev) => {
            const entry = prev[sym]
            if (!entry) return prev
            return {
              ...prev,
              [sym]: {
                ...entry,
                liveCandle: candle,
                dayHigh: entry.dayHigh !== null ? Math.max(entry.dayHigh, candle.high) : candle.high,
                dayLow: entry.dayLow !== null ? Math.min(entry.dayLow, candle.low) : candle.low,
              },
            }
          })
        } catch {
          /* ignore parse error */
        }
      })

      // Auth error
      es.addEventListener('auth_error', (e: MessageEvent) => {
        if (cancelled) return
        try {
          const { symbol: sym, error } = JSON.parse(e.data)
          setStateMap((prev) => {
            const entry = prev[sym]
            if (!entry) return prev
            return {
              ...prev,
              [sym]: {
                ...entry,
                error: error ?? 'Authentication failed',
                connected: false,
              },
            }
          })
        } catch {
          /* ignore */
        }
      })

      es.onerror = () => {
        if (cancelled) return
        setStateMap((prev) => {
          const next = { ...prev }
          for (const sym of symbols) {
            if (next[sym]) {
              next[sym] = { ...next[sym], connected: false, error: 'Stream disconnected' }
            }
          }
          return next
        })
        // EventSource auto-reconnects by default
      }
    }

    init()

    return () => {
      cancelled = true
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, timeframe, cleanup])

  // Derive full LiveStreamState for each symbol (add computed fields)
  const result = useMemo(() => {
    const out: Record<string, LiveStreamState> = {}
    for (const sym of symbols) {
      const entry = stateMap[sym]
      if (!entry) {
        out[sym] = {
          candles: [],
          liveCandle: undefined,
          lastPrice: null,
          lastChange: null,
          lastChangePct: null,
          previousClose: null,
          dayHigh: null,
          dayLow: null,
          connected: false,
          error: null,
        }
        continue
      }

      const lastPrice =
        entry.liveCandle?.close ??
        (entry.candles.length > 0
          ? entry.candles[entry.candles.length - 1].close
          : null)
      const lastChange =
        lastPrice !== null && entry.previousClose !== null
          ? lastPrice - entry.previousClose
          : null
      const lastChangePct =
        lastChange !== null && entry.previousClose !== null && entry.previousClose !== 0
          ? (lastChange / entry.previousClose) * 100
          : null

      out[sym] = {
        candles: entry.candles,
        liveCandle: entry.liveCandle,
        lastPrice,
        lastChange,
        lastChangePct,
        previousClose: entry.previousClose,
        dayHigh: entry.dayHigh,
        dayLow: entry.dayLow,
        connected: entry.connected,
        error: entry.error,
      }
    }
    return out
  }, [symbols, stateMap])

  return result
}
