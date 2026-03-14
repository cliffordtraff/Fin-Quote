'use client'

import { useState, useReducer, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { useReplay } from '@/lib/hooks/use-replay'
import type { ReplayConfig } from '@/lib/hooks/use-replay'
import { getTradingDate } from '@/lib/market-hours'
import {
  FullDayCanvas,
  bucketCandles,
  useDayCandles,
  candleMinutesSinceOpen,
} from '@/components/PulseTodayDashboard'
import type { DayCandleData } from '@/components/PulseTodayDashboard'

/* ───────── State Machine ───────── */

type ReviewPhase =
  | 'IDLE'
  | 'LOADING'
  | 'FULL_DAY'
  | 'HIGHLIGHTING'
  | 'MORPHING_IN'
  | 'CLEARING_CONTEXT'
  | 'REPLAYING'
  | 'MORPHING_OUT'
  | 'FULL_DAY_FINAL'

type ReviewReplayAggregation = '1s' | '10s'

interface ReviewState {
  phase: ReviewPhase
  morphProgress: number
  highlightOpacity: number
  clearProgress: number
}

type ReviewAction =
  | { type: 'START' }
  | { type: 'DATA_READY' }
  | { type: 'ADVANCE'; to: ReviewPhase }
  | { type: 'SET_MORPH'; progress: number }
  | { type: 'SET_HIGHLIGHT_OPACITY'; opacity: number }
  | { type: 'SET_CLEAR_PROGRESS'; progress: number }
  | { type: 'RESET' }

const initialState: ReviewState = {
  phase: 'IDLE',
  morphProgress: 0,
  highlightOpacity: 0,
  clearProgress: 0,
}

function reducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case 'START':
      return { ...state, phase: 'LOADING', morphProgress: 0, highlightOpacity: 0, clearProgress: 0 }
    case 'DATA_READY':
      return { ...state, phase: 'FULL_DAY' }
    case 'ADVANCE':
      return { ...state, phase: action.to }
    case 'SET_MORPH':
      return { ...state, morphProgress: action.progress }
    case 'SET_HIGHLIGHT_OPACITY':
      return { ...state, highlightOpacity: action.opacity }
    case 'SET_CLEAR_PROGRESS':
      return { ...state, clearProgress: action.progress }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

/* ───────── Config ───────── */

const SYMBOL = 'GOOGL'
const HIGHLIGHT_FROM = '09:30'
const HIGHLIGHT_TO = '09:35'
const CHART_HEIGHT = 500
const FULL_DAY_MINUTES = 390
const HIGHLIGHT_START_MIN = 0
const HIGHLIGHT_END_MIN = 5
const REVIEW_SYMBOLS = [SYMBOL] as const
const REVIEW_REPLAY_SPEED = 2
const REVIEW_CANVAS_PADDING = { top: 12, right: 64, bottom: 28, left: 8 }
const REVIEW_ZOOM_CONTEXT_MINUTES = 30

function buildReplayConfig(date: string): ReplayConfig {
  return {
    symbol: SYMBOL,
    date,
    from: HIGHLIGHT_FROM,
    to: HIGHLIGHT_TO,
    // Always replay the raw 1s stream so 10s candles can keep growing
    // while the underlying ticks are still arriving.
    timeframe: '1s',
    autoPlay: false,
    requestId: Date.now(),
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

/* ───────── Component ───────── */

export default function ReviewDayDashboard() {
  const { theme: rawTheme } = useTheme()
  const theme = (rawTheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark'

  const [state, dispatch] = useReducer(reducer, initialState)
  const { phase, morphProgress, highlightOpacity, clearProgress } = state
  const [replayAggregation, setReplayAggregation] = useState<ReviewReplayAggregation>('10s')

  // ── Data: full-day 1min candles (fetched on mount) ──
  const dayCandles = useDayCandles(REVIEW_SYMBOLS)
  const dayData = dayCandles[SYMBOL] as DayCandleData | undefined
  const replayDate = useMemo(
    () => dayData?.candles[0]?.date.split(' ')[0] ?? getTradingDate(),
    [dayData],
  )

  // ── Replay: fetch native 1s candles with autoPlay: false ──
  // The review chart supports both 1s and 10s modes. In 10s mode we still
  // drive from the 1s stream so the active 10s candle can keep expanding
  // and contracting while new 1s ticks arrive.
  const [replayConfig, setReplayConfig] = useState<ReplayConfig | null>(null)
  const replay = useReplay(replayConfig)
  const replay1sData = useMemo<DayCandleData | undefined>(() => {
    const revealed = [...replay.candles]
    if (replay.liveCandle) revealed.push(replay.liveCandle)
    if (revealed.length === 0) return undefined

    const etFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })

    const candles = revealed.map((c) => {
      const parts = etFmt.formatToParts(new Date(c.time * 1000))
      const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'

      return {
        date: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }
    })

    return {
      candles,
      previousClose: replay.previousClose,
      changePct: replay.lastChangePct,
    }
  }, [replay.candles, replay.liveCandle, replay.previousClose, replay.lastChangePct])
  const replay10sData = useMemo<DayCandleData | undefined>(() => {
    const revealed = [...replay.candles]
    if (replay.liveCandle) revealed.push(replay.liveCandle)
    if (revealed.length === 0) return undefined

    const etFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })

    return {
      candles: bucketCandles(revealed, 10, etFmt),
      previousClose: replay.previousClose,
      changePct: replay.lastChangePct,
    }
  }, [replay.candles, replay.liveCandle, replay.previousClose, replay.lastChangePct])

  // ─────────────────────────────────────────────────────────
  // SINGLE CANVAS DATA — computed based on phase
  // ─────────────────────────────────────────────────────────

  const chartData = useMemo<{
    candles: DayCandleData['candles']
    previousClose: number | null
    aggregation: '1s' | '10s' | '1min'
    dynamicXAxis: boolean
    xAxisMaxSlots: number | null
    lastPrice: number | null
    dayHigh: number | null
    dayLow: number | null
  }>(() => {
    const empty = {
      candles: [] as DayCandleData['candles'],
      previousClose: null,
      aggregation: '1min' as const,
      dynamicXAxis: false,
      xAxisMaxSlots: null,
      lastPrice: null,
      dayHigh: null,
      dayLow: null,
    }

    if (!dayData || dayData.candles.length === 0) return empty

    const allCandles = dayData.candles
    const prevClose = dayData.previousClose

    const stats = (cs: typeof allCandles) => {
      if (cs.length === 0) return { lastPrice: null, dayHigh: null, dayLow: null }
      return {
        lastPrice: cs[cs.length - 1].close,
        dayHigh: Math.max(...cs.map(c => c.high)),
        dayLow: Math.min(...cs.map(c => c.low)),
      }
    }

    const fullStats = stats(allCandles)

    switch (phase) {
      case 'LOADING':
      case 'FULL_DAY':
      case 'HIGHLIGHTING':
        return { candles: allCandles, previousClose: prevClose, aggregation: '1min', dynamicXAxis: false, xAxisMaxSlots: null, ...fullStats }

      case 'MORPHING_IN':
      case 'CLEARING_CONTEXT': {
        const zoomSlots = Math.max(
          REVIEW_ZOOM_CONTEXT_MINUTES,
          Math.round(lerp(FULL_DAY_MINUTES, REVIEW_ZOOM_CONTEXT_MINUTES, morphProgress)),
        )
        const visible = allCandles.filter((c) => {
          const mins = candleMinutesSinceOpen(c)
          return mins >= HIGHLIGHT_START_MIN && mins < zoomSlots
        })
        return {
          candles: visible,
          previousClose: prevClose,
          aggregation: '1min',
          dynamicXAxis: true,
          xAxisMaxSlots: zoomSlots,
          ...stats(visible),
        }
      }

      case 'REPLAYING': {
        const replayData = replayAggregation === '1s' ? replay1sData : replay10sData
        if (replayData && replayData.candles.length > 0) {
          return {
            candles: replayData.candles,
            previousClose: replayData.previousClose,
            aggregation: replayAggregation,
            dynamicXAxis: true,
            xAxisMaxSlots: null,
            ...stats(replayData.candles),
          }
        }
        return {
          candles: [] as DayCandleData['candles'],
          previousClose: replay.previousClose ?? prevClose,
          aggregation: replayAggregation,
          dynamicXAxis: true,
          xAxisMaxSlots: null,
          lastPrice: replay.lastPrice,
          dayHigh: null,
          dayLow: null,
        }
      }

      case 'MORPHING_OUT': {
        const viewStart = lerp(0, HIGHLIGHT_START_MIN, morphProgress)
        const viewEnd = lerp(FULL_DAY_MINUTES, HIGHLIGHT_END_MIN, morphProgress)
        const visible = allCandles.filter(c => {
          const mins = candleMinutesSinceOpen(c)
          return mins >= viewStart && mins < viewEnd
        })
        return { candles: visible, previousClose: prevClose, aggregation: '1min', dynamicXAxis: true, xAxisMaxSlots: null, ...stats(visible) }
      }

      case 'FULL_DAY_FINAL':
        return { candles: allCandles, previousClose: prevClose, aggregation: '1min', dynamicXAxis: false, xAxisMaxSlots: null, ...fullStats }

      default:
        return empty
    }
  }, [
    phase,
    morphProgress,
    dayData,
    replayAggregation,
    replay1sData,
    replay10sData,
    replay.previousClose,
    replay.lastPrice,
  ])

  // ── Phase transitions ──

  // LOADING → FULL_DAY: only needs day candles. Replay loads in background.
  useEffect(() => {
    if (phase !== 'LOADING') return
    if (dayData && dayData.candles.length > 0) {
      dispatch({ type: 'DATA_READY' })
    }
  }, [phase, dayData])

  // FULL_DAY → HIGHLIGHTING (2s)
  useEffect(() => {
    if (phase !== 'FULL_DAY') return
    const timer = setTimeout(() => dispatch({ type: 'ADVANCE', to: 'HIGHLIGHTING' }), 2000)
    return () => clearTimeout(timer)
  }, [phase])

  // HIGHLIGHTING: fade overlay in 800ms, hold 700ms, then advance
  useEffect(() => {
    if (phase !== 'HIGHLIGHTING') return
    const start = performance.now()
    let raf: number
    const animate = (now: number) => {
      const elapsed = now - start
      if (elapsed < 800) {
        dispatch({ type: 'SET_HIGHLIGHT_OPACITY', opacity: (elapsed / 800) * 0.6 })
        raf = requestAnimationFrame(animate)
      } else if (elapsed < 1500) {
        dispatch({ type: 'SET_HIGHLIGHT_OPACITY', opacity: 0.6 })
        raf = requestAnimationFrame(animate)
      } else {
        dispatch({ type: 'ADVANCE', to: 'MORPHING_IN' })
      }
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  // MORPHING_IN: zoom from full day → window over 2s
  useEffect(() => {
    if (phase !== 'MORPHING_IN') return
    const start = performance.now()
    let raf: number
    const animate = (now: number) => {
      const t = Math.min((now - start) / 2000, 1)
      dispatch({ type: 'SET_MORPH', progress: easeInOut(t) })
      dispatch({ type: 'SET_HIGHLIGHT_OPACITY', opacity: 0.6 * (1 - t) })
      if (t < 1) {
        raf = requestAnimationFrame(animate)
      } else {
        dispatch({ type: 'SET_HIGHLIGHT_OPACITY', opacity: 0 })
        dispatch({ type: 'ADVANCE', to: 'CLEARING_CONTEXT' })
      }
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  // CLEARING_CONTEXT: hold the zoomed 1min view, then fade it away before replay starts.
  useEffect(() => {
    if (phase !== 'CLEARING_CONTEXT') return
    const start = performance.now()
    let raf: number
    const animate = (now: number) => {
      const elapsed = now - start
      const holdMs = 300
      const fadeMs = 700
      if (elapsed <= holdMs) {
        dispatch({ type: 'SET_CLEAR_PROGRESS', progress: 0 })
        raf = requestAnimationFrame(animate)
        return
      }
      const t = Math.min((elapsed - holdMs) / fadeMs, 1)
      dispatch({ type: 'SET_CLEAR_PROGRESS', progress: easeInOut(t) })
      if (t < 1) {
        raf = requestAnimationFrame(animate)
      }
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  useEffect(() => {
    if (phase !== 'CLEARING_CONTEXT' || clearProgress < 1) return
    if (replay.status === 'loading') return
    dispatch({ type: 'ADVANCE', to: 'REPLAYING' })
  }, [phase, clearProgress, replay.status])

  // REPLAYING: wait for replay to be ready, then play.
  // If replay has no data or errors, skip straight to MORPHING_OUT.
  useEffect(() => {
    if (phase !== 'REPLAYING') return

    if (replay.status === 'ready' && replay.allCandles.length > 0) {
      replay.setSpeed(REVIEW_REPLAY_SPEED)
      if (replay.revealedCount === 0) {
        replay.skip(1)
      }
      replay.play()
    } else if (replay.status === 'error' || (replay.status === 'ready' && replay.allCandles.length === 0)) {
      // No replay data available — skip to morph out after a brief pause
      const timer = setTimeout(() => {
        dispatch({ type: 'SET_MORPH', progress: 1 })
        dispatch({ type: 'ADVANCE', to: 'MORPHING_OUT' })
      }, 500)
      return () => clearTimeout(timer)
    }
    // If still loading, this effect re-runs when replay.status changes
  }, [phase, replay.status, replay.allCandles.length, replay.revealedCount, replay.play, replay.setSpeed, replay.skip]) // eslint-disable-line react-hooks/exhaustive-deps

  // REPLAYING → MORPHING_OUT: when replay finishes
  useEffect(() => {
    if (phase !== 'REPLAYING') return
    if (replay.status === 'done') {
      const timer = setTimeout(() => {
        dispatch({ type: 'SET_MORPH', progress: 1 })
        dispatch({ type: 'ADVANCE', to: 'MORPHING_OUT' })
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [phase, replay.status])

  // MORPHING_OUT: zoom from window → full day over 2s
  useEffect(() => {
    if (phase !== 'MORPHING_OUT') return
    const start = performance.now()
    let raf: number
    const animate = (now: number) => {
      const t = Math.min((now - start) / 2000, 1)
      dispatch({ type: 'SET_MORPH', progress: 1 - easeInOut(t) })
      if (t < 1) {
        raf = requestAnimationFrame(animate)
      } else {
        dispatch({ type: 'ADVANCE', to: 'FULL_DAY_FINAL' })
      }
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  // ── Actions ──

  const handlePlay = useCallback(() => {
    dispatch({ type: 'START' })
    setReplayConfig(buildReplayConfig(replayDate))
  }, [replayDate])

  const handleReplayAgain = useCallback(() => {
    replay.reset()
    dispatch({ type: 'START' })
    setReplayConfig(buildReplayConfig(replayDate))
  }, [replay, replayDate])

  const handleCancel = useCallback(() => {
    replay.pause()
    replay.reset()
    setReplayConfig(null)
    dispatch({ type: 'RESET' })
  }, [replay])

  // ── Highlight overlay geometry ──
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const highlightRect = useMemo<{
    left: number; top: number; width: number; height: number
  } | null>(() => {
    if (phase !== 'HIGHLIGHTING' && phase !== 'MORPHING_IN' && phase !== 'CLEARING_CONTEXT') return null
    const container = chartContainerRef.current
    if (!container) return null
    const containerWidth = container.clientWidth
    const currentViewMinutes = phase === 'MORPHING_IN' || phase === 'CLEARING_CONTEXT'
      ? Math.max(
          REVIEW_ZOOM_CONTEXT_MINUTES,
          Math.round(lerp(FULL_DAY_MINUTES, REVIEW_ZOOM_CONTEXT_MINUTES, morphProgress)),
        )
      : FULL_DAY_MINUTES
    const drawW = containerWidth - REVIEW_CANVAS_PADDING.right - REVIEW_CANVAS_PADDING.left
    const x1 = REVIEW_CANVAS_PADDING.left + (HIGHLIGHT_START_MIN / currentViewMinutes) * drawW
    const x2 = REVIEW_CANVAS_PADDING.left + (HIGHLIGHT_END_MIN / currentViewMinutes) * drawW
    return {
      left: x1,
      top: REVIEW_CANVAS_PADDING.top,
      width: x2 - x1,
      height: CHART_HEIGHT - REVIEW_CANVAS_PADDING.top - REVIEW_CANVAS_PADDING.bottom,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, morphProgress])

  // ── Progress ──
  const progressPct = replay.totalCandles > 0
    ? Math.max(replay.revealedCount > 0 ? 1 : 0, Math.round((replay.revealedCount / replay.totalCandles) * 100))
    : 0

  const phaseLabel = {
    IDLE: '',
    LOADING: 'Loading data...',
    FULL_DAY: 'Full Day Overview',
    HIGHLIGHTING: 'Highlighting Region',
    MORPHING_IN: 'Zooming Into Opening Range',
    CLEARING_CONTEXT: `Preparing ${replayAggregation} Replay`,
    REPLAYING: `Replaying ${replayAggregation} — ${progressPct}%`,
    MORPHING_OUT: 'Zooming Out',
    FULL_DAY_FINAL: 'Review Complete',
  }[phase]

  const showChart = phase !== 'IDLE' && chartData.candles.length > 0
  const showCancelButton = phase !== 'IDLE' && phase !== 'FULL_DAY_FINAL'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Review Day — {SYMBOL}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cinematic replay of the {HIGHLIGHT_FROM}–{HIGHLIGHT_TO} window
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white/70 p-1 dark:border-gray-700 dark:bg-gray-800/70">
            {(['1s', '10s'] as const).map((aggregation) => (
              <button
                key={aggregation}
                type="button"
                onClick={() => setReplayAggregation(aggregation)}
                className={
                  `px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    replayAggregation === aggregation
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`
                }
              >
                {aggregation}
              </button>
            ))}
          </div>
          {phaseLabel && (
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              {phaseLabel}
            </span>
          )}
          {showCancelButton && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          )}
          {phase === 'IDLE' && (
            <button type="button" onClick={handlePlay} className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors">
              Play Review Day
            </button>
          )}
          {phase === 'FULL_DAY_FINAL' && (
            <button type="button" onClick={handleReplayAgain} className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors">
              Replay Again
            </button>
          )}
        </div>
      </div>

      <div
        ref={chartContainerRef}
        className="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
        style={{ height: CHART_HEIGHT }}
      >
        {phase === 'LOADING' && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Loading {SYMBOL} data...</span>
            </div>
          </div>
        )}

        {phase === 'IDLE' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              Click &quot;Play Review Day&quot; to start the cinematic walkthrough
            </p>
          </div>
        )}

        {showChart && (
          <div className="absolute inset-0">
            <FullDayCanvas
              candles={chartData.candles}
              previousClose={chartData.previousClose}
              lastPrice={chartData.lastPrice}
              dayHigh={chartData.dayHigh}
              dayLow={chartData.dayLow}
              lineMode={false}
              aggregation={chartData.aggregation}
              theme={theme}
              chartHeight={CHART_HEIGHT}
              dynamicXAxis={chartData.dynamicXAxis}
              xAxisMaxSlots={chartData.xAxisMaxSlots}
            />
          </div>
        )}

        {((phase === 'HIGHLIGHTING' && highlightOpacity > 0) ||
          phase === 'MORPHING_IN' ||
          phase === 'CLEARING_CONTEXT') &&
          highlightRect && (
          <>
            <div
              className="absolute inset-0 pointer-events-none z-10"
              style={{
                background: `rgba(0, 0, 0, ${highlightOpacity})`,
                clipPath: `polygon(
                  0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                  ${highlightRect.left}px ${highlightRect.top}px,
                  ${highlightRect.left}px ${highlightRect.top + highlightRect.height}px,
                  ${highlightRect.left + highlightRect.width}px ${highlightRect.top + highlightRect.height}px,
                  ${highlightRect.left + highlightRect.width}px ${highlightRect.top}px,
                  ${highlightRect.left}px ${highlightRect.top}px
                )`,
              }}
            />
            <div
              className="absolute pointer-events-none z-20"
              style={{
                left: highlightRect.left,
                top: highlightRect.top,
                width: highlightRect.width,
                height: highlightRect.height,
                border: '2px solid rgb(147, 51, 234)',
                borderRadius: 6,
                opacity: phase === 'HIGHLIGHTING' ? highlightOpacity / 0.6 : 1 - clearProgress,
                boxShadow: phase === 'MORPHING_IN' || phase === 'CLEARING_CONTEXT'
                  ? '0 12px 28px rgba(0, 0, 0, 0.12)'
                  : undefined,
              }}
            />
          </>
        )}

        {phase === 'CLEARING_CONTEXT' && clearProgress > 0 && (
          <div
            className="absolute inset-0 pointer-events-none z-30 transition-opacity"
            style={{
              opacity: clearProgress,
              background: theme === 'dark'
                ? 'rgba(31, 41, 55, 0.94)'
                : 'rgba(255, 255, 255, 0.96)',
            }}
          />
        )}

        {phase === 'REPLAYING' && replay.totalCandles > 0 && (
          <div className="absolute bottom-2 left-4 right-4 z-10">
            <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
