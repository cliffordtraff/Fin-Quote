'use client'

import { useState, useMemo, useCallback } from 'react'
import { Liveline } from 'liveline'
import type { CandlePoint } from 'liveline'
import { useTheme } from '@/components/ThemeProvider'
import { useMultiStream } from '@/lib/hooks/use-multi-stream'
import type { LiveStreamState } from '@/lib/hooks/use-live-stream'

const SYMBOLS = ['GOOGL', 'AAPL', 'NVDA', 'TSLA'] as const

type Timeframe = '1s' | '10s'
type ThemeMode = 'light' | 'dark'

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

interface PulseCardProps {
  symbol: string
  stream: LiveStreamState
  chartData: ChartData | null
  theme: ThemeMode
  timeframe: Timeframe
  exaggerate: boolean
  label?: string
  color?: string
  /** Use pure line mode (enables momentum arrows) instead of candle engine */
  lineOnly?: boolean
  /** Override the visible window in seconds */
  windowOverride?: number
}

function PulseCard({ symbol, stream, chartData, theme, timeframe, exaggerate, label, color = '#22c55e', lineOnly = false, windowOverride }: PulseCardProps) {
  const [lineMode, setLineMode] = useState(true)

  const handleModeChange = useCallback(() => {
    setLineMode((prev) => !prev)
  }, [])

  const refLine =
    stream.previousClose !== null && stream.previousClose > 0
      ? { value: stream.previousClose, label: 'Prev Close' }
      : undefined

  const price = stream.lastPrice ?? 0
  const change = stream.lastChange ?? 0
  const changePct = stream.lastChangePct ?? 0
  const isPositive = change >= 0

  const windowSecs = windowOverride ?? (timeframe === '1s' ? 30 : 300)
  const candleWidth = timeframe === '1s' ? 1 : 10

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative">
      {/* Header */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
            {symbol}
          </span>
          {label && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              exaggerate
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}>
              {label}
            </span>
          )}
          {stream.connected && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
            </span>
          )}
          {stream.error && !stream.connected && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">Reconnecting...</span>
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
            isPositive
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {isPositive ? '+' : ''}
          {change.toFixed(2)} ({isPositive ? '+' : ''}
          {changePct.toFixed(2)}%)
        </span>
      </div>

      {/* Chart */}
      <div style={{ height: 280 }}>
        <Liveline
          data={chartData?.lineData ?? []}
          value={chartData?.lineValue ?? price}
          {...(lineOnly
            ? {}
            : {
                mode: 'candle' as const,
                candles: chartData?.candles ?? [],
                liveCandle: chartData?.liveCandle,
                candleWidth,
                lineMode,
                lineData: chartData?.lineData ?? [],
                lineValue: chartData?.lineValue,
                onModeChange: handleModeChange,
              }
          )}
          loading={!chartData}
          emptyText={stream.error ?? undefined}
          window={windowSecs}
          theme={theme}
          color={color}
          grid={true}
          badge={true}
          scrub={true}
          fill={true}
          pulse={true}
          degen={{ scale: 1.5, downMomentum: true }}
          momentum={true}
          exaggerate={exaggerate}
          referenceLine={lineOnly ? undefined : refLine}
          padding={{ top: 8, right: 70, bottom: 64, left: 8 }}
          formatValue={formatPrice}
          formatTime={formatTime}
        />
      </div>
    </div>
  )
}

/** One column: exaggerated on top, normal on bottom */
function PulseColumn({ symbol, stream, theme, timeframe, variantWindow }: { symbol: string; stream: LiveStreamState; theme: ThemeMode; timeframe: Timeframe; variantWindow?: number }) {
  const chartData = useChartData(stream)

  return (
    <div className="flex flex-col gap-4">
      <PulseCard
        symbol={symbol}
        stream={stream}
        chartData={chartData}
        theme={theme}
        timeframe={timeframe}
        exaggerate={true}
        label="Exaggerated"
        color="#22c55e"
      />
      <PulseCard
        symbol={symbol}
        stream={stream}
        chartData={chartData}
        theme={theme}
        timeframe={timeframe}
        exaggerate={false}
        label="Normal"
        color="#5a6b4a"
      />
      <PulseCard
        symbol={symbol}
        stream={stream}
        chartData={chartData}
        theme={theme}
        timeframe={timeframe}
        exaggerate={false}
        label={variantWindow ? `Variant ${variantWindow}s` : 'Variant'}
        color="#5a6b4a"
        lineOnly
        windowOverride={variantWindow}
      />
    </div>
  )
}

export default function PulseDashboard() {
  const { theme: rawTheme } = useTheme()
  const theme = (rawTheme === 'dark' ? 'dark' : 'light') as ThemeMode
  const [timeframe, setTimeframe] = useState<Timeframe>('1s')

  // Single multiplexed SSE connection for all symbols
  const streams = useMultiStream(SYMBOLS as unknown as string[], timeframe)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pulse</h1>
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
          {timeframe} Momentum
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {SYMBOLS.map((symbol, i) => (
          <PulseColumn
            key={symbol}
            symbol={symbol}
            stream={streams[symbol] ?? { candles: [], liveCandle: undefined, lastPrice: null, lastChange: null, lastChangePct: null, previousClose: null, connected: false, error: null }}
            theme={theme}
            timeframe={timeframe}
            variantWindow={i < 2 ? 120 : undefined}
          />
        ))}
      </div>
    </div>
  )
}
