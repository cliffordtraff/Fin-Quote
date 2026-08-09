import type { WhyMovedEditorialInboxItem } from '@/lib/why-moved-types'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const QUEUE_AGING_MS = HOUR_MS
const QUEUE_STALE_MS = 4 * HOUR_MS
const CATALYST_AGING_MS = 2 * HOUR_MS
const CATALYST_STALE_MS = 6 * HOUR_MS

export type WhyMovedFreshnessState = 'fresh' | 'aging' | 'stale' | 'missing'

export interface WhyMovedFreshnessSignal {
  state: WhyMovedFreshnessState
  ageMinutes: number | null
  label: string
}

export interface WhyMovedEditorialFreshness {
  queue: WhyMovedFreshnessSignal
  catalyst: WhyMovedFreshnessSignal
  needsAttention: boolean
}

function ageMs(value: string | null | undefined, now: Date): number | null {
  if (!value) return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  return Math.max(0, now.getTime() - parsed.getTime())
}

function formatAge(value: number): string {
  if (value < MINUTE_MS) return 'under 1 minute'
  if (value < HOUR_MS) return `${Math.floor(value / MINUTE_MS)}m`
  if (value < 24 * HOUR_MS) return `${Math.floor(value / HOUR_MS)}h`
  return `${Math.floor(value / (24 * HOUR_MS))}d`
}

function signal(
  age: number | null,
  thresholds: { aging: number; stale: number },
  noun: string,
): WhyMovedFreshnessSignal {
  if (age == null) {
    return {
      state: 'missing',
      ageMinutes: null,
      label: `${noun} time unavailable`,
    }
  }
  const state: WhyMovedFreshnessState =
    age >= thresholds.stale
      ? 'stale'
      : age >= thresholds.aging
        ? 'aging'
        : 'fresh'
  return {
    state,
    ageMinutes: Math.floor(age / MINUTE_MS),
    label: `${noun} ${formatAge(age)} ago`,
  }
}

export function getWhyMovedEditorialFreshness(
  item: WhyMovedEditorialInboxItem,
  now = new Date(),
): WhyMovedEditorialFreshness {
  const queue = signal(
    ageMs(item.review.firstSeenAt, now),
    { aging: QUEUE_AGING_MS, stale: QUEUE_STALE_MS },
    'Queued',
  )
  const catalyst =
    item.review.snapshotState === 'legacy_missing'
      ? {
          state: 'missing' as const,
          ageMinutes: null,
          label: 'Discovery-time catalyst missing',
        }
      : signal(
          ageMs(item.catalyst.fetchedAt, now),
          { aging: CATALYST_AGING_MS, stale: CATALYST_STALE_MS },
          'Catalyst captured',
        )

  return {
    queue,
    catalyst,
    needsAttention:
      item.review.status === 'pending' &&
      (queue.state === 'aging' ||
        queue.state === 'stale' ||
        catalyst.state === 'aging' ||
        catalyst.state === 'stale' ||
        catalyst.state === 'missing'),
  }
}

export const WHY_MOVED_FRESHNESS_THRESHOLDS = {
  queueAgingMinutes: QUEUE_AGING_MS / MINUTE_MS,
  queueStaleMinutes: QUEUE_STALE_MS / MINUTE_MS,
  catalystAgingMinutes: CATALYST_AGING_MS / MINUTE_MS,
  catalystStaleMinutes: CATALYST_STALE_MS / MINUTE_MS,
} as const
