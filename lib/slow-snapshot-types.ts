import type { AllMarketData } from '@/lib/market-types'

export const SLOW_MARKET_DATA_SECTIONS = [
  'esFutures',
  'futures',
  'futuresWithHistory',
  'sectors',
  'economicEvents',
  'marketNews',
  'earnings',
  'earningsTotalCount',
  'sp500GainerSparklines',
  'sp500LoserSparklines',
  'metaSparkline',
  'xlbSparkline',
  'forexBonds',
  'largeInsiderTrades',
] as const satisfies readonly (keyof AllMarketData)[]

export type SlowMarketDataSection = typeof SLOW_MARKET_DATA_SECTIONS[number]

export type SlowSectionCaptureTimes = Partial<
  Record<SlowMarketDataSection, string>
>

export interface SlowMarketDataSnapshot {
  data: Partial<AllMarketData>
  failedSections: SlowMarketDataSection[]
  /** Time the source fan-out finished, not the time an HTTP response was sent. */
  capturedAt: string
}

const SECTION_ORDER = new Map<SlowMarketDataSection, number>(
  SLOW_MARKET_DATA_SECTIONS.map((section, index) => [section, index]),
)

export function normalizeSlowFailedSections(
  sections: readonly SlowMarketDataSection[],
): SlowMarketDataSection[] {
  return [...new Set(sections)].sort(
    (left, right) => SECTION_ORDER.get(left)! - SECTION_ORDER.get(right)!,
  )
}

/** Preserve only fields whose current loader explicitly reported failure. */
export function mergeFailedSlowSections(
  current: Partial<AllMarketData>,
  lastKnownGood: Partial<AllMarketData> | null,
  failedSections: readonly SlowMarketDataSection[],
): Partial<AllMarketData> {
  if (!lastKnownGood || failedSections.length === 0) return current

  const merged = { ...current } as Record<string, unknown>
  const fallback = lastKnownGood as Record<string, unknown>
  for (const section of failedSections) {
    if (Object.prototype.hasOwnProperty.call(fallback, section)) {
      merged[section] = fallback[section]
    }
  }
  return merged as Partial<AllMarketData>
}

/** Return the oldest source time among the values assembled into one patch. */
export function oldestSlowCaptureTime(
  captureTimes: readonly (string | null | undefined)[],
  fallback: string,
): string {
  let oldest: string | null = null
  let oldestMs = Number.POSITIVE_INFINITY

  for (const capturedAt of captureTimes) {
    if (!capturedAt) continue
    const capturedAtMs = Date.parse(capturedAt)
    if (
      Number.isFinite(capturedAtMs) &&
      capturedAtMs < oldestMs
    ) {
      oldest = capturedAt
      oldestMs = capturedAtMs
    }
  }

  return oldest ?? fallback
}

export function slowSectionHeaderName(section: SlowMarketDataSection): string {
  return section.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}
