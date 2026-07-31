import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs'
import { dirname, resolve } from 'path'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getStockWhyMovingData } from '@/lib/stock-why-moving'
import {
  buildPulseTodayCockpitSnapshot,
  type PulseTodayMoversData,
} from '@/lib/pulse-today-utils'
import type { Database } from '@/lib/database.types'
import type {
  WhyMovedCandidate,
  WhyMovedDirection,
  WhyMovedQueueItem,
  WhyMovedReviewRecord,
  WhyMovedReviewStatus,
} from '@/lib/why-moved-types'

type ReviewRow =
  Database['public']['Tables']['stock_why_moving_reviews']['Row']

const REVIEW_TABLE = 'stock_why_moving_reviews'
const LOCAL_REVIEW_DIR = resolve('.why-moved-reviews')
const LOCAL_REVIEW_PATH = resolve(LOCAL_REVIEW_DIR, 'reviews.json')

export function buildWhyMovedReviewKey(input: {
  marketDate: string
  session: string
  direction: WhyMovedDirection
  symbol: string
}): string {
  return [
    input.marketDate,
    input.session,
    input.direction,
    input.symbol.trim().toUpperCase(),
  ].join(':')
}

function mapReviewRow(row: ReviewRow): WhyMovedReviewRecord {
  return {
    id: row.id,
    reviewKey: row.review_key,
    symbol: row.symbol,
    marketDate: row.market_date,
    session: row.session as WhyMovedReviewRecord['session'],
    direction: row.direction as WhyMovedDirection,
    status: row.status as WhyMovedReviewStatus,
    notes: row.notes,
    reviewerId: row.reviewer_id,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function readLocalReviews(
  storagePath = LOCAL_REVIEW_PATH,
): WhyMovedReviewRecord[] {
  if (!existsSync(storagePath)) return []
  try {
    const value = JSON.parse(
      readFileSync(storagePath, 'utf8'),
    ) as WhyMovedReviewRecord[]
    return Array.isArray(value) ? value : []
  } catch (error) {
    console.error('[why-moved-review] Failed to read local reviews:', error)
    return []
  }
}

function writeLocalReviews(
  records: WhyMovedReviewRecord[],
  storagePath = LOCAL_REVIEW_PATH,
) {
  mkdirSync(dirname(storagePath), { recursive: true })
  const tempPath = `${storagePath}.${crypto.randomUUID()}.tmp`
  writeFileSync(tempPath, JSON.stringify(records, null, 2))
  renameSync(tempPath, storagePath)
}

function hasDatabaseStorage(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

function isMissingReviewTableError(error: {
  code?: string
  message?: string
} | null): boolean {
  return (
    error?.code === 'PGRST205' ||
    Boolean(
      error?.message?.includes(REVIEW_TABLE) &&
        error.message.includes('schema cache'),
    )
  )
}

async function listReviewRecords(
  reviewKeys: string[],
): Promise<WhyMovedReviewRecord[]> {
  if (reviewKeys.length === 0) return []

  if (hasDatabaseStorage()) {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from(REVIEW_TABLE)
      .select('*')
      .in('review_key', reviewKeys)

    if (!error) {
      return (data as ReviewRow[]).map(mapReviewRow)
    }
    if (!isMissingReviewTableError(error)) {
      throw new Error(`Failed to load why-moved reviews: ${error.message}`)
    }
  }

  const keySet = new Set(reviewKeys)
  return readLocalReviews().filter((record) => keySet.has(record.reviewKey))
}

export function selectWhyMovedCandidates(
  gainersData: PulseTodayMoversData,
  losersData: PulseTodayMoversData,
  marketDate: string,
  limitPerDirection = 5,
): WhyMovedCandidate[] {
  const snapshot = buildPulseTodayCockpitSnapshot(gainersData, losersData)
  const reviewSession = snapshot.session === 'closed' ? 'cash' : snapshot.session
  const seen = new Set<string>()
  const candidates: WhyMovedCandidate[] = []

  const append = (
    movers: typeof snapshot.gainers,
    direction: WhyMovedDirection,
  ) => {
    for (const mover of movers.slice(0, limitPerDirection)) {
      const symbol = mover.symbol.trim().toUpperCase()
      if (!symbol || seen.has(symbol)) continue
      seen.add(symbol)
      candidates.push({
        ...mover,
        symbol,
        direction,
        session: reviewSession,
        marketDate,
        reviewKey: buildWhyMovedReviewKey({
          marketDate,
          session: reviewSession,
          direction,
          symbol,
        }),
      })
    }
  }

  append(snapshot.gainers, 'gainer')
  append(snapshot.losers, 'loser')
  return candidates
}

export async function loadWhyMovedReviewQueue(
  candidates: WhyMovedCandidate[],
): Promise<WhyMovedQueueItem[]> {
  const [reviews, catalysts] = await Promise.all([
    listReviewRecords(candidates.map((candidate) => candidate.reviewKey)),
    Promise.all(
      candidates.map(async (candidate) => {
        try {
          return await getStockWhyMovingData(candidate.symbol)
        } catch (error) {
          const fetchedAt = new Date().toISOString()
          return {
            symbol: candidate.symbol,
            status: 'error' as const,
            displayText: null,
            headline: null,
            summary: null,
            bulletPoints: [],
            sentiment: null,
            source: null,
            sourceTimestamp: null,
            isCatalyst: null,
            sourceUrl: '',
            fetchedAt,
            errorMessage:
              error instanceof Error ? error.message : 'Catalyst lookup failed',
          }
        }
      }),
    ),
  ])

  const reviewsByKey = new Map(
    reviews.map((review) => [review.reviewKey, review]),
  )

  return candidates.map((candidate, index) => {
    const review = reviewsByKey.get(candidate.reviewKey) ?? null
    return {
      ...candidate,
      whyMoving: catalysts[index],
      review,
      reviewStatus: review?.status ?? 'pending',
    }
  })
}

export async function saveWhyMovedReview(input: {
  candidate: WhyMovedCandidate
  status: WhyMovedReviewStatus
  notes: string
  reviewerId: string
}, options: {
  localStoragePath?: string
} = {}): Promise<WhyMovedReviewRecord> {
  const now = new Date().toISOString()
  const notes = input.notes.trim()
  const reviewedAt = input.status === 'pending' ? null : now
  const symbol = input.candidate.symbol.trim().toUpperCase()
  const reviewKey = buildWhyMovedReviewKey({
    marketDate: input.candidate.marketDate,
    session: input.candidate.session,
    direction: input.candidate.direction,
    symbol,
  })

  if (hasDatabaseStorage()) {
    const supabase = createServiceRoleClient()
    const payload = {
      review_key: reviewKey,
      symbol,
      market_date: input.candidate.marketDate,
      session: input.candidate.session,
      direction: input.candidate.direction,
      status: input.status,
      notes,
      reviewer_id: input.reviewerId,
      reviewed_at: reviewedAt,
      updated_at: now,
    }
    const { data, error } = await supabase
      .from(REVIEW_TABLE)
      .upsert(payload, { onConflict: 'review_key' })
      .select('*')
      .single()

    if (!error && data) {
      return mapReviewRow(data as ReviewRow)
    }
    if (!isMissingReviewTableError(error)) {
      throw new Error(
        `Failed to save why-moved review: ${error?.message ?? 'Unknown error'}`,
      )
    }
  }

  const localStoragePath = options.localStoragePath ?? LOCAL_REVIEW_PATH
  const records = readLocalReviews(localStoragePath)
  const existingIndex = records.findIndex(
    (record) => record.reviewKey === reviewKey,
  )
  const existing = existingIndex >= 0 ? records[existingIndex] : null
  const record: WhyMovedReviewRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    reviewKey,
    symbol,
    marketDate: input.candidate.marketDate,
    session: input.candidate.session,
    direction: input.candidate.direction,
    status: input.status,
    notes,
    reviewerId: input.reviewerId,
    reviewedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  if (existingIndex >= 0) records[existingIndex] = record
  else records.push(record)
  writeLocalReviews(records, localStoragePath)
  return record
}
