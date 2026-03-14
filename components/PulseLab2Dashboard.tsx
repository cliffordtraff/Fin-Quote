'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Liveline } from 'liveline'
import type { CandlePoint } from 'liveline'
import { useTheme } from '@/components/ThemeProvider'
import { useMultiStream } from '@/lib/hooks/use-multi-stream'
import type { LiveStreamState } from '@/lib/hooks/use-live-stream'

const SYMBOLS = ['GOOGL', 'AAPL', 'NVDA', 'TSLA'] as const

type Timeframe = '1s' | '10s'
type ThemeMode = 'light' | 'dark'

/* ───────── Shared helpers (copied from PulseLabDashboard) ───────── */

function formatPrice(v: number) {
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

/* ───────── Day candles hook ───────── */

interface DayCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
}

interface DayCandleData {
  candles: DayCandle[]
  previousClose: number | null
  changePct: number | null
}

interface Candle5Min {
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
  for (const group of buckets.values()) {
    bars.push({
      open: group[0].open,
      high: Math.max(...group.map((g) => g.high)),
      low: Math.min(...group.map((g) => g.low)),
      close: group[group.length - 1].close,
    })
  }
  return bars
}

function useDayCandles(symbols: readonly string[]): Record<string, DayCandleData> {
  const [data, setData] = useState<Record<string, DayCandleData>>({})

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      const results = await Promise.allSettled(
        symbols.map(async (sym) => {
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
          const candles: DayCandle[] = json.todayOHLC ?? []
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
  }, [symbols])

  return data
}

/* ═══════════════════════════════════════════════════════════════════
   Approach #2: Split Chart (Daily + Live)
   ═══════════════════════════════════════════════════════════════════ */

function SplitChartCanvas({
  candles,
  previousClose,
  chartHeight = 120,
  padding = { top: 6, right: 50, bottom: 6, left: 6 },
  theme,
}: {
  candles: DayCandle[]
  previousClose: number | null
  chartHeight?: number
  padding?: { top: number; right: number; bottom: number; left: number }
  theme: ThemeMode
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const bars = useMemo(() => aggregateTo5Min(candles), [candles])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || bars.length === 0) return

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

    // Y-axis: full day range with 5% buffer
    const allLows = bars.map((b) => b.low)
    const allHighs = bars.map((b) => b.high)
    const minP = Math.min(...allLows)
    const maxP = Math.max(...allHighs)
    const range = maxP - minP || 1
    const buffer = range * 0.05
    const yMin = minP - buffer
    const yMax = maxP + buffer
    const yRange = yMax - yMin

    const chartTop = padding.top
    const chartBottom = height - padding.bottom
    const chartAreaH = chartBottom - chartTop
    const drawLeft = padding.left
    const drawRight = width - padding.right
    const drawW = drawRight - drawLeft

    const priceToY = (p: number) => chartTop + (1 - (p - yMin) / yRange) * chartAreaH

    // Previous close dashed line
    if (previousClose !== null && previousClose >= yMin && previousClose <= yMax) {
      const prevY = priceToY(previousClose)
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = theme === 'dark' ? 'rgba(156,163,175,0.35)' : 'rgba(107,114,128,0.35)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(drawLeft, prevY)
      ctx.lineTo(drawRight, prevY)
      ctx.stroke()
      ctx.restore()
    }

    // Draw each 5-min bar at full opacity
    const barSpacing = drawW / bars.length
    const bodyWidth = Math.max(barSpacing * 0.5, 2)

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i]
      const cx = drawLeft + (i + 0.5) * barSpacing
      const isUp = bar.close >= bar.open
      const green = theme === 'dark' ? 'rgba(74,222,128,1)' : 'rgba(34,197,94,1)'
      const red = theme === 'dark' ? 'rgba(248,113,113,1)' : 'rgba(239,68,68,1)'
      const color = isUp ? green : red

      // Wick (high → low)
      const wickX = Math.round(cx)
      const highY = priceToY(bar.high)
      const lowY = priceToY(bar.low)
      ctx.beginPath()
      ctx.moveTo(wickX + 0.5, highY)
      ctx.lineTo(wickX + 0.5, lowY)
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.stroke()

      // Body (open → close)
      const openY = priceToY(bar.open)
      const closeY = priceToY(bar.close)
      const bodyTop = Math.min(openY, closeY)
      const bodyH = Math.max(Math.abs(closeY - openY), 1)
      ctx.fillStyle = color
      ctx.fillRect(cx - bodyWidth / 2, bodyTop, bodyWidth, bodyH)
    }

    // "Now" marker: thin vertical line at the right edge of data
    const nowX = drawLeft + (bars.length - 0.5) * barSpacing
    ctx.save()
    ctx.strokeStyle = theme === 'dark' ? 'rgba(129,140,248,0.5)' : 'rgba(99,102,241,0.4)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(nowX, chartTop)
    ctx.lineTo(nowX, chartBottom)
    ctx.stroke()
    ctx.restore()
  }, [bars, previousClose, chartHeight, padding, theme])

  if (bars.length === 0) return null

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0 }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}

function Approach2Card({
  symbol,
  stream,
  chartData,
  dayData,
  theme,
  timeframe,
}: {
  symbol: string
  stream: LiveStreamState
  chartData: ChartData | null
  dayData: DayCandleData | undefined
  theme: ThemeMode
  timeframe: Timeframe
}) {
  const [lineMode, setLineMode] = useState(true)
  const handleModeChange = useCallback(() => setLineMode((prev) => !prev), [])

  const price = stream.lastPrice ?? 0
  const change = stream.lastChange ?? 0
  const changePct = stream.lastChangePct ?? 0
  const isPositive = change >= 0
  const windowSecs = timeframe === '1s' ? 30 : 300
  const candleWidth = timeframe === '1s' ? 1 : 10

  const refLine =
    stream.previousClose !== null && stream.previousClose > 0
      ? { value: stream.previousClose, label: 'Prev Close' }
      : undefined

  const splitPadding = { top: 4, right: 50, bottom: 40, left: 4 }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative">
      {/* Header */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
            {symbol}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
            Split Chart
          </span>
          {stream.connected && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
            </span>
          )}
        </div>
        <button
          onClick={handleModeChange}
          className="px-2 py-0.5 text-[10px] font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {lineMode ? 'Candles' : 'Line'}
        </button>
      </div>

      {/* Price */}
      <div className="px-3 pb-2">
        <span className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">
          {formatPrice(price)}
        </span>
        <span
          className={`ml-2 text-xs font-medium tabular-nums ${
            isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
        </span>
      </div>

      {/* Top section: Full day candlesticks */}
      <div style={{ height: 120, position: 'relative' }}>
        {dayData && dayData.candles.length > 0 && (
          <SplitChartCanvas
            candles={dayData.candles}
            previousClose={dayData.previousClose}
            chartHeight={120}
            theme={theme}
          />
        )}
        {(!dayData || dayData.candles.length === 0) && (
          <div className="flex items-center justify-center h-full text-xs text-gray-400">
            Loading day data...
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-700" />

      {/* Bottom section: Live zoomed-in Liveline */}
      <div style={{ height: 159, position: 'relative' }}>
        <Liveline
          data={chartData?.lineData ?? []}
          value={chartData?.lineValue ?? price}
          mode={'candle' as const}
          candles={chartData?.candles ?? []}
          liveCandle={chartData?.liveCandle}
          candleWidth={candleWidth}
          lineMode={lineMode}
          lineData={chartData?.lineData ?? []}
          lineValue={chartData?.lineValue}
          onModeChange={handleModeChange}
          loading={!chartData}
          emptyText={stream.error ?? undefined}
          window={windowSecs}
          theme={theme}
          color={isPositive ? '#22c55e' : '#ef4444'}
          grid={true}
          badge={true}
          scrub={true}
          fill={true}
          pulse={true}
          momentum={true}
          referenceLine={refLine}
          padding={splitPadding}
          formatValue={formatPrice}
          formatTime={formatTime}
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Approach #3: Zoom Transition (Day/Live Toggle)
   ═══════════════════════════════════════════════════════════════════ */

function Approach3Card({
  symbol,
  stream,
  chartData,
  dayData,
  theme,
  timeframe,
}: {
  symbol: string
  stream: LiveStreamState
  chartData: ChartData | null
  dayData: DayCandleData | undefined
  theme: ThemeMode
  timeframe: Timeframe
}) {
  const [viewMode, setViewMode] = useState<'day' | 'live'>('live')
  const [lineMode, setLineMode] = useState(true)
  const handleModeChange = useCallback(() => setLineMode((prev) => !prev), [])

  const price = stream.lastPrice ?? 0
  const change = stream.lastChange ?? 0
  const changePct = stream.lastChangePct ?? 0
  const isPositive = change >= 0

  const refLine =
    stream.previousClose !== null && stream.previousClose > 0
      ? { value: stream.previousClose, label: 'Prev Close' }
      : undefined

  // Day view: convert 1-min day candles to line points
  // Shift timestamps so the last point aligns with "now" — Liveline anchors
  // its viewport to the current wall-clock time, so historical timestamps
  // would fall outside the visible window.
  const dayLineData = useMemo(() => {
    if (!dayData || dayData.candles.length === 0) return []
    const rawPoints = dayData.candles.map((c) => ({
      time: new Date(c.date.replace(' ', 'T')).getTime() / 1000,
      value: c.close,
    }))
    const nowSecs = Date.now() / 1000
    const lastTime = rawPoints[rawPoints.length - 1].time
    const offset = nowSecs - lastTime
    return rawPoints.map((p) => ({
      time: p.time + offset,
      value: p.value,
    }))
  }, [dayData])

  const dayDuration = useMemo(() => {
    if (dayLineData.length < 2) return 300
    return dayLineData[dayLineData.length - 1].time - dayLineData[0].time + 60
  }, [dayLineData])

  // Choose data and window based on view mode
  const isDay = viewMode === 'day'
  const displayData = isDay ? dayLineData : (chartData?.lineData ?? [])
  const displayValue = isDay
    ? (dayLineData.length > 0 ? dayLineData[dayLineData.length - 1].value : price)
    : (chartData?.lineValue ?? price)
  const displayWindow = isDay ? dayDuration : (timeframe === '1s' ? 30 : 300)

  const chartPadding = { top: 8, right: 70, bottom: 64, left: 8 }
  const chartHeight = 280
  const candleWidth = timeframe === '1s' ? 1 : 10

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative">
      {/* Header */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
            {symbol}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Zoom Toggle
          </span>
          {stream.connected && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
            </span>
          )}
        </div>

        {/* Day/Live toggle pill */}
        <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
          <button
            onClick={() => setViewMode('day')}
            className={`px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
              isDay
                ? 'bg-sage-500 text-white dark:bg-sage-600'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setViewMode('live')}
            className={`px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
              !isDay
                ? 'bg-sage-500 text-white dark:bg-sage-600'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Live
          </button>
        </div>
      </div>

      {/* Price */}
      <div className="px-3 pb-2">
        <span className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">
          {formatPrice(price)}
        </span>
        <span
          className={`ml-2 text-xs font-medium tabular-nums ${
            isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
        </span>
      </div>

      {/* Chart */}
      <div style={{ height: chartHeight, position: 'relative' }}>
        <Liveline
          data={displayData}
          value={displayValue}
          {...(!isDay
            ? {
                mode: 'candle' as const,
                candles: chartData?.candles ?? [],
                liveCandle: chartData?.liveCandle,
                candleWidth,
                lineMode,
                lineData: chartData?.lineData ?? [],
                lineValue: chartData?.lineValue,
                onModeChange: handleModeChange,
              }
            : {}
          )}
          loading={isDay ? dayLineData.length === 0 : !chartData}
          emptyText={stream.error ?? undefined}
          window={displayWindow}
          theme={theme}
          color={isPositive ? '#22c55e' : '#ef4444'}
          grid={true}
          badge={true}
          scrub={true}
          fill={true}
          pulse={!isDay}
          momentum={!isDay}
          referenceLine={refLine}
          padding={chartPadding}
          formatValue={formatPrice}
          formatTime={formatTime}
        />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Approach #6: Rolling Window with History Trail
   ═══════════════════════════════════════════════════════════════════ */

function HistoryTrailOverlay({
  padding,
  theme,
}: {
  padding: { top: number; right: number; bottom: number; left: number }
  theme: ThemeMode
}) {
  const bg = theme === 'dark' ? '#1f2937' : '#ffffff'

  return (
    <div
      style={{
        position: 'absolute',
        top: padding.top,
        left: padding.left,
        right: padding.right,
        bottom: padding.bottom,
        background: `linear-gradient(to right, ${bg} 0%, ${bg} 40%, ${bg}cc 60%, ${bg}33 75%, transparent 100%)`,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  )
}

function Approach6Card({
  symbol,
  stream,
  chartData,
  theme,
  timeframe,
}: {
  symbol: string
  stream: LiveStreamState
  chartData: ChartData | null
  theme: ThemeMode
  timeframe: Timeframe
}) {
  const price = stream.lastPrice ?? 0
  const change = stream.lastChange ?? 0
  const changePct = stream.lastChangePct ?? 0
  const isPositive = change >= 0

  const refLine =
    stream.previousClose !== null && stream.previousClose > 0
      ? { value: stream.previousClose, label: 'Prev Close' }
      : undefined

  const chartPadding = { top: 8, right: 70, bottom: 64, left: 8 }
  const chartHeight = 280

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative">
      {/* Header */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
            {symbol}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            History Trail
          </span>
          <span className="text-[10px] text-gray-400 font-medium">10min</span>
          {stream.connected && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="px-3 pb-2">
        <span className="text-lg font-semibold text-gray-900 dark:text-white tabular-nums">
          {formatPrice(price)}
        </span>
        <span
          className={`ml-2 text-xs font-medium tabular-nums ${
            isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {isPositive ? '+' : ''}{change.toFixed(2)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%)
        </span>
      </div>

      {/* Chart with trail overlay */}
      <div style={{ height: chartHeight, position: 'relative' }}>
        <Liveline
          data={chartData?.lineData ?? []}
          value={chartData?.lineValue ?? price}
          loading={!chartData}
          emptyText={stream.error ?? undefined}
          window={600}
          theme={theme}
          color={isPositive ? '#22c55e' : '#ef4444'}
          grid={true}
          badge={true}
          scrub={true}
          fill={true}
          pulse={true}
          momentum={true}
          referenceLine={refLine}
          padding={chartPadding}
          formatValue={formatPrice}
          formatTime={formatTime}
        />
        <HistoryTrailOverlay padding={chartPadding} theme={theme} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Column + Dashboard
   ═══════════════════════════════════════════════════════════════════ */

function PulseLab2Column({
  symbol,
  stream,
  theme,
  timeframe,
  dayData,
}: {
  symbol: string
  stream: LiveStreamState
  theme: ThemeMode
  timeframe: Timeframe
  dayData?: DayCandleData
}) {
  const chartData = useChartData(stream)

  return (
    <div className="flex flex-col gap-4">
      <Approach2Card
        symbol={symbol}
        stream={stream}
        chartData={chartData}
        dayData={dayData}
        theme={theme}
        timeframe={timeframe}
      />
      <Approach3Card
        symbol={symbol}
        stream={stream}
        chartData={chartData}
        dayData={dayData}
        theme={theme}
        timeframe={timeframe}
      />
      <Approach6Card
        symbol={symbol}
        stream={stream}
        chartData={chartData}
        theme={theme}
        timeframe={timeframe}
      />
    </div>
  )
}

export default function PulseLab2Dashboard() {
  const { theme: rawTheme } = useTheme()
  const theme = (rawTheme === 'dark' ? 'dark' : 'light') as ThemeMode
  const [timeframe, setTimeframe] = useState<Timeframe>('1s')

  const streams = useMultiStream(SYMBOLS as unknown as string[], timeframe)
  const dayCandles = useDayCandles(SYMBOLS)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pulse Lab 2</h1>
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            {(['1s', '10s'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  timeframe === tf
                    ? 'bg-sage-500 text-white dark:bg-sage-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
          </span>
          {timeframe} Approaches #2, #3, #6
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {SYMBOLS.map((symbol) => (
          <PulseLab2Column
            key={symbol}
            symbol={symbol}
            stream={streams[symbol] ?? { candles: [], liveCandle: undefined, lastPrice: null, lastChange: null, lastChangePct: null, previousClose: null, dayHigh: null, dayLow: null, connected: false, error: null }}
            theme={theme}
            timeframe={timeframe}
            dayData={dayCandles[symbol]}
          />
        ))}
      </div>
    </div>
  )
}
