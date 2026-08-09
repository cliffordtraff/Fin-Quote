/**
 * Browser-safe runtime contracts for Pulse intraday and live candle data.
 *
 * These parsers deliberately do not trust a successful HTTP status or an SSE
 * type assertion. A malformed market-data point is worse than an empty chart:
 * it can produce NaN canvas coordinates, relabel another symbol's data, or
 * make a later good update impossible to render.
 */

export const PULSE_CANDLE_MAX_ROWS = 500
export const PULSE_CANDLE_MAX_INPUT_ROWS = 4_000

const MIN_EPOCH_SECONDS = 946_684_800 // 2000-01-01
const MAX_EPOCH_SECONDS = 4_102_444_800 // 2100-01-01
const MAX_PRICE = 1_000_000_000_000
const MAX_VOLUME = 1_000_000_000_000_000
const MARKET_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/

export interface PulseDayCandle {
  date: string
  open: number
  high: number
  low: number
  close: number
}

export interface PulseDayCandleData {
  candles: PulseDayCandle[]
  previousClose: number | null
  changePct: number | null
}

export interface PulseStreamCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

export interface PulseLiveStreamBackfillPayload {
  symbol: string
  candles: PulseStreamCandle[]
  previousClose: number | null
  dayHigh: number | null
  dayLow: number | null
}

export interface PulseStreamEvent {
  symbol: string
  candle: PulseStreamCandle
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isBoundedPrice(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_PRICE
  )
}

function isNullablePrice(value: unknown): value is number | null {
  return value === null || isBoundedPrice(value)
}

function hasCoherentOhlc(
  open: number,
  high: number,
  low: number,
  close: number,
): boolean {
  return (
    low <= high &&
    low <= open &&
    low <= close &&
    high >= open &&
    high >= close
  )
}

function normalizeMarketDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 32) return null
  const match = MARKET_DATE_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4] ?? 0)
  const minute = Number(match[5] ?? 0)
  const second = Number(match[6] ?? 0)
  if (
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null
  }

  const represented = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (
    represented.getUTCFullYear() !== year ||
    represented.getUTCMonth() !== month - 1 ||
    represented.getUTCDate() !== day ||
    represented.getUTCHours() !== hour ||
    represented.getUTCMinutes() !== minute ||
    represented.getUTCSeconds() !== second
  ) {
    return null
  }

  const date = `${match[1]}-${match[2]}-${match[3]}`
  if (match[4] === undefined) return date
  return `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

export function parsePulseDayCandle(value: unknown): PulseDayCandle | null {
  if (!isRecord(value)) return null
  const date = normalizeMarketDate(value.date)
  const { open, high, low, close } = value
  if (
    date === null ||
    !isBoundedPrice(open) ||
    !isBoundedPrice(high) ||
    !isBoundedPrice(low) ||
    !isBoundedPrice(close) ||
    !hasCoherentOhlc(open, high, low, close)
  ) {
    return null
  }
  return { date, open, high, low, close }
}

export function parsePulseStreamCandle(value: unknown): PulseStreamCandle | null {
  if (!isRecord(value)) return null
  const { time, open, high, low, close, volume } = value
  if (
    typeof time !== 'number' ||
    !Number.isSafeInteger(time) ||
    time < MIN_EPOCH_SECONDS ||
    time > MAX_EPOCH_SECONDS ||
    !isBoundedPrice(open) ||
    !isBoundedPrice(high) ||
    !isBoundedPrice(low) ||
    !isBoundedPrice(close) ||
    !hasCoherentOhlc(open, high, low, close) ||
    !(
      volume === undefined ||
      (
        typeof volume === 'number' &&
        Number.isFinite(volume) &&
        volume >= 0 &&
        volume <= MAX_VOLUME
      )
    )
  ) {
    return null
  }

  return volume === undefined
    ? { time, open, high, low, close }
    : { time, open, high, low, close, volume }
}

export function normalizePulseStreamCandles(
  value: unknown,
  options: { maximumInputRows?: number } = {},
): PulseStreamCandle[] | null {
  if (!Array.isArray(value)) return null
  const maximumInputRows = options.maximumInputRows ?? PULSE_CANDLE_MAX_ROWS
  if (
    !Number.isSafeInteger(maximumInputRows) ||
    maximumInputRows < PULSE_CANDLE_MAX_ROWS ||
    value.length > maximumInputRows ||
    value.length > PULSE_CANDLE_MAX_INPUT_ROWS
  ) {
    return null
  }

  const byTime = new Map<number, PulseStreamCandle>()
  for (const rawCandle of value) {
    const candle = parsePulseStreamCandle(rawCandle)
    if (!candle) return null
    byTime.set(candle.time, candle)
  }

  const sorted = [...byTime.values()].sort((left, right) => left.time - right.time)
  return sorted.length <= PULSE_CANDLE_MAX_ROWS
    ? sorted
    : sorted.slice(sorted.length - PULSE_CANDLE_MAX_ROWS)
}

export function mergePulseStreamCandles(
  older: readonly PulseStreamCandle[],
  newer: readonly PulseStreamCandle[],
): PulseStreamCandle[] {
  const byTime = new Map<number, PulseStreamCandle>()
  for (const candle of older) byTime.set(candle.time, candle)
  for (const candle of newer) byTime.set(candle.time, candle)
  const sorted = [...byTime.values()].sort((left, right) => left.time - right.time)
  return sorted.length <= PULSE_CANDLE_MAX_ROWS
    ? sorted
    : sorted.slice(sorted.length - PULSE_CANDLE_MAX_ROWS)
}

export function parsePulseDayCandlePayload(
  value: unknown,
  expectedSymbol: string,
): PulseDayCandleData | null {
  if (
    !isRecord(value) ||
    value.symbol !== expectedSymbol ||
    !Array.isArray(value.todayOHLC) ||
    value.todayOHLC.length > PULSE_CANDLE_MAX_INPUT_ROWS ||
    !isNullablePrice(value.previousClose)
  ) {
    return null
  }

  const byDate = new Map<string, PulseDayCandle>()
  for (const rawCandle of value.todayOHLC) {
    const candle = parsePulseDayCandle(rawCandle)
    if (!candle) return null
    byDate.set(candle.date, candle)
  }
  const sorted = [...byDate.values()].sort((left, right) =>
    left.date.localeCompare(right.date)
  )
  const candles = sorted.length <= PULSE_CANDLE_MAX_ROWS
    ? sorted
    : sorted.slice(sorted.length - PULSE_CANDLE_MAX_ROWS)
  const previousClose = value.previousClose
  const lastClose = candles[candles.length - 1]?.close ?? null
  const changePct = previousClose !== null && lastClose !== null
    ? ((lastClose - previousClose) / previousClose) * 100
    : null

  return {
    candles,
    previousClose,
    changePct: changePct !== null && Number.isFinite(changePct) ? changePct : null,
  }
}

export function parsePulseLiveStreamBackfillPayload(
  value: unknown,
  expectedSymbol: string,
): PulseLiveStreamBackfillPayload | null {
  if (
    !isRecord(value) ||
    value.symbol !== expectedSymbol ||
    !isNullablePrice(value.previousClose) ||
    !isNullablePrice(value.dayHigh) ||
    !isNullablePrice(value.dayLow) ||
    (
      value.dayHigh !== null &&
      value.dayLow !== null &&
      value.dayHigh < value.dayLow
    )
  ) {
    return null
  }
  const candles = normalizePulseStreamCandles(value.candles)
  if (!candles) return null
  return {
    symbol: expectedSymbol,
    candles,
    previousClose: value.previousClose,
    dayHigh: value.dayHigh,
    dayLow: value.dayLow,
  }
}

export function parsePulseStreamEvent(
  value: unknown,
  expectedSymbols: ReadonlySet<string>,
): PulseStreamEvent | null {
  if (!isRecord(value) || typeof value.symbol !== 'string') return null
  if (!expectedSymbols.has(value.symbol)) return null
  const candle = parsePulseStreamCandle(value)
  if (!candle) return null
  return { symbol: value.symbol, candle }
}
