'use client'

import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react'
import { Liveline } from 'liveline'
import type { CandlePoint } from 'liveline'
import { useTheme } from '@/components/ThemeProvider'
import { useMultiStream } from '@/lib/hooks/use-multi-stream'
import type { LiveStreamState } from '@/lib/hooks/use-live-stream'
import { useReplay } from '@/lib/hooks/use-replay'
import type { ReplayConfig, ReplaySpeed } from '@/lib/hooks/use-replay'
import MarketMoversTable from '@/components/MarketMoversTable'
import type { MoverData } from '@/app/actions/market-movers'
import type { MarketSession } from '@/lib/market-hours'

const SYMBOLS = ['GOOGL'] as const

type ThemeMode = 'light' | 'dark'

export function formatPrice(v: number) {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatTime(t: number) {
  const d = new Date(t * 1000)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

/* ───────── Liveline chart data hook ───────── */

interface ChartData {
  candles: CandlePoint[]
  liveCandle: CandlePoint | undefined
  lineData: { time: number; value: number }[]
  lineValue: number | undefined
}

function useChartData(stream: LiveStreamState): ChartData | null {
  return useMemo(() => {
    if (stream.candles.length === 0) return null

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
  }, [stream.candles, stream.liveCandle])
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

export function useDayCandles(symbols: readonly string[]): Record<string, DayCandleData> {
  const [data, setData] = useState<Record<string, DayCandleData>>({})
  const normalizedSymbols = Array.from(new Set(symbols.map((symbol) => symbol.toUpperCase()))).sort()
  const symbolsKey = normalizedSymbols.join(',')

  useEffect(() => {
    let cancelled = false
    const activeSymbols = normalizedSymbols

    async function fetchAll() {
      const results = await Promise.allSettled(
        activeSymbols.map(async (sym) => {
          const res = await fetch(`/api/stock-intraday/${sym}?interval=1`)
          if (!res.ok) return null
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
      setData(next)
    }

    fetchAll()
    const id = setInterval(fetchAll, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [symbolsKey])

  return data
}

/* ───────── Candle time parsing helpers ───────── */

export const MARKET_OPEN_MINUTES = 9 * 60 + 30 // 9:30 AM
const PREMARKET_START_MINUTES = 4 * 60
const CASH_END_MINUTES = 16 * 60
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

export function getSessionWindowForCandles(candles: { date: string }[]): SessionWindow {
  const latest = candles[candles.length - 1]
  if (!latest) return SESSION_WINDOWS.cash

  const totalMinutes = getCandleTotalMinutes(latest)
  if (totalMinutes >= CASH_END_MINUTES) return SESSION_WINDOWS.afterhours
  if (totalMinutes >= MARKET_OPEN_MINUTES) return SESSION_WINDOWS.cash
  if (totalMinutes >= PREMARKET_START_MINUTES) return SESSION_WINDOWS.premarket
  return SESSION_WINDOWS.cash
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
  if (session === 'afterhours') return 'After Hours '
  return ''
}

function getExtremesForSession(
  candles: Array<{ date: string; high: number; low: number }>,
  session: IntradaySession,
): { dayHigh: number | null; dayLow: number | null } {
  const sessionWindow = SESSION_WINDOWS[session]
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

function areLevelsEquivalent(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false
  const tolerance = Math.max(0.0001, Math.max(Math.abs(a), Math.abs(b)) * 0.0005)
  return Math.abs(a - b) <= tolerance
}

export function buildPulseSessionLevels(
  candles: Array<{ date: string; high: number; low: number }>,
): PulseSessionLevels {
  const activeSession = getSessionWindowForCandles(candles).session
  const activeExtremes = getExtremesForSession(candles, activeSession)
  const lines: PulseLevelLine[] = []
  const activePrefix = getSessionLabelPrefix(activeSession)

  const primaryHigh = activeExtremes.dayHigh !== null
    ? {
        id: `${activeSession}-high`,
        value: activeExtremes.dayHigh,
        label: `${activePrefix}HOD`,
        tone: 'high' as const,
        emphasis: 'primary' as const,
      }
    : null

  const primaryLow = activeExtremes.dayLow !== null
    ? {
        id: `${activeSession}-low`,
        value: activeExtremes.dayLow,
        label: `${activePrefix}LOD`,
        tone: 'low' as const,
        emphasis: 'primary' as const,
      }
    : null

  if (primaryHigh) lines.push(primaryHigh)
  if (primaryLow) lines.push(primaryLow)

  if (activeSession !== 'premarket') {
    const premarketExtremes = getExtremesForSession(candles, 'premarket')

    if (premarketExtremes.dayHigh !== null && !areLevelsEquivalent(premarketExtremes.dayHigh, primaryHigh?.value ?? null)) {
      lines.push({
        id: 'premarket-high',
        value: premarketExtremes.dayHigh,
        label: 'Premarket HOD',
        tone: 'high',
        emphasis: 'secondary',
      })
    }

    if (premarketExtremes.dayLow !== null && !areLevelsEquivalent(premarketExtremes.dayLow, primaryLow?.value ?? null)) {
      lines.push({
        id: 'premarket-low',
        value: premarketExtremes.dayLow,
        label: 'Premarket LOD',
        tone: 'low',
        emphasis: 'secondary',
      })
    }
  }

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
}: FullDayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [crosshair, setCrosshair] = useState<CrosshairData | null>(null)
  const rafRef = useRef<number>(0)

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
  const { yMin, yMax } = useMemo(() => {
    if (candles.length === 0) return { yMin: 0, yMax: 1 }
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
    const width = container.clientWidth
    const height = chartHeight

    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const isDark = theme === 'dark'

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
      // Choose label spacing in seconds — granular for short durations
      const labelStepSecs = aggregation === '1s'
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

    // --- Session key levels (HOD/LOD + Premarket carryover levels) ---
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
        const pulse = Math.sin(Date.now() / 600) * 0.5 + 0.5
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
        ? 0.5 + (Math.sin(Date.now() / 600) * 0.5 + 0.5) * 0.5
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
  }, [candles, slotMap, previousClose, lastPrice, resolvedLevelLines, lineMode, aggregation, theme, chartHeight, crosshair, yMin, yMax, totalSlots, labelInterval, dynamicXAxis, xAxisMaxSlots, padding.top, padding.right, padding.bottom, padding.left, morphProgress, morphTargetCandles, isMorphing, effectiveTotalSlots, targetSlotMap, targetTotalSlots, sessionWindow])

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
        className="w-full flex items-center justify-center text-gray-400 text-sm"
        style={{ height: chartHeight }}
      >
        Loading chart data...
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full" style={{ height: chartHeight }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  )
}

/* ───────── PIP HOD/LOD overlay ───────── */

const PIP_PROXIMITY = 0.01 // 1% of price

function PipPriceOverlay({
  dayHigh,
  dayLow,
  lastPrice,
  candles,
  liveCandle,
  windowSecs,
  padding,
  chartHeight,
}: {
  dayHigh: number | null
  dayLow: number | null
  lastPrice: number | null
  candles: { time: number; high: number; low: number; close: number }[]
  liveCandle: { high: number; low: number; close: number } | undefined
  windowSecs: number
  padding: { top: number; right: number; bottom: number; left: number }
  chartHeight: number
}) {
  const overlay = useMemo(() => {
    if (dayHigh === null || dayLow === null || lastPrice === null || lastPrice === 0) return null
    if (candles.length === 0) return null

    const now = candles[candles.length - 1].time
    const windowStart = now - windowSecs
    let visMin = Infinity
    let visMax = -Infinity
    for (const c of candles) {
      if (c.time >= windowStart) {
        if (c.high > visMax) visMax = c.high
        if (c.low < visMin) visMin = c.low
      }
    }
    if (liveCandle) {
      if (liveCandle.high > visMax) visMax = liveCandle.high
      if (liveCandle.low < visMin) visMin = liveCandle.low
    }

    if (!isFinite(visMin) || !isFinite(visMax) || visMin === visMax) return null

    const range = visMax - visMin
    const buffer = range * 0.05
    const bufferedMin = visMin - buffer
    const bufferedMax = visMax + buffer
    const bufferedRange = bufferedMax - bufferedMin
    const chartAreaHeight = chartHeight - padding.top - padding.bottom

    const priceToY = (price: number) =>
      padding.top + (1 - (price - bufferedMin) / bufferedRange) * chartAreaHeight

    const chartTop = padding.top
    const chartBottom = chartHeight - padding.bottom

    type LineInfo = { price: number; y: number; label: string; color: string; blink?: boolean }
    type EdgeInfo = { side: 'top' | 'bottom'; label: string; color: string; bgColor: string; opacity: number }

    const lines: LineInfo[] = []
    const edges: EdgeInfo[] = []

    // HOD
    const hodY = priceToY(dayHigh)
    const hodDistPct = (dayHigh - lastPrice) / lastPrice
    const hodInRange = hodY >= chartTop - 10 && hodY <= chartBottom + 10

    if (hodInRange) {
      lines.push({ price: dayHigh, y: hodY, label: `HOD`, color: 'rgba(34, 197, 94, 0.6)' })
    } else if (hodDistPct > 0 && hodDistPct <= PIP_PROXIMITY) {
      const intensity = 1 - hodDistPct / PIP_PROXIMITY
      edges.push({
        side: 'top',
        label: 'HOD',
        color: 'rgb(34, 197, 94)',
        bgColor: 'rgba(34, 197, 94, 0.12)',
        opacity: 0.4 + intensity * 0.6,
      })
    }

    // LOD
    const lodY = priceToY(dayLow)
    const lodDistPct = (lastPrice - dayLow) / lastPrice
    const lodInRange = lodY >= chartTop - 10 && lodY <= chartBottom + 10

    const nearLOD = lodDistPct >= 0 && lodDistPct <= 0.005

    if (lodInRange) {
      lines.push({ price: dayLow, y: lodY, label: `LOD`, color: 'rgba(239, 68, 68, 0.6)', blink: nearLOD })
    } else if (lodDistPct > 0 && lodDistPct <= PIP_PROXIMITY) {
      const intensity = 1 - lodDistPct / PIP_PROXIMITY
      edges.push({
        side: 'bottom',
        label: 'LOD',
        color: 'rgb(239, 68, 68)',
        bgColor: 'rgba(239, 68, 68, 0.12)',
        opacity: 0.4 + intensity * 0.6,
      })
    }

    if (lines.length === 0 && edges.length === 0) return null
    return { lines, edges }
  }, [dayHigh, dayLow, lastPrice, candles, liveCandle, windowSecs, padding, chartHeight])

  if (!overlay) return null

  return (
    <>
      {overlay.lines.map((line) => (
        <div
          key={line.label}
          className={line.blink ? 'lod-blink-line' : ''}
          style={{
            position: 'absolute',
            top: line.y,
            left: padding.left,
            right: padding.right,
            height: 0,
            borderTop: line.blink ? '2px dashed rgba(239, 68, 68, 0.9)' : `1px dashed ${line.color}`,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <span
            className={line.blink ? 'lod-blink-label' : ''}
            style={{
              position: 'absolute',
              left: 2,
              top: -12,
              fontSize: 8,
              fontWeight: 600,
              color: line.color,
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {line.label}
          </span>
        </div>
      ))}

      {overlay.edges.map((edge) => (
        <div
          key={edge.label}
          style={{
            position: 'absolute',
            [edge.side === 'top' ? 'top' : 'bottom']: edge.side === 'top' ? padding.top : padding.bottom,
            left: padding.left,
            right: padding.right,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 10,
            opacity: edge.opacity,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: '1px 5px',
              borderRadius: 3,
              backgroundColor: edge.bgColor,
              fontSize: 8,
              fontWeight: 600,
              color: edge.color,
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            <span>{edge.side === 'top' ? '\u2191' : '\u2193'}</span>
            <span>{edge.label}</span>
          </div>
        </div>
      ))}
    </>
  )
}

/* ───────── PulseTodayCard ───────── */

interface PulseTodayCardProps {
  symbol: string
  dayData: DayCandleData | undefined
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

const PulseTodayCard = memo(function PulseTodayCard({ symbol, dayData, stream1s, stream10s, theme, chartHeight = 420, dynamicXAxis = false, forceAggregation, morphProgress = 0, morphTargetCandles }: PulseTodayCardProps) {
  const [lineMode, setLineMode] = useState(false)
  const [internalAgg, setInternalAgg] = useState<'1min' | '5min'>('1min')
  const aggregation = forceAggregation ?? internalAgg
  const [pipVisible, setPipVisible] = useState(true)
  const [pipTimeframe, setPipTimeframe] = useState<PipTimeframe>('10s')
  const [pipLineMode, setPipLineMode] = useState(true)
  const [pipZoom, setPipZoom] = useState<number>(2)
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null)
  const [gradientMode, setGradientMode] = useState(true)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const pipContainerRef = useRef<HTMLDivElement>(null)

  // Drag handlers for PIP
  const handleDragStart = useCallback((e: React.MouseEvent) => {
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
      startX: e.clientX,
      startY: e.clientY,
      origX: currentX,
      origY: currentY,
    }

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current || !container) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const containerRect = container.getBoundingClientRect()

      // Clamp within container bounds (match PIP dimensions)
      const maxX = containerRect.width - 300
      const maxY = containerRect.height - 180
      const newX = Math.max(0, Math.min(maxX, dragRef.current.origX + dx))
      const newY = Math.max(0, Math.min(maxY, dragRef.current.origY + dy))

      setPipPos({ x: newX, y: newY })
    }

    const handleUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [])

  // Use 1s stream for card-level price/change (freshest)
  const stream = stream1s
  const pipStream = pipTimeframe === '1s' ? stream1s : stream10s
  const chartData = useChartData(pipStream)
  const mainChartStream = useMemo(() => {
    const stream10sCount = stream10s.candles.length + (stream10s.liveCandle ? 1 : 0)
    if (stream10sCount > 0) return stream10s

    const stream1sCount = stream1s.candles.length + (stream1s.liveCandle ? 1 : 0)
    if (stream1sCount > 0) return stream1s

    return null
  }, [stream10s, stream1s])
  const mainDayData = useMemo<DayCandleData | undefined>(() => {
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

  const price = stream.lastPrice ?? (mainDayData?.candles.length ? mainDayData.candles[mainDayData.candles.length - 1].close : 0)
  const change = stream.lastChange ?? 0
  // Prefer real-time stream changePct so it stays consistent with change
  const changePct = stream.lastChangePct ?? mainDayData?.changePct ?? 0
  const isPositive = changePct >= 0

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

  const pipColor = isPositive ? '#22c55e' : '#ef4444'

  const flashClass = flashColor === 'green'
    ? 'pulse-today-flash-green'
    : flashColor === 'red'
      ? 'pulse-today-flash-red'
      : ''

  const isDark = theme === 'dark'

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
            style={{ background: GOOGL_GRADIENT.glow, opacity: isDark ? 0.5 : 0.24 }}
          />
          <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_22%,transparent_72%,rgba(15,23,42,0.12))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_24%,transparent_74%,rgba(2,6,23,0.42))]" />
        </>
      )}

      {/* Content */}
      <div className={gradientMode ? 'relative z-20' : ''}>
      {/* Header */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
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
          <span className={`text-xs font-semibold tabular-nums ${
            gradientMode
              ? (isPositive ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300')
              : (isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')
          }`}>
            {isPositive ? '+' : ''}{change.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Aggregation: forced badge (with morph indicator) or interactive toggle */}
          {forceAggregation ? (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
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
                  onClick={() => setInternalAgg(agg)}
                  className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
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
            onClick={() => setLineMode((prev) => !prev)}
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors ${
              gradientMode
                ? 'border-white/20 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-white/10 backdrop-blur-sm'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {lineMode ? 'Candles' : 'Line'}
          </button>
          {/* Gradient toggle */}
          <button
            onClick={() => setGradientMode((prev) => !prev)}
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors ${
              gradientMode
                ? 'bg-white/30 dark:bg-white/20 border-white/20 dark:border-white/10 text-gray-900 dark:text-white backdrop-blur-sm'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            Gradient
          </button>
        </div>
      </div>

      {/* Price */}
      <div className="px-3 pb-2">
        <span className="text-xl font-semibold text-gray-900 dark:text-white tabular-nums">
          ${formatPrice(price)}
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
        />

        {/* Picture-in-picture: exaggerated 1s Liveline */}
        {pipVisible && (
          <div
            style={{
              position: 'absolute',
              ...(pipPos
                ? { left: pipPos.x, top: pipPos.y }
                : { top: 8, right: 68 }),
              width: 300,
              height: 180,
              borderRadius: 8,
              overflow: 'hidden',
              border: theme === 'dark' ? '1px solid rgba(75,85,99,0.6)' : '1px solid rgba(209,213,219,0.8)',
              boxShadow: theme === 'dark'
                ? '0 4px 12px rgba(0,0,0,0.4)'
                : '0 4px 12px rgba(0,0,0,0.1)',
              zIndex: 20,
              background: theme === 'dark' ? 'rgba(31,41,55,0.92)' : 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(4px)',
            }}
          >
            {/* PIP header — draggable thumb */}
            <div
              onMouseDown={handleDragStart}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '3px 6px',
                borderBottom: theme === 'dark' ? '1px solid rgba(75,85,99,0.4)' : '1px solid rgba(229,231,235,0.8)',
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {/* Drag handle dots */}
                <svg width="8" height="10" viewBox="0 0 8 10" style={{ opacity: 0.4 }}>
                  <circle cx="2" cy="2" r="1" fill={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                  <circle cx="6" cy="2" r="1" fill={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                  <circle cx="2" cy="5" r="1" fill={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                  <circle cx="6" cy="5" r="1" fill={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                  <circle cx="2" cy="8" r="1" fill={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                  <circle cx="6" cy="8" r="1" fill={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                </svg>
                {/* 1s / 10s toggle */}
                <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: theme === 'dark' ? '1px solid rgba(75,85,99,0.5)' : '1px solid rgba(209,213,219,0.7)' }}>
                  {(['1s', '10s'] as const).map((tf) => (
                    <button
                      key={tf}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setPipTimeframe(tf) }}
                      style={{
                        fontSize: 8,
                        fontWeight: 600,
                        padding: '1px 5px',
                        border: 'none',
                        cursor: 'pointer',
                        background: pipTimeframe === tf
                          ? (theme === 'dark' ? '#4b5563' : '#d1d5db')
                          : 'transparent',
                        color: pipTimeframe === tf
                          ? (theme === 'dark' ? '#f3f4f6' : '#111827')
                          : (theme === 'dark' ? '#9ca3af' : '#6b7280'),
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: theme === 'dark' ? '#d1d5db' : '#374151',
                }}>
                  Live
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {/* Zoom toggle */}
                <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: theme === 'dark' ? '1px solid rgba(75,85,99,0.5)' : '1px solid rgba(209,213,219,0.7)' }}>
                  {([1, 2, 4, 8, 16] as const).map((z) => (
                    <button
                      key={z}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setPipZoom(z) }}
                      style={{
                        fontSize: 8,
                        fontWeight: 600,
                        padding: '1px 4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: pipZoom === z
                          ? (theme === 'dark' ? '#4b5563' : '#d1d5db')
                          : 'transparent',
                        color: pipZoom === z
                          ? (theme === 'dark' ? '#f3f4f6' : '#111827')
                          : (theme === 'dark' ? '#9ca3af' : '#6b7280'),
                      }}
                    >
                      {z}x
                    </button>
                  ))}
                </div>
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setPipLineMode((prev) => !prev) }}
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    padding: '1px 5px',
                    borderRadius: 3,
                    border: theme === 'dark' ? '1px solid rgba(75,85,99,0.5)' : '1px solid rgba(209,213,219,0.7)',
                    cursor: 'pointer',
                    background: 'transparent',
                    color: theme === 'dark' ? '#9ca3af' : '#6b7280',
                  }}
                >
                  {pipLineMode ? 'Candles' : 'Line'}
                </button>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setPipVisible(false) }}
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  padding: '1px 5px',
                  borderRadius: 3,
                  cursor: 'pointer',
                  border: theme === 'dark' ? '1px solid rgba(75,85,99,0.5)' : '1px solid rgba(209,213,219,0.7)',
                  background: 'transparent',
                  color: theme === 'dark' ? '#9ca3af' : '#6b7280',
                }}
              >
                Collapse
              </button>
              </div>
            </div>
            {/* PIP Liveline chart with HOD/LOD overlay */}
            <div style={{ height: 156, position: 'relative' }}>
              <Liveline
                data={chartData?.lineData ?? []}
                value={chartData?.lineValue ?? price}
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
                labelFontSize={10}
                padding={{ top: 6, right: 56, bottom: 20, left: 6 }}
                formatValue={formatPrice}
                formatTime={() => ''}
              />
            </div>
          </div>
        )}

        {/* Toggle to re-show PIP if hidden */}
        {!pipVisible && (
          <button
            onClick={() => setPipVisible(true)}
            style={{
              position: 'absolute',
              top: 8,
              right: 68,
              zIndex: 20,
              fontSize: 9,
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              border: theme === 'dark' ? '1px solid rgba(75,85,99,0.6)' : '1px solid rgba(209,213,219,0.8)',
              background: theme === 'dark' ? 'rgba(31,41,55,0.9)' : 'rgba(255,255,255,0.9)',
              color: theme === 'dark' ? '#d1d5db' : '#374151',
              backdropFilter: 'blur(4px)',
            }}
          >
            PIP
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
    prev.stream1s.candles === next.stream1s.candles &&
    prev.stream1s.liveCandle === next.stream1s.liveCandle &&
    prev.stream1s.lastPrice === next.stream1s.lastPrice &&
    prev.stream1s.dayHigh === next.stream1s.dayHigh &&
    prev.stream1s.dayLow === next.stream1s.dayLow &&
    prev.stream1s.connected === next.stream1s.connected &&
    prev.stream10s.candles === next.stream10s.candles &&
    prev.stream10s.liveCandle === next.stream10s.liveCandle &&
    prev.stream10s.lastPrice === next.stream10s.lastPrice &&
    prev.stream10s.dayHigh === next.stream10s.dayHigh &&
    prev.stream10s.dayLow === next.stream10s.dayLow
  )
})

/* ───────── Replay stream adapter ───────── */

const SPEED_OPTIONS: ReplaySpeed[] = [1, 2, 5, 10]

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

/* ───────── Gradient meta for GOOGL (from PulseTextDashboard SYMBOL_META) ───────── */

const GOOGL_GRADIENT = {
  accent: '#2563eb',
  glow: 'rgba(37, 99, 235, 0.28)',
  gradient: 'linear-gradient(135deg, rgba(15,25,60,0.92), rgba(10,22,50,0.85) 45%, rgba(8,18,42,0.80))',
}

/* ───────── GradientPulseTodayCard ───────── */

interface GradientPulseTodayCardProps {
  symbol: string
  dayData: DayCandleData | undefined
  stream1s: LiveStreamState
  stream10s: LiveStreamState
  theme: ThemeMode
  chartHeight?: number
}

const GradientPulseTodayCard = memo(function GradientPulseTodayCard({
  symbol,
  dayData,
  stream1s,
  stream10s,
  theme,
  chartHeight = 420,
}: GradientPulseTodayCardProps) {
  const [lineMode, setLineMode] = useState(false)
  const [aggregation, setAggregation] = useState<'1min' | '5min'>('1min')
  const [pipVisible, setPipVisible] = useState(true)
  const [pipTimeframe, setPipTimeframe] = useState<'1s' | '10s'>('10s')
  const [pipLineMode, setPipLineMode] = useState(true)
  const [pipZoom, setPipZoom] = useState<number>(2)
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const pipContainerRef = useRef<HTMLDivElement>(null)

  // Drag handlers for PIP
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const pipEl = (e.currentTarget as HTMLElement).parentElement
    const container = pipContainerRef.current
    if (!pipEl || !container) return

    const containerRect = container.getBoundingClientRect()
    const pipRect = pipEl.getBoundingClientRect()
    const currentX = pipRect.left - containerRect.left
    const currentY = pipRect.top - containerRect.top

    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: currentX, origY: currentY }

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current || !container) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      const cr = container.getBoundingClientRect()
      const maxX = cr.width - 300
      const maxY = cr.height - 180
      setPipPos({
        x: Math.max(0, Math.min(maxX, dragRef.current.origX + dx)),
        y: Math.max(0, Math.min(maxY, dragRef.current.origY + dy)),
      })
    }

    const handleUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [])

  const stream = stream1s
  const pipStream = pipTimeframe === '1s' ? stream1s : stream10s
  const chartData = useChartData(pipStream)
  const sessionExtremes = useMemo(() => {
    const candleExtremes = getSessionExtremesForCandles(dayData?.candles ?? [])
    return {
      dayHigh: candleExtremes.dayHigh ?? stream.dayHigh,
      dayLow: candleExtremes.dayLow ?? stream.dayLow,
    }
  }, [dayData?.candles, stream.dayHigh, stream.dayLow])
  const displayDayHigh = sessionExtremes.dayHigh
  const displayDayLow = sessionExtremes.dayLow
  const degenOpts = useDegenScale(stream.lastPrice, displayDayHigh, displayDayLow)

  const price = stream.lastPrice ?? (dayData?.candles.length ? dayData.candles[dayData.candles.length - 1].close : 0)
  const change = stream.lastChange ?? 0
  const changePct = stream.lastChangePct ?? dayData?.changePct ?? 0
  const isPositive = changePct >= 0
  const isDark = theme === 'dark'

  const pipBaseWindow = pipTimeframe === '1s' ? 30 : 300
  const pipWindowSecs = pipBaseWindow * pipZoom

  // Reference line (HOD/LOD) for PIP
  const pipRefLine = useMemo(() => {
    const lp = stream.lastPrice
    const hod = displayDayHigh
    const lod = displayDayLow
    if (lp === null || (hod === null && lod === null)) return undefined
    const threshold = 0.01
    const distToHod = hod !== null ? Math.abs(lp - hod) / lp : Infinity
    const distToLod = lod !== null ? Math.abs(lp - lod) / lp : Infinity
    if (distToLod <= distToHod && distToLod <= threshold && lod !== null) {
      return { value: lod, label: `LOD $${formatPrice(lod)}` }
    }
    if (distToHod < distToLod && distToHod <= threshold && hod !== null) {
      return { value: hod, label: `HOD $${formatPrice(hod)}` }
    }
    return undefined
  }, [stream.lastPrice, displayDayHigh, displayDayLow])

  // LOD blink
  const isNearLOD = useMemo(() => {
    const lp = stream.lastPrice
    const lod = displayDayLow
    if (lp === null || lod === null || lod === 0) return false
    return Math.abs(lp - lod) / lod < 0.005
  }, [stream.lastPrice, displayDayLow])

  const [lodBlinkRed, setLodBlinkRed] = useState(false)
  useEffect(() => {
    if (!isNearLOD) { setLodBlinkRed(false); return }
    const id = setInterval(() => setLodBlinkRed((v) => !v), 800)
    return () => clearInterval(id)
  }, [isNearLOD])

  const coloredRefLine = useMemo(() => {
    if (!pipRefLine) return undefined
    if (isNearLOD && pipRefLine.value === displayDayLow && lodBlinkRed) {
      return { ...pipRefLine, color: 'rgba(239, 68, 68, 0.9)' }
    }
    return pipRefLine
  }, [pipRefLine, isNearLOD, lodBlinkRed, displayDayLow])

  const pipColor = isPositive ? '#22c55e' : '#ef4444'

  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200/80 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Glow */}
      <div
        className="pointer-events-none absolute inset-x-6 top-6 z-10 h-24 rounded-full blur-3xl"
        style={{ background: GOOGL_GRADIENT.glow, opacity: isDark ? 0.5 : 0.24 }}
      />
      {/* Scrim overlay */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_22%,transparent_72%,rgba(15,23,42,0.12))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_24%,transparent_74%,rgba(2,6,23,0.42))]" />

      {/* Content (above overlays) */}
      <div className="relative z-20">
        {/* Header */}
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-sm font-bold bg-white/20 dark:bg-white/10 text-gray-900 dark:text-white backdrop-blur-sm">
              {symbol}
            </span>
            {changePct !== null && (
              <span className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded backdrop-blur-sm ${
                isPositive
                  ? 'bg-green-500/20 text-green-800 dark:text-green-300'
                  : 'bg-red-500/20 text-red-800 dark:text-red-300'
              }`}>
                {isPositive ? '+' : ''}{changePct.toFixed(2)}%
              </span>
            )}
            <span className={`text-xs font-semibold tabular-nums ${
              isPositive
                ? 'text-green-700 dark:text-green-300'
                : 'text-red-700 dark:text-red-300'
            }`}>
              {isPositive ? '+' : ''}{change.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded border border-white/20 dark:border-white/10 overflow-hidden backdrop-blur-sm">
              {(['1min', '5min'] as const).map((agg) => (
                <button
                  key={agg}
                  onClick={() => setAggregation(agg)}
                  className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    aggregation === agg
                      ? 'bg-white/30 dark:bg-white/20 text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {agg === '1min' ? '1m' : '5m'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setLineMode((prev) => !prev)}
              className="px-1.5 py-0.5 text-[10px] font-medium rounded border border-white/20 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-white/10 transition-colors backdrop-blur-sm"
            >
              {lineMode ? 'Candles' : 'Line'}
            </button>
          </div>
        </div>

        {/* Price */}
        <div className="px-3 pb-2">
          <span className="text-xl font-semibold text-gray-900 dark:text-white tabular-nums">
            ${formatPrice(price)}
          </span>
        </div>

        {/* Chart area with PIP overlay */}
        <div ref={pipContainerRef} style={{ position: 'relative' }}>
          <FullDayCanvas
            candles={dayData?.candles ?? []}
            previousClose={dayData?.previousClose ?? null}
            lastPrice={stream.lastPrice}
            dayHigh={displayDayHigh}
            dayLow={displayDayLow}
            lineMode={lineMode}
            aggregation={aggregation}
            theme={theme}
            chartHeight={chartHeight}
          />

          {/* Picture-in-picture: exaggerated Liveline */}
          {pipVisible && (
            <div
              style={{
                position: 'absolute',
                ...(pipPos
                  ? { left: pipPos.x, top: pipPos.y }
                  : { top: 8, right: 68 }),
                width: 300,
                height: 180,
                borderRadius: 8,
                overflow: 'hidden',
                border: isDark ? '1px solid rgba(75,85,99,0.6)' : '1px solid rgba(209,213,219,0.8)',
                boxShadow: isDark
                  ? '0 4px 12px rgba(0,0,0,0.4)'
                  : '0 4px 12px rgba(0,0,0,0.1)',
                zIndex: 20,
                background: isDark ? 'rgba(31,41,55,0.92)' : 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(4px)',
              }}
            >
              {/* PIP header — draggable thumb */}
              <div
                onMouseDown={handleDragStart}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '3px 6px',
                  borderBottom: isDark ? '1px solid rgba(75,85,99,0.4)' : '1px solid rgba(229,231,235,0.8)',
                  cursor: 'grab',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="8" height="10" viewBox="0 0 8 10" style={{ opacity: 0.4 }}>
                    <circle cx="2" cy="2" r="1" fill={isDark ? '#9ca3af' : '#6b7280'} />
                    <circle cx="6" cy="2" r="1" fill={isDark ? '#9ca3af' : '#6b7280'} />
                    <circle cx="2" cy="5" r="1" fill={isDark ? '#9ca3af' : '#6b7280'} />
                    <circle cx="6" cy="5" r="1" fill={isDark ? '#9ca3af' : '#6b7280'} />
                    <circle cx="2" cy="8" r="1" fill={isDark ? '#9ca3af' : '#6b7280'} />
                    <circle cx="6" cy="8" r="1" fill={isDark ? '#9ca3af' : '#6b7280'} />
                  </svg>
                  <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: isDark ? '1px solid rgba(75,85,99,0.5)' : '1px solid rgba(209,213,219,0.7)' }}>
                    {(['1s', '10s'] as const).map((tf) => (
                      <button
                        key={tf}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setPipTimeframe(tf) }}
                        style={{
                          fontSize: 8,
                          fontWeight: 600,
                          padding: '1px 5px',
                          border: 'none',
                          cursor: 'pointer',
                          background: pipTimeframe === tf
                            ? (isDark ? '#4b5563' : '#d1d5db')
                            : 'transparent',
                          color: pipTimeframe === tf
                            ? (isDark ? '#f3f4f6' : '#111827')
                            : (isDark ? '#9ca3af' : '#6b7280'),
                        }}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 600, color: isDark ? '#d1d5db' : '#374151' }}>
                    Live
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: isDark ? '1px solid rgba(75,85,99,0.5)' : '1px solid rgba(209,213,219,0.7)' }}>
                    {([1, 2, 4, 8, 16] as const).map((z) => (
                      <button
                        key={z}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setPipZoom(z) }}
                        style={{
                          fontSize: 8,
                          fontWeight: 600,
                          padding: '1px 4px',
                          border: 'none',
                          cursor: 'pointer',
                          background: pipZoom === z
                            ? (isDark ? '#4b5563' : '#d1d5db')
                            : 'transparent',
                          color: pipZoom === z
                            ? (isDark ? '#f3f4f6' : '#111827')
                            : (isDark ? '#9ca3af' : '#6b7280'),
                        }}
                      >
                        {z}x
                      </button>
                    ))}
                  </div>
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setPipLineMode((prev) => !prev) }}
                    style={{
                      fontSize: 8,
                      fontWeight: 600,
                      padding: '1px 5px',
                      borderRadius: 3,
                      border: isDark ? '1px solid rgba(75,85,99,0.5)' : '1px solid rgba(209,213,219,0.7)',
                      cursor: 'pointer',
                      background: 'transparent',
                      color: isDark ? '#9ca3af' : '#6b7280',
                    }}
                  >
                    {pipLineMode ? 'Candles' : 'Line'}
                  </button>
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setPipVisible(false) }}
                    style={{
                      fontSize: 8,
                      fontWeight: 600,
                      padding: '1px 5px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      border: isDark ? '1px solid rgba(75,85,99,0.5)' : '1px solid rgba(209,213,219,0.7)',
                      background: 'transparent',
                      color: isDark ? '#9ca3af' : '#6b7280',
                    }}
                  >
                    Collapse
                  </button>
                </div>
              </div>
              {/* PIP Liveline chart */}
              <div style={{ height: 156, position: 'relative' }}>
                <Liveline
                  data={chartData?.lineData ?? []}
                  value={chartData?.lineValue ?? price}
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
                  labelFontSize={10}
                  padding={{ top: 6, right: 56, bottom: 20, left: 6 }}
                  formatValue={formatPrice}
                  formatTime={() => ''}
                />
              </div>
            </div>
          )}

          {/* Toggle to re-show PIP if hidden */}
          {!pipVisible && (
            <button
              onClick={() => setPipVisible(true)}
              style={{
                position: 'absolute',
                top: 8,
                right: 68,
                zIndex: 20,
                fontSize: 9,
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                border: isDark ? '1px solid rgba(75,85,99,0.6)' : '1px solid rgba(209,213,219,0.8)',
                background: isDark ? 'rgba(31,41,55,0.9)' : 'rgba(255,255,255,0.9)',
                color: isDark ? '#d1d5db' : '#374151',
                backdropFilter: 'blur(4px)',
              }}
            >
              PIP
            </button>
          )}
        </div>
      </div>
    </div>
  )
}, (prev, next) => {
  return (
    prev.symbol === next.symbol &&
    prev.theme === next.theme &&
    prev.chartHeight === next.chartHeight &&
    prev.dayData === next.dayData &&
    prev.stream1s.candles === next.stream1s.candles &&
    prev.stream1s.liveCandle === next.stream1s.liveCandle &&
    prev.stream1s.lastPrice === next.stream1s.lastPrice &&
    prev.stream1s.dayHigh === next.stream1s.dayHigh &&
    prev.stream1s.dayLow === next.stream1s.dayLow &&
    prev.stream1s.connected === next.stream1s.connected &&
    prev.stream10s.candles === next.stream10s.candles &&
    prev.stream10s.liveCandle === next.stream10s.liveCandle &&
    prev.stream10s.lastPrice === next.stream10s.lastPrice &&
    prev.stream10s.dayHigh === next.stream10s.dayHigh &&
    prev.stream10s.dayLow === next.stream10s.dayLow
  )
})

/**
 * Converts ReplayState output into a LiveStreamState-compatible object.
 * - Time-shifts candles so the latest maps to "now" (Liveline anchors to wall-clock)
 * - Computes dayHigh/dayLow from all revealed candles
 */
function useReplayStream(replay: ReturnType<typeof useReplay>): LiveStreamState {
  return useMemo(() => {
    if (replay.candles.length === 0 && !replay.liveCandle) {
      return {
        ...EMPTY_STREAM,
        lastPrice: replay.lastPrice,
        lastChange: replay.lastChange,
        lastChangePct: replay.lastChangePct,
        previousClose: replay.previousClose,
        error: replay.error,
      }
    }

    // Time-shift: latest revealed candle → "now"
    const latestOriginal = replay.liveCandle?.time
      ?? (replay.candles.length > 0 ? replay.candles[replay.candles.length - 1].time : 0)
    const nowSecs = Math.floor(Date.now() / 1000)
    const timeShift = nowSecs - latestOriginal

    const shiftedCandles = replay.candles.map((c) => ({
      time: c.time + timeShift,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))

    const shiftedLive = replay.liveCandle
      ? {
          time: replay.liveCandle.time + timeShift,
          open: replay.liveCandle.open,
          high: replay.liveCandle.high,
          low: replay.liveCandle.low,
          close: replay.liveCandle.close,
        }
      : undefined

    // Compute dayHigh/dayLow from all revealed candles
    let dayHigh = -Infinity
    let dayLow = Infinity
    for (const c of replay.candles) {
      if (c.high > dayHigh) dayHigh = c.high
      if (c.low < dayLow) dayLow = c.low
    }
    if (replay.liveCandle) {
      if (replay.liveCandle.high > dayHigh) dayHigh = replay.liveCandle.high
      if (replay.liveCandle.low < dayLow) dayLow = replay.liveCandle.low
    }

    return {
      candles: shiftedCandles,
      liveCandle: shiftedLive,
      lastPrice: replay.lastPrice,
      lastChange: replay.lastChange,
      lastChangePct: replay.lastChangePct,
      previousClose: replay.previousClose,
      dayHigh: isFinite(dayHigh) ? dayHigh : null,
      dayLow: isFinite(dayLow) ? dayLow : null,
      connected: false,
      error: replay.error,
    }
  }, [replay.candles, replay.liveCandle, replay.lastPrice, replay.lastChange, replay.lastChangePct, replay.previousClose, replay.error])
}

/* ───────── Replay 1s → 1min aggregated candles (live growing) ───────── */

function useReplayAggregatedCandles(replay: ReturnType<typeof useReplay>): DayCandleData | undefined {
  return useMemo(() => {
    const revealed = [...replay.candles]
    if (replay.liveCandle) revealed.push(replay.liveCandle)
    if (revealed.length === 0) return undefined

    // Bucket by minute — floor unix seconds to 60s boundary.
    // ET offset is whole hours, so UTC minute boundaries = ET minute boundaries.
    const buckets = new Map<number, { open: number; high: number; low: number; close: number }>()
    const bucketOrder: number[] = []

    for (const c of revealed) {
      const key = Math.floor(c.time / 60) * 60
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

    // Convert to DayCandle[] — formatToParts only once per bucket (~390 max)
    const etFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const candles: DayCandle[] = bucketOrder.map((key) => {
      const ohlc = buckets.get(key)!
      const parts = etFmt.formatToParts(new Date(key * 1000))
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
      return {
        date: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:00`,
        ...ohlc,
      }
    })

    return {
      candles,
      previousClose: replay.previousClose,
      changePct: replay.lastChangePct,
    }
  }, [replay.candles, replay.liveCandle, replay.previousClose, replay.lastChangePct])
}

/* ───────── Replay 1s → adaptive 10s/1min candles ───────── */

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
    const parts = etFmt.formatToParts(new Date(key * 1000))
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
    return {
      date: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`,
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

export function useReplayAdaptiveCandles(replay: ReturnType<typeof useReplay>): {
  dayData10s: DayCandleData | undefined
  dayData1min: DayCandleData | undefined
  mode: '10s' | '1min'
} {
  return useMemo(() => {
    const revealed = [...replay.candles]
    if (replay.liveCandle) revealed.push(replay.liveCandle)
    if (revealed.length === 0) return { dayData10s: undefined, dayData1min: undefined, mode: '10s' as const }

    // Determine elapsed time
    const firstTime = revealed[0].time
    const lastTime = revealed[revealed.length - 1].time
    const elapsed = lastTime - firstTime

    // Threshold: 15 minutes (900s)
    const mode = elapsed < 900 ? '10s' as const : '1min' as const

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

    // Always bucket into both 10s and 1min simultaneously
    const candles10s = bucketCandles(revealed, 10, etFmt)
    const candles1min = bucketCandles(revealed, 60, etFmt)

    const shared = {
      previousClose: replay.previousClose,
      changePct: replay.lastChangePct,
    }

    return {
      dayData10s: { candles: candles10s, ...shared },
      dayData1min: { candles: candles1min, ...shared },
      mode,
    }
  }, [replay.candles, replay.liveCandle, replay.previousClose, replay.lastChangePct])
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

  // Active symbol — updated when user clicks a ticker in the movers tables
  const [activeSymbol, setActiveSymbol] = useState('GOOGL')
  const liveSymbols = useMemo(() => [activeSymbol], [activeSymbol])

  // Replay state
  const [replayConfig, setReplayConfig] = useState<ReplayConfig | null>(null)
  const isReplay = !!replayConfig
  const replay = useReplay(replayConfig)
  const replayStream = useReplayStream(replay)
  const aggregatedDayData = useReplayAggregatedCandles(replay)
  const { dayData10s: adaptiveData10s, dayData1min: adaptiveData1min, mode: adaptiveMode } = useReplayAdaptiveCandles(replay)

  // Morph animation: 10s → 1min transition
  const prevAdaptiveModeRef = useRef(adaptiveMode)
  const [morphProgress, setMorphProgress] = useState(0)

  useEffect(() => {
    if (prevAdaptiveModeRef.current === '10s' && adaptiveMode === '1min') {
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
  const dayCandles = useDayCandles(liveSymbols)

  const startReplay = useCallback(() => {
    setReplayConfig({
      symbol: 'GOOGL',
      date: '2026-03-13',
      from: '09:30',
      to: '16:00',
      timeframe: '1s',
    })
  }, [])

  const exitReplay = useCallback(() => {
    setReplayConfig(null)
  }, [])

  // Progress percentage
  const progressPct = replay.totalCandles > 0
    ? Math.round((replay.revealedCount / replay.totalCandles) * 100)
    : 0

  // In replay mode, reveal dayData candles proportionally to the scrubber position.
  // Filter to regular market hours only (9:30–16:00) so pre-market candles don't
  // consume fraction without being visible on the chart.
  const replayDayData = useMemo<DayCandleData | undefined>(() => {
    if (!isReplay) return undefined
    const base = dayCandles['GOOGL']
    if (!base || base.candles.length === 0) return base
    if (replay.totalCandles === 0) return { ...base, candles: [] }

    const marketOnly = [...base.candles]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((c) => {
        const parts = c.date.split(' ')
        const timeParts = (parts[1] ?? '00:00:00').split(':')
        const totalMins = parseInt(timeParts[0] ?? '0', 10) * 60 + parseInt(timeParts[1] ?? '0', 10)
        return totalMins >= 570 && totalMins <= 960 // 9:30 AM – 4:00 PM
      })

    const fraction = replay.revealedCount / replay.totalCandles
    const visibleCount = Math.round(fraction * marketOnly.length)
    return { ...base, candles: marketOnly.slice(0, visibleCount) }
  }, [isReplay, dayCandles, replay.totalCandles, replay.revealedCount])

  // Scrubber drag state
  const scrubBarRef = useRef<HTMLDivElement>(null)
  const wasPlayingRef = useRef(false)

  const seekFromPointer = useCallback((clientX: number) => {
    const bar = scrubBarRef.current
    if (!bar || replay.totalCandles === 0) return
    const rect = bar.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const index = Math.round(fraction * replay.totalCandles)
    replay.seek(index)
  }, [replay.totalCandles, replay.seek])

  const handleScrubStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    wasPlayingRef.current = replay.status === 'playing'
    if (replay.status === 'playing') replay.pause()
    seekFromPointer(e.clientX)

    const handleMove = (ev: MouseEvent) => seekFromPointer(ev.clientX)
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      if (wasPlayingRef.current) replay.play()
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [replay.status, replay.pause, replay.play, seekFromPointer])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pulse Today</h1>
        <div className="flex items-center gap-2">
          {!isReplay ? (
            <>
              <button
                onClick={startReplay}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors cursor-pointer"
              >
                Replay
              </button>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
                </span>
                Live
              </span>
            </>
          ) : (
            <>
              {/* Replay badge */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                REPLAY GOOGL
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                {replayConfig?.date} {replayConfig?.from}–{replayConfig?.to}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                {progressPct}%
              </span>
              <button
                onClick={exitReplay}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer"
              >
                Exit
              </button>
            </>
          )}
        </div>
      </div>

      {/* Replay playback controls — sticky so they stay visible when scrolling to lower charts */}
      {isReplay && (
        <div className="sticky top-0 z-30 flex items-center gap-3 mb-4 px-3 py-2 rounded-lg bg-purple-50/95 dark:bg-purple-900/80 border border-purple-200 dark:border-purple-800/30 backdrop-blur-sm">
          {/* Play / Pause */}
          <button
            onClick={() => replay.status === 'playing' ? replay.pause() : replay.play()}
            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-purple-600 hover:bg-purple-700 text-white transition-colors"
          >
            {replay.status === 'playing' ? (
              <svg width="10" height="12" viewBox="0 0 10 12"><rect x="1" y="1" width="3" height="10" fill="currentColor" /><rect x="6" y="1" width="3" height="10" fill="currentColor" /></svg>
            ) : (
              <svg width="10" height="12" viewBox="0 0 10 12"><polygon points="1,0 10,6 1,12" fill="currentColor" /></svg>
            )}
          </button>

          {/* Reset */}
          <button
            onClick={replay.reset}
            className="text-xs font-medium text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 transition-colors"
          >
            Reset
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-purple-200 dark:bg-purple-800/40" />

          {/* Skip controls */}
          <button
            onClick={() => replay.skip(-5)}
            className="text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors tabular-nums"
          >
            -5s
          </button>
          <button
            onClick={() => replay.skip(5)}
            className="text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors tabular-nums"
          >
            +5s
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-purple-200 dark:bg-purple-800/40" />

          {/* Speed pills */}
          <div className="flex rounded border border-purple-300 dark:border-purple-700 overflow-hidden">
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => replay.setSpeed(s)}
                className={`px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  replay.speed === s
                    ? 'bg-purple-600 text-white'
                    : 'text-purple-600 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Status */}
          <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 capitalize">
            {replay.status}
          </span>

          {/* Scrubber */}
          <div
            ref={scrubBarRef}
            onMouseDown={handleScrubStart}
            className="flex-1 h-4 flex items-center cursor-pointer group"
          >
            <div className="relative w-full h-1.5 bg-purple-200 dark:bg-purple-800/30 rounded-full">
              <div
                className="h-full bg-purple-500 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
              {/* Thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-purple-600 border-2 border-white dark:border-gray-800 shadow-sm group-hover:scale-125 transition-transform"
                style={{ left: `calc(${progressPct}% - 6px)` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* GOOGL cards — two side-by-side in replay for comparison, single otherwise */}
      {isReplay && (
        <div className="grid grid-cols-2 gap-4">
          <PulseTodayCard
            symbol="GOOGL"
            dayData={replayDayData}
            stream1s={replayStream}
            stream10s={replayStream}
            theme={theme}
            chartHeight={340}
          />
          <PulseTodayCard
            symbol="GOOGL"
            dayData={replayDayData}
            stream1s={replayStream}
            stream10s={replayStream}
            theme={theme}
            chartHeight={340}
            dynamicXAxis
          />
        </div>
      )}

      {/* Third chart: live growing candlesticks (replay only) */}
      {isReplay && (
        <div className="mt-4">
          <PulseTodayCard
            symbol="GOOGL"
            dayData={aggregatedDayData}
            stream1s={replayStream}
            stream10s={replayStream}
            theme={theme}
            chartHeight={420}
            dynamicXAxis
          />
        </div>
      )}

      {/* Fourth chart: adaptive 10s→1min growing candles with morph animation (replay only) */}
      {isReplay && (
        <div className="mt-4">
          <PulseTodayCard
            symbol="GOOGL"
            dayData={morphProgress < 1 ? adaptiveData10s : adaptiveData1min}
            stream1s={replayStream}
            stream10s={replayStream}
            theme={theme}
            chartHeight={420}
            dynamicXAxis
            forceAggregation={morphProgress < 1 ? '10s' : '1min'}
            morphProgress={morphProgress}
            morphTargetCandles={morphProgress < 1 ? adaptiveData1min?.candles : undefined}
          />
        </div>
      )}

      {!isReplay && (
        <div className="flex gap-4">
          {/* Charts column — fixed width to preserve chart size */}
          <div className="max-w-3xl w-full space-y-4">
            <PulseTodayCard
              symbol={activeSymbol}
              dayData={dayCandles[activeSymbol]}
              stream1s={streams1s[activeSymbol] ?? EMPTY_STREAM}
              stream10s={streams10s[activeSymbol] ?? EMPTY_STREAM}
              theme={theme}
            />
          </div>

          {/* Gainers / Losers sidebar — side by side */}
          {gainersData && losersData && (
            <div className="shrink-0 flex gap-3">
              <div className="w-60">
                <MarketMoversTable title="Gainers" data={gainersData} maxRows={8} onSymbolClick={setActiveSymbol} />
              </div>
              <div className="w-60">
                <MarketMoversTable title="Losers" data={losersData} maxRows={8} onSymbolClick={setActiveSymbol} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
