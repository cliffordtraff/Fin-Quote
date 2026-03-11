'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Liveline } from 'liveline'
import type { CandlePoint } from 'liveline'
import { useTheme } from '@/components/ThemeProvider'
import type { OHLCData } from '@/app/actions/sparkline-indices'
import type { MoverData } from '@/app/actions/market-movers'
import type { StockIntradayOHLC } from '@/app/actions/stock-intraday-ohlc'
import type { MarketSession } from '@/lib/market-hours'

const ES_SYMBOL = 'ES=F'

interface Props {
  initialEsData: StockIntradayOHLC | null
  initialGainers: MoverData[]
  initialGainerOHLC: StockIntradayOHLC | null
  initialSession: MarketSession
}

const SESSION_LABELS: Record<MarketSession, string> = {
  premarket: 'Pre-Market Gainers',
  cash: 'Top Gainers',
  afterhours: 'After-Hours Gainers',
  closed: 'Top Gainers',
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

export default function LiveDashboard({
  initialEsData,
  initialGainers,
  initialGainerOHLC,
  initialSession,
}: Props) {
  const { theme } = useTheme()
  const [esData, setEsData] = useState<StockIntradayOHLC | null>(initialEsData)
  const [gainers, setGainers] = useState<MoverData[]>(initialGainers)
  const [session, setSession] = useState<MarketSession>(initialSession)

  // selectedSymbol: null = S&P 500 futures, string = gainer stock
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(
    initialGainerOHLC?.symbol ?? null
  )
  const [gainerOHLC, setGainerOHLC] = useState<StockIntradayOHLC | null>(
    initialGainerOHLC
  )
  const [lineMode, setLineMode] = useState(true)
  const [loadingOHLC, setLoadingOHLC] = useState(false)
  // Live price from fast polling (updates every 5s)
  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [livePriceChange, setLivePriceChange] = useState<number | null>(null)
  const [livePriceChangePct, setLivePriceChangePct] = useState<number | null>(null)

  const selectedSymbolRef = useRef(selectedSymbol)
  selectedSymbolRef.current = selectedSymbol

  // Fetch OHLC data for any symbol (stocks or futures)
  const fetchOHLC = useCallback(async (symbol: string) => {
    try {
      const res = await fetch(`/api/stock-intraday/${encodeURIComponent(symbol)}`)
      if (!res.ok) return null
      return (await res.json()) as StockIntradayOHLC
    } catch {
      return null
    }
  }, [])

  // Handle gainer chip click
  const handleSelectGainer = useCallback(
    async (symbol: string) => {
      if (symbol === selectedSymbol) return
      setSelectedSymbol(symbol)
      setLivePrice(null)
      setLoadingOHLC(true)
      const data = await fetchOHLC(symbol)
      if (data) setGainerOHLC(data)
      setLoadingOHLC(false)
    },
    [selectedSymbol, fetchOHLC]
  )

  // Handle clicking "S&P 500" to show ES futures
  const handleSelectSpx = useCallback(() => {
    setSelectedSymbol(null)
    setGainerOHLC(null)
    setLivePrice(null)
  }, [])

  // Poll 1: Gainers list + ES futures (every 30s)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        // Update ES futures data
        const esFresh = await fetchOHLC(ES_SYMBOL)
        if (esFresh) setEsData(esFresh)

        // Update gainers from market snapshot
        const res = await fetch('/api/market-snapshot/fast')
        if (!res.ok) return
        const data = await res.json()

        if (data.gainers && Array.isArray(data.gainers)) {
          const newGainers: MoverData[] = data.gainers
          if (newGainers.length > 0) {
            setGainers(newGainers)

            if (
              selectedSymbolRef.current &&
              selectedSymbolRef.current !== ES_SYMBOL &&
              !newGainers.find((g) => g.symbol === selectedSymbolRef.current)
            ) {
              setSelectedSymbol(newGainers[0].symbol)
              const ohlc = await fetchOHLC(newGainers[0].symbol)
              if (ohlc) setGainerOHLC(ohlc)
            }
          }
        }

        if (data.session) setSession(data.session)
      } catch {
        // Silently ignore polling errors
      }
    }, 30_000)

    return () => clearInterval(interval)
  }, [fetchOHLC])

  // Poll 2: Selected gainer stock OHLC (every 30s, resets on symbol change)
  useEffect(() => {
    if (!selectedSymbol) return

    const interval = setInterval(async () => {
      const data = await fetchOHLC(selectedSymbol)
      if (data) setGainerOHLC(data)
    }, 30_000)

    return () => clearInterval(interval)
  }, [selectedSymbol, fetchOHLC])

  // Poll 3: Fast quote poll (every 5s) for live price animation
  useEffect(() => {
    const activeSymbol = selectedSymbol ?? ES_SYMBOL

    const poll = async () => {
      try {
        const res = await fetch(`/api/quote/${encodeURIComponent(activeSymbol)}`)
        if (!res.ok) return
        const q = await res.json()
        if (typeof q.price === 'number') {
          setLivePrice(q.price)
          setLivePriceChange(q.change)
          setLivePriceChangePct(q.changesPercentage)
        }
      } catch {
        // ignore
      }
    }

    // Fetch immediately, then every 5 seconds
    poll()
    const interval = setInterval(poll, 5_000)
    return () => clearInterval(interval)
  }, [selectedSymbol])

  // Determine active data source
  const isShowingGainer = selectedSymbol !== null && gainerOHLC !== null
  const activeData: StockIntradayOHLC | null = isShowingGainer
    ? gainerOHLC
    : esData

  // Build candle data from OHLC (updates on full data refresh)
  const { candles, baseLiveCandle, lineData, baseLineValue, windowSecs } = useMemo(() => {
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

    // Liveline anchors its viewport to `now`. The window must span from
    // the oldest candle to the current time so all data is visible.
    const nowSecs = Math.floor(Date.now() / 1000)
    const windowSecs =
      allCandles.length > 0
        ? nowSecs - allCandles[0].time + 600
        : 86400

    return {
      candles: committed,
      baseLiveCandle: live,
      lineData: linePts,
      baseLineValue: lineVal,
      windowSecs,
    }
  }, [activeData])

  // Merge livePrice into the live candle and line value for real-time updates.
  // Liveline animates smoothly when these props change.
  const liveCandle = useMemo(() => {
    if (!baseLiveCandle) return undefined
    if (livePrice === null) return baseLiveCandle
    return {
      ...baseLiveCandle,
      close: livePrice,
      high: Math.max(baseLiveCandle.high, livePrice),
      low: Math.min(baseLiveCandle.low, livePrice),
    }
  }, [baseLiveCandle, livePrice])

  const lineValue = livePrice ?? baseLineValue

  const handleModeChange = useCallback(() => {
    setLineMode((prev) => !prev)
  }, [])

  // Display info for header — prefer live quote data
  const displayName = isShowingGainer ? gainerOHLC!.name : 'S&P 500 Futures'
  const displaySymbol = isShowingGainer ? gainerOHLC!.symbol : ES_SYMBOL
  const displayPrice = livePrice ?? activeData?.currentPrice ?? 0
  const displayChange = livePriceChange ?? activeData?.priceChange ?? 0
  const displayChangePercent = livePriceChangePct ?? activeData?.priceChangePercent ?? 0
  const refLine = activeData?.previousClose
    ? { value: activeData.previousClose, label: 'Prev Close' }
    : undefined

  const isPositive = displayChange >= 0
  const changeColor = isPositive
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'
  const changeSign = isPositive ? '+' : ''

  const hasNoData = !esData && gainers.length === 0

  if (hasNoData) {
    return (
      <div className="text-center py-20 text-gray-500 dark:text-gray-400">
        No market data available
      </div>
    )
  }

  return (
    <div>
      {/* Session badge + candle/line toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {gainers.length > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sage-100 text-sage-800 dark:bg-sage-900/30 dark:text-sage-300">
              {SESSION_LABELS[session]}
            </span>
          )}
        </div>
        <button
          onClick={handleModeChange}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          {lineMode ? 'Candles' : 'Line'}
        </button>
      </div>

      {/* Gainer chips - scrollable row */}
      {gainers.length > 0 && (
        <div
          className="flex items-center gap-2 mb-4 overflow-x-auto pb-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {/* S&P 500 Futures chip */}
          <button
            onClick={handleSelectSpx}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              !isShowingGainer
                ? 'bg-sage-500 text-white border-sage-500 dark:bg-sage-600 dark:border-sage-600'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-750'
            }`}
          >
            S&P 500
          </button>

          {gainers.slice(0, 10).map((g) => {
            const isSelected = selectedSymbol === g.symbol
            const chipPositive = g.changesPercentage >= 0
            return (
              <button
                key={g.symbol}
                onClick={() => handleSelectGainer(g.symbol)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  isSelected
                    ? 'bg-sage-500 text-white border-sage-500 dark:bg-sage-600 dark:border-sage-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-750'
                }`}
              >
                <span>{g.symbol}</span>
                <span
                  className={`ml-1.5 ${
                    isSelected
                      ? 'text-white/80'
                      : chipPositive
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {chipPositive ? '+' : ''}
                  {g.changesPercentage.toFixed(1)}%
                </span>
              </button>
            )
          })}
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

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden relative">
        {loadingOHLC && (
          <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 z-10 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-sage-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div style={{ height: 500 }}>
          {activeData ? (
            <Liveline
              data={lineData}
              value={lineValue ?? displayPrice}
              mode="candle"
              candles={candles}
              liveCandle={liveCandle}
              candleWidth={300}
              lineMode={lineMode}
              lineData={lineData}
              lineValue={lineValue}
              onModeChange={handleModeChange}
              window={windowSecs}
              theme={theme}
              color="#5a6b4a"
              grid={true}
              badge={true}
              scrub={true}
              fill={true}
              pulse={true}
              referenceLine={refLine}
              padding={{ top: 12, right: 80, bottom: 52, left: 12 }}
              formatValue={(v: number) =>
                v.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              }
              formatTime={(t: number) =>
                new Date(t * 1000).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })
              }
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
              No chart data available
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
