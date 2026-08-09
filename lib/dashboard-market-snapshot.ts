import {
  FAST_MARKET_DATA_SECTIONS,
  fastSectionFromHeaderName,
  isValidSnapshotTimestamp,
  normalizeFastFailedSections,
  type FastMarketDataSection,
} from '@/lib/fast-snapshot-types'
import {
  DASHBOARD_INDEX_SYMBOLS,
  DASHBOARD_STOCK_SYMBOLS,
} from '@/lib/dashboard-fixed-panels'
import { FOREX_BOND_SYMBOLS } from '@/lib/forex-bonds-panel'
import type { AllMarketData } from '@/lib/market-types'
import {
  SLOW_MARKET_DATA_SECTIONS,
  normalizeSlowFailedSections,
  slowSectionHeaderName,
  type SlowMarketDataSection,
} from '@/lib/slow-snapshot-types'

export type DashboardMarketSnapshotKind = 'fast' | 'slow'
export type DashboardMarketSnapshotSection =
  | FastMarketDataSection
  | SlowMarketDataSection

export interface DashboardMarketSnapshotPatch {
  kind: DashboardMarketSnapshotKind
  data: Partial<AllMarketData>
  appliedSections: DashboardMarketSnapshotSection[]
  degradedSections: DashboardMarketSnapshotSection[]
  capturedAt: string
  receivedAt: string
}

export const DASHBOARD_SNAPSHOT_CLIENT_TIMEOUT_MS = {
  fast: 12_000,
  slow: 16_000,
} as const satisfies Record<DashboardMarketSnapshotKind, number>

const ENDPOINTS = {
  fast: '/api/market-snapshot/fast',
  slow: '/api/market-snapshot/slow',
} as const satisfies Record<DashboardMarketSnapshotKind, string>

const SLOW_HEADER_TO_SECTION = new Map<string, SlowMarketDataSection>(
  SLOW_MARKET_DATA_SECTIONS.map((section) => [
    slowSectionHeaderName(section),
    section,
  ]),
)

function allowedSections(
  kind: DashboardMarketSnapshotKind,
): readonly DashboardMarketSnapshotSection[] {
  return kind === 'fast'
    ? FAST_MARKET_DATA_SECTIONS
    : SLOW_MARKET_DATA_SECTIONS
}

function sectionFromHeaderName(
  kind: DashboardMarketSnapshotKind,
  name: string,
): DashboardMarketSnapshotSection | null {
  if (kind === 'fast') return fastSectionFromHeaderName(name)
  return SLOW_HEADER_TO_SECTION.get(name.trim().toLowerCase()) ?? null
}

function normalizeSections(
  kind: DashboardMarketSnapshotKind,
  sections: readonly DashboardMarketSnapshotSection[],
): DashboardMarketSnapshotSection[] {
  return kind === 'fast'
    ? normalizeFastFailedSections(sections as readonly FastMarketDataSection[])
    : normalizeSlowFailedSections(sections as readonly SlowMarketDataSection[])
}

function parseDegradedSections(
  kind: DashboardMarketSnapshotKind,
  header: string | null,
): DashboardMarketSnapshotSection[] {
  if (!header?.trim()) return []

  const sections = header.split(',').map((name) => {
    const section = sectionFromHeaderName(kind, name)
    if (!section) {
      throw new Error(
        `Market snapshot returned an unknown degraded section: ${name.trim()}`,
      )
    }
    return section
  })

  return normalizeSections(kind, sections)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function isFiniteNonZeroNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value !== 0
}

function isNullableFiniteNumber(value: unknown): boolean {
  return value === null || isFiniteNumber(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isArrayOf(
  value: unknown,
  predicate: (candidate: unknown) => boolean,
): boolean {
  return Array.isArray(value) && value.every(predicate)
}

function isFinitePricePoint(
  value: unknown,
): value is { date: string; close: number } {
  return (
    isRecord(value) &&
    isString(value.date) &&
    isFiniteNumber(value.close)
  )
}

function isPositivePricePoint(value: unknown): boolean {
  return isFinitePricePoint(value) && isPositiveNumber(value.close)
}

function isFiniteCoherentOhlcPoint(value: unknown): boolean {
  if (!isRecord(value) || !isString(value.date)) return false
  const { open, high, low, close } = value
  return (
    isFiniteNumber(open) &&
    isFiniteNumber(high) &&
    isFiniteNumber(low) &&
    isFiniteNumber(close) &&
    high >= Math.max(open, close) &&
    low <= Math.min(open, close) &&
    high >= low
  )
}

function isPositiveCoherentOhlcPoint(value: unknown): boolean {
  return (
    isFiniteCoherentOhlcPoint(value) &&
    isRecord(value) &&
    isPositiveNumber(value.open) &&
    isPositiveNumber(value.high) &&
    isPositiveNumber(value.low) &&
    isPositiveNumber(value.close)
  )
}

function isMover(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.symbol) &&
    isString(value.name) &&
    isPositiveNumber(value.price) &&
    isFiniteNumber(value.change) &&
    isFiniteNumber(value.changesPercentage)
  )
}

function isAllSessionMovers(value: unknown): boolean {
  return (
    isRecord(value) &&
    isArrayOf(value.premarket, isMover) &&
    isArrayOf(value.cash, isMover) &&
    isArrayOf(value.afterhours, isMover) &&
    ['premarket', 'cash', 'afterhours', 'closed'].includes(
      value.currentSession as string,
    )
  )
}

function isStock(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.symbol) &&
    isString(value.name) &&
    isPositiveNumber(value.price) &&
    isFiniteNumber(value.change) &&
    isFiniteNumber(value.changePercent)
  )
}

function isExactSymbolPanel(
  value: unknown,
  expectedSymbols: readonly string[],
  isValidRow: (candidate: unknown) => boolean,
): boolean {
  if (!Array.isArray(value) || value.length !== expectedSymbols.length) {
    return false
  }

  const expected = new Set(expectedSymbols)
  const seen = new Set<string>()
  return value.every((candidate) => {
    if (!isValidRow(candidate) || !isRecord(candidate)) return false
    const symbol = candidate.symbol
    if (!isString(symbol) || !expected.has(symbol) || seen.has(symbol)) {
      return false
    }
    seen.add(symbol)
    return true
  }) && seen.size === expected.size
}

function isSparklineIndex(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !Array.isArray(value.priceHistory) ||
    !Array.isArray(value.priceTimestamps)
  ) {
    return false
  }

  const historyLength = value.priceHistory.length
  return (
    isString(value.symbol) &&
    isString(value.name) &&
    isPositiveNumber(value.currentPrice) &&
    isFiniteNumber(value.priceChange) &&
    isFiniteNumber(value.priceChangePercent) &&
    isNullableFiniteNumber(value.yesterdayChangePercent) &&
    isArrayOf(value.priceHistory, isPositiveNumber) &&
    isArrayOf(value.priceTimestamps, isString) &&
    value.priceTimestamps.length === historyLength &&
    isArrayOf(value.yesterdayOHLC, isPositiveCoherentOhlcPoint) &&
    isArrayOf(value.todayOHLC, isPositiveCoherentOhlcPoint) &&
    (value.previousClose === null || isPositiveNumber(value.previousClose)) &&
    (value.todayStartIndex === null ||
      (Number.isInteger(value.todayStartIndex) &&
        (value.todayStartIndex as number) >= 0 &&
        (value.todayStartIndex as number) <= historyLength))
  )
}

function isMarketData(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNonZeroNumber(value.currentPrice) &&
    isFiniteNumber(value.priceChange) &&
    isFiniteNumber(value.priceChangePercent) &&
    isString(value.date) &&
    isArrayOf(value.priceHistory, isFiniteCoherentOhlcPoint)
  )
}

function isFuture(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.symbol) &&
    isString(value.name) &&
    isFiniteNonZeroNumber(value.price) &&
    isFiniteNumber(value.change) &&
    isFiniteNumber(value.changesPercentage) &&
    isArrayOf(value.ytdPriceHistory, isFinitePricePoint) &&
    isFiniteNumber(value.ytdChangePercent)
  )
}

function isFutureWithHistory(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.symbol) &&
    isString(value.name) &&
    isFiniteNonZeroNumber(value.currentPrice) &&
    isFiniteNumber(value.priceChange) &&
    isFiniteNumber(value.priceChangePercent) &&
    isString(value.date) &&
    isArrayOf(value.priceHistory, isFiniteCoherentOhlcPoint)
  )
}

function isSector(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.sector) &&
    isString(value.changesPercentage) &&
    (value.ytdReturn === undefined || isFiniteNumber(value.ytdReturn))
  )
}

function isEconomicEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.date) &&
    isString(value.country) &&
    isString(value.event) &&
    isString(value.currency) &&
    isNullableFiniteNumber(value.previous) &&
    isNullableFiniteNumber(value.estimate) &&
    isNullableFiniteNumber(value.actual) &&
    isString(value.impact) &&
    isString(value.unit)
  )
}

function isMarketNewsItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.title) &&
    isString(value.text) &&
    isString(value.url) &&
    isString(value.publishedDate) &&
    isString(value.site)
  )
}

function isEarnings(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.symbol) &&
    isString(value.name) &&
    isString(value.date) &&
    (value.time === null || ['bmo', 'amc', 'dmh'].includes(value.time as string)) &&
    isString(value.fiscalDateEnding) &&
    isNullableFiniteNumber(value.eps) &&
    isNullableFiniteNumber(value.epsEstimated) &&
    isNullableFiniteNumber(value.revenue) &&
    isNullableFiniteNumber(value.revenueEstimated)
  )
}

function isMiniSparkline(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.symbol) &&
    isFiniteNumber(value.changesPercentage) &&
    isArrayOf(value.priceHistory, isPositivePricePoint)
  )
}

function isForexBond(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.symbol) &&
    isString(value.name) &&
    isFiniteNumber(value.price) &&
    value.price !== 0 &&
    isFiniteNumber(value.change) &&
    isFiniteNumber(value.changesPercentage)
  )
}

function isLargeInsiderTrade(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.symbol) &&
    isString(value.reportingName) &&
    isString(value.transactionDate) &&
    isString(value.transactionCode) &&
    isString(value.formType) &&
    isPositiveNumber(value.shares) &&
    isPositiveNumber(value.price) &&
    isPositiveNumber(value.value) &&
    isString(value.acquisitionDisposition)
  )
}

const SECTION_VALUE_VALIDATORS = {
  gainers: isAllSessionMovers,
  losers: isAllSessionMovers,
  stocks: (value: unknown) =>
    isExactSymbolPanel(value, DASHBOARD_STOCK_SYMBOLS, isStock),
  sparklineIndices: (value: unknown) =>
    isExactSymbolPanel(value, DASHBOARD_INDEX_SYMBOLS, isSparklineIndex),
  esFutures: (value: unknown) => value === null || isMarketData(value),
  futures: (value: unknown) => isArrayOf(value, isFuture),
  futuresWithHistory: (value: unknown) =>
    isArrayOf(value, isFutureWithHistory),
  sectors: (value: unknown) => isArrayOf(value, isSector),
  economicEvents: (value: unknown) => isArrayOf(value, isEconomicEvent),
  marketNews: (value: unknown) => isArrayOf(value, isMarketNewsItem),
  earnings: (value: unknown) => isArrayOf(value, isEarnings),
  earningsTotalCount: (value: unknown) =>
    isFiniteNumber(value) && Number.isInteger(value) && value >= 0,
  sp500GainerSparklines: (value: unknown) =>
    isArrayOf(value, isMiniSparkline),
  sp500LoserSparklines: (value: unknown) =>
    isArrayOf(value, isMiniSparkline),
  metaSparkline: (value: unknown) => value === null || isMiniSparkline(value),
  xlbSparkline: (value: unknown) => value === null || isMiniSparkline(value),
  forexBonds: (value: unknown) =>
    isExactSymbolPanel(value, FOREX_BOND_SYMBOLS, isForexBond),
  largeInsiderTrades: (value: unknown) =>
    isArrayOf(value, isLargeInsiderTrade),
} satisfies Record<DashboardMarketSnapshotSection, (value: unknown) => boolean>

/**
 * Validate one same-origin snapshot response and project only the fields that
 * belong to its cadence. Failed fields are omitted even when the server body
 * contains a last-known-good fallback.
 */
export async function readDashboardMarketSnapshotResponse(
  kind: DashboardMarketSnapshotKind,
  response: Response,
): Promise<DashboardMarketSnapshotPatch> {
  if (!response.ok) {
    throw new Error(`Market snapshot returned ${response.status}`)
  }
  if (response.headers.get('X-Snapshot') !== kind) {
    throw new Error(`Market snapshot identity did not match ${kind}`)
  }

  const capturedAt = response.headers.get('X-Snapshot-Captured-At')
  if (!isValidSnapshotTimestamp(capturedAt)) {
    throw new Error(`Market snapshot returned an invalid ${kind} capture time`)
  }

  const body: unknown = await response.json()
  if (!isRecord(body)) {
    throw new Error('Market snapshot returned a non-object payload')
  }

  const declaredDegraded = parseDegradedSections(
    kind,
    response.headers.get('X-Snapshot-Degraded'),
  )
  const declaredSet = new Set<DashboardMarketSnapshotSection>(declaredDegraded)
  const missing: DashboardMarketSnapshotSection[] = []
  const invalid: DashboardMarketSnapshotSection[] = []
  const data: Record<string, unknown> = {}
  const appliedSections: DashboardMarketSnapshotSection[] = []

  for (const section of allowedSections(kind)) {
    if (!Object.prototype.hasOwnProperty.call(body, section)) {
      missing.push(section)
      continue
    }
    if (declaredSet.has(section)) continue

    if (!SECTION_VALUE_VALIDATORS[section](body[section])) {
      invalid.push(section)
      continue
    }

    data[section] = body[section]
    appliedSections.push(section)
  }

  const degradedSections = normalizeSections(kind, [
    ...declaredDegraded,
    ...missing,
    ...invalid,
  ])

  return {
    kind,
    data: data as Partial<AllMarketData>,
    appliedSections,
    degradedSections,
    capturedAt,
    receivedAt: new Date().toISOString(),
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Snapshot request aborted', 'AbortError')
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal)
}

/**
 * Race an operation against cancellation even when the operation ignores the
 * provided signal. Attaching both settlement handlers also consumes a late
 * rejection after the abort has already won the race.
 */
function awaitWithAbortFence<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortReason(signal))
      return
    }

    let settled = false
    const cleanup = () => signal.removeEventListener('abort', handleAbort)
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const handleAbort = () => finish(() => reject(abortReason(signal)))

    signal.addEventListener('abort', handleAbort, { once: true })
    operation.then(
      (value) =>
        finish(() => {
          if (signal.aborted) reject(abortReason(signal))
          else resolve(value)
        }),
      (error) => finish(() => reject(error)),
    )
  })
}

export interface FetchDashboardMarketSnapshotOptions {
  signal: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/** A caller-owned signal plus a hard body-read deadline bounds every request. */
export async function fetchDashboardMarketSnapshot(
  kind: DashboardMarketSnapshotKind,
  options: FetchDashboardMarketSnapshotOptions,
): Promise<DashboardMarketSnapshotPatch> {
  const {
    signal,
    timeoutMs = DASHBOARD_SNAPSHOT_CLIENT_TIMEOUT_MS[kind],
    fetchImpl = fetch,
  } = options

  throwIfAborted(signal)

  const controller = new AbortController()
  const handleParentAbort = () => controller.abort(abortReason(signal))
  signal.addEventListener('abort', handleParentAbort, { once: true })
  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException(`Market ${kind} snapshot timed out`, 'TimeoutError'),
    )
  }, timeoutMs)

  try {
    let request: Promise<Response>
    try {
      request = fetchImpl(ENDPOINTS[kind], {
        cache: 'no-store',
        signal: controller.signal,
      })
    } catch (error) {
      request = Promise.reject(error)
    }

    const response = await awaitWithAbortFence(
      request,
      controller.signal,
    )
    throwIfAborted(controller.signal)

    const snapshot = await awaitWithAbortFence(
      readDashboardMarketSnapshotResponse(kind, response),
      controller.signal,
    )
    throwIfAborted(controller.signal)
    return snapshot
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', handleParentAbort)
  }
}
