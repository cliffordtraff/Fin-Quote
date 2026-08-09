/**
 * Single-symbol compatibility wrapper around the multiplexed live transport.
 *
 * Keeping one lifecycle implementation means the standalone live dashboard
 * gets the same live-first startup, strict runtime boundary, visibility pause,
 * deadline, and cancellation guarantees as every multi-symbol Pulse surface.
 */

'use client'

import { useMemo } from 'react'
import { normalizeMarketSymbol } from '@/lib/market-symbol'
import { useMultiStream } from './use-multi-stream'
import type { LiveStreamBackfillIssue } from './live-stream-backfill'

export interface StreamCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface LiveStreamState {
  /** Committed (historical + completed) candles */
  candles: StreamCandle[]
  /** In-progress candle for the current period */
  liveCandle: StreamCandle | undefined
  /** Last known price */
  lastPrice: number | null
  /** Absolute price change from previous close */
  lastChange: number | null
  /** Percentage change from previous close */
  lastChangePct: number | null
  /** Previous trading session close price */
  previousClose: number | null
  /** Running high of day */
  dayHigh: number | null
  /** Running low of day */
  dayLow: number | null
  /** Whether EventSource is connected */
  connected: boolean
  /** Error message if connection failed */
  error: string | null
  /** Typed, non-fatal reason historical backfill is unavailable. */
  backfillIssue?: LiveStreamBackfillIssue | null
}

const EMPTY_LIVE_STREAM_STATE: LiveStreamState = {
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
  backfillIssue: null,
}

export function useLiveStream(
  symbol: string | null,
  timeframe: '1s' | '10s',
): LiveStreamState {
  const normalizedSymbol = symbol ? normalizeMarketSymbol(symbol) : null
  const symbols = useMemo(
    () => normalizedSymbol ? [normalizedSymbol] : [],
    [normalizedSymbol],
  )
  const streams = useMultiStream(symbols, timeframe)
  return normalizedSymbol
    ? streams[normalizedSymbol] ?? EMPTY_LIVE_STREAM_STATE
    : EMPTY_LIVE_STREAM_STATE
}
