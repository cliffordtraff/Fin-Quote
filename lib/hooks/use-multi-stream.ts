/**
 * Client hook for multiplexed real-time streaming via a single SSE connection.
 *
 * Live transport starts independently of historical backfill. Backfill is a
 * bounded enhancement: it may fail or time out without holding the live tape
 * hostage, and a late response is merged behind any newer SSE candles.
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StreamCandle, LiveStreamState } from './use-live-stream'
import {
  fetchLiveStreamBackfill,
  toLiveStreamBackfillIssue,
  type LiveStreamBackfillIssue,
} from './live-stream-backfill'
import {
  mergePulseStreamCandles,
  parsePulseStreamEvent,
  type PulseStreamCandle,
} from '@/lib/pulse-market-data-contract'
import { isValidMarketSymbol, normalizeMarketSymbol } from '@/lib/market-symbol'

const MAX_CLIENT_SYMBOLS = 30
export const MULTI_STREAM_BACKFILL_DEADLINE_MS = 8_000
const VISIBILITY_FOCUS_DEDUPE_MS = 250
const BACKFILL_LOOKBACK: Record<string, number> = {
  '1s': 300,
  '10s': 1800,
}

interface MultiStreamEntry {
  candles: StreamCandle[]
  liveCandle: StreamCandle | undefined
  previousClose: number | null
  dayHigh: number | null
  dayLow: number | null
  connected: boolean
  error: string | null
  backfillIssue: LiveStreamBackfillIssue | null
}

function emptyEntry(): MultiStreamEntry {
  return {
    candles: [],
    liveCandle: undefined,
    previousClose: null,
    dayHigh: null,
    dayLow: null,
    connected: false,
    error: null,
    backfillIssue: null,
  }
}

function canonicalSymbols(symbols: readonly string[]): string[] {
  const unique: string[] = []
  const seen = new Set<string>()
  for (const rawSymbol of symbols) {
    const symbol = normalizeMarketSymbol(rawSymbol)
    if (!isValidMarketSymbol(symbol) || seen.has(symbol)) continue
    seen.add(symbol)
    unique.push(symbol)
    if (unique.length >= MAX_CLIENT_SYMBOLS) break
  }
  return unique
}

/** Stable key for a canonical sorted set of symbols. */
function symbolsKey(symbols: readonly string[]): string {
  return canonicalSymbols(symbols).sort().join(',')
}

function isPageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

function monotonicNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function boundedError(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 240)
    : fallback
}

function maxNullable(...values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value)
  )
  return finite.length > 0 ? Math.max(...finite) : null
}

function minNullable(...values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value)
  )
  return finite.length > 0 ? Math.min(...finite) : null
}

function parseMessageData(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function useMultiStream(
  symbols: string[],
  timeframe: '1s' | '10s',
): Record<string, LiveStreamState> {
  const key = useMemo(() => symbolsKey(symbols), [symbols])
  // Preserve first-seen caller order while the logical symbol set is stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const uniqueSymbols = useMemo(() => canonicalSymbols(symbols), [key])
  const [stateMap, setStateMap] = useState<Record<string, MultiStreamEntry>>({})
  const [active, setActive] = useState(isPageVisible)
  const [refreshGeneration, setRefreshGeneration] = useState(0)

  const eventSourceRef = useRef<EventSource | null>(null)
  const backfillControllerRef = useRef<AbortController | null>(null)
  const sessionRef = useRef(0)
  const activityRef = useRef(active)
  const configurationRef = useRef<string | null>(null)
  const sessionCandlesRef = useRef(new Map<string, PulseStreamCandle[]>())
  const sessionHighRef = useRef(new Map<string, number>())
  const sessionLowRef = useRef(new Map<string, number>())
  const suppressFocusUntilRef = useRef(Number.NEGATIVE_INFINITY)
  const focusRefreshQueuedRef = useRef(false)

  const cleanup = useCallback((reason = 'Multi-stream session ended.') => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    backfillControllerRef.current?.abort(
      new DOMException(reason, 'AbortError'),
    )
    backfillControllerRef.current = null
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      const nextActive = isPageVisible()
      activityRef.current = nextActive
      if (!nextActive) {
        cleanup('The page became hidden.')
      } else {
        // A browser commonly emits focus immediately after visibilitychange.
        // This synchronous generation owns that resume; suppress its paired
        // focus event so the burst produces one replacement session.
        suppressFocusUntilRef.current = monotonicNow() + VISIBILITY_FOCUS_DEDUPE_MS
        setRefreshGeneration((current) => current + 1)
      }
      setActive(nextActive)
    }
    const handleFocus = () => {
      if (!isPageVisible()) return
      activityRef.current = true
      setActive(true)
      const now = monotonicNow()
      if (
        now < suppressFocusUntilRef.current ||
        focusRefreshQueuedRef.current
      ) {
        return
      }
      suppressFocusUntilRef.current = now + VISIBILITY_FOCUS_DEDUPE_MS
      focusRefreshQueuedRef.current = true
      queueMicrotask(() => {
        focusRefreshQueuedRef.current = false
        if (!activityRef.current) return
        // Focus while already visible replaces one active session so a stale
        // or disconnected EventSource is refreshed immediately.
        setRefreshGeneration((current) => current + 1)
      })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    return () => {
      activityRef.current = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      cleanup('Multi-stream hook unmounted.')
    }
  }, [cleanup])

  useEffect(() => {
    cleanup()
    const session = ++sessionRef.current
    const expectedSymbols = new Set(uniqueSymbols)
    const configuration = `${key}|${timeframe}`
    const configurationChanged = configurationRef.current !== configuration
    configurationRef.current = configuration
    sessionCandlesRef.current = new Map()
    sessionHighRef.current = new Map()
    sessionLowRef.current = new Map()

    setStateMap((previous) => {
      const next: Record<string, MultiStreamEntry> = {}
      for (const symbol of uniqueSymbols) {
        const retained = !configurationChanged ? previous[symbol] : undefined
        next[symbol] = retained
          ? {
              ...retained,
              liveCandle: undefined,
              connected: false,
              error: null,
            }
          : emptyEntry()
      }
      return next
    })

    if (!active || uniqueSymbols.length === 0) return
    activityRef.current = true
    let cancelled = false

    const isCurrent = () =>
      !cancelled &&
      activityRef.current &&
      sessionRef.current === session

    // Open live transport before beginning historical work. A slow or failed
    // backfill can no longer prevent the page from receiving current prices.
    const encodedSymbols = uniqueSymbols
      .map((symbol) => encodeURIComponent(symbol))
      .join(',')
    const eventSource = new EventSource(
      `/api/stream/multi?symbols=${encodedSymbols}&timeframe=${timeframe}`,
    )
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      if (!isCurrent()) return
      setStateMap((previous) => {
        if (!isCurrent()) return previous
        const next = { ...previous }
        for (const symbol of uniqueSymbols) {
          const entry = next[symbol]
          if (entry) next[symbol] = { ...entry, connected: true, error: null }
        }
        return next
      })
    }

    eventSource.addEventListener('candle', (event: MessageEvent) => {
      if (!isCurrent()) return
      const parsed = parsePulseStreamEvent(
        parseMessageData(event.data),
        expectedSymbols,
      )
      if (!parsed) return
      const { symbol, candle } = parsed
      const sessionCandles = mergePulseStreamCandles(
        sessionCandlesRef.current.get(symbol) ?? [],
        [candle],
      )
      sessionCandlesRef.current.set(symbol, sessionCandles)
      sessionHighRef.current.set(
        symbol,
        Math.max(sessionHighRef.current.get(symbol) ?? candle.high, candle.high),
      )
      sessionLowRef.current.set(
        symbol,
        Math.min(sessionLowRef.current.get(symbol) ?? candle.low, candle.low),
      )

      setStateMap((previous) => {
        if (!isCurrent()) return previous
        const entry = previous[symbol]
        if (!entry) return previous
        return {
          ...previous,
          [symbol]: {
            ...entry,
            candles: mergePulseStreamCandles(entry.candles, [candle]),
            liveCandle:
              entry.liveCandle && entry.liveCandle.time > candle.time
                ? entry.liveCandle
                : undefined,
            dayHigh: maxNullable(entry.dayHigh, candle.high),
            dayLow: minNullable(entry.dayLow, candle.low),
          },
        }
      })
    })

    eventSource.addEventListener('aggregate', (event: MessageEvent) => {
      if (!isCurrent()) return
      const parsed = parsePulseStreamEvent(
        parseMessageData(event.data),
        expectedSymbols,
      )
      if (!parsed) return
      const { symbol, candle } = parsed
      sessionHighRef.current.set(
        symbol,
        Math.max(sessionHighRef.current.get(symbol) ?? candle.high, candle.high),
      )
      sessionLowRef.current.set(
        symbol,
        Math.min(sessionLowRef.current.get(symbol) ?? candle.low, candle.low),
      )

      setStateMap((previous) => {
        if (!isCurrent()) return previous
        const entry = previous[symbol]
        const latestCommitted = entry?.candles[entry.candles.length - 1]
        if (!entry || (latestCommitted && candle.time <= latestCommitted.time)) {
          return previous
        }
        return {
          ...previous,
          [symbol]: {
            ...entry,
            liveCandle: candle,
            dayHigh: maxNullable(entry.dayHigh, candle.high),
            dayLow: minNullable(entry.dayLow, candle.low),
          },
        }
      })
    })

    const applySymbolError = (event: MessageEvent, fallback: string) => {
      if (!isCurrent()) return
      const raw = parseMessageData(event.data)
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
      const value = raw as Record<string, unknown>
      const symbol = typeof value.symbol === 'string' ? value.symbol : ''
      if (!expectedSymbols.has(symbol)) return
      setStateMap((previous) => {
        if (!isCurrent()) return previous
        const entry = previous[symbol]
        if (!entry) return previous
        return {
          ...previous,
          [symbol]: {
            ...entry,
            error: boundedError(value.error, fallback),
            connected: false,
          },
        }
      })
    }
    eventSource.addEventListener('auth_error', (event: MessageEvent) => {
      applySymbolError(event, 'Authentication failed')
    })
    eventSource.addEventListener('subscription_error', (event: MessageEvent) => {
      applySymbolError(event, 'Live market-data subscription failed.')
    })

    eventSource.onerror = () => {
      if (!isCurrent()) return
      setStateMap((previous) => {
        if (!isCurrent()) return previous
        const next = { ...previous }
        for (const symbol of uniqueSymbols) {
          const entry = next[symbol]
          if (entry) {
            next[symbol] = {
              ...entry,
              connected: false,
              error: 'Stream disconnected',
            }
          }
        }
        return next
      })
      // EventSource reconnects automatically while this visible session lives.
    }

    const backfillController = new AbortController()
    backfillControllerRef.current = backfillController
    const deadline = setTimeout(() => {
      backfillController.abort(new DOMException(
        'Multi-stream backfill deadline elapsed.',
        'TimeoutError',
      ))
    }, MULTI_STREAM_BACKFILL_DEADLINE_MS)
    const lookback = BACKFILL_LOOKBACK[timeframe] ?? 300

    const backfillLoads = uniqueSymbols.map(async (symbol) => {
      try {
        const data = await fetchLiveStreamBackfill(
          symbol,
          timeframe,
          lookback,
          backfillController.signal,
        )
        if (!isCurrent() || backfillController.signal.aborted) return

        setStateMap((previous) => {
          if (!isCurrent() || backfillController.signal.aborted) return previous
          const entry = previous[symbol]
          if (!entry) return previous
          const sessionCandles = sessionCandlesRef.current.get(symbol) ?? []
          return {
            ...previous,
            [symbol]: {
              ...entry,
              // Session SSE candles are newer and win timestamp collisions.
              candles: mergePulseStreamCandles(data.candles, sessionCandles),
              previousClose: data.previousClose,
              dayHigh: maxNullable(
                data.dayHigh,
                sessionHighRef.current.get(symbol),
              ),
              dayLow: minNullable(
                data.dayLow,
                sessionLowRef.current.get(symbol),
              ),
              backfillIssue: null,
            },
          }
        })
      } catch (error) {
        if (!isCurrent() || backfillController.signal.aborted) return
        console.error(`[useMultiStream] Backfill error for ${symbol}:`, error)
        setStateMap((previous) => {
          if (!isCurrent() || backfillController.signal.aborted) return previous
          const entry = previous[symbol]
          if (!entry) return previous
          return {
            ...previous,
            [symbol]: {
              ...entry,
              backfillIssue: toLiveStreamBackfillIssue(error),
            },
          }
        })
      }
    })

    void Promise.allSettled(backfillLoads).finally(() => {
      clearTimeout(deadline)
      if (backfillControllerRef.current === backfillController) {
        backfillControllerRef.current = null
      }
    })

    return () => {
      cancelled = true
      if (sessionRef.current === session) sessionRef.current += 1
      clearTimeout(deadline)
      cleanup()
    }
  }, [active, cleanup, key, refreshGeneration, timeframe, uniqueSymbols])

  return useMemo(() => {
    const result: Record<string, LiveStreamState> = {}
    for (const symbol of uniqueSymbols) {
      const entry = stateMap[symbol]
      if (!entry) {
        result[symbol] = {
          ...emptyEntry(),
          lastPrice: null,
          lastChange: null,
          lastChangePct: null,
        }
        continue
      }

      const lastPrice = entry.liveCandle?.close ??
        entry.candles[entry.candles.length - 1]?.close ??
        null
      const lastChange = lastPrice !== null && entry.previousClose !== null
        ? lastPrice - entry.previousClose
        : null
      const lastChangePct =
        lastChange !== null &&
        entry.previousClose !== null &&
        entry.previousClose !== 0
          ? (lastChange / entry.previousClose) * 100
          : null

      result[symbol] = {
        ...entry,
        lastPrice,
        lastChange,
        lastChangePct,
      }
    }
    return result
  }, [stateMap, uniqueSymbols])
}
