import type { AllMarketData } from '@/lib/market-types'

/**
 * Fields the market-overview client actually refreshes on its fast cadence.
 *
 * Keep this allowlist deliberately small. Adding a field here is a promise that
 * the fast loader, route boundary, and client freshness label all understand
 * its failure semantics.
 */
export const FAST_MARKET_DATA_SECTIONS = [
  'gainers',
  'losers',
  'stocks',
  'sparklineIndices',
] as const satisfies readonly (keyof AllMarketData)[]

export type FastMarketDataSection = typeof FAST_MARKET_DATA_SECTIONS[number]

export type FastMarketDataPatch = Partial<
  Pick<AllMarketData, FastMarketDataSection>
>

export interface FastMarketDataSnapshot {
  data: FastMarketDataPatch
  failedSections: FastMarketDataSection[]
  /** Time the source fan-out finished, not the time a client received it. */
  capturedAt: string
}

const SECTION_ORDER = new Map<FastMarketDataSection, number>(
  FAST_MARKET_DATA_SECTIONS.map((section, index) => [section, index]),
)

const HEADER_TO_SECTION = new Map<string, FastMarketDataSection>(
  FAST_MARKET_DATA_SECTIONS.map((section) => [
    fastSectionHeaderName(section),
    section,
  ]),
)

export function normalizeFastFailedSections(
  sections: readonly FastMarketDataSection[],
): FastMarketDataSection[] {
  return [...new Set(sections)].sort(
    (left, right) => SECTION_ORDER.get(left)! - SECTION_ORDER.get(right)!,
  )
}

export function fastSectionHeaderName(
  section: FastMarketDataSection,
): string {
  return section.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

export function fastSectionFromHeaderName(
  headerName: string,
): FastMarketDataSection | null {
  return HEADER_TO_SECTION.get(headerName.trim().toLowerCase()) ?? null
}

export function isValidSnapshotTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false
  }

  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}
