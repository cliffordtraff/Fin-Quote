import { NextResponse } from 'next/server'
import type { AllMarketData } from '@/lib/market-types'
import { hasCompleteForexBondPanel } from '@/lib/forex-bonds-panel'
import { getSlowSnapshotBase } from '@/lib/slow-snapshot-base-cache'
import { recoverSlowSnapshotForexBonds } from '@/lib/slow-snapshot-forex-recovery'
import {
  mergeFailedSlowSections,
  normalizeSlowFailedSections,
  oldestSlowCaptureTime,
  SLOW_MARKET_DATA_SECTIONS,
  slowSectionHeaderName,
  type SlowMarketDataSection,
  type SlowSectionCaptureTimes,
} from '@/lib/slow-snapshot-types'

const TTL_MS = 5 * 60_000
const COMPLETE_CACHE_CONTROL =
  'public, max-age=120, stale-while-revalidate=600'
const DEGRADED_CACHE_CONTROL = 'no-store'

// Retain the last complete value after its public TTL expires. Explicitly
// failed fields may borrow from it, but a degraded refresh never replaces it.
interface SlowRouteCache {
  at: number
  capturedAt: string
  data: Partial<AllMarketData>
  sectionCapturedAt: SlowSectionCaptureTimes
}

let cache: SlowRouteCache | null = null

function hasSection(
  data: Partial<AllMarketData>,
  section: SlowMarketDataSection,
): boolean {
  return Object.prototype.hasOwnProperty.call(data, section)
}

function captureTimesForData(
  data: Partial<AllMarketData>,
  source: SlowSectionCaptureTimes,
  fallback: string,
): SlowSectionCaptureTimes {
  const result: SlowSectionCaptureTimes = {}
  for (const section of SLOW_MARKET_DATA_SECTIONS) {
    if (hasSection(data, section)) {
      result[section] = source[section] ?? fallback
    }
  }
  return result
}

function mergeFallbackCaptureTimes(
  current: SlowSectionCaptureTimes,
  fallback: SlowRouteCache | null,
  sections: readonly SlowMarketDataSection[],
): SlowSectionCaptureTimes {
  if (!fallback || sections.length === 0) return current

  const result = { ...current }
  for (const section of sections) {
    if (hasSection(fallback.data, section)) {
      result[section] =
        fallback.sectionCapturedAt[section] ?? fallback.capturedAt
    }
  }
  return result
}

function oldestDataCaptureTime(
  data: Partial<AllMarketData>,
  sectionCapturedAt: SlowSectionCaptureTimes,
  fallback: string,
): string {
  return oldestSlowCaptureTime(
    SLOW_MARKET_DATA_SECTIONS.map((section) =>
      hasSection(data, section) ? sectionCapturedAt[section] : null,
    ),
    fallback,
  )
}

function responseHeaders(
  failedSections: readonly SlowMarketDataSection[],
  cacheStatus: 'HIT' | 'MISS',
  capturedAt: string,
) {
  const complete = failedSections.length === 0
  return {
    'Cache-Control': complete
      ? COMPLETE_CACHE_CONTROL
      : DEGRADED_CACHE_CONTROL,
    'X-Cache': cacheStatus,
    'X-Snapshot': 'slow',
    'X-Snapshot-Captured-At': capturedAt,
    ...(complete
      ? {}
      : {
          'X-Snapshot-Degraded': failedSections
            .map(slowSectionHeaderName)
            .join(','),
        }),
  }
}

export async function GET(request: Request) {
  const now = Date.now()

  if (cache && now - cache.at < TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: responseHeaders([], 'HIT', cache.capturedAt),
    })
  }

  const base = await getSlowSnapshotBase(request.signal)
  let failedSections = normalizeSlowFailedSections(base.failedSections)
  const baseStaleSections = new Set(base.staleSections)
  const sectionsMissingBaseFallback = failedSections.filter(
    (section) => !baseStaleSections.has(section),
  )
  let data = mergeFailedSlowSections(
    base.data,
    cache?.data ?? null,
    sectionsMissingBaseFallback,
  )
  let sectionCapturedAt = mergeFallbackCaptureTimes(
    captureTimesForData(
      base.data,
      base.sectionCapturedAt,
      base.capturedAt,
    ),
    cache,
    sectionsMissingBaseFallback,
  )

  // A failed FX section may already contain stale rows borrowed from the last
  // complete snapshot. Still run the targeted live repair before declaring the
  // refresh complete.
  if (
    failedSections.includes('forexBonds') ||
    !hasCompleteForexBondPanel(data.forexBonds)
  ) {
    const recoveredForexBonds = await recoverSlowSnapshotForexBonds(
      request.signal,
    )
    if (recoveredForexBonds) {
      data = { ...data, forexBonds: recoveredForexBonds.forexBonds }
      sectionCapturedAt = {
        ...sectionCapturedAt,
        forexBonds: recoveredForexBonds.capturedAt,
      }
      failedSections = failedSections.filter(
        (section) => section !== 'forexBonds',
      )
    } else if (!failedSections.includes('forexBonds')) {
      failedSections = normalizeSlowFailedSections([
        ...failedSections,
        'forexBonds',
      ])
    }
  }

  // Exact panel completeness is a final boundary check even if a mocked or
  // future recovery implementation violates its own contract.
  if (
    !hasCompleteForexBondPanel(data.forexBonds) &&
    !failedSections.includes('forexBonds')
  ) {
    failedSections = normalizeSlowFailedSections([
      ...failedSections,
      'forexBonds',
    ])
  }

  // Some failures (notably a partial FX panel discovered at this boundary)
  // are added after the initial base merge. Reconcile the final provenance so
  // a cold patch omits failed placeholders and a warm patch uses only the last
  // complete value.
  const failedWithoutBaseFallback = failedSections.filter(
    (section) => !baseStaleSections.has(section),
  )
  if (failedWithoutBaseFallback.length > 0) {
    const cleanPatch = { ...data } as Record<string, unknown>
    const cleanCaptureTimes = { ...sectionCapturedAt }
    for (const section of failedWithoutBaseFallback) {
      delete cleanPatch[section]
      delete cleanCaptureTimes[section]
    }
    data = mergeFailedSlowSections(
      cleanPatch as Partial<AllMarketData>,
      cache?.data ?? null,
      failedWithoutBaseFallback,
    )
    sectionCapturedAt = mergeFallbackCaptureTimes(
      cleanCaptureTimes,
      cache,
      failedWithoutBaseFallback,
    )
  }

  const capturedAt = oldestDataCaptureTime(
    data,
    sectionCapturedAt,
    base.capturedAt,
  )
  if (failedSections.length === 0) {
    cache = {
      at: Date.now(),
      capturedAt,
      data: { ...data },
      sectionCapturedAt: { ...sectionCapturedAt },
    }
  }

  return NextResponse.json(data, {
    headers: responseHeaders(failedSections, 'MISS', capturedAt),
  })
}
