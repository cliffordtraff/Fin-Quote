/**
 * Provider-agnostic types for market data.
 *
 * These types match the shape consumers already expect from FMP responses,
 * so switching providers requires zero changes in server actions.
 */

// ---------------------------------------------------------------------------
// Core data shapes
// ---------------------------------------------------------------------------

/** A real-time (or delayed) quote for a single ticker. */
export interface ProviderQuote {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  previousClose?: number
  volume?: number
  dayHigh?: number
  dayLow?: number
  yearHigh?: number
  yearLow?: number
  marketCap?: number
  timestamp?: number // unix ms
}

/** A single OHLCV candle. */
export interface ProviderCandle {
  /** ET-formatted date string for backward compat: "YYYY-MM-DD" or "YYYY-MM-DD HH:mm:ss" */
  date: string
  /** Epoch milliseconds (always present, even when `date` is also set). */
  timestampMs: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** A single news article. */
export interface ProviderNews {
  title: string
  text: string
  url: string
  image: string | null
  publishedDate: string
  site: string
  symbol: string
}

// ---------------------------------------------------------------------------
// Intraday parameters
// ---------------------------------------------------------------------------

/** Timespan unit for candle aggregation. */
export type CandleTimespan = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month'

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface MarketDataProvider {
  /** Fetch a single quote. Returns null when the symbol is not found. */
  getQuote(symbol: string): Promise<ProviderQuote | null>

  /** Fetch quotes for multiple symbols in a single call. */
  getQuotes(symbols: string[]): Promise<ProviderQuote[]>

  /**
   * Fetch intraday or custom-resolution candles.
   * @param symbol    Ticker (e.g. "AAPL", "^GSPC")
   * @param multiplier  Bar size multiplier (e.g. 5 for 5-minute bars)
   * @param timespan  Bar size unit
   * @param from      Start date "YYYY-MM-DD" or epoch ms
   * @param to        End date "YYYY-MM-DD" or epoch ms (defaults to now)
   */
  getIntraday(
    symbol: string,
    multiplier: number,
    timespan: CandleTimespan,
    from?: string,
    to?: string,
  ): Promise<ProviderCandle[]>

  /**
   * Fetch daily historical candles.
   * @param symbol  Ticker
   * @param from    Start date "YYYY-MM-DD"
   * @param to      End date "YYYY-MM-DD" (defaults to today)
   */
  getHistoricalDaily(
    symbol: string,
    from: string,
    to?: string,
  ): Promise<ProviderCandle[]>

  /** Top gainers by percentage change. */
  getGainers(): Promise<ProviderQuote[]>

  /** Top losers by percentage change. */
  getLosers(): Promise<ProviderQuote[]>

  /**
   * Snapshot quotes for the full market or a filtered set of tickers.
   * When `tickers` is omitted, returns the full available snapshot.
   */
  getSnapshot(tickers?: string[]): Promise<ProviderQuote[]>

  /**
   * Fetch recent news for a symbol.
   * @param symbol  Ticker
   * @param limit   Max number of articles (default: 5)
   */
  getNews(symbol: string, limit?: number): Promise<ProviderNews[]>
}
