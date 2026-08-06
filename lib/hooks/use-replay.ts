/**
 * Client hook for historical replay mode.
 *
 * Fetches candles from /api/replay/:symbol and supports two playback modes:
 *   - Static: all candles rendered at once
 *   - Animated: candles revealed progressively on a timer with speed controls
 *
 * Output shape mirrors LiveStreamState so the chart rendering code works identically.
 */

'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { StreamCandle } from '@/lib/hooks/use-live-stream'

export type ReplayMode = 'static' | 'animated'
export type ReplaySpeed = 1 | 2 | 5 | 10 | 25 | 50 | 100
export type ReplayStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'done' | 'error'

// Keep playback updates smooth and bounded even at 100x. Each tick advances a
// virtual market clock, then reveals every candle at or before that timestamp.
// Sparse trade data therefore preserves real gaps without rendering per candle.
const PLAYBACK_TICK_MS = 50

function candleDurationSeconds(timeframe: ReplayConfig['timeframe']): number {
  return timeframe === '1s' ? 1 : 10
}

function fallbackReplayStartTime(candles: StreamCandle[]): number | null {
  return candles.length > 0 ? candles[0].time : null
}

function fallbackReplayEndTime(
  candles: StreamCandle[],
  timeframe: ReplayConfig['timeframe'],
): number | null {
  return candles.length > 0
    ? candles[candles.length - 1].time + candleDurationSeconds(timeframe)
    : null
}

/** Number of sorted candles that have fully completed by `targetTime`. */
function revealedCountAtTime(
  candles: StreamCandle[],
  targetTime: number,
  timeframe: ReplayConfig['timeframe'],
): number {
  const latestCompletedStartTime = targetTime - candleDurationSeconds(timeframe)
  let low = 0
  let high = candles.length

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (candles[middle].time <= latestCompletedStartTime) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  return low
}

export interface ReplayConfig {
  symbol: string
  date: string       // "YYYY-MM-DD"
  from: string       // "HH:MM" ET
  to: string         // "HH:MM" ET
  timeframe: '1s' | '10s'
  /** When false, fetches candles but waits in 'ready' state instead of auto-playing */
  autoPlay?: boolean
  /** Optional client request identity used to trigger and correlate a retry */
  requestId?: number
}

export interface ReplayState {
  /** Full fetched candle set for analysis and chaptering */
  allCandles: StreamCandle[]
  /** All candles up to revealedIndex (committed) */
  candles: StreamCandle[]
  /** Current in-progress candle (last revealed) */
  liveCandle: StreamCandle | undefined
  /** Last known price */
  lastPrice: number | null
  /** Absolute price change from previous close */
  lastChange: number | null
  /** Percentage change from previous close */
  lastChangePct: number | null
  /** Previous trading session close price */
  previousClose: number | null
  /** Always false for replay */
  connected: boolean
  /** Error message if fetch failed */
  error: string | null
  /** Current replay mode */
  mode: ReplayMode
  /** Current playback status */
  status: ReplayStatus
  /** Current speed multiplier */
  speed: ReplaySpeed
  /** Total number of candles */
  totalCandles: number
  /** Number of candles currently revealed */
  revealedCount: number
  /** Virtual replay-window start, as Unix seconds */
  replayStartTime: number | null
  /** Virtual replay-window end, as Unix seconds */
  replayEndTime: number | null
  /** Current virtual market time, as Unix seconds */
  replayCurrentTime: number | null
  /** Elapsed market-time fraction from 0 to 1 */
  replayProgress: number
  /** Controls */
  play: () => void
  pause: () => void
  reset: () => void
  skip: (seconds: number) => void
  seek: (index: number) => void
  seekTime: (timestamp: number) => void
  setSpeed: (s: ReplaySpeed) => void
  setMode: (m: ReplayMode) => void
}

export function useReplay(config: ReplayConfig | null): ReplayState {
  const [allCandles, setAllCandles] = useState<StreamCandle[]>([])
  const [revealedIndex, setRevealedIndex] = useState(0)
  const [mode, setModeState] = useState<ReplayMode>('animated')
  const [speed, setSpeedState] = useState<ReplaySpeed>(1)
  const [status, setStatus] = useState<ReplayStatus>('idle')
  const [previousClose, setPreviousClose] = useState<number | null>(null)
  const [replayStartTime, setReplayStartTime] = useState<number | null>(null)
  const [replayEndTime, setReplayEndTime] = useState<number | null>(null)
  const [replayCurrentTime, setReplayCurrentTime] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTimerTickRef = useRef<number | null>(null)
  const virtualReplayTimeRef = useRef<number | null>(null)
  const allCandlesRef = useRef<StreamCandle[]>([])
  const revealedIndexRef = useRef(0)
  allCandlesRef.current = allCandles
  revealedIndexRef.current = revealedIndex

  // Depend on config primitives rather than the object identity. Callers can
  // safely pass an inline object without causing a fetch/state render loop.
  const hasConfig = config !== null
  const replaySymbol = config?.symbol ?? ''
  const replayDate = config?.date ?? ''
  const replayFrom = config?.from ?? ''
  const replayTo = config?.to ?? ''
  const replayTimeframe = config?.timeframe ?? '1s'
  const replayAutoPlay = config?.autoPlay
  const replayRequestId = config?.requestId

  // Cleanup timer
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    lastTimerTickRef.current = null
  }, [])

  // Fetch candles when config changes
  useEffect(() => {
    if (!hasConfig) {
      setAllCandles([])
      revealedIndexRef.current = 0
      virtualReplayTimeRef.current = null
      setRevealedIndex(0)
      setReplayStartTime(null)
      setReplayEndTime(null)
      setReplayCurrentTime(null)
      setStatus('idle')
      setPreviousClose(null)
      setError(null)
      clearTimer()
      return
    }

    let cancelled = false
    setStatus('loading')
    setError(null)
    clearTimer()

    async function fetchReplay() {
      try {
        const params = new URLSearchParams({
          date: replayDate,
          from: replayFrom,
          to: replayTo,
          timeframe: replayTimeframe,
        })
        if (replayRequestId !== undefined) {
          params.set('requestId', String(replayRequestId))
        }
        const res = await fetch(`/api/replay/${encodeURIComponent(replaySymbol)}?${params}`)
        const data: unknown = await res.json().catch(() => null)
        if (!res.ok) {
          const responseError = data && typeof data === 'object' && 'error' in data
            ? (data as { error?: unknown }).error
            : null
          throw new Error(
            typeof responseError === 'string' && responseError.trim().length > 0
              ? responseError
              : `Replay fetch failed: ${res.status}`,
          )
        }
        if (cancelled) return

        const payload = data && typeof data === 'object'
          ? data as {
            candles?: unknown
            previousClose?: unknown
            startTime?: unknown
            endTime?: unknown
          }
          : {}
        const candles: StreamCandle[] = Array.isArray(payload.candles)
          ? (payload.candles as StreamCandle[])
            .filter((candle) => Number.isFinite(candle?.time))
            .sort((a, b) => a.time - b.time)
          : []
        setAllCandles(candles)
        setPreviousClose(
          typeof payload.previousClose === 'number' && Number.isFinite(payload.previousClose)
            ? payload.previousClose
            : null,
        )

        // Auto-play in animated mode unless autoPlay is explicitly false
        revealedIndexRef.current = 0
        const fallbackStartTime = fallbackReplayStartTime(candles)
        const fallbackEndTime = fallbackReplayEndTime(candles, replayTimeframe)
        let nextReplayStartTime = typeof payload.startTime === 'number' && Number.isFinite(payload.startTime)
          ? payload.startTime
          : fallbackStartTime
        let nextReplayEndTime = typeof payload.endTime === 'number' && Number.isFinite(payload.endTime)
          ? payload.endTime
          : fallbackEndTime

        // Treat a malformed server window as absent instead of allowing a
        // reversed clock. This preserves compatibility with candle-only data.
        if (
          nextReplayStartTime !== null &&
          nextReplayEndTime !== null &&
          nextReplayEndTime < nextReplayStartTime
        ) {
          nextReplayStartTime = fallbackStartTime
          nextReplayEndTime = fallbackEndTime
        }

        setReplayStartTime(nextReplayStartTime)
        setReplayEndTime(nextReplayEndTime)
        virtualReplayTimeRef.current = nextReplayStartTime
        setReplayCurrentTime(nextReplayStartTime)
        setRevealedIndex(0)
        setModeState('animated')
        if (candles.length === 0 || replayAutoPlay === false) {
          setStatus('ready')
        } else {
          setStatus('playing')
        }
      } catch (err) {
        if (cancelled) return
        console.error('[useReplay] Fetch error:', err)
        setError(err instanceof Error ? err.message : 'Replay fetch failed')
        setStatus('error')
      }
    }

    fetchReplay()
    return () => { cancelled = true; clearTimer() }
  }, [
    clearTimer,
    hasConfig,
    replayAutoPlay,
    replayDate,
    replayFrom,
    replayRequestId,
    replaySymbol,
    replayTimeframe,
    replayTo,
  ])

  // Timer for animated mode
  const startTimer = useCallback(() => {
    clearTimer()
    const tf = replayTimeframe
    const candleDurationMs = candleDurationSeconds(tf) * 1000
    const tickMs = Math.min(250, Math.max(PLAYBACK_TICK_MS, candleDurationMs / speed))
    lastTimerTickRef.current = Date.now()

    timerRef.current = setInterval(() => {
      const now = Date.now()
      const elapsedMs = Math.max(0, now - (lastTimerTickRef.current ?? now))
      lastTimerTickRef.current = now

      const candles = allCandlesRef.current
      const replayWindowStart = replayStartTime
        ?? fallbackReplayStartTime(candles)
      const replayWindowEnd = replayEndTime
        ?? fallbackReplayEndTime(candles, tf)
      if (replayWindowStart === null || replayWindowEnd === null) {
        clearTimer()
        setStatus('done')
        return
      }

      const replayTime = virtualReplayTimeRef.current
        ?? replayWindowStart
      const nextReplayTime = Math.min(
        replayWindowEnd,
        replayTime + (elapsedMs / 1000) * speed,
      )
      virtualReplayTimeRef.current = nextReplayTime
      setReplayCurrentTime(nextReplayTime)

      const next = revealedCountAtTime(candles, nextReplayTime, tf)
      if (next !== revealedIndexRef.current) {
        revealedIndexRef.current = next
        setRevealedIndex(next)
      }

      if (nextReplayTime >= replayWindowEnd) {
        virtualReplayTimeRef.current = replayWindowEnd
        setReplayCurrentTime(replayWindowEnd)
        clearTimer()
        setStatus('done')
      }
    }, tickMs)
  }, [replayEndTime, replayStartTime, replayTimeframe, speed, clearTimer])

  // Restart timer when speed changes during playback
  useEffect(() => {
    if (status === 'playing') {
      startTimer()
    }
    return () => clearTimer()
  }, [speed, status, startTimer, clearTimer])

  // Controls
  const play = useCallback(() => {
    if (allCandlesRef.current.length === 0) return
    if (replayStartTime === null || replayEndTime === null) return
    // A completed replay restarts at the session bound. Merely revealing the
    // last trade does not imply completion when a quiet trailing gap remains.
    if (status === 'done') {
      revealedIndexRef.current = 0
      virtualReplayTimeRef.current = replayStartTime
      setReplayCurrentTime(replayStartTime)
      setRevealedIndex(0)
    }
    setStatus('playing')
  }, [replayEndTime, replayStartTime, status])

  const pause = useCallback(() => {
    clearTimer()
    setStatus('paused')
  }, [clearTimer])

  const reset = useCallback(() => {
    clearTimer()
    revealedIndexRef.current = 0
    virtualReplayTimeRef.current = replayStartTime
    setReplayCurrentTime(replayStartTime)
    setRevealedIndex(0)
    setStatus('ready')
  }, [replayStartTime, clearTimer])

  const skip = useCallback((seconds: number) => {
    if (replayStartTime === null || replayEndTime === null) return

    const currentTime = virtualReplayTimeRef.current ?? replayStartTime
    const targetTime = Math.max(replayStartTime, Math.min(replayEndTime, currentTime + seconds))
    const next = revealedCountAtTime(
      allCandles,
      targetTime,
      config?.timeframe ?? '1s',
    )

    virtualReplayTimeRef.current = targetTime
    setReplayCurrentTime(targetTime)
    revealedIndexRef.current = next
    setRevealedIndex(next)
    if (targetTime >= replayEndTime) {
      clearTimer()
      setStatus('done')
    } else {
      setStatus((current) => current === 'playing' ? current : 'paused')
    }
  }, [allCandles, config?.timeframe, replayEndTime, replayStartTime, clearTimer])

  const seek = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(allCandles.length, index))
    const timeframe = config?.timeframe ?? '1s'
    const requestedTime = clamped > 0
      ? allCandles[clamped - 1].time + candleDurationSeconds(timeframe)
      : replayStartTime
    const targetTime = requestedTime === null
      ? null
      : Math.max(
        replayStartTime ?? requestedTime,
        Math.min(replayEndTime ?? requestedTime, requestedTime),
      )
    const next = targetTime === null
      ? 0
      : revealedCountAtTime(allCandles, targetTime, timeframe)

    clearTimer()
    virtualReplayTimeRef.current = targetTime
    setReplayCurrentTime(virtualReplayTimeRef.current)
    revealedIndexRef.current = next
    setRevealedIndex(next)
    setStatus(
      virtualReplayTimeRef.current !== null &&
      replayEndTime !== null &&
      virtualReplayTimeRef.current >= replayEndTime
        ? 'done'
        : 'paused',
    )
  }, [allCandles, config?.timeframe, replayEndTime, replayStartTime, clearTimer])

  const seekTime = useCallback((timestamp: number) => {
    if (
      replayStartTime === null ||
      replayEndTime === null ||
      !Number.isFinite(timestamp)
    ) return

    const targetTime = Math.max(replayStartTime, Math.min(replayEndTime, timestamp))
    const next = revealedCountAtTime(
      allCandles,
      targetTime,
      config?.timeframe ?? '1s',
    )

    clearTimer()
    virtualReplayTimeRef.current = targetTime
    setReplayCurrentTime(targetTime)
    revealedIndexRef.current = next
    setRevealedIndex(next)
    setStatus(targetTime >= replayEndTime ? 'done' : 'paused')
  }, [allCandles, config?.timeframe, replayEndTime, replayStartTime, clearTimer])

  const setSpeed = useCallback((s: ReplaySpeed) => {
    setSpeedState(s)
  }, [])

  const setMode = useCallback((m: ReplayMode) => {
    clearTimer()
    setModeState(m)
    if (m === 'static') {
      revealedIndexRef.current = allCandles.length
      virtualReplayTimeRef.current = replayEndTime
      setReplayCurrentTime(virtualReplayTimeRef.current)
      setRevealedIndex(allCandles.length)
      setStatus('ready')
    } else {
      // Animated: reset to beginning
      revealedIndexRef.current = 0
      virtualReplayTimeRef.current = replayStartTime
      setReplayCurrentTime(virtualReplayTimeRef.current)
      setRevealedIndex(0)
      setStatus('ready')
    }
  }, [allCandles.length, replayEndTime, replayStartTime, clearTimer])

  // Derived output — match LiveStreamState shape
  const candles = useMemo(() => {
    if (revealedIndex <= 1) return []
    return allCandles.slice(0, revealedIndex - 1)
  }, [allCandles, revealedIndex])

  const liveCandle = useMemo(() => {
    if (revealedIndex === 0) return undefined
    return allCandles[revealedIndex - 1]
  }, [allCandles, revealedIndex])

  const lastPrice = liveCandle?.close ?? (candles.length > 0 ? candles[candles.length - 1].close : null)
  const lastChange = lastPrice !== null && previousClose !== null
    ? lastPrice - previousClose
    : null
  const lastChangePct = lastChange !== null && previousClose !== null && previousClose !== 0
    ? (lastChange / previousClose) * 100
    : null
  const replayProgress = replayStartTime !== null && replayEndTime !== null && replayCurrentTime !== null
    ? replayEndTime <= replayStartTime
      ? revealedIndex > 0 ? 1 : 0
      : Math.max(0, Math.min(1, (replayCurrentTime - replayStartTime) / (replayEndTime - replayStartTime)))
    : 0

  return {
    allCandles,
    candles,
    liveCandle,
    lastPrice,
    lastChange,
    lastChangePct,
    previousClose,
    connected: false,
    error,
    mode,
    status,
    speed,
    totalCandles: allCandles.length,
    revealedCount: revealedIndex,
    replayStartTime,
    replayEndTime,
    replayCurrentTime,
    replayProgress,
    play,
    pause,
    reset,
    skip,
    seek,
    seekTime,
    setSpeed,
    setMode,
  }
}
