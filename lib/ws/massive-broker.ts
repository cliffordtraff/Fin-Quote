/**
 * Singleton WebSocket broker for Massive (formerly Polygon.io) real-time data.
 *
 * Architecture:
 *   - One WS connection per market type (stocks, futures)
 *   - Subscribes to `A.{ticker}` (per-second aggregates)
 *   - Aggregates raw 1s events into 10s candles server-side
 *   - Consumers subscribe via `broker.subscribe(symbol, cb)`
 *   - Auto-reconnect with exponential backoff
 *   - Circuit breaker: stops after 3 consecutive auth failures
 *   - 30s grace period before disconnect on last unsubscribe
 */

import WebSocket from 'ws'
import { resolveFrontMonth } from '@/lib/providers/futures-resolver'
import { FMP_FUTURES_TO_PRODUCT } from '@/lib/providers/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrokerCandle {
  time: number       // unix seconds (start of candle)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type BrokerEventType = 'candle_1s' | 'candle_10s' | 'auth_error'

export interface BrokerEvent {
  type: BrokerEventType
  symbol: string      // FMP-style symbol (e.g. "AAPL", "ES=F")
  candle: BrokerCandle
  /** Set when type === 'auth_error' */
  error?: string
}

export type BrokerCallback = (event: BrokerEvent) => void

// ---------------------------------------------------------------------------
// Internal: per-ticker subscription state
// ---------------------------------------------------------------------------

interface TickerState {
  /** FMP-style symbol */
  fmpSymbol: string
  /** Polygon ticker used for WS subscription (e.g. "AAPL", "ESZ25") */
  polygonTicker: string
  /** Market type */
  market: 'stocks' | 'futures'
  /** Subscriber callbacks */
  listeners: Set<BrokerCallback>
  /** Current 10s candle being aggregated */
  tenSecBucket: BrokerCandle | null
  /** Epoch-second of the current 10s bucket start */
  tenSecBucketStart: number
  /** Grace timer: fires 30s after last unsubscribe to disconnect */
  graceTimer: ReturnType<typeof setTimeout> | null
}

// ---------------------------------------------------------------------------
// Internal: per-market WS connection
// ---------------------------------------------------------------------------

interface MarketConnection {
  ws: WebSocket | null
  url: string
  authenticated: boolean
  subscribedTickers: Set<string>  // polygon tickers currently subscribed
  reconnectAttempts: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
  authFailures: number           // consecutive auth failures for circuit breaker
}

const GRACE_PERIOD_MS = 30_000
const MAX_RECONNECT_DELAY_MS = 30_000
const BASE_RECONNECT_DELAY_MS = 1_000
const MAX_AUTH_FAILURES = 3

export const DEFAULT_BROKER_LIMITS = {
  // Keep a single runtime comfortably below provider subscription and process
  // resource ceilings while still allowing several full 30-symbol dashboards.
  maxTickers: 200,
  maxListenersPerTicker: 100,
  maxTotalListeners: 500,
} as const

export type BrokerCapacityCode =
  | 'BROKER_TICKER_CAPACITY_EXCEEDED'
  | 'BROKER_LISTENER_CAPACITY_EXCEEDED'
  | 'BROKER_TOTAL_LISTENER_CAPACITY_EXCEEDED'

export class BrokerCapacityError extends Error {
  readonly name = 'BrokerCapacityError'

  constructor(
    readonly code: BrokerCapacityCode,
    message: string,
    readonly limit: number,
  ) {
    super(message)
  }
}

export interface MassiveBrokerLimits {
  maxTickers: number
  maxListenersPerTicker: number
  maxTotalListeners: number
}

export interface MassiveBrokerOptions {
  limits?: Partial<MassiveBrokerLimits>
  gracePeriodMs?: number
}

function positiveInteger(value: string | number | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

// ---------------------------------------------------------------------------
// Broker class
// ---------------------------------------------------------------------------

export class MassiveBroker {
  private tickers = new Map<string, TickerState>()  // keyed by FMP symbol
  private connections = new Map<'stocks' | 'futures', MarketConnection>()
  private pendingInitializations = new Map<string, Promise<TickerState | null>>()
  private pendingListenerReservations = new Map<string, number>()
  private pendingTotalListeners = 0
  private totalListeners = 0
  private apiKey: string
  private limits: MassiveBrokerLimits
  private gracePeriodMs: number

  constructor(options: MassiveBrokerOptions = {}) {
    this.apiKey = process.env.MASSIVE_API_KEY ?? ''
    this.limits = {
      maxTickers: positiveInteger(
        options.limits?.maxTickers ?? process.env.MASSIVE_BROKER_MAX_TICKERS,
        DEFAULT_BROKER_LIMITS.maxTickers,
      ),
      maxListenersPerTicker: positiveInteger(
        options.limits?.maxListenersPerTicker ?? process.env.MASSIVE_BROKER_MAX_LISTENERS_PER_TICKER,
        DEFAULT_BROKER_LIMITS.maxListenersPerTicker,
      ),
      maxTotalListeners: positiveInteger(
        options.limits?.maxTotalListeners ?? process.env.MASSIVE_BROKER_MAX_TOTAL_LISTENERS,
        DEFAULT_BROKER_LIMITS.maxTotalListeners,
      ),
    }
    const configuredGracePeriod = options.gracePeriodMs ?? GRACE_PERIOD_MS
    this.gracePeriodMs = Number.isFinite(configuredGracePeriod)
      ? Math.max(0, configuredGracePeriod)
      : GRACE_PERIOD_MS
  }

  /**
   * Subscribe to real-time data for a symbol.
   * Returns an unsubscribe function.
   */
  async subscribe(
    fmpSymbol: string,
    callback: BrokerCallback,
  ): Promise<() => void> {
    // Ensure API key is available (may not be set at construction in dev)
    if (!this.apiKey) {
      this.apiKey = process.env.MASSIVE_API_KEY ?? ''
    }

    let state: TickerState | null | undefined = this.tickers.get(fmpSymbol)
    let initialization = this.pendingInitializations.get(fmpSymbol)

    if (!state && !initialization) {
      this.ensureTickerCapacity()
    }

    this.reserveListener(fmpSymbol, state ?? undefined)

    try {
      if (!state && !initialization) {
        initialization = this.initializeTicker(fmpSymbol).finally(() => {
          this.pendingInitializations.delete(fmpSymbol)
        })
        this.pendingInitializations.set(fmpSymbol, initialization)
      }

      state = state ?? await initialization!
      if (!state) return () => {}

      return this.addListener(state, callback)
    } finally {
      this.releaseListenerReservation(fmpSymbol)
    }
  }

  private async initializeTicker(fmpSymbol: string): Promise<TickerState | null> {
    const market = this.getMarket(fmpSymbol)
    const polygonTicker = await this.resolvePolygonTicker(fmpSymbol, market)
    if (!polygonTicker) {
      console.error(`[broker] Could not resolve polygon ticker for ${fmpSymbol}`)
      return null
    }

    const state: TickerState = {
      fmpSymbol,
      polygonTicker,
      market,
      listeners: new Set(),
      tenSecBucket: null,
      tenSecBucketStart: 0,
      graceTimer: null,
    }
    this.tickers.set(fmpSymbol, state)

    try {
      this.ensureConnection(market)
      this.wsSubscribe(market, polygonTicker)
      return state
    } catch (error) {
      this.wsUnsubscribe(market, polygonTicker)
      this.tickers.delete(fmpSymbol)
      this.maybeDisconnect(market)
      throw error
    }
  }

  private ensureTickerCapacity(): void {
    if (
      this.tickers.size + this.pendingInitializations.size <
      this.limits.maxTickers
    ) {
      return
    }

    // Grace-period entries have no active listeners. Evict them first instead
    // of rejecting useful work merely to preserve a reconnect optimization.
    for (const [symbol, state] of this.tickers) {
      if (
        state.listeners.size > 0 ||
        (this.pendingListenerReservations.get(symbol) ?? 0) > 0
      ) {
        continue
      }
      this.removeTickerImmediately(symbol, state)
      if (
        this.tickers.size + this.pendingInitializations.size <
        this.limits.maxTickers
      ) {
        return
      }
    }

    throw new BrokerCapacityError(
      'BROKER_TICKER_CAPACITY_EXCEEDED',
      'Live market-data ticker capacity is temporarily exhausted.',
      this.limits.maxTickers,
    )
  }

  private reserveListener(fmpSymbol: string, state: TickerState | undefined): void {
    const pendingForTicker = this.pendingListenerReservations.get(fmpSymbol) ?? 0
    const committedForTicker = state?.listeners.size ?? 0

    if (
      committedForTicker + pendingForTicker >=
      this.limits.maxListenersPerTicker
    ) {
      throw new BrokerCapacityError(
        'BROKER_LISTENER_CAPACITY_EXCEEDED',
        `Live market-data listener capacity for ${fmpSymbol} is temporarily exhausted.`,
        this.limits.maxListenersPerTicker,
      )
    }

    if (
      this.totalListeners + this.pendingTotalListeners >=
      this.limits.maxTotalListeners
    ) {
      throw new BrokerCapacityError(
        'BROKER_TOTAL_LISTENER_CAPACITY_EXCEEDED',
        'Live market-data listener capacity is temporarily exhausted.',
        this.limits.maxTotalListeners,
      )
    }

    this.pendingListenerReservations.set(fmpSymbol, pendingForTicker + 1)
    this.pendingTotalListeners++
  }

  private releaseListenerReservation(fmpSymbol: string): void {
    const pendingForTicker = this.pendingListenerReservations.get(fmpSymbol) ?? 0
    if (pendingForTicker <= 1) {
      this.pendingListenerReservations.delete(fmpSymbol)
    } else {
      this.pendingListenerReservations.set(fmpSymbol, pendingForTicker - 1)
    }
    this.pendingTotalListeners = Math.max(0, this.pendingTotalListeners - 1)
  }

  private addListener(state: TickerState, callback: BrokerCallback): () => void {
    if (state.graceTimer) {
      clearTimeout(state.graceTimer)
      state.graceTimer = null
    }

    const added = !state.listeners.has(callback)
    if (added) {
      state.listeners.add(callback)
      this.totalListeners++
    }

    let active = added
    return () => {
      if (!active) return
      active = false

      const current = this.tickers.get(state.fmpSymbol)
      if (!current || !current.listeners.delete(callback)) return
      this.totalListeners = Math.max(0, this.totalListeners - 1)

      if (current.listeners.size === 0 && !current.graceTimer) {
        if (this.gracePeriodMs === 0) {
          this.removeTickerImmediately(state.fmpSymbol, current)
          return
        }

        current.graceTimer = setTimeout(() => {
          const latest = this.tickers.get(state.fmpSymbol)
          if (latest && latest.listeners.size === 0) {
            this.removeTickerImmediately(state.fmpSymbol, latest)
          }
        }, this.gracePeriodMs)
      }
    }
  }

  private removeTickerImmediately(symbol: string, state: TickerState): void {
    if (state.graceTimer) {
      clearTimeout(state.graceTimer)
      state.graceTimer = null
    }
    this.wsUnsubscribe(state.market, state.polygonTicker)
    this.tickers.delete(symbol)
    this.maybeDisconnect(state.market)
  }

  // -----------------------------------------------------------------------
  // Market detection
  // -----------------------------------------------------------------------

  private getMarket(fmpSymbol: string): 'stocks' | 'futures' {
    return fmpSymbol.endsWith('=F') ? 'futures' : 'stocks'
  }

  private async resolvePolygonTicker(
    fmpSymbol: string,
    market: 'stocks' | 'futures',
  ): Promise<string | null> {
    if (market === 'futures') {
      const productCode = FMP_FUTURES_TO_PRODUCT[fmpSymbol] ?? fmpSymbol.replace('=F', '')
      const contract = await resolveFrontMonth(productCode)
      return contract
    }
    // Stocks pass through directly
    return fmpSymbol
  }

  // -----------------------------------------------------------------------
  // WebSocket connection management
  // -----------------------------------------------------------------------

  private getWsUrl(market: 'stocks' | 'futures'): string {
    if (market === 'futures') {
      return 'wss://socket.massive.com/futures'
    }
    return 'wss://socket.massive.com/stocks'
  }

  private ensureConnection(market: 'stocks' | 'futures'): void {
    let conn = this.connections.get(market)
    if (conn?.ws?.readyState === WebSocket.OPEN) return
    if (conn?.ws?.readyState === WebSocket.CONNECTING) return

    if (!conn) {
      conn = {
        ws: null,
        url: this.getWsUrl(market),
        authenticated: false,
        subscribedTickers: new Set(),
        reconnectAttempts: 0,
        reconnectTimer: null,
        authFailures: 0,
      }
      this.connections.set(market, conn)
    }

    this.connect(market, conn)
  }

  private connect(market: 'stocks' | 'futures', conn: MarketConnection): void {
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer)
      conn.reconnectTimer = null
    }

    console.log(`[broker] Connecting to ${conn.url}...`)

    const ws = new WebSocket(conn.url)
    conn.ws = ws
    conn.authenticated = false

    ws.on('open', () => {
      console.log(`[broker] Connected to ${market}`)
      // NOTE: reconnectAttempts is reset on auth_success, not here.
      // Resetting on open causes infinite 1s reconnects when auth fails.
      ws.send(JSON.stringify({ action: 'auth', params: this.apiKey }))
    })

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const messages = JSON.parse(raw.toString())
        if (!Array.isArray(messages)) return

        for (const msg of messages) {
          this.handleMessage(market, conn, msg)
        }
      } catch {
        // Ignore parse errors
      }
    })

    ws.on('close', () => {
      console.log(`[broker] Disconnected from ${market}`)
      conn.authenticated = false
      conn.ws = null
      this.scheduleReconnect(market, conn)
    })

    ws.on('error', (err: Error) => {
      console.error(`[broker] WS error (${market}):`, err.message)
    })
  }

  private handleMessage(
    market: 'stocks' | 'futures',
    conn: MarketConnection,
    msg: any,
  ): void {
    // Auth response
    if (msg.ev === 'status') {
      if (msg.status === 'auth_success') {
        console.log(`[broker] Authenticated on ${market}`)
        conn.authenticated = true
        conn.reconnectAttempts = 0
        conn.authFailures = 0
        // Re-subscribe all tickers for this market
        for (const ticker of conn.subscribedTickers) {
          this.sendSubscribe(conn, ticker)
        }
      } else if (msg.status === 'auth_failed') {
        conn.authFailures++
        console.error(
          `[broker] Auth failed on ${market}: ${msg.message} (failure ${conn.authFailures}/${MAX_AUTH_FAILURES})`,
        )
        if (conn.authFailures >= MAX_AUTH_FAILURES) {
          console.error(
            `[broker] Giving up on ${market} after ${MAX_AUTH_FAILURES} auth failures — check MASSIVE_API_KEY`,
          )
          // Notify all subscribers of the auth error
          this.notifyAuthError(market)
          // Close and stop reconnecting
          if (conn.ws) {
            conn.ws.close()
            conn.ws = null
          }
          if (conn.reconnectTimer) {
            clearTimeout(conn.reconnectTimer)
            conn.reconnectTimer = null
          }
          return
        }
      }
      return
    }

    // Per-second aggregate (ev: "A" for stocks, "A" for futures too)
    if (msg.ev === 'A') {
      this.handleAggregate(market, msg)
    }
  }

  private handleAggregate(market: 'stocks' | 'futures', msg: any): void {
    const polygonTicker = msg.sym as string
    if (!polygonTicker) return

    // Find the matching fmpSymbol from our tracked tickers
    let state: TickerState | undefined
    for (const [, s] of this.tickers) {
      if (s.polygonTicker === polygonTicker && s.market === market) {
        state = s
        break
      }
    }
    if (!state || state.listeners.size === 0) return

    // Build 1s candle from the aggregate message
    const candle1s: BrokerCandle = {
      time: Math.floor((msg.s ?? msg.e ?? Date.now()) / 1000), // start timestamp
      open: msg.o ?? 0,
      high: msg.h ?? 0,
      low: msg.l ?? 0,
      close: msg.c ?? 0,
      volume: msg.v ?? 0,
    }

    // Emit 1s candle
    const event1s: BrokerEvent = {
      type: 'candle_1s',
      symbol: state.fmpSymbol,
      candle: candle1s,
    }
    for (const cb of state.listeners) {
      try { cb(event1s) } catch { /* listener error */ }
    }

    // Aggregate into 10s bucket
    const bucketStart = Math.floor(candle1s.time / 10) * 10

    if (!state.tenSecBucket || state.tenSecBucketStart !== bucketStart) {
      // Emit completed 10s bucket if one exists
      if (state.tenSecBucket) {
        const event10s: BrokerEvent = {
          type: 'candle_10s',
          symbol: state.fmpSymbol,
          candle: state.tenSecBucket,
        }
        for (const cb of state.listeners) {
          try { cb(event10s) } catch { /* listener error */ }
        }
      }

      // Start new 10s bucket
      state.tenSecBucketStart = bucketStart
      state.tenSecBucket = {
        time: bucketStart,
        open: candle1s.open,
        high: candle1s.high,
        low: candle1s.low,
        close: candle1s.close,
        volume: candle1s.volume,
      }
    } else {
      // Merge into existing 10s bucket
      const b = state.tenSecBucket
      b.high = Math.max(b.high, candle1s.high)
      b.low = Math.min(b.low, candle1s.low)
      b.close = candle1s.close
      b.volume += candle1s.volume
    }
  }

  // -----------------------------------------------------------------------
  // Auth error notification
  // -----------------------------------------------------------------------

  private notifyAuthError(market: 'stocks' | 'futures'): void {
    for (const [, state] of this.tickers) {
      if (state.market !== market) continue
      const event: BrokerEvent = {
        type: 'auth_error',
        symbol: state.fmpSymbol,
        candle: { time: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 },
        error: 'Authentication failed — check MASSIVE_API_KEY',
      }
      for (const cb of state.listeners) {
        try { cb(event) } catch { /* listener error */ }
      }
    }
  }

  // -----------------------------------------------------------------------
  // WS subscribe/unsubscribe
  // -----------------------------------------------------------------------

  private wsSubscribe(market: 'stocks' | 'futures', polygonTicker: string): void {
    const conn = this.connections.get(market)
    if (!conn) return

    conn.subscribedTickers.add(polygonTicker)

    if (conn.authenticated && conn.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(conn, polygonTicker)
    }
    // If not authenticated yet, will re-subscribe on auth_success
  }

  private sendSubscribe(conn: MarketConnection, polygonTicker: string): void {
    if (conn.ws?.readyState === WebSocket.OPEN) {
      console.log(`[broker] Subscribing to A.${polygonTicker}`)
      conn.ws.send(JSON.stringify({
        action: 'subscribe',
        params: `A.${polygonTicker}`,
      }))
    }
  }

  private wsUnsubscribe(market: 'stocks' | 'futures', polygonTicker: string): void {
    const conn = this.connections.get(market)
    if (!conn) return

    conn.subscribedTickers.delete(polygonTicker)

    if (conn.ws?.readyState === WebSocket.OPEN) {
      console.log(`[broker] Unsubscribing from A.${polygonTicker}`)
      conn.ws.send(JSON.stringify({
        action: 'unsubscribe',
        params: `A.${polygonTicker}`,
      }))
    }
  }

  private maybeDisconnect(market: 'stocks' | 'futures'): void {
    const conn = this.connections.get(market)
    if (!conn) return

    // Only disconnect if no tickers are left for this market
    if (conn.subscribedTickers.size > 0) return

    console.log(`[broker] No more subscribers for ${market}, closing connection`)
    if (conn.ws) {
      conn.ws.close()
      conn.ws = null
    }
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer)
      conn.reconnectTimer = null
    }
    this.connections.delete(market)
  }

  // -----------------------------------------------------------------------
  // Reconnect
  // -----------------------------------------------------------------------

  private scheduleReconnect(market: 'stocks' | 'futures', conn: MarketConnection): void {
    // Don't reconnect if no subscribers
    if (conn.subscribedTickers.size === 0) return

    // Don't reconnect if auth circuit breaker tripped
    if (conn.authFailures >= MAX_AUTH_FAILURES) return

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, conn.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS,
    )
    conn.reconnectAttempts++

    console.log(`[broker] Reconnecting ${market} in ${delay}ms (attempt ${conn.reconnectAttempts})`)
    conn.reconnectTimer = setTimeout(() => {
      this.connect(market, conn)
    }, delay)
  }
}

// ---------------------------------------------------------------------------
// Singleton via globalThis (survives HMR in dev)
// ---------------------------------------------------------------------------

const GLOBAL_KEY = '__massive_broker__' as const

declare global {
  // eslint-disable-next-line no-var
  var __massive_broker__: MassiveBroker | undefined
}

export function getBroker(): MassiveBroker {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = new MassiveBroker()
  }
  return globalThis[GLOBAL_KEY]!
}
