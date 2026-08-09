import type { BeehiivDeliveryRecord } from './types'

const TIMESTAMPTZ_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/

interface PreciseTimestamp {
  epochMillis: number
  subMillisecondMicros: number
}

function parsePreciseTimestamp(value: string): PreciseTimestamp | null {
  const match = TIMESTAMPTZ_PATTERN.exec(value.trim())
  if (!match) return null

  const [, date, time, fraction = '', offset] = match
  const wholeSecondMillis = Date.parse(`${date}T${time}${offset}`)
  if (!Number.isFinite(wholeSecondMillis)) return null

  const fractionalMicros = fraction.padEnd(6, '0')
  return {
    epochMillis:
      wholeSecondMillis + Number(fractionalMicros.slice(0, 3)),
    subMillisecondMicros: Number(fractionalMicros.slice(3, 6)),
  }
}

function comparePreciseTimestamps(
  left: PreciseTimestamp,
  right: PreciseTimestamp,
): number {
  if (left.epochMillis !== right.epochMillis) {
    return left.epochMillis < right.epochMillis ? -1 : 1
  }
  if (left.subMillisecondMicros === right.subMillisecondMicros) return 0
  return left.subMillisecondMicros < right.subMillisecondMicros ? -1 : 1
}

/**
 * Reports whether a saved newsletter version is absent from Beehiiv.
 *
 * New receipts carry the exact draft version that produced their content, so
 * equality is the freshness contract. A legacy receipt without that evidence
 * fails closed and requires one safe resync; completion time alone cannot prove
 * which version reached Beehiiv. Comparison retains PostgreSQL's microsecond
 * precision instead of truncating through JavaScript Date objects.
 */
export function beehiivDeliveryNeedsSync(
  draftUpdatedAt: string,
  delivery: Pick<
    BeehiivDeliveryRecord,
    'sourceDraftUpdatedAt' | 'syncedAt'
  >,
): boolean {
  if (!delivery.sourceDraftUpdatedAt) return true
  const draftVersion = parsePreciseTimestamp(draftUpdatedAt)
  const deliveredVersion = parsePreciseTimestamp(
    delivery.sourceDraftUpdatedAt,
  )
  return (
    draftVersion === null ||
    deliveredVersion === null ||
    comparePreciseTimestamps(deliveredVersion, draftVersion) !== 0
  )
}
