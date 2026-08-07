'use client'

import Link from 'next/link'
import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react'
import { Liveline } from 'liveline'
import type { CandlePoint } from 'liveline'
import { useTheme } from '@/components/ThemeProvider'
import { useMultiStream } from '@/lib/hooks/use-multi-stream'
import type { LiveStreamState, StreamCandle } from '@/lib/hooks/use-live-stream'
import { useReplay } from '@/lib/hooks/use-replay'
import type { ReplayConfig, ReplaySpeed } from '@/lib/hooks/use-replay'
import MarketMoversTable from '@/components/MarketMoversTable'
import type { MoverData } from '@/app/actions/market-movers'
import { getMarketStatus, getSessionLabel, getTradingDate, type MarketSession } from '@/lib/market-hours'
import { isUsMarketEarlyClose } from '@/lib/market-calendar'
import {
  buildPulseTodayCockpitSnapshot,
} from '@/lib/pulse-today-utils'
import type { StockWhyMovingResult } from '@/lib/stock-why-moving'

type ThemeMode = 'light' | 'dark'

export function formatPrice(v: number) {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/* ───────── Liveline chart data hook ───────── */

interface ChartData {
  candles: CandlePoint[]
  liveCandle: CandlePoint | undefined
  lineData: { time: number; value: number }[]
  lineValue: number | undefined
}

function useChartData(stream: LiveStreamState, enabled = true): ChartData | null {
  return useMemo(() => {
    if (!enabled || stream.candles.length === 0) return null

    const allCandles: CandlePoint[] = stream.candles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))

    const committed = allCandles.length > 1 ? allCandles.slice(0, -1) : allCandles
    const liveCandle = stream.liveCandle
      ? {
          time: stream.liveCandle.time,
          open: stream.liveCandle.open,
          high: stream.liveCandle.high,
          low: stream.liveCandle.low,
          close: stream.liveCandle.close,
        }
      : allCandles.length > 0
        ? allCandles[allCandles.length - 1]
        : undefined

    const lineData = allCandles.map((c) => ({ time: c.time, value: c.close }))
    const lineValue =
      stream.liveCandle?.close ??
      (lineData.length > 0 ? lineData[lineData.length - 1].value : undefined)

    return { candles: committed, liveCandle, lineData, lineValue }
  }, [enabled, stream.candles, stream.liveCandle])
}

/* ───────── Degen scale for exaggerated mini chart ───────── */

function useDegenScale(
  lastPrice: number | null,
  dayHigh: number | null,
  dayLow: number | null,
  baseScale = 1.5,
): { scale: number; downMomentum: boolean } {
  return useMemo(() => {
    if (lastPrice === null || dayHigh === null || dayLow === null || dayHigh === 0 || dayLow === 0) {
      return { scale: baseScale, downMomentum: true }
    }

    const proximityThreshold = 0.002
    const distToHigh = Math.abs(lastPrice - dayHigh) / dayHigh
    const distToLow = Math.abs(lastPrice - dayLow) / dayLow
    const nearestDist = Math.min(distToHigh, distToLow)

    if (lastPrice > dayHigh || lastPrice < dayLow) {
      return { scale: 5, downMomentum: true }
    }

    if (nearestDist < proximityThreshold) {
      const intensity = 1 - nearestDist / proximityThreshold
      return { scale: baseScale + intensity * 3.5, downMomentum: true }
    }

    return { scale: baseScale, downMomentum: true }
  }, [lastPrice, dayHigh, dayLow, baseScale])
}

/* ───────── Day candles types & hooks (same as PulseLabDashboard) ───────── */

export interface DayCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
}

export interface DayCandleData {
  candles: DayCandle[]
  previousClose: number | null
  changePct: number | null
}

interface Candle5Min {
  date: string
  open: number
  high: number
  low: number
  close: number
}

function aggregateTo5Min(candles: DayCandle[]): Candle5Min[] {
  if (candles.length === 0) return []

  const buckets = new Map<string, DayCandle[]>()
  for (const c of candles) {
    const parts = c.date.split(' ')
    const timeParts = (parts[1] ?? '00:00:00').split(':')
    const hour = timeParts[0]
    const minute = Math.floor(parseInt(timeParts[1] ?? '0', 10) / 5) * 5
    const key = `${parts[0]} ${hour}:${String(minute).padStart(2, '0')}`
    const arr = buckets.get(key)
    if (arr) arr.push(c)
    else buckets.set(key, [c])
  }

  const bars: Candle5Min[] = []
  for (const [key, group] of buckets.entries()) {
    bars.push({
      date: key,
      open: group[0].open,
      high: Math.max(...group.map((g) => g.high)),
      low: Math.min(...group.map((g) => g.low)),
      close: group[group.length - 1].close,
    })
  }
  return bars
}

function sortCandles(candles: DayCandle[]) {
  return [...candles].sort((a, b) => a.date.localeCompare(b.date))
}

interface DayCandlesState {
  data: Record<string, DayCandleData>
  loading: boolean
  error: string | null
  retry: () => void
}

export function useDayCandlesState(symbols: readonly string[]): DayCandlesState {
  const [data, setData] = useState<Record<string, DayCandleData>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const symbolsKey = Array.from(new Set(symbols.map((symbol) => symbol.toUpperCase()))).sort().join(',')

  useEffect(() => {
    let cancelled = false
    const activeSymbols = symbolsKey ? symbolsKey.split(',') : []

    if (activeSymbols.length === 0) {
      setLoading(false)
      setError(null)
      return
    }

    async function fetchAll() {
      setLoading(true)
      setError(null)
      const results = await Promise.allSettled(
        activeSymbols.map(async (sym) => {
          const res = await fetch(`/api/stock-intraday/${sym}?interval=1`)
          if (!res.ok) throw new Error(`Chart request failed with status ${res.status}`)
          return { sym, json: await res.json() }
        })
      )

      if (cancelled) return

      const next: Record<string, DayCandleData> = {}
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          const { sym, json } = r.value
          const candles = sortCandles((json.todayOHLC ?? []) as DayCandle[])
          const previousClose: number | null = json.previousClose ?? null
          let changePct: number | null = null
          if (previousClose && previousClose > 0 && candles.length > 0) {
            const last = candles[candles.length - 1].close
            changePct = ((last - previousClose) / previousClose) * 100
          }
          next[sym] = { candles, previousClose, changePct }
        }
      }

      if (Object.keys(next).length > 0) {
        setData((current) => ({ ...current, ...next }))
        setError(null)
      } else {
        setError('Intraday chart data is temporarily unavailable.')
      }
      setLoading(false)
    }

    void fetchAll()
    const id = setInterval(fetchAll, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbolsKey, refreshKey])

  const retry = useCallback(() => setRefreshKey((current) => current + 1), [])

  return { data, loading, error, retry }
}

export function useDayCandles(symbols: readonly string[]): Record<string, DayCandleData> {
  return useDayCandlesState(symbols).data
}

/* ───────── Candle time parsing helpers ───────── */

export const MARKET_OPEN_MINUTES = 9 * 60 + 30 // 9:30 AM
const PREMARKET_START_MINUTES = 4 * 60
const CASH_END_MINUTES = 16 * 60
const EARLY_CASH_END_MINUTES = 13 * 60
const AFTERHOURS_END_MINUTES = 20 * 60

type IntradaySession = 'premarket' | 'cash' | 'afterhours'

interface SessionWindow {
  session: IntradaySession
  startMinutes: number
  endMinutes: number
  hourLabels: Array<{ hour: number; minute?: number; label: string }>
}

const SESSION_WINDOWS: Record<IntradaySession, SessionWindow> = {
  premarket: {
    session: 'premarket',
    startMinutes: PREMARKET_START_MINUTES,
    endMinutes: MARKET_OPEN_MINUTES,
    hourLabels: [
      { hour: 5, label: '5AM' },
      { hour: 6, label: '6AM' },
      { hour: 7, label: '7AM' },
      { hour: 8, label: '8AM' },
      { hour: 9, label: '9AM' },
    ],
  },
  cash: {
    session: 'cash',
    startMinutes: MARKET_OPEN_MINUTES,
    endMinutes: CASH_END_MINUTES,
    hourLabels: [
      { hour: 10, label: '10AM' },
      { hour: 11, label: '11AM' },
      { hour: 12, label: '12PM' },
      { hour: 13, label: '1PM' },
      { hour: 14, label: '2PM' },
      { hour: 15, label: '3PM' },
    ],
  },
  afterhours: {
    session: 'afterhours',
    startMinutes: CASH_END_MINUTES,
    endMinutes: AFTERHOURS_END_MINUTES,
    hourLabels: [
      { hour: 17, label: '5PM' },
      { hour: 18, label: '6PM' },
      { hour: 19, label: '7PM' },
    ],
  },
}

function getCandleTimeParts(candle: { date: string }) {
  const parts = candle.date.split(' ')
  const timeParts = (parts[1] ?? '00:00:00').split(':')

  return {
    hour: parseInt(timeParts[0] ?? '0', 10),
    minute: parseInt(timeParts[1] ?? '0', 10),
    second: parseInt(timeParts[2] ?? '0', 10),
  }
}

function getCandleTotalMinutes(candle: { date: string }): number {
  const { hour, minute } = getCandleTimeParts(candle)
  return hour * 60 + minute
}

function getCandleDate(candle: { date: string }): string | null {
  const date = candle.date.split(' ')[0]
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
}

function getSessionWindowForDate(session: IntradaySession, date: string | null): SessionWindow {
  if (!date || !isUsMarketEarlyClose(date)) return SESSION_WINDOWS[session]

  if (session === 'cash') {
    return {
      ...SESSION_WINDOWS.cash,
      endMinutes: EARLY_CASH_END_MINUTES,
      hourLabels: [
        { hour: 10, label: '10AM' },
        { hour: 11, label: '11AM' },
        { hour: 12, label: '12PM' },
      ],
    }
  }

  if (session === 'afterhours') {
    return {
      ...SESSION_WINDOWS.afterhours,
      startMinutes: EARLY_CASH_END_MINUTES,
      hourLabels: [
        { hour: 14, label: '2PM' },
        { hour: 15, label: '3PM' },
        { hour: 16, label: '4PM' },
        { hour: 17, label: '5PM' },
        { hour: 18, label: '6PM' },
        { hour: 19, label: '7PM' },
      ],
    }
  }

  return SESSION_WINDOWS.premarket
}

export function getSessionWindowForCandles(candles: { date: string }[]): SessionWindow {
  const latest = candles[candles.length - 1]
  if (!latest) return SESSION_WINDOWS.cash

  const date = getCandleDate(latest)
  const cashEndMinutes = date && isUsMarketEarlyClose(date)
    ? EARLY_CASH_END_MINUTES
    : CASH_END_MINUTES
  const totalMinutes = getCandleTotalMinutes(latest)
  if (totalMinutes >= cashEndMinutes) return getSessionWindowForDate('afterhours', date)
  if (totalMinutes >= MARKET_OPEN_MINUTES) return getSessionWindowForDate('cash', date)
  if (totalMinutes >= PREMARKET_START_MINUTES) return getSessionWindowForDate('premarket', date)
  return getSessionWindowForDate('cash', date)
}

export function getSessionExtremesForCandles(
  candles: Array<{ date: string; high: number; low: number }>,
): { session: IntradaySession; dayHigh: number | null; dayLow: number | null } {
  const sessionWindow = getSessionWindowForCandles(candles)

  let dayHigh = Number.NEGATIVE_INFINITY
  let dayLow = Number.POSITIVE_INFINITY

  for (const candle of candles) {
    const totalMinutes = getCandleTotalMinutes(candle)
    if (totalMinutes < sessionWindow.startMinutes || totalMinutes >= sessionWindow.endMinutes) {
      continue
    }

    if (Number.isFinite(candle.high)) dayHigh = Math.max(dayHigh, candle.high)
    if (Number.isFinite(candle.low)) dayLow = Math.min(dayLow, candle.low)
  }

  return {
    session: sessionWindow.session,
    dayHigh: Number.isFinite(dayHigh) ? dayHigh : null,
    dayLow: Number.isFinite(dayLow) ? dayLow : null,
  }
}

export interface PulseLevelLine {
  id: string
  value: number
  label: string
  tone: 'high' | 'low'
  emphasis: 'primary' | 'secondary'
}

interface PulseSessionLevels {
  activeSession: IntradaySession
  lines: PulseLevelLine[]
  primaryHigh: PulseLevelLine | null
  primaryLow: PulseLevelLine | null
}

function getSessionLabelPrefix(session: IntradaySession): string {
  if (session === 'premarket') return 'Premarket '
  return ''
}

function getExtremesForSession(
  candles: Array<{ date: string; high: number; low: number }>,
  session: IntradaySession,
): { dayHigh: number | null; dayLow: number | null } {
  const sessionWindow = getSessionWindowForDate(
    session,
    candles.length > 0 ? getCandleDate(candles[candles.length - 1]) : null,
  )
  let dayHigh = Number.NEGATIVE_INFINITY
  let dayLow = Number.POSITIVE_INFINITY

  for (const candle of candles) {
    const totalMinutes = getCandleTotalMinutes(candle)
    if (totalMinutes < sessionWindow.startMinutes || totalMinutes >= sessionWindow.endMinutes) {
      continue
    }

    if (Number.isFinite(candle.high)) dayHigh = Math.max(dayHigh, candle.high)
    if (Number.isFinite(candle.low)) dayLow = Math.min(dayLow, candle.low)
  }

  return {
    dayHigh: Number.isFinite(dayHigh) ? dayHigh : null,
    dayLow: Number.isFinite(dayLow) ? dayLow : null,
  }
}

export function buildPulseSessionLevels(
  candles: Array<{ date: string; high: number; low: number }>,
): PulseSessionLevels {
  const activeSession = getSessionWindowForCandles(candles).session
  const primarySession = activeSession === 'afterhours' ? 'cash' : activeSession
  const activeExtremes = getExtremesForSession(candles, primarySession)
  const lines: PulseLevelLine[] = []
  const activePrefix = getSessionLabelPrefix(primarySession)

  const primaryHigh = activeExtremes.dayHigh !== null
    ? {
        id: `${primarySession}-high`,
        value: activeExtremes.dayHigh,
        label: `${activePrefix}HOD`,
        tone: 'high' as const,
        emphasis: 'primary' as const,
      }
    : null

  const primaryLow = activeExtremes.dayLow !== null
    ? {
        id: `${primarySession}-low`,
        value: activeExtremes.dayLow,
        label: `${activePrefix}LOD`,
        tone: 'low' as const,
        emphasis: 'primary' as const,
      }
    : null

  if (primaryHigh) lines.push(primaryHigh)
  if (primaryLow) lines.push(primaryLow)

  return { activeSession, lines, primaryHigh, primaryLow }
}

export function candleMinutesSinceOpen(candle: { date: string }): number {
  return candleMinutesSinceSessionStart(candle, MARKET_OPEN_MINUTES)
}

export function candleSecondsSinceOpen(candle: { date: string }): number {
  return candleSecondsSinceSessionStart(candle, MARKET_OPEN_MINUTES)
}

function candleMinutesSinceSessionStart(candle: { date: string }, sessionStartMinutes: number): number {
  return getCandleTotalMinutes(candle) - sessionStartMinutes
}

function candleSecondsSinceSessionStart(candle: { date: string }, sessionStartMinutes: number): number {
  const { hour, minute, second } = getCandleTimeParts(candle)
  return (hour * 3600 + minute * 60 + second) - sessionStartMinutes * 60
}

/* ───────── FullDayCanvas ───────── */

export interface FullDayCanvasProps {
  candles: DayCandle[]
  previousClose: number | null
  lastPrice: number | null
  dayHigh: number | null
  dayLow: number | null
  levelLines?: PulseLevelLine[]
  lineMode: boolean
  aggregation: '1s' | '10s' | '1min' | '5min'
  theme: ThemeMode
  chartHeight: number
  /** When true, X-axis scales to fit only the visible candles instead of the full 390-min day */
  dynamicXAxis?: boolean
  /** Optional explicit X-axis slot ceiling for anchored zoom sequences. */
  xAxisMaxSlots?: number | null
  /** 0 = fully current aggregation, 1 = fully morphed to target candles */
  morphProgress?: number
  /** The 1min candles to morph into */
  morphTargetCandles?: DayCandle[]
  accessibleLabel?: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyMessage?: string
}

interface CrosshairData {
  x: number
  y: number
  candle: { date: string; open: number; high: number; low: number; close: number }
  time: string
}

export function FullDayCanvas({
  candles: rawCandles,
  previousClose,
  lastPrice,
  dayHigh,
  dayLow,
  levelLines,
  lineMode,
  aggregation,
  theme,
  chartHeight,
  dynamicXAxis = false,
  xAxisMaxSlots = null,
  morphProgress = 0,
  morphTargetCandles,
  accessibleLabel = 'Intraday price chart',
  loading = false,
  error = null,
  onRetry,
  emptyMessage = 'No intraday candles are available for this session.',
}: FullDayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [crosshair, setCrosshair] = useState<CrosshairData | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateWidth = () => setContainerWidth(container.clientWidth)
    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }

    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const sessionWindow = useMemo(() => getSessionWindowForCandles(rawCandles), [rawCandles])
  const resolvedLevelLines = useMemo(() => {
    const explicitLines = (levelLines ?? []).filter((line) => Number.isFinite(line.value) && line.value > 0)
    if (explicitLines.length > 0) return explicitLines

    const fallbackLines: PulseLevelLine[] = []
    if (dayHigh !== null && dayHigh > 0) {
      fallbackLines.push({ id: 'fallback-high', value: dayHigh, label: 'HOD', tone: 'high', emphasis: 'primary' })
    }
    if (dayLow !== null && dayLow > 0) {
      fallbackLines.push({ id: 'fallback-low', value: dayLow, label: 'LOD', tone: 'low', emphasis: 'primary' })
    }
    return fallbackLines
  }, [levelLines, dayHigh, dayLow])

  // Render the currently active session window so premarket and afterhours
  // movers still produce a visible main chart.
  const sessionCandles = useMemo(() => {
    return rawCandles.filter((c) => {
      const totalMins = getCandleTotalMinutes(c)
      return totalMins >= sessionWindow.startMinutes && totalMins < sessionWindow.endMinutes
    })
  }, [rawCandles, sessionWindow])

  const candles = useMemo(() => {
    if (aggregation === '5min') return aggregateTo5Min(sessionCandles)
    // 1s, 10s, and 1min pass through raw candles (second data is pre-bucketed upstream)
    return sessionCandles
  }, [sessionCandles, aggregation])

  const intervalSecs = aggregation === '1s' ? 1 : aggregation === '10s' ? 10 : aggregation === '1min' ? 60 : 300
  const sessionDurationMinutes = sessionWindow.endMinutes - sessionWindow.startMinutes

  // Precompute slot positions for each candle
  const slotMap = useMemo(() => {
    if (aggregation === '1s' || aggregation === '10s') {
      const bucketSize = aggregation === '1s' ? 1 : 10
      return candles.map((c) => {
        const secs = candleSecondsSinceSessionStart(c, sessionWindow.startMinutes)
        return Math.floor(secs / bucketSize)
      })
    }
    const intervalMinutes = aggregation === '1min' ? 1 : 5
    return candles.map((c) => {
      const mins = candleMinutesSinceSessionStart(c, sessionWindow.startMinutes)
      return Math.floor(mins / intervalMinutes)
    })
  }, [candles, aggregation, sessionWindow.startMinutes])

  // Dynamic X-axis: starts at full-day width and never goes below
  // the visible candles × 4, so candles stay compact on the left ~25% at first,
  // then naturally fill more of the chart as the day progresses.
  // 1s: 6.5hrs × 3600 = 23400 slots; 10s: 2340; 1min: 390; 5min: 78
  const fullDaySlots = aggregation === '1s'
    ? sessionDurationMinutes * 60
    : aggregation === '10s'
      ? sessionDurationMinutes * 6
      : aggregation === '1min'
        ? sessionDurationMinutes
        : Math.max(1, Math.floor(sessionDurationMinutes / 5))
  const totalSlots = useMemo(() => {
    if (xAxisMaxSlots !== null) {
      return Math.min(Math.max(xAxisMaxSlots, 1), fullDaySlots)
    }
    if (!dynamicXAxis || slotMap.length === 0) {
      return fullDaySlots
    }
    const maxSlot = Math.max(...slotMap)
    // Second-based modes keep a compact dynamic window so the active replay
    // candles stay visually readable instead of stretching across the full panel.
    const multiplier = aggregation === '1s' ? 1.05 : aggregation === '10s' ? 1.15 : 4
    const minSlots = aggregation === '1s' ? 60 : aggregation === '10s' ? 100 : 40
    return Math.min(Math.max(Math.ceil(maxSlot * multiplier), minSlots), fullDaySlots)
  }, [dynamicXAxis, slotMap, fullDaySlots, xAxisMaxSlots, aggregation])

  // Morph: precompute 1min target slot map and totalSlots
  const isMorphing = morphProgress > 0 && morphProgress < 1 && !!morphTargetCandles && morphTargetCandles.length > 0
  const targetSlotMap = useMemo(() => {
    if (!morphTargetCandles || morphTargetCandles.length === 0) return []
    return morphTargetCandles.map((c) => {
      const mins = candleMinutesSinceOpen(c)
      return Math.floor(mins / 1) // 1min slots
    })
  }, [morphTargetCandles])

  const targetTotalSlots = useMemo(() => {
    if (!dynamicXAxis || targetSlotMap.length === 0) return 390
    const maxSlot = Math.max(...targetSlotMap)
    return Math.min(Math.max(Math.ceil(maxSlot * 4), 40), 390)
  }, [dynamicXAxis, targetSlotMap])

  // Lerp totalSlots during morph for smooth X-axis rescaling
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const effectiveTotalSlots = isMorphing ? lerp(totalSlots, targetTotalSlots, morphProgress) : totalSlots

  // Chart padding
  const padding = { top: 12, right: 64, bottom: 28, left: 20 }

  // Price range — only expands, never contracts, to keep HOD/LOD lines stable
  const stableRangeRef = useRef<{ yMin: number; yMax: number } | null>(null)
  const stableRangeContextRef = useRef<string | null>(null)
  const stableRangeCandleCountRef = useRef(0)
  const latestSessionDate = rawCandles.length > 0
    ? getCandleDate(rawCandles[rawCandles.length - 1])
    : null
  const stableRangeContext = `${latestSessionDate ?? 'empty'}:${sessionWindow.session}`
  if (
    stableRangeContextRef.current !== stableRangeContext ||
    candles.length < stableRangeCandleCountRef.current
  ) {
    stableRangeContextRef.current = stableRangeContext
    stableRangeRef.current = null
  }
  stableRangeCandleCountRef.current = candles.length
  const { yMin, yMax } = useMemo(() => {
    if (candles.length === 0) {
      // Reset means a new replay pass should establish its scale from the
      // opening bars again, not inherit the completed session's extremes.
      stableRangeRef.current = null
      return { yMin: 0, yMax: 1 }
    }
    const allPrices: number[] = []
    for (const c of candles) {
      if (c.high > 0) allPrices.push(c.high)
      if (c.low > 0) allPrices.push(c.low)
    }
    if (previousClose !== null && previousClose > 0) allPrices.push(previousClose)
    if (lastPrice !== null && lastPrice > 0) allPrices.push(lastPrice)
    for (const line of resolvedLevelLines) {
      allPrices.push(line.value)
    }
    const min = Math.min(...allPrices)
    const max = Math.max(...allPrices)
    const range = max - min || 1
    const buffer = range * 0.05
    const newMin = min - buffer
    const newMax = max + buffer

    const prev = stableRangeRef.current
    // Reset when there's no previous range, or when the new data is completely
    // outside the old range (symbol changed to a different price level)
    const noOverlap = prev !== null && (newMin > prev.yMax || newMax < prev.yMin)
    if (prev === null || (prev.yMin === 0 && prev.yMax === 1) || noOverlap) {
      stableRangeRef.current = { yMin: newMin, yMax: newMax }
      return { yMin: newMin, yMax: newMax }
    }

    const stableMin = Math.min(prev.yMin, newMin)
    const stableMax = Math.max(prev.yMax, newMax)
    stableRangeRef.current = { yMin: stableMin, yMax: stableMax }
    return { yMin: stableMin, yMax: stableMax }
  }, [candles, previousClose, lastPrice, resolvedLevelLines])

  // Y-axis label interval (adapted from SimpleCanvasChart)
  const labelInterval = useMemo(() => {
    const range = yMax - yMin
    if (range <= 3) return 0.5
    if (range <= 8) return 2
    if (range <= 30) return 5
    if (range <= 80) return 20
    if (range <= 150) return 50
    if (range <= 300) return 100
    return 200
  }, [yMin, yMax])

  // Draw the chart
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || candles.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const width = containerWidth || container.clientWidth
    const height = chartHeight

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const isDark = theme === 'dark'
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const motionPhase = prefersReducedMotion
      ? 0.5
      : Math.sin(Date.now() / 600) * 0.5 + 0.5

    const chartTop = padding.top
    const chartBottom = height - padding.bottom
    const chartAreaH = chartBottom - chartTop
    const drawLeft = padding.left
    const drawRight = width - padding.right
    const drawW = drawRight - drawLeft
    const yRange = yMax - yMin

    const priceToY = (p: number) => chartTop + (1 - (p - yMin) / yRange) * chartAreaH
    const renderTotalSlots = isMorphing ? effectiveTotalSlots : totalSlots
    const slotToX = (slot: number) => drawLeft + (slot / renderTotalSlots) * drawW

    // --- Grid lines + Y-axis labels ---
    const gridColor = isDark ? 'rgba(55,65,81,0.5)' : 'rgba(229,231,235,0.8)'
    const textColor = isDark ? '#9ca3af' : '#6b7280'

    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'left'

    const firstLabel = Math.ceil(yMin / labelInterval) * labelInterval
    for (let price = firstLabel; price <= yMax; price += labelInterval) {
      const y = priceToY(price)
      if (y < chartTop || y > chartBottom) continue
      // Grid line
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 0.5
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(drawLeft, y)
      ctx.lineTo(drawRight, y)
      ctx.stroke()
      ctx.setLineDash([])
      // Label
      ctx.fillStyle = textColor
      ctx.fillText(price.toFixed(price < 10 ? 2 : price < 1000 ? 1 : 0), drawRight + 4, y + 3)
    }

    // --- X-axis time labels ---
    ctx.textAlign = 'center'
    ctx.fillStyle = textColor
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

    if (dynamicXAxis && candles.length > 0) {
      // During morph, use 1min-scale for labels since that's the target
      const labelIntervalSecs = isMorphing ? 60 : intervalSecs
      const maxSlot = isMorphing && targetSlotMap.length > 0
        ? Math.max(...targetSlotMap)
        : Math.max(xAxisMaxSlots ?? 0, ...slotMap)
      const visibleMins = isMorphing
        ? maxSlot // already in minute-slots
        : (maxSlot * intervalSecs) / 60
      // Choose label spacing in seconds, then widen it when the currently
      // revealed span occupies only a small part of a narrow canvas. This
      // avoids painting several timestamp strings on top of one another at
      // the start of an adaptive replay.
      const preferredLabelStepSecs = aggregation === '1s'
        ? visibleMins <= 0.5 ? 5
          : visibleMins <= 2 ? 10
          : visibleMins <= 5 ? 30
          : visibleMins <= 15 ? 60
          : visibleMins <= 60 ? 300
          : visibleMins <= 120 ? 900
          : visibleMins <= 240 ? 1800
          : 3600
        : aggregation === '10s'
        ? visibleMins <= 2 ? 10
          : visibleMins <= 5 ? 30
          : visibleMins <= 15 ? 60
          : visibleMins <= 60 ? 300
          : visibleMins <= 120 ? 900
          : visibleMins <= 240 ? 1800
          : 3600
        : visibleMins <= 2 ? 30
          : visibleMins <= 5 ? 60
          : visibleMins <= 15 ? 300
          : visibleMins <= 60 ? 900
          : visibleMins <= 120 ? 1800
          : visibleMins <= 240 ? 3600
          : 7200
      const renderedVisibleWidth = renderTotalSlots > 0
        ? (maxSlot / renderTotalSlots) * drawW
        : 0
      const maxReadableLabels = Math.max(1, Math.floor(renderedVisibleWidth / 72))
      const minimumReadableStepSecs = maxSlot > 0
        ? (maxSlot * labelIntervalSecs) / maxReadableLabels
        : preferredLabelStepSecs
      const niceLabelSteps = [5, 10, 15, 30, 60, 120, 180, 300, 600, 900, 1800, 3600, 7200]
      const desiredLabelStepSecs = Math.max(preferredLabelStepSecs, minimumReadableStepSecs)
      const labelStepSecs = niceLabelSteps.find((step) => step >= desiredLabelStepSecs) ?? 7200
      const labelStepSlots = Math.max(1, Math.floor(labelStepSecs / labelIntervalSecs))

      for (let slot = labelStepSlots; slot <= maxSlot; slot += labelStepSlots) {
        const secsFromOpen = slot * labelIntervalSecs
        const totalSecs = MARKET_OPEN_MINUTES * 60 + secsFromOpen
        const h24 = Math.floor(totalSecs / 3600)
        const m = Math.floor((totalSecs % 3600) / 60)
        const s = totalSecs % 60
        const ampm = h24 >= 12 ? 'PM' : 'AM'
        const h12 = h24 > 12 ? h24 - 12 : h24 === 0 ? 12 : h24
        // Show seconds for sub-minute labels, otherwise just H:MM
        const label = labelStepSecs < 60
          ? `${h12}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, '0')}`
        const x = slotToX(slot)
        if (x >= drawLeft + 20 && x <= drawRight - 20) {
          ctx.fillText(label, x, height - 6)
        }
      }
    } else {
      // Fixed: full-day hour labels
      for (const { hour, minute = 0, label } of sessionWindow.hourLabels) {
        const minsFromSessionStart = (hour * 60 + minute) - sessionWindow.startMinutes
        const slot = Math.floor((minsFromSessionStart * 60) / intervalSecs)
        const x = slotToX(slot)
        if (x >= drawLeft && x <= drawRight) {
          ctx.fillText(label, x, height - 6)
        }
      }
    }

    // --- Axis border lines (solid, subtle) ---
    const axisBorderColor = isDark ? 'rgba(75,85,99,0.6)' : 'rgba(209,213,219,0.8)'
    ctx.strokeStyle = axisBorderColor
    ctx.lineWidth = 1
    ctx.setLineDash([])
    // Right Y-axis border
    ctx.beginPath()
    ctx.moveTo(drawRight, chartTop)
    ctx.lineTo(drawRight, chartBottom)
    ctx.stroke()
    // Bottom X-axis border
    ctx.beginPath()
    ctx.moveTo(drawLeft, chartBottom)
    ctx.lineTo(drawRight, chartBottom)
    ctx.stroke()

    // --- Clip to chart area so nothing draws in the left/right margins ---
    ctx.save()
    ctx.beginPath()
    ctx.rect(drawLeft, chartTop, drawW, chartAreaH)
    ctx.clip()

    // --- Previous close dashed line ---
    if (previousClose !== null) {
      const prevY = priceToY(previousClose)
      if (prevY >= chartTop && prevY <= chartBottom) {
        ctx.save()
        ctx.setLineDash([5, 4])
        ctx.strokeStyle = isDark ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.45)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(drawLeft, prevY)
        ctx.lineTo(drawRight, prevY)
        ctx.stroke()
        ctx.restore()
        // Label
        ctx.fillStyle = isDark ? 'rgba(239,68,68,0.7)' : 'rgba(239,68,68,0.6)'
        ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(`Prev $${formatPrice(previousClose)}`, drawRight - 4, prevY - 4)
        ctx.textAlign = 'center'
      }
    }

    // --- Session key levels (HOD/LOD + optional after-hours premarket carryover levels) ---
    const highLevelLines = resolvedLevelLines
      .filter((line) => line.tone === 'high')
      .sort((a, b) => b.value - a.value)
    const lowLevelLines = resolvedLevelLines
      .filter((line) => line.tone === 'low')
      .sort((a, b) => a.value - b.value)

    const drawLevelLine = (line: PulseLevelLine, index: number) => {
      const y = priceToY(line.value)
      if (y < chartTop - 5 || y > chartBottom + 5) return

      const isSecondary = line.emphasis === 'secondary'
      const isLow = line.tone === 'low'
      const nearLowLevel = isLow && lastPrice !== null && line.value > 0
        ? Math.abs(lastPrice - line.value) / line.value < 0.005
        : false

      ctx.save()
      ctx.setLineDash(isSecondary ? [6, 4] : [3, 3])

      if (nearLowLevel) {
        const pulse = motionPhase
        const alpha = 0.35 + pulse * 0.65
        ctx.strokeStyle = `rgba(239,68,68,${alpha})`
        ctx.lineWidth = 1 + pulse * 1.5
        ctx.shadowColor = 'rgba(239,68,68,0.5)'
        ctx.shadowBlur = pulse * 10
      } else if (line.tone === 'high') {
        ctx.strokeStyle = isDark
          ? `rgba(34,197,94,${isSecondary ? 0.28 : 0.5})`
          : `rgba(34,197,94,${isSecondary ? 0.22 : 0.45})`
        ctx.lineWidth = isSecondary ? 0.75 : 1
      } else {
        ctx.strokeStyle = isDark
          ? `rgba(239,68,68,${isSecondary ? 0.28 : 0.5})`
          : `rgba(239,68,68,${isSecondary ? 0.22 : 0.45})`
        ctx.lineWidth = isSecondary ? 0.75 : 1
      }

      ctx.beginPath()
      ctx.moveTo(drawLeft, y)
      ctx.lineTo(drawRight, y)
      ctx.stroke()
      ctx.restore()

      const baseLabelAlpha = nearLowLevel
        ? 0.5 + motionPhase * 0.5
        : isSecondary
          ? (isDark ? 0.52 : 0.44)
          : (isDark ? 0.7 : 0.6)
      const labelColor = line.tone === 'high'
        ? `rgba(34,197,94,${baseLabelAlpha})`
        : `rgba(239,68,68,${baseLabelAlpha})`

      ctx.fillStyle = labelColor
      ctx.font = `${isSecondary ? '11px' : '13px'} -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
      ctx.textAlign = 'right'
      const labelY = line.tone === 'high'
        ? y - 4 - index * 12
        : y + 12 + index * 12
      ctx.fillText(`${line.label} $${formatPrice(line.value)}`, drawRight - 4, labelY)
    }

    highLevelLines.forEach((line, index) => drawLevelLine(line, index))
    lowLevelLines.forEach((line, index) => drawLevelLine(line, index))

    // --- Draw candles or line ---
    if (lineMode) {
      // Line mode: connect close prices
      if (candles.length >= 2) {
        const isUp = lastPrice !== null && previousClose !== null ? lastPrice >= previousClose : true
        const lineColor = isUp ? '#22c55e' : '#ef4444'

        ctx.beginPath()
        for (let i = 0; i < candles.length; i++) {
          const slot = slotMap[i]
          const x = slotToX(slot + 0.5)
          const y = priceToY(candles[i].close)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Fill under line
        const lastSlot = slotMap[candles.length - 1]
        ctx.lineTo(slotToX(lastSlot + 0.5), chartBottom)
        ctx.lineTo(slotToX(slotMap[0] + 0.5), chartBottom)
        ctx.closePath()
        ctx.fillStyle = isUp ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)'
        ctx.fill()
      }
    } else if (isMorphing && morphTargetCandles && morphTargetCandles.length > 0) {
      // ═══ MORPH MODE: interpolate 10s candles toward 1min positions ═══
      const green = isDark ? '#4ade80' : '#22c55e'
      const red = isDark ? '#f87171' : '#ef4444'

      // Compute body widths for both scales
      const barSpacing10s = drawW / totalSlots
      const barSpacing1min = drawW / targetTotalSlots
      const bodyWidth10s = Math.min(Math.max(barSpacing10s * 0.7, 2), 16)
      const bodyWidth1min = Math.min(Math.max(barSpacing1min * 0.7, 2), 10)

      // Build a lookup: for each 10s candle, find its parent 1min group index
      // Each 10s candle maps to a 1min target by flooring its seconds-since-open to 60s
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i]
        const slot10s = slotMap[i]
        const secsSinceOpen = candleSecondsSinceOpen(c)
        const targetSlot1min = Math.floor(secsSinceOpen / 60) // 1min slot index

        // Compute interpolated position
        const x10s = (slot10s + 0.5) / totalSlots * drawW
        const x1min = (targetSlot1min + 0.5) / targetTotalSlots * drawW
        const cx = drawLeft + lerp(x10s, x1min, morphProgress)

        // Interpolate body width
        const bw = lerp(bodyWidth10s, bodyWidth1min, morphProgress)

        // Find the target 1min candle to lerp OHLC toward
        const targetIdx = targetSlotMap.indexOf(targetSlot1min)
        const target1min = targetIdx >= 0 ? morphTargetCandles[targetIdx] : null

        // Lerp OHLC values toward the merged 1min candle
        const lerpO = target1min ? lerp(c.open, target1min.open, morphProgress) : c.open
        const lerpH = target1min ? lerp(c.high, target1min.high, morphProgress) : c.high
        const lerpL = target1min ? lerp(c.low, target1min.low, morphProgress) : c.low
        const lerpC = target1min ? lerp(c.close, target1min.close, morphProgress) : c.close

        const isUp = lerpC >= lerpO
        const color = isUp ? green : red

        // Wick
        const highY = priceToY(lerpH)
        const lowY = priceToY(lerpL)
        ctx.beginPath()
        ctx.moveTo(Math.round(cx) + 0.5, highY)
        ctx.lineTo(Math.round(cx) + 0.5, lowY)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.stroke()

        // Body
        const openY = priceToY(lerpO)
        const closeY = priceToY(lerpC)
        const bodyTop = Math.min(openY, closeY)
        const bodyH = Math.max(Math.abs(closeY - openY), 1)
        ctx.fillStyle = color
        ctx.fillRect(cx - bw / 2, bodyTop, bw, bodyH)
      }
    } else {
      // Candle mode — wider bodies for 10s candles, tighter for 1s/1min/5min
      const barSpacing = drawW / renderTotalSlots
      const maxBody = aggregation === '1s' ? 8 : aggregation === '10s' ? 16 : 10
      const bodyWidth = Math.min(Math.max(barSpacing * 0.7, 2), maxBody)

      for (let i = 0; i < candles.length; i++) {
        const c = candles[i]
        const slot = slotMap[i]
        const cx = slotToX(slot + 0.5)
        const isUp = c.close >= c.open
        const green = isDark ? '#4ade80' : '#22c55e'
        const red = isDark ? '#f87171' : '#ef4444'
        const color = isUp ? green : red

        // Wick
        const highY = priceToY(c.high)
        const lowY = priceToY(c.low)
        ctx.beginPath()
        ctx.moveTo(Math.round(cx) + 0.5, highY)
        ctx.lineTo(Math.round(cx) + 0.5, lowY)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.stroke()

        // Body
        const openY = priceToY(c.open)
        const closeY = priceToY(c.close)
        const bodyTop = Math.min(openY, closeY)
        const bodyH = Math.max(Math.abs(closeY - openY), 1)
        ctx.fillStyle = color
        ctx.fillRect(cx - bodyWidth / 2, bodyTop, bodyWidth, bodyH)
      }
    }

    // --- Restore from chart-area clip ---
    ctx.restore()

    // --- Live price pill badge at right edge ---
    if (lastPrice !== null && candles.length > 0) {
      const lastSlot = slotMap[candles.length - 1]
      const tipX = slotToX(lastSlot + 1)
      const tipY = priceToY(lastPrice)

      // Pulsing dot (only in fixed X-axis / live mode)
      const isUp = previousClose !== null ? lastPrice >= previousClose : true
      if (!dynamicXAxis) {
        const dotColor = isUp ? '#22c55e' : '#ef4444'
        ctx.beginPath()
        ctx.arc(tipX, tipY, 3, 0, Math.PI * 2)
        ctx.fillStyle = dotColor
        ctx.fill()
      }

      // Pill badge on Y-axis
      const priceText = formatPrice(lastPrice)
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      const tw = ctx.measureText(priceText).width
      const pillPad = 4
      const pillH = 16
      const pillW = tw + pillPad * 2
      const pillX = drawRight + 1
      const pillY = tipY - pillH / 2

      // Background
      ctx.fillStyle = isUp ? '#22c55e' : '#ef4444'
      ctx.beginPath()
      const r = 3
      ctx.moveTo(pillX + r, pillY)
      ctx.lineTo(pillX + pillW - r, pillY)
      ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + r)
      ctx.lineTo(pillX + pillW, pillY + pillH - r)
      ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - r, pillY + pillH)
      ctx.lineTo(pillX + r, pillY + pillH)
      ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - r)
      ctx.lineTo(pillX, pillY + r)
      ctx.quadraticCurveTo(pillX, pillY, pillX + r, pillY)
      ctx.closePath()
      ctx.fill()

      // Text
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.fillText(priceText, pillX + pillPad, tipY + 3.5)
    }

    // --- Crosshair ---
    if (crosshair) {
      // Vertical line
      ctx.setLineDash([2, 2])
      ctx.strokeStyle = isDark ? 'rgba(156,163,175,0.5)' : 'rgba(107,114,128,0.5)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(crosshair.x, chartTop)
      ctx.lineTo(crosshair.x, chartBottom)
      ctx.stroke()

      // Horizontal line
      ctx.beginPath()
      ctx.moveTo(drawLeft, crosshair.y)
      ctx.lineTo(drawRight, crosshair.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Price label above cursor
      const priceLabel = `$${formatPrice(crosshair.candle.close)}`
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      const labelW = ctx.measureText(priceLabel).width + 10
      const labelH = 18
      const labelX = crosshair.x - labelW / 2
      const labelY = crosshair.y - labelH - 6

      ctx.fillStyle = isDark ? 'rgba(31,41,55,0.95)' : 'rgba(255,255,255,0.95)'
      ctx.strokeStyle = isDark ? 'rgba(75,85,99,0.6)' : 'rgba(209,213,219,0.8)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(labelX, labelY, labelW, labelH, 3)
      ctx.fill()
      ctx.stroke()

      ctx.fillStyle = isDark ? '#e5e7eb' : '#374151'
      ctx.textAlign = 'center'
      ctx.fillText(priceLabel, crosshair.x, labelY + 13)
    }
  }, [candles, slotMap, previousClose, lastPrice, resolvedLevelLines, lineMode, aggregation, theme, chartHeight, containerWidth, crosshair, yMin, yMax, totalSlots, labelInterval, dynamicXAxis, xAxisMaxSlots, padding.top, padding.right, padding.bottom, padding.left, morphProgress, morphTargetCandles, isMorphing, effectiveTotalSlots, targetSlotMap, targetTotalSlots, sessionWindow, intervalSecs])

  // Mouse handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (candles.length === 0) return
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const canvas = canvasRef.current
        const container = containerRef.current
        if (!canvas || !container) return
        const rect = canvas.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const drawLeft = padding.left
        const drawRight = container.clientWidth - padding.right
        const drawW = drawRight - drawLeft

        // Find nearest candle by x position
        const mouseSlots = isMorphing ? effectiveTotalSlots : totalSlots
        const fraction = (mouseX - drawLeft) / drawW
        const targetSlot = Math.round(fraction * mouseSlots)

        let closest = 0
        let closestDist = Infinity
        for (let i = 0; i < slotMap.length; i++) {
          const dist = Math.abs(slotMap[i] - targetSlot)
          if (dist < closestDist) {
            closestDist = dist
            closest = i
          }
        }

        const c = candles[closest]
        const slot = slotMap[closest]
        const x = drawLeft + ((slot + 0.5) / mouseSlots) * drawW

        // Format time from candle date
        const parts = c.date.split(' ')
        const timePart = parts[1] ?? '00:00'
        const tp = timePart.split(':')
        let h = parseInt(tp[0], 10)
        const m = tp[1] ?? '00'
        const s = tp[2] ?? '00'
        const ampm = h >= 12 ? 'PM' : 'AM'
        if (h > 12) h -= 12
        if (h === 0) h = 12
        const timeStr = aggregation === '1s' || aggregation === '10s'
          ? `${h}:${m}:${s} ${ampm}`
          : `${h}:${m} ${ampm}`

        setCrosshair({ x, y: mouseY, candle: c, time: timeStr })
      })
    },
    [candles, slotMap, totalSlots, padding.left, padding.right, isMorphing, effectiveTotalSlots, aggregation]
  )

  const handleMouseLeave = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setCrosshair(null)
  }, [])

  if (candles.length === 0) {
    return (
      <div
        ref={containerRef}
        role={error ? 'alert' : 'status'}
        aria-live="polite"
        className="flex w-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-gray-500 dark:text-gray-400"
        style={{ height: chartHeight }}
      >
        <p>
          {error
            ? error
            : loading
              ? 'Loading chart data…'
              : emptyMessage}
        </p>
        {error && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-9 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            Retry chart
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full" style={{ height: chartHeight }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={accessibleLabel}
        className="w-full h-full"
        style={{ display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {accessibleLabel}
      </canvas>
    </div>
  )
}

/* ───────── PulseTodayCard ───────── */

interface PulseTodayCardProps {
  symbol: string
  dayData: DayCandleData | undefined
  dayDataLoading?: boolean
  dayDataError?: string | null
  onRetryDayData?: () => void
  emptyMessage?: string
  enableLiveDetail?: boolean
  mergeStreamIntoDayData?: boolean
  stream1s: LiveStreamState
  stream10s: LiveStreamState
  theme: ThemeMode
  chartHeight?: number
  dynamicXAxis?: boolean
  /** When set, overrides the internal 1m/5m aggregation and hides the toggle */
  forceAggregation?: '10s' | '1min' | '5min'
  /** 0 = fully current aggregation, 1 = fully morphed to target candles */
  morphProgress?: number
  /** The 1min candles to morph into */
  morphTargetCandles?: DayCandle[]
}

type PipTimeframe = '1s' | '10s'
type PipDock = 'top-right' | 'top-left' | 'bottom-right'

export const PulseTodayCard = memo(function PulseTodayCard({ symbol, dayData, dayDataLoading = false, dayDataError = null, onRetryDayData, emptyMessage, enableLiveDetail = true, mergeStreamIntoDayData = true, stream1s, stream10s, theme, chartHeight = 420, dynamicXAxis = false, forceAggregation, morphProgress = 0, morphTargetCandles }: PulseTodayCardProps) {
  const [lineMode, setLineMode] = useState(false)
  const [internalAgg, setInternalAgg] = useState<'1min' | '5min'>('1min')
  const aggregation = forceAggregation ?? internalAgg
  const [pipVisible, setPipVisible] = useState(true)
  const [pipTimeframe, setPipTimeframe] = useState<PipTimeframe>('10s')
  const [pipLineMode, setPipLineMode] = useState(true)
  const [pipZoom, setPipZoom] = useState<number>(2)
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null)
  const [pipDock, setPipDock] = useState<PipDock>('top-right')
  const [gradientMode, setGradientMode] = useState(true)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origX: number
    origY: number
    maxX: number
    maxY: number
  } | null>(null)
  const pipContainerRef = useRef<HTMLDivElement>(null)
  const pipPanelRef = useRef<HTMLDivElement>(null)
  const pipDockButtonRef = useRef<HTMLButtonElement>(null)
  const hidePipButtonRef = useRef<HTMLButtonElement>(null)
  const showPipButtonRef = useRef<HTMLButtonElement>(null)
  const focusShowPipRef = useRef(false)
  const focusPipControlsRef = useRef(false)

  // The detail chart can be repositioned with any pointer on larger screens.
  // On phones it stays in normal document flow so it can never be clipped.
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if (!window.matchMedia('(min-width: 640px)').matches) return
    if ((e.target as HTMLElement).closest('button, select')) return
    e.preventDefault()
    const pipEl = (e.currentTarget as HTMLElement).parentElement
    const container = pipContainerRef.current
    if (!pipEl || !container) return

    const containerRect = container.getBoundingClientRect()
    const pipRect = pipEl.getBoundingClientRect()

    // Current position of the PIP relative to the container
    const currentX = pipRect.left - containerRect.left
    const currentY = pipRect.top - containerRect.top

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: currentX,
      origY: currentY,
      maxX: Math.max(0, containerRect.width - pipRect.width),
      maxY: Math.max(0, containerRect.height - pipRect.height),
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const handleDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return

    const newX = Math.max(0, Math.min(drag.maxX, drag.origX + e.clientX - drag.startX))
    const newY = Math.max(0, Math.min(drag.maxY, drag.origY + e.clientY - drag.startY))
    setPipPos({ x: newX, y: newY })
  }, [])

  const handleDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  const cyclePipDock = useCallback(() => {
    setPipPos(null)
    setPipDock((current) => current === 'top-right'
      ? 'top-left'
      : current === 'top-left'
        ? 'bottom-right'
        : 'top-right')
  }, [])

  const hidePip = useCallback(() => {
    focusShowPipRef.current = true
    setPipVisible(false)
  }, [])

  const showPip = useCallback(() => {
    focusPipControlsRef.current = true
    setPipVisible(true)
  }, [])

  useEffect(() => {
    if (!pipVisible && focusShowPipRef.current) {
      focusShowPipRef.current = false
      showPipButtonRef.current?.focus()
    } else if (pipVisible && focusPipControlsRef.current) {
      focusPipControlsRef.current = false
      if (window.matchMedia('(min-width: 640px)').matches) pipDockButtonRef.current?.focus()
      else hidePipButtonRef.current?.focus()
    }
  }, [pipVisible])

  useEffect(() => {
    if (!pipVisible) return
    const container = pipContainerRef.current
    const panel = pipPanelRef.current
    if (!container || !panel) return

    const clampPosition = () => {
      if (!window.matchMedia('(min-width: 640px)').matches) return
      const containerRect = container.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      setPipPos((current) => {
        if (!current) return current
        const next = {
          x: Math.max(0, Math.min(Math.max(0, containerRect.width - panelRect.width), current.x)),
          y: Math.max(0, Math.min(Math.max(0, containerRect.height - panelRect.height), current.y)),
        }
        return next.x === current.x && next.y === current.y ? current : next
      })
    }

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampPosition)
      return () => window.removeEventListener('resize', clampPosition)
    }

    const observer = new ResizeObserver(clampPosition)
    observer.observe(container)
    return () => observer.disconnect()
  }, [pipVisible])

  // Use 1s stream for card-level price/change (freshest)
  const stream = stream1s
  const pipStream = pipTimeframe === '1s' ? stream1s : stream10s
  const chartData = useChartData(pipStream, enableLiveDetail)
  const mainChartStream = useMemo(() => {
    const stream10sCount = stream10s.candles.length + (stream10s.liveCandle ? 1 : 0)
    if (stream10sCount > 0) return stream10s

    const stream1sCount = stream1s.candles.length + (stream1s.liveCandle ? 1 : 0)
    if (stream1sCount > 0) return stream1s

    return null
  }, [stream10s, stream1s])
  const mainDayData = useMemo<DayCandleData | undefined>(() => {
    if (!mergeStreamIntoDayData) return dayData

    const mergedCandles = mergeLatestDayCandlesWithStream(
      dayData?.candles ?? [],
      mainChartStream?.candles ?? [],
      mainChartStream?.liveCandle,
    )

    if (mergedCandles.length === 0) {
      return dayData
    }

    return {
      candles: mergedCandles,
      previousClose: mainChartStream?.previousClose ?? dayData?.previousClose ?? null,
      changePct: mainChartStream?.lastChangePct ?? dayData?.changePct ?? null,
    }
  }, [
    dayData,
    mergeStreamIntoDayData,
    mainChartStream?.candles,
    mainChartStream?.liveCandle,
    mainChartStream?.previousClose,
    mainChartStream?.lastChangePct,
  ])
  const levelModel = useMemo(() => buildPulseSessionLevels(mainDayData?.candles ?? []), [mainDayData?.candles])
  const chartLevelLines = useMemo(() => {
    if (levelModel.lines.length > 0) return levelModel.lines

    const fallbackLines: PulseLevelLine[] = []
    const fallbackPrefix = getSessionLabelPrefix(levelModel.activeSession)
    if (stream.dayHigh !== null && stream.dayHigh > 0) {
      fallbackLines.push({
        id: `${levelModel.activeSession}-fallback-high`,
        value: stream.dayHigh,
        label: `${fallbackPrefix}HOD`,
        tone: 'high',
        emphasis: 'primary',
      })
    }
    if (stream.dayLow !== null && stream.dayLow > 0) {
      fallbackLines.push({
        id: `${levelModel.activeSession}-fallback-low`,
        value: stream.dayLow,
        label: `${fallbackPrefix}LOD`,
        tone: 'low',
        emphasis: 'primary',
      })
    }
    return fallbackLines
  }, [levelModel, stream.dayHigh, stream.dayLow])
  const primaryHighLine = chartLevelLines.find((line) => line.tone === 'high' && line.emphasis === 'primary') ?? null
  const primaryLowLine = chartLevelLines.find((line) => line.tone === 'low' && line.emphasis === 'primary') ?? null
  const displayDayHigh = primaryHighLine?.value ?? null
  const displayDayLow = primaryLowLine?.value ?? null
  const degenOpts = useDegenScale(stream.lastPrice, displayDayHigh, displayDayLow)

  const price = stream.lastPrice ?? (mainDayData?.candles.length ? mainDayData.candles[mainDayData.candles.length - 1].close : null)
  const change = stream.lastChange
  // Prefer real-time stream changePct so it stays consistent with change
  const changePct = stream.lastChangePct ?? mainDayData?.changePct ?? null
  const directionValue = changePct ?? change
  const isPositive = directionValue !== null && directionValue >= 0

  const pipBaseWindow = pipTimeframe === '1s' ? 30 : 300
  const pipWindowSecs = pipBaseWindow * pipZoom

  // Pass nearest key level as referenceLine so Liveline keeps it in the Y-axis range
  const pipReferenceLevel = useMemo(() => {
    const lp = stream.lastPrice
    if (lp === null || chartLevelLines.length === 0) return null

    const threshold = 0.01 // 1% of price
    let nearest: PulseLevelLine | null = null
    let nearestDist = Infinity

    for (const line of chartLevelLines) {
      const dist = Math.abs(lp - line.value) / lp
      if (dist <= threshold && dist < nearestDist) {
        nearest = line
        nearestDist = dist
      }
    }

    return nearest
  }, [stream.lastPrice, chartLevelLines])
  const pipRefLine = useMemo(() => {
    if (!pipReferenceLevel) return undefined
    return {
      value: pipReferenceLevel.value,
      label: `${pipReferenceLevel.label} $${formatPrice(pipReferenceLevel.value)}`,
    }
  }, [pipReferenceLevel])

  // Blink reference line red when near LOD (alternates color, never disappears)
  const isNearLOD = useMemo(() => {
    const lp = stream.lastPrice
    if (lp === null || !pipReferenceLevel || pipReferenceLevel.tone !== 'low' || pipReferenceLevel.value === 0) return false
    return Math.abs(lp - pipReferenceLevel.value) / pipReferenceLevel.value < 0.005
  }, [stream.lastPrice, pipReferenceLevel])

  const [lodBlinkRed, setLodBlinkRed] = useState(false)

  useEffect(() => {
    if (!isNearLOD) { setLodBlinkRed(false); return }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLodBlinkRed(true)
      return
    }
    const id = setInterval(() => setLodBlinkRed((v) => !v), 800)
    return () => clearInterval(id)
  }, [isNearLOD])

  const coloredRefLine = useMemo(() => {
    if (!pipRefLine) return undefined
    // Only color the LOD line when blinking red
    if (isNearLOD && pipReferenceLevel?.tone === 'low' && lodBlinkRed) {
      return { ...pipRefLine, color: 'rgba(239, 68, 68, 0.9)' }
    }
    return pipRefLine
  }, [pipRefLine, isNearLOD, lodBlinkRed, pipReferenceLevel])

  // HOD/LOD break flash detection
  const [flashColor, setFlashColor] = useState<'green' | 'red' | null>(null)
  const prevExtremesRef = useRef<{ hod: number | null; lod: number | null }>({ hod: null, lod: null })

  useEffect(() => {
    const hod = stream.dayHigh
    const lod = stream.dayLow
    const prev = prevExtremesRef.current

    // Only flash after we have established a baseline (skip the first data load)
    if (prev.hod !== null && prev.lod !== null) {
      if (hod !== null && hod > prev.hod) {
        setFlashColor('green')
      } else if (lod !== null && lod < prev.lod) {
        setFlashColor('red')
      }
    }

    prevExtremesRef.current = { hod, lod }
  }, [stream.dayHigh, stream.dayLow])

  // Clear flash after animation
  useEffect(() => {
    if (!flashColor) return
    const timer = setTimeout(() => setFlashColor(null), 1200)
    return () => clearTimeout(timer)
  }, [flashColor])

  const pipColor = directionValue === null ? '#64748b' : isPositive ? '#22c55e' : '#ef4444'

  const flashClass = flashColor === 'green'
    ? 'pulse-today-flash-green'
    : flashColor === 'red'
      ? 'pulse-today-flash-red'
      : ''

  const isDark = theme === 'dark'
  const visibleDataError = dayDataError ?? stream.error
  const showingStaleData = Boolean(visibleDataError && mainDayData?.candles.length)

  return (
    <div className={`relative rounded-xl border overflow-hidden ${flashClass} ${
      gradientMode
        ? 'border-gray-200/80 bg-white dark:border-gray-700 dark:bg-gray-900'
        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
    }`}>
      {/* Gradient mode overlays */}
      {gradientMode && (
        <>
          <div
            className="pointer-events-none absolute inset-x-6 top-6 z-10 h-24 rounded-full blur-3xl"
            style={{ background: PULSE_GRADIENT_GLOW, opacity: isDark ? 0.5 : 0.24 }}
          />
          <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_22%,transparent_72%,rgba(15,23,42,0.12))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_24%,transparent_74%,rgba(2,6,23,0.42))]" />
        </>
      )}

      {/* Content */}
      <div className={gradientMode ? 'relative z-20' : ''}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-1 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-sm font-bold ${
            gradientMode
              ? 'bg-white/20 dark:bg-white/10 text-gray-900 dark:text-white backdrop-blur-sm'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
          }`}>
            {symbol}
          </span>
          {changePct !== null && (
            <span className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded ${
              gradientMode
                ? (isPositive
                    ? 'bg-green-500/20 text-green-800 dark:text-green-300 backdrop-blur-sm'
                    : 'bg-red-500/20 text-red-800 dark:text-red-300 backdrop-blur-sm')
                : (isPositive
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400')
            }`}>
              {isPositive ? '+' : ''}{changePct.toFixed(2)}%
            </span>
          )}
          {change !== null ? (
            <span className={`text-xs font-semibold tabular-nums ${
              gradientMode
                ? (isPositive ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300')
                : (isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')
            }`}>
              {isPositive ? '+' : ''}{change.toFixed(2)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* Aggregation: forced badge (with morph indicator) or interactive toggle */}
          {forceAggregation ? (
            <span className="inline-flex min-h-8 items-center rounded bg-purple-100 px-2 text-xs font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              {morphProgress > 0 && morphProgress < 1
                ? '10s \u2192 1m'
                : forceAggregation === '10s' ? '10s' : forceAggregation === '1min' ? '1m' : '5m'}
            </span>
          ) : (
            <div className={`flex rounded border overflow-hidden ${
              gradientMode
                ? 'border-white/20 dark:border-white/10 backdrop-blur-sm'
                : 'border-gray-300 dark:border-gray-600'
            }`}>
              {(['1min', '5min'] as const).map((agg) => (
                <button
                  key={agg}
                  type="button"
                  onClick={() => setInternalAgg(agg)}
                  aria-pressed={aggregation === agg}
                  className={`min-h-8 px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-500 ${
                    gradientMode
                      ? (aggregation === agg
                          ? 'bg-white/30 dark:bg-white/20 text-gray-900 dark:text-white'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-white/10')
                      : (aggregation === agg
                          ? 'bg-sage-500 text-white dark:bg-sage-600'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700')
                  }`}
                >
                  {agg === '1min' ? '1m' : '5m'}
                </button>
              ))}
            </div>
          )}
          {/* Line / Candle toggle */}
          <button
            type="button"
            onClick={() => setLineMode((prev) => !prev)}
            aria-pressed={lineMode}
            aria-label="Display the main chart as a line"
            className={`min-h-8 rounded border px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 ${
              gradientMode
                ? 'border-white/20 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-white/10 backdrop-blur-sm'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Line
          </button>
          {/* Gradient toggle */}
          <button
            type="button"
            onClick={() => setGradientMode((prev) => !prev)}
            aria-pressed={gradientMode}
            className={`min-h-8 rounded border px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 ${
              gradientMode
                ? 'bg-white/30 dark:bg-white/20 border-white/20 dark:border-white/10 text-gray-900 dark:text-white backdrop-blur-sm'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Gradient
          </button>
        </div>
      </div>

      {showingStaleData ? (
        <div role="status" className="mx-3 mt-2 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <p>Live updates are delayed. Showing the last successful chart data.</p>
          {dayDataError && onRetryDayData ? (
            <button
              type="button"
              onClick={onRetryDayData}
              className="min-h-8 shrink-0 rounded-md border border-amber-300 bg-white px-2.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-800 dark:bg-amber-950"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Price */}
      <div className="px-3 pb-2">
        <span className="text-xl font-semibold text-gray-900 dark:text-white tabular-nums">
          {price === null ? '—' : `$${formatPrice(price)}`}
        </span>
      </div>

      {/* Chart area with PIP overlay */}
      <div ref={pipContainerRef} style={{ position: 'relative' }}>
        <FullDayCanvas
          key={symbol}
          candles={mainDayData?.candles ?? []}
          previousClose={mainDayData?.previousClose ?? null}
          lastPrice={stream.lastPrice}
          dayHigh={displayDayHigh}
          dayLow={displayDayLow}
          levelLines={chartLevelLines}
          lineMode={lineMode}
          aggregation={aggregation}
          theme={theme}
          chartHeight={chartHeight}
          dynamicXAxis={dynamicXAxis}
          morphProgress={morphProgress}
          morphTargetCandles={morphTargetCandles}
          accessibleLabel={`${symbol} intraday price chart with ${mainDayData?.candles.length ?? 0} candles. ${price === null ? 'Waiting for price data.' : `Last price $${formatPrice(price)}.`}`}
          loading={dayDataLoading}
          error={dayDataError ?? stream.error}
          onRetry={onRetryDayData}
          emptyMessage={emptyMessage}
        />

        {/* Detail chart: stacked on phones, draggable picture-in-picture on larger screens. */}
        {enableLiveDetail && pipVisible && (
          <div
            ref={pipPanelRef}
            style={{
              '--pip-x': pipPos ? `${pipPos.x}px` : undefined,
              '--pip-y': pipPos ? `${pipPos.y}px` : undefined,
            } as React.CSSProperties}
            className={`relative mx-2 mb-2 mt-2 h-[220px] overflow-hidden rounded-xl border border-gray-200 bg-white/95 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 sm:absolute sm:m-0 sm:h-[180px] sm:w-[320px] sm:z-20 ${
              pipPos
                ? 'sm:left-[var(--pip-x)] sm:top-[var(--pip-y)]'
                : pipDock === 'top-left'
                  ? 'sm:left-[68px] sm:top-2'
                  : pipDock === 'bottom-right'
                    ? 'sm:bottom-2 sm:right-[68px]'
                    : 'sm:right-[68px] sm:top-2'
            }`}
          >
            <div
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              className="flex min-h-11 select-none items-center gap-1 border-b border-gray-200 px-2 dark:border-gray-700 sm:cursor-grab sm:touch-none"
            >
              <div className="mr-auto flex min-w-0 items-center gap-1.5">
                <button
                  ref={pipDockButtonRef}
                  type="button"
                  onClick={cyclePipDock}
                  className="hidden h-8 w-7 shrink-0 items-center justify-center rounded text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 dark:hover:bg-gray-700 dark:hover:text-gray-100 sm:flex"
                  aria-label={`Move detail chart from ${pipDock.replace('-', ' ')} to ${pipDock === 'top-right' ? 'top left' : pipDock === 'top-left' ? 'bottom right' : 'top right'}`}
                >
                  <svg className="h-4 w-3" viewBox="0 0 8 12" aria-hidden="true">
                    {[2, 6].flatMap((cx) => [2, 6, 10].map((cy) => (
                      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" fill="currentColor" />
                    )))}
                  </svg>
                </button>
                <span className="truncate text-[11px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                  Detail
                </span>
              </div>

              <div
                className="flex h-8 shrink-0 overflow-hidden rounded-md border border-gray-300 dark:border-gray-600"
                role="group"
                aria-label="Detail chart timeframe"
              >
                {(['1s', '10s'] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    aria-pressed={pipTimeframe === tf}
                    onClick={() => setPipTimeframe(tf)}
                    className={`min-w-9 px-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-500 ${
                      pipTimeframe === tf
                        ? 'bg-gray-200 text-gray-950 dark:bg-gray-600 dark:text-white'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              <select
                aria-label="Detail chart window"
                value={pipZoom}
                onChange={(event) => setPipZoom(Number(event.target.value))}
                className="h-8 w-[3.4rem] shrink-0 rounded-md border border-gray-300 bg-white px-1 text-[11px] font-semibold text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                {[1, 2, 4, 8, 16].map((zoom) => (
                  <option key={zoom} value={zoom}>{zoom}x</option>
                ))}
              </select>

              <button
                type="button"
                aria-pressed={pipLineMode}
                aria-label="Display the detail chart as a line"
                onClick={() => setPipLineMode((current) => !current)}
                className="h-8 min-w-12 rounded-md border border-gray-300 px-2 text-[11px] font-semibold text-gray-600 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Line
              </button>

              <button
                ref={hidePipButtonRef}
                type="button"
                onClick={hidePip}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                aria-label="Hide detail chart"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            <div
              role="img"
              aria-label={`${symbol} detail chart using ${pipTimeframe} candles and a ${pipZoom} times window`}
              className="relative h-[176px] sm:h-[136px]"
            >
              <Liveline
                data={chartData?.lineData ?? []}
                value={chartData?.lineValue ?? price ?? 0}
                {...(pipLineMode
                  ? {}
                  : {
                      mode: 'candle' as const,
                      candles: chartData?.candles ?? [],
                      liveCandle: chartData?.liveCandle,
                      candleWidth: pipTimeframe === '1s' ? 1 : 10,
                      lineMode: pipLineMode,
                      lineData: chartData?.lineData ?? [],
                      lineValue: chartData?.lineValue,
                      onModeChange: () => setPipLineMode((prev) => !prev),
                    }
                )}
                loading={!chartData}
                window={pipWindowSecs}
                theme={theme}
                color={pipColor}
                grid={true}
                badge={true}
                scrub={true}
                fill={true}
                pulse={true}
                momentum={true}
                degen={degenOpts}
                exaggerate={false}
                referenceLine={coloredRefLine}
                padding={{ top: 6, right: 56, bottom: 20, left: 6 }}
                formatValue={formatPrice}
                formatTime={() => ''}
              />
            </div>
          </div>
        )}

        {/* Toggle to re-show PIP if hidden */}
        {enableLiveDetail && !pipVisible && (
          <button
            ref={showPipButtonRef}
            type="button"
            onClick={showPip}
            className="absolute right-[68px] top-2 z-20 min-h-9 rounded-lg border border-gray-300 bg-white/90 px-3 text-xs font-semibold text-gray-700 shadow-sm backdrop-blur transition hover:border-sage-400 hover:text-sage-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 dark:border-gray-600 dark:bg-gray-800/90 dark:text-gray-200"
          >
            Show detail chart
          </button>
        )}
      </div>
      </div>{/* /content wrapper */}
    </div>
  )
}, (prev, next) => {
  // Only re-render when THIS card's data meaningfully changes
  return (
    prev.symbol === next.symbol &&
    prev.theme === next.theme &&
    prev.chartHeight === next.chartHeight &&
    prev.dynamicXAxis === next.dynamicXAxis &&
    prev.forceAggregation === next.forceAggregation &&
    prev.morphProgress === next.morphProgress &&
    prev.morphTargetCandles === next.morphTargetCandles &&
    prev.dayData === next.dayData &&
    prev.dayDataLoading === next.dayDataLoading &&
    prev.dayDataError === next.dayDataError &&
    prev.onRetryDayData === next.onRetryDayData &&
    prev.emptyMessage === next.emptyMessage &&
    prev.enableLiveDetail === next.enableLiveDetail &&
    prev.mergeStreamIntoDayData === next.mergeStreamIntoDayData &&
    prev.stream1s.candles === next.stream1s.candles &&
    prev.stream1s.liveCandle === next.stream1s.liveCandle &&
    prev.stream1s.lastPrice === next.stream1s.lastPrice &&
    prev.stream1s.dayHigh === next.stream1s.dayHigh &&
    prev.stream1s.dayLow === next.stream1s.dayLow &&
    prev.stream1s.connected === next.stream1s.connected &&
    prev.stream1s.error === next.stream1s.error &&
    prev.stream10s.candles === next.stream10s.candles &&
    prev.stream10s.liveCandle === next.stream10s.liveCandle &&
    prev.stream10s.lastPrice === next.stream10s.lastPrice &&
    prev.stream10s.dayHigh === next.stream10s.dayHigh &&
    prev.stream10s.dayLow === next.stream10s.dayLow &&
    prev.stream10s.error === next.stream10s.error
  )
})

/* ───────── Replay stream adapter ───────── */

const SPEED_OPTIONS: ReplaySpeed[] = [1, 5, 10, 25, 100]
const REPLAY_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})

function formatReplayTime(timestamp: number | null): string | null {
  return timestamp === null ? null : REPLAY_TIME_FORMATTER.format(new Date(timestamp * 1000))
}

export function buildPulseReplayConfig(
  symbol: string,
  referenceDate: Date = new Date(),
): ReplayConfig {
  const marketStatus = getMarketStatus(referenceDate)
  const latestCompletedSessionDate = marketStatus.session === 'premarket' || marketStatus.session === 'cash'
    ? getTradingDate(new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000))
    : getTradingDate(referenceDate)

  return {
    symbol: symbol.trim().toUpperCase(),
    date: latestCompletedSessionDate,
    from: '09:30',
    to: isUsMarketEarlyClose(latestCompletedSessionDate) ? '13:00' : '16:00',
    timeframe: '1s',
    autoPlay: false,
  }
}

const EMPTY_STREAM: LiveStreamState = {
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

const PULSE_GRADIENT_GLOW = 'rgba(37, 99, 235, 0.28)'

/** Converts replay output into the small LiveStreamState subset used by the card. */
function useReplayStream(replay: ReturnType<typeof useReplay>): LiveStreamState {
  return useMemo(() => {
    return {
      candles: replay.candles,
      liveCandle: replay.liveCandle,
      lastPrice: replay.lastPrice,
      lastChange: replay.lastChange,
      lastChangePct: replay.lastChangePct,
      previousClose: replay.previousClose,
      // Replay cards derive their session levels from their aggregated day
      // data, so scanning the growing tick array for these on every clock tick
      // would be wasted work.
      dayHigh: null,
      dayLow: null,
      connected: false,
      error: replay.error,
    }
  }, [replay.candles, replay.liveCandle, replay.lastPrice, replay.lastChange, replay.lastChangePct, replay.previousClose, replay.error])
}

/* ───────── Replay 1s → adaptive 10s/1min candles ───────── */

const REPLAY_ET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatReplayBucketDate(timestamp: number, etFmt = REPLAY_ET_FORMATTER): string {
  const parts = etFmt.formatToParts(new Date(timestamp * 1000))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

export function bucketCandles(
  revealed: { time: number; open: number; high: number; low: number; close: number }[],
  bucketSize: number,
  etFmt: Intl.DateTimeFormat,
): DayCandle[] {
  const buckets = new Map<number, { open: number; high: number; low: number; close: number }>()
  const bucketOrder: number[] = []

  for (const c of revealed) {
    const key = Math.floor(c.time / bucketSize) * bucketSize
    const existing = buckets.get(key)
    if (existing) {
      if (c.high > existing.high) existing.high = c.high
      if (c.low < existing.low) existing.low = c.low
      existing.close = c.close
    } else {
      buckets.set(key, { open: c.open, high: c.high, low: c.low, close: c.close })
      bucketOrder.push(key)
    }
  }

  return bucketOrder.map((key) => {
    const ohlc = buckets.get(key)!
    return {
      date: formatReplayBucketDate(key, etFmt),
      ...ohlc,
    }
  })
}

export function mergeLatestDayCandlesWithStream(
  baseCandles: DayCandle[],
  streamCandles: { time: number; open: number; high: number; low: number; close: number }[],
  liveCandle?: { time: number; open: number; high: number; low: number; close: number },
): DayCandle[] {
  const revealed = [...streamCandles]
  if (liveCandle) revealed.push(liveCandle)

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

  const streamedBuckets = bucketCandles(revealed, 60, etFmt)
  const allDates = [...baseCandles, ...streamedBuckets].map((c) => c.date.split(' ')[0]).filter(Boolean)
  const latestDate = allDates.sort().at(-1)

  if (!latestDate) return []

  const merged = new Map<string, DayCandle>()

  for (const candle of sortCandles(baseCandles)) {
    if (candle.date.startsWith(latestDate)) {
      merged.set(candle.date, candle)
    }
  }

  for (const candle of sortCandles(streamedBuckets)) {
    if (candle.date.startsWith(latestDate)) {
      merged.set(candle.date, candle)
    }
  }

  return sortCandles(Array.from(merged.values()))
}

interface PreparedReplayBucketSeries {
  /** Final OHLC for every observed bucket. Future buckets are never exposed directly. */
  buckets: DayCandle[]
  /** Bucket containing each source candle. */
  bucketIndexes: Uint32Array
  /** Prefix-safe values for the active bucket at each source candle. */
  partialHighs: Float64Array
  partialLows: Float64Array
  partialCloses: Float64Array
}

interface ReplayBucketBuilder extends PreparedReplayBucketSeries {
  bucketSize: number
  currentKey: number | null
}

interface PreparedReplayAggregations {
  candleCount: number
  candleTimes: Float64Array
  tenSecond: PreparedReplayBucketSeries
  oneMinute: PreparedReplayBucketSeries
}

function createReplayBucketBuilder(bucketSize: number, candleCount: number): ReplayBucketBuilder {
  return {
    bucketSize,
    currentKey: null,
    buckets: [],
    bucketIndexes: new Uint32Array(candleCount),
    partialHighs: new Float64Array(candleCount),
    partialLows: new Float64Array(candleCount),
    partialCloses: new Float64Array(candleCount),
  }
}

function indexReplayCandle(
  builder: ReplayBucketBuilder,
  candle: StreamCandle,
  timestamp: number,
  sourceIndex: number,
) {
  const key = Math.floor(timestamp / builder.bucketSize) * builder.bucketSize
  let bucketIndex = builder.buckets.length - 1

  if (key !== builder.currentKey) {
    builder.currentKey = key
    bucketIndex += 1
    builder.buckets.push({
      date: formatReplayBucketDate(key),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })
  } else {
    const bucket = builder.buckets[bucketIndex]
    if (candle.high > bucket.high) bucket.high = candle.high
    if (candle.low < bucket.low) bucket.low = candle.low
    bucket.close = candle.close
  }

  const bucket = builder.buckets[bucketIndex]
  builder.bucketIndexes[sourceIndex] = bucketIndex
  builder.partialHighs[sourceIndex] = bucket.high
  builder.partialLows[sourceIndex] = bucket.low
  builder.partialCloses[sourceIndex] = bucket.close
}

/**
 * Builds both replay resolutions in one pass over the immutable fetched set.
 * Playback renders then become prefix lookups instead of repeated full-history
 * scans. Per-candle partial OHLC values keep future ticks from leaking into the
 * currently active bucket when users play, skip, seek, or rewind.
 */
function prepareReplayAggregations(candles: StreamCandle[]): PreparedReplayAggregations {
  const candleTimes = new Float64Array(candles.length)
  const tenSecond = createReplayBucketBuilder(10, candles.length)
  const oneMinute = createReplayBucketBuilder(60, candles.length)

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]
    const timestamp = candle.time
    candleTimes[index] = timestamp
    indexReplayCandle(tenSecond, candle, timestamp, index)
    indexReplayCandle(oneMinute, candle, timestamp, index)
  }

  return {
    candleCount: candles.length,
    candleTimes,
    tenSecond,
    oneMinute,
  }
}

function revealPreparedBuckets(
  prepared: PreparedReplayBucketSeries,
  revealedCount: number,
): DayCandle[] {
  if (revealedCount === 0) return []

  const sourceIndex = revealedCount - 1
  const activeBucketIndex = prepared.bucketIndexes[sourceIndex]
  const activeBucket = prepared.buckets[activeBucketIndex]
  const candles = prepared.buckets.slice(0, activeBucketIndex)

  // The stored bucket contains its eventual final OHLC. Only its identity,
  // date, and open are safe to reuse; the active values come from the prefix
  // snapshot at the latest revealed source candle.
  candles.push({
    date: activeBucket.date,
    open: activeBucket.open,
    high: prepared.partialHighs[sourceIndex],
    low: prepared.partialLows[sourceIndex],
    close: prepared.partialCloses[sourceIndex],
  })

  return candles
}

export function useReplayAdaptiveCandles(replay: ReturnType<typeof useReplay>): {
  dayData10s: DayCandleData | undefined
  dayData1min: DayCandleData | undefined
  mode: '10s' | '1min'
} {
  const prepared = useMemo(
    () => prepareReplayAggregations(replay.allCandles),
    [replay.allCandles],
  )

  return useMemo(() => {
    const revealedCount = Math.min(
      prepared.candleCount,
      Math.max(0, Math.floor(replay.revealedCount)),
    )
    if (revealedCount === 0) {
      return { dayData10s: undefined, dayData1min: undefined, mode: '10s' as const }
    }

    // Determine elapsed time
    const firstTime = prepared.candleTimes[0]
    const lastTime = prepared.candleTimes[revealedCount - 1]
    const elapsed = lastTime - firstTime

    // Threshold: 15 minutes (900s)
    const mode = elapsed < 900 ? '10s' as const : '1min' as const
    const candles10s = revealPreparedBuckets(prepared.tenSecond, revealedCount)
    const candles1min = revealPreparedBuckets(prepared.oneMinute, revealedCount)

    const shared = {
      previousClose: replay.previousClose,
      changePct: replay.lastChangePct,
    }

    return {
      dayData10s: { candles: candles10s, ...shared },
      dayData1min: { candles: candles1min, ...shared },
      mode,
    }
  }, [prepared, replay.revealedCount, replay.previousClose, replay.lastChangePct])
}

/* ───────── PulseTodayDashboard ───────── */

interface MoversSessionData {
  premarket: MoverData[]
  cash: MoverData[]
  afterhours: MoverData[]
  currentSession: MarketSession
}

interface PulseTodayDashboardProps {
  gainersData?: MoversSessionData
  losersData?: MoversSessionData
}

export default function PulseTodayDashboard({ gainersData, losersData }: PulseTodayDashboardProps) {
  const { theme: rawTheme } = useTheme()
  const theme = (rawTheme === 'dark' ? 'dark' : 'light') as ThemeMode
  const cockpit = useMemo(
    () => buildPulseTodayCockpitSnapshot(gainersData, losersData),
    [gainersData, losersData],
  )

  // Active symbol — updated when user clicks a ticker in the movers tables
  const [activeSymbol, setActiveSymbol] = useState(
    () => cockpit.topGainer?.symbol ?? cockpit.topLoser?.symbol ?? 'GOOGL',
  )
  const [replayConfig, setReplayConfig] = useState<ReplayConfig | null>(null)
  const isReplay = !!replayConfig
  const liveSymbols = useMemo(() => isReplay ? [] : [activeSymbol], [activeSymbol, isReplay])
  const replayButtonRef = useRef<HTMLButtonElement>(null)
  const exitReplayButtonRef = useRef<HTMLButtonElement>(null)
  const wasReplayRef = useRef(false)
  const [whyMoving, setWhyMoving] = useState<StockWhyMovingResult | null>(null)
  const [whyMovingLoading, setWhyMovingLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadWhyMoving() {
      try {
        setWhyMovingLoading(true)
        setWhyMoving(null)
        const response = await fetch(
          `/api/stock-why-moving/${encodeURIComponent(activeSymbol)}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          },
        )
        const payload = (await response.json()) as StockWhyMovingResult
        if (!cancelled) setWhyMoving(payload)
      } catch (error) {
        if (
          !cancelled &&
          !(error instanceof DOMException && error.name === 'AbortError')
        ) {
          setWhyMoving(null)
        }
      } finally {
        if (!cancelled) setWhyMovingLoading(false)
      }
    }

    void loadWhyMoving()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [activeSymbol])

  // Replay state
  const replay = useReplay(replayConfig)
  const replayStream = useReplayStream(replay)
  const { dayData10s: adaptiveData10s, dayData1min: adaptiveData1min, mode: adaptiveMode } = useReplayAdaptiveCandles(replay)
  // Session context and the adaptive chart share the exact same prepared
  // one-minute series instead of independently aggregating the replay prefix.
  const aggregatedDayData = adaptiveData1min

  useEffect(() => {
    if (wasReplayRef.current === isReplay) return
    wasReplayRef.current = isReplay

    const frame = requestAnimationFrame(() => {
      if (isReplay) exitReplayButtonRef.current?.focus()
      else replayButtonRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [isReplay])

  // Morph animation: 10s → 1min transition
  const prevAdaptiveModeRef = useRef(adaptiveMode)
  const [morphProgress, setMorphProgress] = useState(0)

  useEffect(() => {
    if (prevAdaptiveModeRef.current === '10s' && adaptiveMode === '1min') {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setMorphProgress(1)
        prevAdaptiveModeRef.current = adaptiveMode
        return
      }
      // Start animation
      const start = performance.now()
      const duration = 1000
      let raf: number
      const animate = (now: number) => {
        const t = Math.min((now - start) / duration, 1)
        // Ease-in-out for smooth feel
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        setMorphProgress(eased)
        if (t < 1) raf = requestAnimationFrame(animate)
      }
      raf = requestAnimationFrame(animate)
      prevAdaptiveModeRef.current = adaptiveMode
      return () => cancelAnimationFrame(raf)
    } else if (adaptiveMode === '10s') {
      setMorphProgress(0)
    }
    prevAdaptiveModeRef.current = adaptiveMode
  }, [adaptiveMode])

  // Live streams
  const streams1s = useMultiStream(liveSymbols, '1s')
  const streams10s = useMultiStream(liveSymbols, '10s')

  // Day candles
  const {
    data: dayCandles,
    loading: dayCandlesLoading,
    error: dayCandlesError,
    retry: retryDayCandles,
  } = useDayCandlesState(liveSymbols)

  const startReplay = useCallback(() => {
    setReplayConfig(buildPulseReplayConfig(activeSymbol))
  }, [activeSymbol])

  const exitReplay = useCallback(() => {
    setReplayConfig(null)
  }, [])

  const retryReplay = useCallback(() => {
    setReplayConfig((current) => current
      ? { ...current, requestId: Date.now(), autoPlay: false }
      : current)
  }, [])

  const replaySymbol = replayConfig?.symbol ?? activeSymbol

  // Progress and scrubbing follow elapsed market time, not trade count. Some
  // second-level feeds omit quiet seconds, so array position is not a clock.
  const progressPct = Math.round(replay.replayProgress * 100)
  const replayRangeStart = replay.replayStartTime ?? 0
  const replayRangeEnd = replay.replayEndTime !== null && replay.replayEndTime > replayRangeStart
    ? replay.replayEndTime
    : replayRangeStart + 1
  const replayRangeValue = Math.floor(Math.max(
    replayRangeStart,
    Math.min(replayRangeEnd, replay.replayCurrentTime ?? replayRangeStart),
  ))
  const replayClockLabel = formatReplayTime(replay.replayCurrentTime)

  const activeMover =
    cockpit.gainers.find((mover) => mover.symbol === activeSymbol) ??
    cockpit.losers.find((mover) => mover.symbol === activeSymbol) ??
    null
  const sessionLabel = getSessionLabel(cockpit.session)
  const activeStream = streams1s[activeSymbol] ?? EMPTY_STREAM
  const liveDataIssue = dayCandlesError ?? activeStream.error
  const hasSnapshotData = Boolean(dayCandles[activeSymbol]?.candles.length)
  const liveStatusLabel = liveDataIssue
    ? 'Data delayed'
    : cockpit.session === 'closed'
      ? 'Closing snapshot'
      : activeStream.connected
        ? 'Live'
        : hasSnapshotData
          ? 'Snapshot'
          : 'Connecting'
  const liveStatusClass = liveDataIssue
    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
    : cockpit.session === 'closed'
      ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
      : activeStream.connected
        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        : hasSnapshotData
          ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'

  return (
    <div className="pulse-today-root">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pulse Today</h1>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {sessionLabel} · {cockpit.reviewSymbols.length} catalyst candidates
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {!isReplay ? (
            <>
              <button
                ref={replayButtonRef}
                type="button"
                onClick={startReplay}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-purple-100 px-3 text-xs font-semibold text-purple-800 transition-colors hover:bg-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50"
              >
                Replay
              </button>
              <span role="status" aria-live="polite" className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${liveStatusClass}`}>
                {activeStream.connected && !liveDataIssue && cockpit.session !== 'closed' ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
                  </span>
                ) : null}
                {liveStatusLabel}
              </span>
            </>
          ) : (
            <>
              {/* Replay badge */}
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-purple-100 px-3 text-xs font-bold text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                REPLAY {replaySymbol}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                {replayConfig?.date} {replayConfig?.from}–{replayConfig?.to}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                {progressPct}%
              </span>
              <button
                ref={exitReplayButtonRef}
                type="button"
                onClick={exitReplay}
                className="inline-flex min-h-9 items-center rounded-full bg-gray-100 px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Exit
              </button>
            </>
          )}
        </div>
      </div>

      {!isReplay ? (
        <>
          <section className="mb-3 grid overflow-hidden rounded-lg border border-cream-300 bg-white dark:border-gray-700 dark:bg-gray-800 sm:grid-cols-2 xl:grid-cols-4">
            <div className="border-b border-cream-300 px-4 py-3 dark:border-gray-700 sm:border-r xl:border-b-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                Session
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {sessionLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => cockpit.topGainer && setActiveSymbol(cockpit.topGainer.symbol)}
              disabled={!cockpit.topGainer}
              className="border-b border-cream-300 px-4 py-3 text-left transition hover:bg-cream-50 disabled:cursor-default dark:border-gray-700 dark:hover:bg-gray-700/40 sm:border-r xl:border-b-0"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                Leading gainer
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {cockpit.topGainer
                  ? `${cockpit.topGainer.symbol} +${cockpit.topGainer.changesPercentage.toFixed(2)}%`
                  : 'No data'}
              </p>
            </button>
            <button
              type="button"
              onClick={() => cockpit.topLoser && setActiveSymbol(cockpit.topLoser.symbol)}
              disabled={!cockpit.topLoser}
              className="border-b border-cream-300 px-4 py-3 text-left transition hover:bg-cream-50 disabled:cursor-default dark:border-gray-700 dark:hover:bg-gray-700/40 sm:border-r sm:border-b-0"
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                Leading decliner
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {cockpit.topLoser
                  ? `${cockpit.topLoser.symbol} ${cockpit.topLoser.changesPercentage.toFixed(2)}%`
                  : 'No data'}
              </p>
            </button>
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                Active chart
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                {activeSymbol}
              </p>
            </div>
          </section>

          <section className="mb-4 rounded-lg border border-cream-300 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
              <div className="shrink-0 lg:w-48">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-bold text-gray-950 dark:text-white">
                    {activeSymbol}
                  </span>
                  {activeMover ? (
                    <span
                      className={`text-sm font-semibold ${
                        activeMover.changesPercentage >= 0
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {activeMover.changesPercentage >= 0 ? '+' : ''}
                      {activeMover.changesPercentage.toFixed(2)}%
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  {activeMover?.name ?? 'Active chart'}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                  Why it moved
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-800 dark:text-gray-200">
                  {whyMovingLoading
                    ? 'Loading the latest catalyst...'
                    : whyMoving?.status === 'found' && whyMoving.displayText
                      ? whyMoving.displayText
                      : 'No specific catalyst is available for this move yet.'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/stock/${encodeURIComponent(activeSymbol)}`}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800 dark:border-gray-600 dark:text-gray-200"
                >
                  Stock page
                </Link>
                {whyMoving?.sourceUrl ? (
                  <a
                    href={whyMoving.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800 dark:border-gray-600 dark:text-gray-200"
                  >
                    Source
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {/* Replay playback controls — sticky so they stay visible when scrolling to lower charts */}
      {isReplay && (
        <section
          aria-label="Replay controls"
          className="sticky top-[6.625rem] z-30 mb-4 space-y-3 rounded-xl border border-purple-200 bg-purple-50/95 p-3 shadow-sm backdrop-blur-sm dark:border-purple-800/50 dark:bg-purple-950/90 lg:top-[6.375rem]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label={replay.status === 'playing' ? 'Pause replay' : 'Play replay'}
              onClick={() => replay.status === 'playing' ? replay.pause() : replay.play()}
              disabled={replay.status === 'loading' || replay.status === 'error' || replay.totalCandles === 0}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-purple-600 text-white transition-colors hover:bg-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:ring-offset-gray-950"
            >
              {replay.status === 'playing' ? (
                <svg width="12" height="14" viewBox="0 0 10 12" aria-hidden="true"><rect x="1" y="1" width="3" height="10" fill="currentColor" /><rect x="6" y="1" width="3" height="10" fill="currentColor" /></svg>
              ) : (
                <svg width="12" height="14" viewBox="0 0 10 12" aria-hidden="true"><polygon points="1,0 10,6 1,12" fill="currentColor" /></svg>
              )}
            </button>

            <button
              type="button"
              onClick={replay.reset}
              disabled={replay.totalCandles === 0}
              className="min-h-9 rounded-lg px-2.5 text-xs font-semibold text-purple-700 transition hover:bg-purple-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-50 dark:text-purple-300 dark:hover:bg-purple-900/40"
            >
              Reset
            </button>

            <div className="h-6 w-px bg-purple-200 dark:bg-purple-800/60" aria-hidden="true" />

            <button
              type="button"
              aria-label="Skip backward 1 minute"
              onClick={() => replay.skip(-60)}
              disabled={replay.totalCandles === 0}
              className="min-h-9 rounded-lg px-2.5 text-xs font-semibold tabular-nums text-gray-700 transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-purple-900/40"
            >
              −1m
            </button>
            <button
              type="button"
              aria-label="Skip forward 1 minute"
              onClick={() => replay.skip(60)}
              disabled={replay.totalCandles === 0}
              className="min-h-9 rounded-lg px-2.5 text-xs font-semibold tabular-nums text-gray-700 transition hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-purple-900/40"
            >
              +1m
            </button>

            <div
              className="flex h-9 overflow-hidden rounded-lg border border-purple-300 dark:border-purple-700"
              role="group"
              aria-label="Replay speed"
            >
              {SPEED_OPTIONS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  aria-pressed={replay.speed === speed}
                  onClick={() => replay.setSpeed(speed)}
                  className={`min-w-9 px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-500 ${
                    replay.speed === speed
                      ? 'bg-purple-600 text-white'
                      : 'text-purple-700 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-purple-900/40'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            <span role="status" aria-live="polite" className="ml-auto rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold capitalize text-gray-600 dark:bg-purple-900/40 dark:text-gray-300">
              {replay.status}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-8 text-right text-xs font-semibold tabular-nums text-purple-700 dark:text-purple-300">
              {progressPct}%
            </span>
            <input
              type="range"
              min={replayRangeStart}
              max={replayRangeEnd}
              step={1}
              value={replayRangeValue}
              disabled={replay.totalCandles === 0}
              onChange={(event) => replay.seekTime(Number(event.currentTarget.value))}
              aria-label="Replay position"
              aria-valuetext={`${progressPct}% complete${replayClockLabel ? `, ${replayClockLabel} Eastern` : ''}`}
              className="h-8 min-w-0 flex-1 cursor-pointer accent-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="hidden min-w-36 text-right text-xs tabular-nums text-gray-500 sm:block dark:text-gray-400">
              {replayClockLabel ? `${replayClockLabel} ET · ` : ''}{replay.revealedCount.toLocaleString()} / {replay.totalCandles.toLocaleString()}
            </span>
          </div>
        </section>
      )}

      {isReplay && replay.error ? (
        <div role="alert" className="mb-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          <p>{replay.error}</p>
          <button type="button" onClick={retryReplay} className="min-h-9 shrink-0 rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
            Retry replay
          </button>
        </div>
      ) : null}

      {isReplay && !replay.error && replay.status !== 'loading' && replay.totalCandles === 0 ? (
        <div role="status" className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <p>No one-second candles were available for {replaySymbol} on {replayConfig?.date}. This can be a temporary provider delay.</p>
          <button
            type="button"
            onClick={retryReplay}
            className="min-h-9 shrink-0 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          >
            Retry replay
          </button>
        </div>
      ) : null}

      {/* Two purposeful replay views replace the former four-chart prototype wall. */}
      {isReplay && !replay.error && (replay.totalCandles > 0 || replay.status === 'loading') && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section aria-labelledby="replay-session-view">
            <div className="mb-2 px-1">
              <h2 id="replay-session-view" className="text-sm font-bold text-gray-900 dark:text-white">Session context</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">The full session fills in as playback advances.</p>
            </div>
            <PulseTodayCard
              symbol={replaySymbol}
              dayData={aggregatedDayData}
              dayDataLoading={replay.status === 'loading'}
              dayDataError={replay.error}
              onRetryDayData={retryReplay}
              emptyMessage={replay.status === 'ready'
                ? 'Replay ready — press play to reveal the first candle.'
                : 'Playback is starting…'}
              enableLiveDetail={false}
              mergeStreamIntoDayData={false}
              stream1s={replayStream}
              stream10s={replayStream}
              theme={theme}
              chartHeight={360}
            />
          </section>

          <section aria-labelledby="replay-adaptive-view">
            <div className="mb-2 px-1">
              <h2 id="replay-adaptive-view" className="text-sm font-bold text-gray-900 dark:text-white">Adaptive tape</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">A readable window that expands from seconds into minutes.</p>
            </div>
            <PulseTodayCard
              symbol={replaySymbol}
              dayData={morphProgress < 1 ? adaptiveData10s : adaptiveData1min}
              dayDataLoading={replay.status === 'loading'}
              dayDataError={replay.error}
              onRetryDayData={retryReplay}
              emptyMessage={replay.status === 'ready'
                ? 'Replay ready — press play to reveal the first candle.'
                : 'Playback is starting…'}
              enableLiveDetail={false}
              mergeStreamIntoDayData={false}
              stream1s={replayStream}
              stream10s={replayStream}
              theme={theme}
              chartHeight={360}
              dynamicXAxis
              forceAggregation={morphProgress < 1 ? '10s' : '1min'}
              morphProgress={morphProgress}
              morphTargetCandles={morphProgress < 1 ? adaptiveData1min?.candles : undefined}
            />
          </section>
        </div>
      )}

      {!isReplay && (
        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="min-w-0 w-full space-y-4 xl:max-w-4xl">
            <PulseTodayCard
              symbol={activeSymbol}
              dayData={dayCandles[activeSymbol]}
              dayDataLoading={dayCandlesLoading}
              dayDataError={dayCandlesError}
              onRetryDayData={retryDayCandles}
              stream1s={streams1s[activeSymbol] ?? EMPTY_STREAM}
              stream10s={streams10s[activeSymbol] ?? EMPTY_STREAM}
              theme={theme}
            />
          </div>

          {/* Gainers / Losers sidebar — side by side */}
          {gainersData && losersData && (
            <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:w-[500px]">
              <div className="min-w-0">
                <MarketMoversTable title="Gainers" data={gainersData} maxRows={8} onSymbolClick={setActiveSymbol} />
              </div>
              <div className="min-w-0">
                <MarketMoversTable title="Losers" data={losersData} maxRows={8} onSymbolClick={setActiveSymbol} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
