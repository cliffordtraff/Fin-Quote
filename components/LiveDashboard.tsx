'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Liveline } from 'liveline'
import type { CandlePoint } from 'liveline'
import { useTheme } from '@/components/ThemeProvider'
import type { OHLCData } from '@/app/actions/sparkline-indices'
import type { MoverData } from '@/app/actions/market-movers'
import type { StockIntradayOHLC } from '@/app/actions/stock-intraday-ohlc'
import type { MarketSession } from '@/lib/market-hours'
import { useLiveStream } from '@/lib/hooks/use-live-stream'
import { useReplay } from '@/lib/hooks/use-replay'
import type { ReplayConfig, ReplaySpeed } from '@/lib/hooks/use-replay'

type Timeframe = '1s' | '10s' | '1m' | '5m'

const MAG7: { symbol: string; name: string }[] = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'NVDA', name: 'Nvidia' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'TSLA', name: 'Tesla' },
]

type MoverTab = 'gainers' | 'losers'

interface Props {
  initialGainers: MoverData[]
  initialLosers: MoverData[]
  initialGainerOHLC: StockIntradayOHLC | null
  initialSession: MarketSession
  replayConfig?: ReplayConfig | null
}

const SESSION_LABELS: Record<MarketSession, Record<MoverTab, string>> = {
  premarket: { gainers: 'Pre-Market Gainers', losers: 'Pre-Market Losers' },
  cash: { gainers: 'Top Gainers', losers: 'Top Losers' },
  afterhours: { gainers: 'After-Hours Gainers', losers: 'After-Hours Losers' },
  closed: { gainers: 'Top Gainers', losers: 'Top Losers' },
}

const TIMEFRAME_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: '1s', label: '1s' },
  { value: '10s', label: '10s' },
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
]

const SPEED_OPTIONS: ReplaySpeed[] = [1, 2, 5, 10]

interface PollTaskContext {
  signal: AbortSignal
  isCurrent: () => boolean
}

interface SerializedPollingOptions {
  enabled: boolean
  intervalMs: number
  runImmediately?: boolean
  task: (context: PollTaskContext) => Promise<void>
}

/**
 * Runs one request at a time and only schedules the next request after the
 * current one settles. Manual refreshes intentionally replace (and abort) the
 * current generation so a symbol/timeframe change never waits on stale work.
 */
function useSerializedPolling({
  enabled,
  intervalMs,
  runImmediately = false,
  task,
}: SerializedPollingOptions) {
  const taskRef = useRef(task)
  const enabledRef = useRef(enabled)
  const intervalMsRef = useRef(intervalMs)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)
  const runRef = useRef<((replaceCurrent: boolean) => void) | null>(null)
  const refreshOnEnableRef = useRef(false)

  taskRef.current = task
  enabledRef.current = enabled
  intervalMsRef.current = intervalMs

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    generationRef.current += 1
    clearTimer()
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [clearTimer])

  const run = useCallback((replaceCurrent: boolean) => {
    if (!enabledRef.current || document.visibilityState === 'hidden') return

    if (controllerRef.current) {
      if (!replaceCurrent) return
      controllerRef.current.abort()
      controllerRef.current = null
    }

    clearTimer()
    const generation = ++generationRef.current
    const controller = new AbortController()
    controllerRef.current = controller

    const isCurrent = () =>
      enabledRef.current &&
      document.visibilityState !== 'hidden' &&
      generationRef.current === generation &&
      controllerRef.current === controller &&
      !controller.signal.aborted

    void taskRef.current({ signal: controller.signal, isCurrent })
      .catch(() => {
        // A failed poll is retried at the normal cadence below.
      })
      .finally(() => {
        if (!isCurrent()) return
        controllerRef.current = null
        timerRef.current = setTimeout(() => {
          runRef.current?.(false)
        }, intervalMsRef.current)
      })
  }, [clearTimer])

  runRef.current = run

  const refresh = useCallback(() => {
    if (!enabledRef.current) {
      // A symbol can be selected in the same render that enables its polls.
      // Preserve the immediate refresh intent until that effect commits.
      refreshOnEnableRef.current = true
      return
    }
    runRef.current?.(true)
  }, [])

  useEffect(() => {
    cancel()
    if (!enabled) return

    const runIfIdle = () => runRef.current?.(false)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        cancel()
      } else {
        // Returning to a visible tab starts a fresh generation immediately.
        refreshOnEnableRef.current = false
        runRef.current?.(true)
      }
    }
    const handleFocus = () => {
      if (document.visibilityState !== 'hidden') runRef.current?.(true)
    }

    if (document.visibilityState !== 'hidden') {
      const shouldRunImmediately = runImmediately || refreshOnEnableRef.current
      refreshOnEnableRef.current = false
      if (shouldRunImmediately) {
        runIfIdle()
      } else {
        timerRef.current = setTimeout(runIfIdle, intervalMs)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      cancel()
    }
  }, [cancel, enabled, intervalMs, runImmediately])

  return useMemo(() => ({ cancel, refresh }), [cancel, refresh])
}

function ohlcToCandlePoints(ohlcData: OHLCData[]): CandlePoint[] {
  return ohlcData.map((c) => ({
    time: Math.floor(new Date(c.date).getTime() / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }))
}

function pickActiveMovers(
  result: {
    premarket?: MoverData[]
    cash?: MoverData[]
    afterhours?: MoverData[]
    currentSession?: MarketSession
  },
  fallbackSession: MarketSession,
) {
  const activeSession = result.currentSession ?? fallbackSession
  if (activeSession === 'premarket' && result.premarket?.length) return result.premarket
  if (activeSession === 'afterhours' && result.afterhours?.length) return result.afterhours
  if (activeSession === 'closed') {
    if (result.afterhours?.length) return result.afterhours
    if (result.cash?.length) return result.cash
    if (result.premarket?.length) return result.premarket
  }
  return result.cash ?? []
}

export default function LiveDashboard({
  initialGainers,
  initialLosers,
  initialGainerOHLC,
  initialSession,
  replayConfig,
}: Props) {
  const { theme } = useTheme()
  const [gainers, setGainers] = useState<MoverData[]>(initialGainers)
  const [losers, setLosers] = useState<MoverData[]>(initialLosers)
  const [moverTab, setMoverTab] = useState<MoverTab>('gainers')
  const [session, setSession] = useState<MarketSession>(initialSession)
  const [timeframe, setTimeframe] = useState<Timeframe>('5m')

  // Replay: client-side state (initialized from URL params, or set via UI)
  const [activeReplayConfig, setActiveReplayConfig] = useState<ReplayConfig | null>(replayConfig ?? null)
  const [showReplayPanel, setShowReplayPanel] = useState(false)
  const [replayFormTimeframe, setReplayFormTimeframe] = useState<'1s' | '10s'>('1s')

  const isReplay = !!activeReplayConfig

  // selectedSymbol is always a stock ticker (first gainer by default)
  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    initialGainerOHLC?.symbol ?? initialGainers[0]?.symbol ?? ''
  )
  const [gainerOHLC, setGainerOHLC] = useState<StockIntradayOHLC | null>(
    initialGainerOHLC
  )
  const [lineMode, setLineMode] = useState(true)
  const [momentumLineMode, setMomentumLineMode] = useState(true)
  const [loadingOHLC, setLoadingOHLC] = useState(false)
  // Live price from fast polling (updates every 5s) — only used in 5m mode
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [livePriceChange, setLivePriceChange] = useState<number | null>(null)
  const [livePriceChangePct, setLivePriceChangePct] = useState<number | null>(null)
  // Previous day's 4 PM close from quote polling (for reference line)
  const [livePrevClose, setLivePrevClose] = useState<number | null>(null)

  const selectedSymbolRef = useRef(selectedSymbol)
  selectedSymbolRef.current = selectedSymbol
  const moverTabRef = useRef(moverTab)
  moverTabRef.current = moverTab
  const sessionRef = useRef(session)
  sessionRef.current = session

  const isStreaming = !isReplay && (timeframe === '1s' || timeframe === '10s')
  const pollingInterval = timeframe === '1m' ? 1 : 5 // minute multiplier for REST candles
  const isReplayRef = useRef(isReplay)
  isReplayRef.current = isReplay
  const isStreamingRef = useRef(isStreaming)
  isStreamingRef.current = isStreaming
  const pollingIntervalRef = useRef(pollingInterval)
  pollingIntervalRef.current = pollingInterval

  // WebSocket streaming hook — disabled in replay mode
  const stream = useLiveStream(
    isStreaming && selectedSymbol ? selectedSymbol : null,
    timeframe === '10s' ? '10s' : '1s',
  )

  // Replay hook — only active in replay mode
  const replay = useReplay(activeReplayConfig)

  // Fetch OHLC data for a stock symbol
  const fetchOHLC = useCallback(async (
    symbol: string,
    interval: number = 5,
    signal?: AbortSignal,
  ) => {
    try {
      const res = await fetch(
        `/api/stock-intraday/${encodeURIComponent(symbol)}?interval=${interval}`,
        { signal },
      )
      if (!res.ok) return null
      return (await res.json()) as StockIntradayOHLC
    } catch {
      return null
    }
  }, [])

  // Poll 2: Selected stock OHLC (every 30s) — disabled while replaying/streaming.
  // The callback reads refs so a manual refresh can atomically replace stale work
  // before React commits the corresponding symbol state update.
  const ohlcPoll = useSerializedPolling({
    enabled: !isReplay && !isStreaming && !!selectedSymbol,
    intervalMs: 30_000,
    task: useCallback(async ({ signal, isCurrent }: PollTaskContext) => {
      const symbol = selectedSymbolRef.current
      const interval = pollingIntervalRef.current
      if (!symbol) return

      const data = await fetchOHLC(symbol, interval, signal)
      if (
        isCurrent() &&
        selectedSymbolRef.current === symbol &&
        pollingIntervalRef.current === interval
      ) {
        if (
          data &&
          typeof data.symbol === 'string' &&
          data.symbol.toUpperCase() === symbol.toUpperCase()
        ) {
          setGainerOHLC(data)
        }
        setLoadingOHLC(false)
      }
    }, [fetchOHLC]),
  })

  // Poll 3: Fast quote poll (every 5s) — disabled while replaying/streaming.
  const quotePoll = useSerializedPolling({
    enabled: !isReplay && !isStreaming && !!selectedSymbol,
    intervalMs: 5_000,
    runImmediately: true,
    task: useCallback(async ({ signal, isCurrent }: PollTaskContext) => {
      const symbol = selectedSymbolRef.current
      if (!symbol) return

      const res = await fetch(`/api/quote/${encodeURIComponent(symbol)}`, { signal })
      if (!res.ok) return
      const quote = await res.json()
      if (!isCurrent() || selectedSymbolRef.current !== symbol) return

      if (quote && typeof quote.price === 'number') {
        setLivePrice(quote.price)
        setLivePriceChange(typeof quote.change === 'number' ? quote.change : null)
        setLivePriceChangePct(
          typeof quote.changesPercentage === 'number' ? quote.changesPercentage : null,
        )
        setLivePrevClose(
          typeof quote.previousClose === 'number' && quote.previousClose > 0
            ? quote.previousClose
            : null,
        )
      }
    }, []),
  })

  const selectSymbol = useCallback((symbol: string) => {
    if (!symbol || symbol === selectedSymbolRef.current) return

    // Update the ref first: even an abort-ignoring old request is stale before
    // the state update renders, and the new request reads the new symbol.
    selectedSymbolRef.current = symbol
    setSelectedSymbol(symbol)
    setGainerOHLC(null)
    setLivePrice(null)
    setLivePriceChange(null)
    setLivePriceChangePct(null)
    setLivePrevClose(null)

    if (!isReplayRef.current && !isStreamingRef.current) {
      setLoadingOHLC(true)
      ohlcPoll.refresh()
      quotePoll.refresh()
    } else {
      setLoadingOHLC(false)
      ohlcPoll.cancel()
      quotePoll.cancel()
    }
  }, [ohlcPoll, quotePoll])

  // Handle chip/table selection.
  const handleSelectSymbol = useCallback((symbol: string) => {
    selectSymbol(symbol)
  }, [selectSymbol])

  // Poll 1: Gainers + losers list (every 30s) — disabled in replay mode.
  useSerializedPolling({
    enabled: !isReplay,
    intervalMs: 30_000,
    task: useCallback(async ({ signal, isCurrent }: PollTaskContext) => {
      const res = await fetch('/api/market-snapshot/live-movers', { signal })
      if (!res.ok) return
      const data = await res.json()
      if (!isCurrent()) return

      const gainersResult = data.gainers && typeof data.gainers === 'object'
        ? data.gainers
        : null
      const losersResult = data.losers && typeof data.losers === 'object'
        ? data.losers
        : null
      const newGainers = gainersResult
        ? pickActiveMovers(gainersResult, sessionRef.current)
        : []
      const newLosers = losersResult
        ? pickActiveMovers(losersResult, sessionRef.current)
        : []

      if (newGainers.length > 0) setGainers(newGainers)
      if (newLosers.length > 0) setLosers(newLosers)

      const nextSession = gainersResult?.currentSession ?? losersResult?.currentSession
      if (nextSession) setSession(nextSession as MarketSession)

      const activeMovers = moverTabRef.current === 'gainers' ? newGainers : newLosers
      const currentSymbol = selectedSymbolRef.current
      const isPinnedMag7 = MAG7.some(({ symbol }) => symbol === currentSymbol)
      if (
        !isPinnedMag7 &&
        activeMovers.length > 0 &&
        (!currentSymbol || !activeMovers.some(({ symbol }) => symbol === currentSymbol))
      ) {
        selectSymbol(activeMovers[0].symbol)
      }
    }, [selectSymbol]),
  })

  useEffect(() => {
    if (isReplay || isStreaming) setLoadingOHLC(false)
  }, [isReplay, isStreaming])

  // Refetch candles when switching between 1m and 5m (different resolutions)
  const prevPollingInterval = useRef(pollingInterval)
  useEffect(() => {
    const previousInterval = prevPollingInterval.current
    prevPollingInterval.current = pollingInterval
    if (
      previousInterval !== pollingInterval &&
      !isReplay &&
      !isStreaming &&
      selectedSymbol
    ) {
      setGainerOHLC(null)
      setLoadingOHLC(true)
      ohlcPoll.refresh()
    }
  }, [isReplay, pollingInterval, isStreaming, selectedSymbol, ohlcPoll])

  // Active data source
  const activeData: StockIntradayOHLC | null =
    gainerOHLC?.symbol.toUpperCase() === selectedSymbol.toUpperCase() ? gainerOHLC : null

  // ---------- 5m polling-mode candle data ----------
  const pollingChartData = useMemo(() => {
    if (!activeData) {
      return {
        candles: [],
        baseLiveCandle: undefined,
        lineData: [],
        baseLineValue: undefined,
        windowSecs: 300,
      }
    }

    const yesterdayCandles = ohlcToCandlePoints(activeData.yesterdayOHLC)
    const todayCandles = ohlcToCandlePoints(activeData.todayOHLC)
    const allCandles = [...yesterdayCandles, ...todayCandles]

    const committed = allCandles.length > 1 ? allCandles.slice(0, -1) : []
    const live =
      allCandles.length > 0 ? allCandles[allCandles.length - 1] : undefined

    const linePts = allCandles.map((c) => ({ time: c.time, value: c.close }))
    const lineVal =
      linePts.length > 0 ? linePts[linePts.length - 1].value : undefined

    const lastCandleTime = allCandles.length > 0 ? allCandles[allCandles.length - 1].time : 0
    const windowSecs =
      allCandles.length > 1
        ? lastCandleTime - allCandles[0].time + 600
        : 86400

    return {
      candles: committed,
      baseLiveCandle: live,
      lineData: linePts,
      baseLineValue: lineVal,
      windowSecs,
    }
  }, [activeData])

  // ---------- Streaming-mode candle data ----------
  const streamingChartData = useMemo(() => {
    if (!isStreaming || stream.candles.length === 0) {
      return null
    }

    const allCandles: CandlePoint[] = stream.candles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))

    const committed = allCandles.length > 1 ? allCandles.slice(0, -1) : allCandles
    const streamLive = stream.liveCandle
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

    const linePts = allCandles.map((c) => ({ time: c.time, value: c.close }))
    const lineVal =
      stream.liveCandle?.close ??
      (linePts.length > 0 ? linePts[linePts.length - 1].value : undefined)

    // Window sizes based on timeframe
    const windowSecs = timeframe === '1s' ? 300 : 1800

    return {
      candles: committed,
      liveCandle: streamLive,
      lineData: linePts,
      lineValue: lineVal,
      windowSecs,
    }
  }, [isStreaming, stream.candles, stream.liveCandle, timeframe])

  // ---------- Replay-mode candle data ----------
  // Liveline anchors the chart to "now", so we shift historical timestamps
  // to the present. The latest revealed candle maps to Date.now(); older candles
  // keep their relative spacing. formatTime reverses the shift for axis labels.
  const replayChartData = useMemo(() => {
    if (!isReplay || replay.candles.length === 0) {
      return null
    }

    // Compute shift: latest revealed candle → "now"
    const latestOriginal = replay.liveCandle?.time
      ?? replay.candles[replay.candles.length - 1].time
    const nowSecs = Math.floor(Date.now() / 1000)
    const timeShift = nowSecs - latestOriginal

    const allCandles: CandlePoint[] = replay.candles.map((c) => ({
      time: c.time + timeShift,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))

    const replayLive = replay.liveCandle
      ? {
          time: replay.liveCandle.time + timeShift,
          open: replay.liveCandle.open,
          high: replay.liveCandle.high,
          low: replay.liveCandle.low,
          close: replay.liveCandle.close,
        }
      : allCandles.length > 0
        ? allCandles[allCandles.length - 1]
        : undefined

    const linePts = [
      ...allCandles.map((c) => ({ time: c.time, value: c.close })),
      ...(replayLive && replay.liveCandle ? [{ time: replayLive.time, value: replay.liveCandle.close }] : []),
    ]
    const lineVal =
      replay.liveCandle?.close ??
      (linePts.length > 0 ? linePts[linePts.length - 1].value : undefined)

    const windowSecs = activeReplayConfig?.timeframe === '1s' ? 120 : 600

    return {
      candles: allCandles,
      liveCandle: replayLive,
      lineData: linePts,
      lineValue: lineVal,
      windowSecs,
      timeShift,
    }
  }, [isReplay, replay.candles, replay.liveCandle, activeReplayConfig?.timeframe])

  // ---------- Choose data source ----------
  const chartCandles = isReplay && replayChartData
    ? replayChartData.candles
    : isStreaming && streamingChartData
      ? streamingChartData.candles
      : pollingChartData.candles

  const chartLineData = isReplay && replayChartData
    ? replayChartData.lineData
    : isStreaming && streamingChartData
      ? streamingChartData.lineData
      : pollingChartData.lineData

  const chartWindowSecs = isReplay && replayChartData
    ? replayChartData.windowSecs
    : isStreaming && streamingChartData
      ? streamingChartData.windowSecs
      : pollingChartData.windowSecs

  const replayCandleWidth = activeReplayConfig?.timeframe === '1s' ? 1 : 10
  const chartCandleWidth = isReplay
    ? replayCandleWidth
    : timeframe === '1s' ? 1 : timeframe === '10s' ? 10 : timeframe === '1m' ? 60 : 300

  // Merge livePrice into the live candle for 5m mode
  const pollingLiveCandle = useMemo(() => {
    const base = pollingChartData.baseLiveCandle
    if (!base) return undefined
    if (livePrice === null) return base
    return {
      ...base,
      close: livePrice,
      high: Math.max(base.high, livePrice),
      low: Math.min(base.low, livePrice),
    }
  }, [pollingChartData.baseLiveCandle, livePrice])

  const chartLiveCandle = isReplay && replayChartData
    ? replayChartData.liveCandle
    : isStreaming && streamingChartData
      ? streamingChartData.liveCandle
      : pollingLiveCandle

  const chartLineValue = isReplay && replayChartData
    ? replayChartData.lineValue
    : isStreaming && streamingChartData
      ? streamingChartData.lineValue
      : (livePrice ?? pollingChartData.baseLineValue)

  const handleModeChange = useCallback(() => {
    setLineMode((prev) => !prev)
  }, [])

  const handleMomentumModeChange = useCallback(() => {
    setMomentumLineMode((prev) => !prev)
  }, [])

  // Display info for header
  const displaySymbol = isReplay ? activeReplayConfig!.symbol : selectedSymbol
  const mag7Match = MAG7.find((m) => m.symbol === displaySymbol)
  const displayName = isReplay
    ? (mag7Match?.name ?? displaySymbol)
    : (activeData?.name ?? mag7Match?.name ?? selectedSymbol)

  const displayPrice = isReplay
    ? (replay.lastPrice ?? 0)
    : isStreaming
      ? (stream.lastPrice ?? activeData?.currentPrice ?? 0)
      : (livePrice ?? activeData?.currentPrice ?? 0)

  const displayChange = isReplay
    ? (replay.lastChange ?? 0)
    : isStreaming
      ? (stream.lastChange ?? activeData?.priceChange ?? 0)
      : (livePriceChange ?? activeData?.priceChange ?? 0)

  const displayChangePercent = isReplay
    ? (replay.lastChangePct ?? 0)
    : isStreaming
      ? (stream.lastChangePct ?? activeData?.priceChangePercent ?? 0)
      : (livePriceChangePct ?? activeData?.priceChangePercent ?? 0)

  // Reference line: previous day's 4 PM ET cash session close
  const prevClose = isReplay
    ? replay.previousClose
    : isStreaming
      ? stream.previousClose
      : (livePrevClose ?? activeData?.previousClose ?? null)
  const refLine = prevClose !== null && prevClose > 0
    ? { value: prevClose, label: 'Prev Close' }
    : undefined

  const isPositive = displayChange >= 0
  const changeColor = isPositive
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'
  const changeSign = isPositive ? '+' : ''

  const hasData = isReplay
    ? (replay.candles.length > 0 || replay.status === 'loading')
    : isStreaming
      ? (stream.candles.length > 0 || !!activeData)
      : !!activeData

  const hasNoData = !isReplay && gainers.length === 0 && !activeData && !isStreaming

  if (hasNoData) {
    return (
      <div className="text-center py-20 text-gray-500 dark:text-gray-400">
        <p className="mb-4">No market data available</p>
        <button
          onClick={() => setShowReplayPanel(p => !p)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            showReplayPanel
              ? 'bg-purple-500 text-white border-purple-500'
              : 'border-gray-300 text-gray-700 hover:bg-gray-100'
          }`}
        >
          Replay
        </button>
        {showReplayPanel && (
          <div className="mt-4 mx-auto max-w-md p-3 bg-white dark:bg-gray-800 rounded-xl border border-purple-200 dark:border-purple-800/50">
            <div className="flex items-center justify-center gap-3">
              <span className="text-xs text-gray-600 dark:text-gray-300">
                GOOGL &middot; Mar 11 &middot; 9:30&ndash;9:40 AM ET
              </span>
              <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                {(['1s', '10s'] as const).map(tf => (
                  <button
                    key={tf}
                    onClick={() => setReplayFormTimeframe(tf)}
                    className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      replayFormTimeframe === tf
                        ? 'bg-purple-500 text-white dark:bg-purple-600'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setActiveReplayConfig({
                    symbol: 'GOOGL',
                    date: '2026-03-11',
                    from: '09:30',
                    to: '09:40',
                    timeframe: replayFormTimeframe,
                  })
                  setShowReplayPanel(false)
                }}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
              >
                Start Replay
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const showSeconds = isReplay || isStreaming

  return (
    <div>
      {/* Session badge / Replay controls + timeframe pills + candle/line toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isReplay ? (
            <>
              {/* REPLAY badge */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 15l3-3m0 0l-3-3m3 3h-7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                REPLAY {activeReplayConfig!.symbol}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {activeReplayConfig!.date} {activeReplayConfig!.from}&ndash;{activeReplayConfig!.to} ({activeReplayConfig!.timeframe})
              </span>
              <button
                onClick={() => setActiveReplayConfig(null)}
                className="px-2 py-0.5 text-xs font-medium rounded-full border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Exit
              </button>
            </>
          ) : (
            <>
              {gainers.length > 0 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sage-100 text-sage-800 dark:bg-sage-900/30 dark:text-sage-300">
                  {SESSION_LABELS[session].gainers}
                </span>
              )}
              {/* LIVE indicator */}
              {isStreaming && stream.connected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                  </span>
                  LIVE
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isReplay ? (
            <>
              {/* Static / Animate toggle */}
              <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                <button
                  onClick={() => replay.setMode('static')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    replay.mode === 'static'
                      ? 'bg-purple-500 text-white dark:bg-purple-600'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  Static
                </button>
                <button
                  onClick={() => replay.setMode('animated')}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    replay.mode === 'animated'
                      ? 'bg-purple-500 text-white dark:bg-purple-600'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  Animate
                </button>
              </div>

              {/* Play/Pause + Skip + Reset (animated mode only) */}
              {replay.mode === 'animated' && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => replay.skip(-5)}
                    className="px-2 py-1 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Back 5 seconds"
                  >
                    -5s
                  </button>
                  {replay.status === 'playing' ? (
                    <button
                      onClick={replay.pause}
                      className="px-2 py-1 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="Pause"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={replay.play}
                      className="px-2 py-1 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="Play"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => replay.skip(5)}
                    className="px-2 py-1 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Forward 5 seconds"
                  >
                    +5s
                  </button>
                  <button
                    onClick={replay.reset}
                    className="px-2 py-1 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Reset"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Speed pills (animated mode only) */}
              {replay.mode === 'animated' && (
                <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                  {SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => replay.setSpeed(s)}
                      className={`px-2 py-1 text-xs font-medium transition-colors ${
                        replay.speed === s
                          ? 'bg-purple-500 text-white dark:bg-purple-600'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}

              {/* 1s / 10s timeframe toggle */}
              <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                {(['1s', '10s'] as const).map(tf => (
                  <button
                    key={tf}
                    onClick={() => {
                      if (activeReplayConfig && activeReplayConfig.timeframe !== tf) {
                        setActiveReplayConfig({ ...activeReplayConfig, timeframe: tf })
                      }
                    }}
                    className={`px-2 py-1 text-xs font-medium transition-colors ${
                      activeReplayConfig?.timeframe === tf
                        ? 'bg-purple-500 text-white dark:bg-purple-600'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Timeframe pills */}
              <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                {TIMEFRAME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTimeframe(opt.value)}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                      timeframe === opt.value
                        ? 'bg-sage-500 text-white dark:bg-sage-600'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Replay button */}
              <button
                onClick={() => setShowReplayPanel(prev => !prev)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  showReplayPanel
                    ? 'bg-purple-500 text-white border-purple-500 dark:bg-purple-600 dark:border-purple-600'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Replay
              </button>
            </>
          )}
          {/* Candle/Line toggle */}
          <button
            onClick={handleModeChange}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {lineMode ? 'Candles' : 'Line'}
          </button>
        </div>
      </div>

      {/* Replay config panel — hardcoded to GOOGL March 11 open for now */}
      {showReplayPanel && !isReplay && (
        <div className="mb-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-purple-200 dark:border-purple-800/50">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600 dark:text-gray-300">
              GOOGL &middot; Mar 11 &middot; 9:30&ndash;9:40 AM ET
            </span>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              {(['1s', '10s'] as const).map(tf => (
                <button
                  key={tf}
                  onClick={() => setReplayFormTimeframe(tf)}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    replayFormTimeframe === tf
                      ? 'bg-purple-500 text-white dark:bg-purple-600'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setActiveReplayConfig({
                  symbol: 'GOOGL',
                  date: '2026-03-11',
                  from: '09:30',
                  to: '09:40',
                  timeframe: replayFormTimeframe,
                })
                setShowReplayPanel(false)
              }}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-purple-500 text-white hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700 transition-colors"
            >
              Start Replay
            </button>
          </div>
        </div>
      )}

      {/* Mag 7 chips — hidden in replay mode */}
      {!isReplay && (
        <div
          className="flex items-center gap-2 mb-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {MAG7.map((m) => {
            const isSelected = selectedSymbol === m.symbol
            return (
              <button
                key={m.symbol}
                onClick={() => handleSelectSymbol(m.symbol)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  isSelected
                    ? 'bg-sage-500 text-white border-sage-500 dark:bg-sage-600 dark:border-sage-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-750'
                }`}
              >
                {m.symbol}
              </button>
            )
          })}
        </div>
      )}

      {/* Replay progress bar */}
      {isReplay && replay.mode === 'animated' && (
        <div className="mb-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 dark:bg-purple-400 rounded-full transition-all duration-150"
                style={{
                  width: replay.totalCandles > 0
                    ? `${(replay.revealedCount / replay.totalCandles) * 100}%`
                    : '0%',
                }}
              />
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums min-w-[60px] text-right">
              {replay.revealedCount}/{replay.totalCandles}
            </span>
          </div>
        </div>
      )}

      {/* Header: stock name + price */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {displayName}
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">
              {displaySymbol}
            </span>
          </h1>
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-3xl font-semibold text-gray-900 dark:text-white">
              {displayPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className={`text-lg font-medium ${changeColor}`}>
              {changeSign}
              {displayChange.toFixed(2)} ({changeSign}
              {displayChangePercent.toFixed(2)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Chart + Gainers table grid — side-by-side charts in replay mode */}
      <div className={`grid gap-4 ${isReplay ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-[1fr_340px]'}`}>
        {/* Chart 1 — exaggerate OFF in replay */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative">
          {loadingOHLC && !isReplay && (
            <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 z-10 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-sage-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {isReplay && replay.status === 'loading' && (
            <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 z-10 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {isReplay && replay.error && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
              {replay.error}
            </div>
          )}
          {!isReplay && isStreaming && stream.error && !stream.connected && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              Reconnecting...
            </div>
          )}
          {isReplay && (
            <div className="absolute top-2 right-24 z-20 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              Normal
            </div>
          )}
          <div style={{ height: 500 }}>
            {hasData ? (
              <Liveline
                data={chartLineData}
                value={chartLineValue ?? displayPrice}
                mode="candle"
                candles={chartCandles}
                liveCandle={chartLiveCandle}
                candleWidth={chartCandleWidth}
                lineMode={lineMode}
                lineData={chartLineData}
                lineValue={chartLineValue}
                onModeChange={handleModeChange}
                window={chartWindowSecs}
                theme={theme}
                color={isReplay ? '#7c3aed' : '#5a6b4a'}
                grid={true}
                badge={true}
                scrub={true}
                fill={true}
                pulse={!isReplay}
                degen={{ scale: 1, downMomentum: true }}
                momentum={true}
                exaggerate={false}
                referenceLine={refLine}
                padding={{ top: 12, right: 80, bottom: 52, left: 12 }}
                formatValue={(v: number) =>
                  v.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                }
                formatTime={(t: number) => {
                  const displayTime = isReplay && replayChartData
                    ? t - replayChartData.timeShift
                    : t
                  return new Date(displayTime * 1000).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    ...(showSeconds ? { second: '2-digit' } : {}),
                    hour12: true,
                  })
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                {isReplay && replay.status === 'loading' ? 'Loading replay data...' : 'No chart data available'}
              </div>
            )}
          </div>
        </div>

        {/* Chart 2 — Zoomed-in momentum view (replay mode: beside main chart; live mode: below) */}
        {isReplay && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden relative">
            <div className="absolute top-2 right-28 z-20 px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
              Momentum
            </div>
            <div style={{ height: 500 }}>
              {hasData ? (
                <Liveline
                  data={chartLineData}
                  value={chartLineValue ?? displayPrice}
                  mode="candle"
                  candles={chartCandles}
                  liveCandle={chartLiveCandle}
                  candleWidth={chartCandleWidth}
                  lineMode={momentumLineMode}
                  lineData={chartLineData}
                  lineValue={chartLineValue}
                  onModeChange={handleMomentumModeChange}
                  window={activeReplayConfig?.timeframe === '10s' ? 300 : 30}
                  theme="light"
                  color="#22c55e"
                  grid={true}
                  badge={true}
                  scrub={true}
                  fill={true}
                  pulse={true}
                  degen={{ scale: 1.5, downMomentum: true }}
                  momentum={true}
                  exaggerate={true}
                  referenceLine={refLine}
                  padding={{ top: 20, right: 100, bottom: 56, left: 16 }}
                  formatValue={(v: number) =>
                    v.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  }
                  formatTime={(t: number) => {
                    const displayTime = replayChartData
                      ? t - replayChartData.timeShift
                      : t
                    return new Date(displayTime * 1000).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true,
                    })
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Loading replay data...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Movers table (Gainers / Losers tabs) — hidden in replay mode */}
        {!isReplay && (gainers.length > 0 || losers.length > 0) && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col" style={{ maxHeight: 540 }}>
            {/* Tab header */}
            <div className="px-4 py-2.5 border-b border-cream-200 dark:border-gray-700 flex items-center gap-1">
              {(['gainers', 'losers'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMoverTab(tab)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                    moverTab === tab
                      ? 'bg-sage-500 text-white dark:bg-sage-600'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {SESSION_LABELS[session][tab]}
                </button>
              ))}
            </div>
            {/* Table body */}
            <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin' }}>
              <table className="w-full">
                <thead className="sticky top-0 bg-white dark:bg-gray-800">
                  <tr className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    <th className="text-left pl-4 pr-1 py-2 font-semibold">#</th>
                    <th className="text-left px-2 py-2 font-semibold">Symbol</th>
                    <th className="text-right px-2 py-2 font-semibold">Price</th>
                    <th className="text-right pl-2 pr-4 py-2 font-semibold">Chg%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-200 dark:divide-gray-700">
                  {(moverTab === 'gainers' ? gainers : losers).slice(0, 20).map((m, i) => {
                    const isSelected = selectedSymbol === m.symbol
                    const rowPositive = m.changesPercentage >= 0
                    return (
                      <tr
                        key={m.symbol}
                        onClick={() => handleSelectSymbol(m.symbol)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-sage-50 dark:bg-sage-900/30'
                            : 'hover:bg-cream-50 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        <td className="pl-4 pr-1 py-2 text-xs text-gray-400 dark:text-gray-500">
                          {i + 1}
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-sm font-medium text-sage-600 dark:text-sage-400">
                            {m.symbol}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                            {m.name}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-sm text-right text-gray-900 dark:text-white">
                          {m.price.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                        <td
                          className={`pl-2 pr-4 py-2 text-sm font-medium text-right ${
                            rowPositive
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {rowPositive ? '+' : ''}
                          {m.changesPercentage.toFixed(2)}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Momentum chart — below main grid in live mode */}
      {!isReplay && hasData && (
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative">
          <div className="absolute top-2 right-24 z-20 px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
            Momentum
          </div>
          <div style={{ height: 400 }}>
            <Liveline
              data={chartLineData}
              value={chartLineValue ?? displayPrice}
              mode="candle"
              candles={chartCandles}
              liveCandle={chartLiveCandle}
              candleWidth={chartCandleWidth}
              lineMode={momentumLineMode}
              lineData={chartLineData}
              lineValue={chartLineValue}
              onModeChange={handleMomentumModeChange}
              window={timeframe === '1s' ? 30 : timeframe === '10s' ? 300 : timeframe === '1m' ? 1800 : 9000}
              theme="light"
              color="#22c55e"
              grid={true}
              badge={true}
              scrub={true}
              fill={true}
              pulse={true}
              degen={{ scale: 1.5, downMomentum: true }}
              momentum={true}
              exaggerate={true}
              referenceLine={refLine}
              padding={{ top: 20, right: 100, bottom: 56, left: 16 }}
              formatValue={(v: number) =>
                v.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              }
              formatTime={(t: number) => {
                return new Date(t * 1000).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  ...(isStreaming ? { second: '2-digit' } : {}),
                  hour12: true,
                })
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
