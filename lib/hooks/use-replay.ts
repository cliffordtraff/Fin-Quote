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
export type ReplaySpeed = 1 | 2 | 5 | 10
export type ReplayStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'done' | 'error'

export interface ReplayConfig {
  symbol: string
  date: string       // "YYYY-MM-DD"
  from: string       // "HH:MM" ET
  to: string         // "HH:MM" ET
  timeframe: '1s' | '10s'
  /** When false, fetches candles but waits in 'ready' state instead of auto-playing */
  autoPlay?: boolean
  /** Optional nonce to force a refetch even when the replay window is unchanged */
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
  /** Controls */
  play: () => void
  pause: () => void
  reset: () => void
  skip: (seconds: number) => void
  seek: (index: number) => void
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
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const allCandlesRef = useRef<StreamCandle[]>([])
  allCandlesRef.current = allCandles

  // Cleanup timer
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Fetch candles when config changes
  useEffect(() => {
    if (!config) {
      setAllCandles([])
      setRevealedIndex(0)
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
        const { symbol, date, from, to, timeframe } = config!
        const params = new URLSearchParams({ date, from, to, timeframe })
        const res = await fetch(`/api/replay/${encodeURIComponent(symbol)}?${params}`)
        if (!res.ok) throw new Error(`Replay fetch failed: ${res.status}`)
        const data = await res.json()
        if (cancelled) return

        const candles: StreamCandle[] = data.candles ?? []
        setAllCandles(candles)
        setPreviousClose(data.previousClose || null)

        // Auto-play in animated mode unless autoPlay is explicitly false
        setRevealedIndex(0)
        setModeState('animated')
        if (config!.autoPlay === false) {
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
  }, [config?.symbol, config?.date, config?.from, config?.to, config?.timeframe, config?.requestId, clearTimer])

  // Timer for animated mode
  const startTimer = useCallback(() => {
    clearTimer()
    const tf = config?.timeframe ?? '1s'
    const baseMs = tf === '1s' ? 1000 : 10000
    const intervalMs = baseMs / speed

    timerRef.current = setInterval(() => {
      setRevealedIndex(prev => {
        const total = allCandlesRef.current.length
        if (prev >= total) {
          clearTimer()
          setStatus('done')
          return total
        }
        return prev + 1
      })
    }, intervalMs)
  }, [config?.timeframe, speed, clearTimer])

  // Restart timer when speed changes during playback
  useEffect(() => {
    if (status === 'playing') {
      startTimer()
    }
    return () => clearTimer()
  }, [speed, status, startTimer, clearTimer])

  // Controls
  const play = useCallback(() => {
    if (allCandles.length === 0) return
    // If done, reset first
    if (revealedIndex >= allCandles.length) {
      setRevealedIndex(0)
    }
    setStatus('playing')
  }, [allCandles.length, revealedIndex])

  const pause = useCallback(() => {
    clearTimer()
    setStatus('paused')
  }, [clearTimer])

  const reset = useCallback(() => {
    clearTimer()
    setRevealedIndex(0)
    setStatus('ready')
  }, [clearTimer])

  const skip = useCallback((seconds: number) => {
    const tf = config?.timeframe ?? '1s'
    const candlesPerSec = tf === '1s' ? 1 : 0.1
    const delta = Math.round(seconds * candlesPerSec)
    setRevealedIndex(prev => {
      const next = Math.max(0, Math.min(allCandles.length, prev + delta))
      if (next >= allCandles.length) {
        clearTimer()
        setStatus('done')
      }
      return next
    })
  }, [config?.timeframe, allCandles.length, clearTimer])

  const seek = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(allCandles.length, index))
    clearTimer()
    setRevealedIndex(clamped)
    setStatus(clamped >= allCandles.length ? 'done' : 'paused')
  }, [allCandles.length, clearTimer])

  const setSpeed = useCallback((s: ReplaySpeed) => {
    setSpeedState(s)
  }, [])

  const setMode = useCallback((m: ReplayMode) => {
    clearTimer()
    setModeState(m)
    if (m === 'static') {
      setRevealedIndex(allCandles.length)
      setStatus('ready')
    } else {
      // Animated: reset to beginning
      setRevealedIndex(0)
      setStatus('ready')
    }
  }, [allCandles.length, clearTimer])

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
    play,
    pause,
    reset,
    skip,
    seek,
    setSpeed,
    setMode,
  }
}
