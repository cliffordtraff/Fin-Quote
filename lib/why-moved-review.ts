import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'fs'
import { dirname, resolve } from 'path'
import type { Database, Json } from '@/lib/database.types'
import type { MarketSession } from '@/lib/market-hours'
import {
  buildPulseTodayCockpitSnapshot,
  type PulseTodayMoversData,
} from '@/lib/pulse-today-utils'
import {
  getStockWhyMovingData,
  type StockWhyMovingResult,
} from '@/lib/stock-why-moving'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type {
  WhyMovedBulkReviewStatus,
  WhyMovedBulkReviewTransitionInput,
  WhyMovedBulkReviewTransitionResult,
  WhyMovedCandidate,
  WhyMovedCandidateSnapshot,
  WhyMovedDirection,
  WhyMovedEditorialDiscovery,
  WhyMovedEditorialInboxCursor,
  WhyMovedEditorialInboxItem,
  WhyMovedEditorialInboxPage,
  WhyMovedEditorialInboxQuery,
  WhyMovedEditorialReviewRecord,
  WhyMovedEditorialSnapshotState,
  WhyMovedQueueItem,
  WhyMovedReviewRecord,
  WhyMovedReviewStatus,
} from '@/lib/why-moved-types'

type ReviewRow =
  Database['public']['Tables']['stock_why_moving_reviews']['Row']
type InboxRow =
  Database['public']['Functions']['list_stock_why_moving_editorial_inbox']['Returns'][number]
type InboxFacetRow =
  Database['public']['Functions']['get_stock_why_moving_editorial_inbox_facets']['Returns'][number]
type BulkTransitionRow =
  Database['public']['Functions']['bulk_transition_stock_why_moving_reviews']['Returns'][number]

interface LocalBulkReceipt {
  idempotencyKey: string
  targetStatus: WhyMovedBulkReviewStatus
  reviewerId: string
  requestFingerprint: string
  results: WhyMovedBulkReviewTransitionResult[]
}

interface LocalReviewRecord extends WhyMovedEditorialReviewRecord {
  _bulkReceipts?: LocalBulkReceipt[]
}

export interface IngestWhyMovedEditorialCandidatesInput {
  sourceRunId: string
  seenAt?: string
  discoveries: WhyMovedEditorialDiscovery[]
}

export interface WhyMovedReviewStorageOptions {
  localStoragePath?: string
}

export class WhyMovedReviewValidationError extends Error {
  readonly code = 'invalid_input'

  constructor(message: string) {
    super(message)
    this.name = 'WhyMovedReviewValidationError'
  }
}

export class WhyMovedReviewConflictError extends Error {
  readonly code = 'edit_conflict'

  constructor(message: string) {
    super(message)
    this.name = 'WhyMovedReviewConflictError'
  }
}

const REVIEW_TABLE = 'stock_why_moving_reviews'
const LOCAL_REVIEW_DIR = resolve('.why-moved-reviews')
const LOCAL_REVIEW_PATH = resolve(LOCAL_REVIEW_DIR, 'reviews.json')
const MAX_INGEST_ITEMS = 100
const MAX_BULK_ITEMS = 100
const MAX_CURRENT_REVIEW_KEYS = 100
const DEFAULT_INBOX_PAGE_SIZE = 25
const MAX_INBOX_PAGE_SIZE = 100
const REVIEW_KEY_MAX_LENGTH = 180
const SOURCE_RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.-]{0,9}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MARKET_SESSIONS = new Set<MarketSession>([
  'premarket',
  'cash',
  'afterhours',
  'closed',
])
const REVIEW_STATUSES = new Set<WhyMovedReviewStatus>([
  'pending',
  'approved',
  'needs_work',
  'dismissed',
])
const BULK_REVIEW_STATUSES = new Set<WhyMovedBulkReviewStatus>([
  'pending',
  'needs_work',
  'dismissed',
])

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function normalizeTimestamp(value: string): string {
  return new Date(value).toISOString()
}

function isValidMarketDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function canonicalSymbol(value: string): string {
  return value.trim().toUpperCase()
}

function nextVersionTimestamp(previous: string, reference = new Date()): string {
  const previousMs = Date.parse(previous)
  const nextMs = Number.isFinite(previousMs) ? previousMs + 1 : 0
  return new Date(Math.max(reference.getTime(), nextMs)).toISOString()
}

function legacyCandidateSnapshot(input: {
  reviewKey: string
  symbol: string
  marketDate: string
  session: MarketSession
  direction: WhyMovedDirection
}): WhyMovedCandidateSnapshot {
  return {
    reviewKey: input.reviewKey,
    symbol: input.symbol,
    name: null,
    price: null,
    change: null,
    changesPercentage: null,
    direction: input.direction,
    session: input.session,
    marketDate: input.marketDate,
  }
}

function legacyCatalystSnapshot(
  symbol: string,
  fetchedAt: string,
): StockWhyMovingResult {
  return {
    symbol,
    status: 'error',
    displayText: null,
    headline: null,
    summary: null,
    bulletPoints: [],
    sentiment: null,
    source: 'legacy_review',
    sourceTimestamp: null,
    isCatalyst: null,
    sourceUrl: '',
    fetchedAt,
    errorMessage:
      'Discovery-time catalyst evidence was not captured for this legacy review.',
  }
}

function parseCandidateSnapshot(
  value: unknown,
  fallback: WhyMovedCandidateSnapshot,
): WhyMovedCandidateSnapshot {
  if (!isRecord(value)) return fallback
  return {
    reviewKey:
      typeof value.reviewKey === 'string' ? value.reviewKey : fallback.reviewKey,
    symbol:
      typeof value.symbol === 'string'
        ? canonicalSymbol(value.symbol)
        : fallback.symbol,
    name: nullableString(value.name),
    price: nullableNumber(value.price),
    change: nullableNumber(value.change),
    changesPercentage: nullableNumber(value.changesPercentage),
    direction:
      value.direction === 'gainer' || value.direction === 'loser'
        ? value.direction
        : fallback.direction,
    session: MARKET_SESSIONS.has(value.session as MarketSession)
      ? (value.session as MarketSession)
      : fallback.session,
    marketDate:
      typeof value.marketDate === 'string'
        ? value.marketDate
        : fallback.marketDate,
  }
}

function parseCatalystSnapshot(
  value: unknown,
  symbol: string,
  fallbackAt: string,
): StockWhyMovingResult {
  const fallback = legacyCatalystSnapshot(symbol, fallbackAt)
  if (!isRecord(value)) return fallback
  const status =
    value.status === 'found' ||
    value.status === 'not_found' ||
    value.status === 'error'
      ? value.status
      : fallback.status
  return {
    symbol:
      typeof value.symbol === 'string'
        ? canonicalSymbol(value.symbol)
        : fallback.symbol,
    status,
    displayText: nullableString(value.displayText),
    headline: nullableString(value.headline),
    summary: nullableString(value.summary),
    bulletPoints: Array.isArray(value.bulletPoints)
      ? value.bulletPoints.filter(
          (bulletPoint): bulletPoint is string => typeof bulletPoint === 'string',
        )
      : [],
    sentiment: nullableString(value.sentiment),
    source: nullableString(value.source),
    sourceTimestamp: nullableString(value.sourceTimestamp),
    isCatalyst:
      typeof value.isCatalyst === 'boolean' ? value.isCatalyst : null,
    sourceUrl: typeof value.sourceUrl === 'string' ? value.sourceUrl : '',
    fetchedAt: isValidTimestamp(value.fetchedAt)
      ? normalizeTimestamp(value.fetchedAt)
      : fallback.fetchedAt,
    errorMessage: nullableString(value.errorMessage),
  }
}

function mapReviewRow(row: ReviewRow): WhyMovedEditorialReviewRecord {
  const session = row.session as MarketSession
  const direction = row.direction as WhyMovedDirection
  const fallbackCandidate = legacyCandidateSnapshot({
    reviewKey: row.review_key,
    symbol: row.symbol,
    marketDate: row.market_date,
    session,
    direction,
  })
  const fallbackAt = row.reviewed_at ?? row.created_at
  const firstSeenAt = row.first_seen_at ?? row.created_at
  const lastSeenAt = row.last_seen_at ?? row.updated_at
  return {
    id: row.id,
    reviewKey: row.review_key,
    symbol: row.symbol,
    marketDate: row.market_date,
    session,
    direction,
    status: row.status as WhyMovedReviewStatus,
    notes: row.notes,
    reviewerId: row.reviewer_id,
    reviewedAt: row.reviewed_at,
    candidateSnapshot: parseCandidateSnapshot(
      row.candidate_snapshot,
      fallbackCandidate,
    ),
    catalystSnapshot: parseCatalystSnapshot(
      row.catalyst_snapshot,
      row.symbol,
      fallbackAt,
    ),
    snapshotState:
      row.snapshot_state === 'captured' ? 'captured' : 'legacy_missing',
    discoveryRunId: row.discovery_run_id ?? 'legacy-database-row',
    firstSeenAt,
    lastSeenAt: lastSeenAt < firstSeenAt ? firstSeenAt : lastSeenAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseLocalReview(value: unknown): LocalReviewRecord | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.reviewKey !== 'string' ||
    typeof value.symbol !== 'string' ||
    !isValidMarketDate(value.marketDate) ||
    !MARKET_SESSIONS.has(value.session as MarketSession) ||
    (value.direction !== 'gainer' && value.direction !== 'loser') ||
    !REVIEW_STATUSES.has(value.status as WhyMovedReviewStatus)
  ) {
    return null
  }

  const symbol = canonicalSymbol(value.symbol)
  const session = value.session as MarketSession
  const direction = value.direction
  const createdAt = isValidTimestamp(value.createdAt)
    ? normalizeTimestamp(value.createdAt)
    : new Date(0).toISOString()
  const updatedAt = isValidTimestamp(value.updatedAt)
    ? normalizeTimestamp(value.updatedAt)
    : createdAt
  const firstSeenAt = isValidTimestamp(value.firstSeenAt)
    ? normalizeTimestamp(value.firstSeenAt)
    : createdAt
  const lastSeenAt = isValidTimestamp(value.lastSeenAt)
    ? normalizeTimestamp(value.lastSeenAt)
    : updatedAt
  const fallbackCandidate = legacyCandidateSnapshot({
    reviewKey: value.reviewKey,
    symbol,
    marketDate: value.marketDate,
    session,
    direction,
  })
  const snapshotState: WhyMovedEditorialSnapshotState =
    value.snapshotState === 'captured' ? 'captured' : 'legacy_missing'

  return {
    id: value.id,
    reviewKey: value.reviewKey,
    symbol,
    marketDate: value.marketDate,
    session,
    direction,
    status: value.status as WhyMovedReviewStatus,
    notes: typeof value.notes === 'string' ? value.notes : '',
    reviewerId: nullableString(value.reviewerId),
    reviewedAt: isValidTimestamp(value.reviewedAt)
      ? normalizeTimestamp(value.reviewedAt)
      : null,
    candidateSnapshot: parseCandidateSnapshot(
      value.candidateSnapshot,
      fallbackCandidate,
    ),
    catalystSnapshot: parseCatalystSnapshot(
      value.catalystSnapshot,
      symbol,
      createdAt,
    ),
    snapshotState,
    discoveryRunId:
      typeof value.discoveryRunId === 'string'
        ? value.discoveryRunId
        : 'legacy-local-file',
    firstSeenAt,
    lastSeenAt: lastSeenAt < firstSeenAt ? firstSeenAt : lastSeenAt,
    createdAt,
    updatedAt,
    _bulkReceipts: Array.isArray(value._bulkReceipts)
      ? (value._bulkReceipts as LocalBulkReceipt[])
      : undefined,
  }
}

function readLocalReviews(storagePath = LOCAL_REVIEW_PATH): LocalReviewRecord[] {
  if (!existsSync(storagePath)) return []
  try {
    const value = JSON.parse(readFileSync(storagePath, 'utf8')) as unknown
    if (!Array.isArray(value)) return []
    return value
      .map(parseLocalReview)
      .filter((record): record is LocalReviewRecord => record !== null)
  } catch (error) {
    console.error('[why-moved-review] Failed to read local reviews:', error)
    return []
  }
}

function writeLocalReviews(
  records: LocalReviewRecord[],
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

function isMissingReviewStorageError(error: {
  code?: string
  message?: string
} | null): boolean {
  return (
    error?.code === 'PGRST202' ||
    error?.code === 'PGRST205' ||
    Boolean(
      error?.message?.includes('schema cache') &&
        (error.message.includes(REVIEW_TABLE) ||
          error.message.includes('stock_why_moving_review')),
    )
  )
}

async function listReviewRecords(
  reviewKeys: string[],
): Promise<WhyMovedEditorialReviewRecord[]> {
  if (reviewKeys.length === 0) return []

  if (hasDatabaseStorage()) {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase
      .from(REVIEW_TABLE)
      .select('*')
      .in('review_key', reviewKeys)

    if (!error) return (data as ReviewRow[]).map(mapReviewRow)
    if (!isMissingReviewStorageError(error)) {
      throw new Error(`Failed to load why-moved reviews: ${error.message}`)
    }
  }

  const keySet = new Set(reviewKeys)
  return readLocalReviews().filter((record) => keySet.has(record.reviewKey))
}

function validateCandidate(candidate: WhyMovedCandidate): WhyMovedCandidateSnapshot {
  const symbol = canonicalSymbol(candidate.symbol)
  if (!SYMBOL_RE.test(symbol)) {
    throw new WhyMovedReviewValidationError('Candidate symbol is invalid')
  }
  if (!isValidMarketDate(candidate.marketDate)) {
    throw new WhyMovedReviewValidationError('Candidate market date is invalid')
  }
  if (!MARKET_SESSIONS.has(candidate.session)) {
    throw new WhyMovedReviewValidationError('Candidate session is invalid')
  }
  if (candidate.direction !== 'gainer' && candidate.direction !== 'loser') {
    throw new WhyMovedReviewValidationError('Candidate direction is invalid')
  }
  const expectedKey = buildWhyMovedReviewKey({
    marketDate: candidate.marketDate,
    session: candidate.session,
    direction: candidate.direction,
    symbol,
  })
  if (
    candidate.reviewKey !== expectedKey ||
    candidate.reviewKey.length > REVIEW_KEY_MAX_LENGTH
  ) {
    throw new WhyMovedReviewValidationError(
      'Candidate review key does not match its identity',
    )
  }
  if (typeof candidate.name !== 'string' || candidate.name.length > 200) {
    throw new WhyMovedReviewValidationError('Candidate name is invalid')
  }
  if (
    !Number.isFinite(candidate.price) ||
    !Number.isFinite(candidate.change) ||
    !Number.isFinite(candidate.changesPercentage)
  ) {
    throw new WhyMovedReviewValidationError(
      'Candidate quote values must be finite numbers',
    )
  }

  return {
    reviewKey: candidate.reviewKey,
    symbol,
    name: candidate.name,
    price: candidate.price,
    change: candidate.change,
    changesPercentage: candidate.changesPercentage,
    direction: candidate.direction,
    session: candidate.session,
    marketDate: candidate.marketDate,
  }
}

function validateCatalyst(
  catalyst: StockWhyMovingResult,
  candidateSymbol: string,
): StockWhyMovingResult {
  const symbol = canonicalSymbol(catalyst.symbol)
  if (symbol !== candidateSymbol) {
    throw new WhyMovedReviewValidationError(
      'Catalyst snapshot symbol does not match its candidate',
    )
  }
  if (
    catalyst.status !== 'found' &&
    catalyst.status !== 'not_found' &&
    catalyst.status !== 'error'
  ) {
    throw new WhyMovedReviewValidationError('Catalyst status is invalid')
  }
  if (!isValidTimestamp(catalyst.fetchedAt)) {
    throw new WhyMovedReviewValidationError('Catalyst fetchedAt is invalid')
  }
  if (
    !Array.isArray(catalyst.bulletPoints) ||
    catalyst.bulletPoints.some((bulletPoint) => typeof bulletPoint !== 'string')
  ) {
    throw new WhyMovedReviewValidationError(
      'Catalyst bullet points must be strings',
    )
  }
  const nullableStrings = [
    catalyst.displayText,
    catalyst.headline,
    catalyst.summary,
    catalyst.sentiment,
    catalyst.source,
    catalyst.sourceTimestamp,
    catalyst.errorMessage,
  ]
  if (
    nullableStrings.some(
      (value) => value !== null && typeof value !== 'string',
    ) ||
    typeof catalyst.sourceUrl !== 'string' ||
    (catalyst.isCatalyst !== null &&
      typeof catalyst.isCatalyst !== 'boolean')
  ) {
    throw new WhyMovedReviewValidationError('Catalyst snapshot is invalid')
  }
  if (
    catalyst.sourceTimestamp !== null &&
    !isValidTimestamp(catalyst.sourceTimestamp)
  ) {
    throw new WhyMovedReviewValidationError(
      'Catalyst source timestamp is invalid',
    )
  }

  return {
    symbol,
    status: catalyst.status,
    displayText: catalyst.displayText,
    headline: catalyst.headline,
    summary: catalyst.summary,
    bulletPoints: [...catalyst.bulletPoints],
    sentiment: catalyst.sentiment,
    source: catalyst.source,
    sourceTimestamp: catalyst.sourceTimestamp,
    isCatalyst: catalyst.isCatalyst,
    sourceUrl: catalyst.sourceUrl,
    fetchedAt: normalizeTimestamp(catalyst.fetchedAt),
    errorMessage: catalyst.errorMessage,
  }
}

function validateDiscoveries(
  input: IngestWhyMovedEditorialCandidatesInput,
): Array<{
  candidate: WhyMovedCandidateSnapshot
  catalyst: StockWhyMovingResult
}> {
  if (!SOURCE_RUN_ID_RE.test(input.sourceRunId)) {
    throw new WhyMovedReviewValidationError('Source run id is invalid')
  }
  if (
    !Array.isArray(input.discoveries) ||
    input.discoveries.length < 1 ||
    input.discoveries.length > MAX_INGEST_ITEMS
  ) {
    throw new WhyMovedReviewValidationError(
      `Discoveries must contain between 1 and ${MAX_INGEST_ITEMS} items`,
    )
  }

  const seenKeys = new Set<string>()
  return input.discoveries.map((discovery) => {
    const candidate = validateCandidate(discovery.candidate)
    if (seenKeys.has(candidate.reviewKey)) {
      throw new WhyMovedReviewValidationError(
        'Discovery review keys must be unique',
      )
    }
    seenKeys.add(candidate.reviewKey)
    const catalyst = validateCatalyst(discovery.catalyst, candidate.symbol)
    if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > 16_384) {
      throw new WhyMovedReviewValidationError('Candidate snapshot is too large')
    }
    if (Buffer.byteLength(JSON.stringify(catalyst), 'utf8') > 65_536) {
      throw new WhyMovedReviewValidationError('Catalyst snapshot is too large')
    }
    return { candidate, catalyst }
  })
}

function validateSeenAt(value: string | undefined): string {
  const seenAt = value ?? new Date().toISOString()
  if (!isValidTimestamp(seenAt)) {
    throw new WhyMovedReviewValidationError('seenAt is invalid')
  }
  return normalizeTimestamp(seenAt)
}

export async function ingestWhyMovedEditorialCandidates(
  input: IngestWhyMovedEditorialCandidatesInput,
  options: WhyMovedReviewStorageOptions = {},
): Promise<WhyMovedEditorialReviewRecord[]> {
  const discoveries = validateDiscoveries(input)
  const seenAt = validateSeenAt(input.seenAt)

  if (hasDatabaseStorage()) {
    const supabase = createServiceRoleClient()
    const pItems = discoveries.map(({ candidate, catalyst }) => ({
      review_key: candidate.reviewKey,
      symbol: candidate.symbol,
      market_date: candidate.marketDate,
      session: candidate.session,
      direction: candidate.direction,
      candidate_snapshot: candidate,
      catalyst_snapshot: catalyst,
    })) as unknown as Json
    const { data, error } = await supabase.rpc(
      'ingest_stock_why_moving_review_candidates',
      {
        p_items: pItems,
        p_seen_at: seenAt,
        p_source_run_id: input.sourceRunId,
      },
    )
    if (!error) return (data as ReviewRow[]).map(mapReviewRow)
    if (!isMissingReviewStorageError(error)) {
      throw new Error(`Failed to ingest why-moved candidates: ${error.message}`)
    }
  }

  const storagePath = options.localStoragePath ?? LOCAL_REVIEW_PATH
  const records = readLocalReviews(storagePath)
  const recordsByKey = new Map(
    records.map((record, index) => [record.reviewKey, index]),
  )
  const ingested: LocalReviewRecord[] = []
  for (const { candidate, catalyst } of discoveries) {
    const existingIndex = recordsByKey.get(candidate.reviewKey)
    if (existingIndex !== undefined) {
      const existing = records[existingIndex]
      const lastSeenAt =
        seenAt > existing.lastSeenAt ? seenAt : existing.lastSeenAt
      const rediscovered = { ...existing, lastSeenAt }
      records[existingIndex] = rediscovered
      ingested.push(rediscovered)
      continue
    }

    const record: LocalReviewRecord = {
      id: crypto.randomUUID(),
      reviewKey: candidate.reviewKey,
      symbol: candidate.symbol,
      marketDate: candidate.marketDate,
      session: candidate.session,
      direction: candidate.direction,
      status: 'pending',
      notes: '',
      reviewerId: null,
      reviewedAt: null,
      candidateSnapshot: candidate,
      catalystSnapshot: catalyst,
      snapshotState: 'captured',
      discoveryRunId: input.sourceRunId,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      createdAt: seenAt,
      updatedAt: seenAt,
    }
    recordsByKey.set(candidate.reviewKey, records.length)
    records.push(record)
    ingested.push(record)
  }
  writeLocalReviews(records, storagePath)
  return ingested.sort((left, right) =>
    left.reviewKey.localeCompare(right.reviewKey),
  )
}

function validateCurrentReviewKeys(reviewKeys: string[]): string[] {
  if (reviewKeys.length > MAX_CURRENT_REVIEW_KEYS) {
    throw new WhyMovedReviewValidationError(
      `Current review keys cannot exceed ${MAX_CURRENT_REVIEW_KEYS}`,
    )
  }
  const unique = new Set(reviewKeys)
  if (
    unique.size !== reviewKeys.length ||
    reviewKeys.some(
      (reviewKey) =>
        typeof reviewKey !== 'string' ||
        reviewKey.length < 1 ||
        reviewKey.length > REVIEW_KEY_MAX_LENGTH,
    )
  ) {
    throw new WhyMovedReviewValidationError('Current review keys are invalid')
  }
  return [...reviewKeys]
}

function validateInboxPageSize(value: number | undefined): number {
  const pageSize = value ?? DEFAULT_INBOX_PAGE_SIZE
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_INBOX_PAGE_SIZE
  ) {
    throw new WhyMovedReviewValidationError(
      `Inbox page size must be between 1 and ${MAX_INBOX_PAGE_SIZE}`,
    )
  }
  return pageSize
}

function validateInboxFilters(query: WhyMovedEditorialInboxQuery): {
  status: WhyMovedReviewStatus | 'all' | undefined
  session: MarketSession | undefined
  marketDate: string | undefined
  dateFrom: string | undefined
  dateTo: string | undefined
} {
  if (
    query.status !== undefined &&
    query.status !== 'all' &&
    !REVIEW_STATUSES.has(query.status)
  ) {
    throw new WhyMovedReviewValidationError('Inbox status filter is invalid')
  }
  if (
    query.session !== undefined &&
    query.session !== 'all' &&
    !MARKET_SESSIONS.has(query.session)
  ) {
    throw new WhyMovedReviewValidationError('Inbox session filter is invalid')
  }
  if (query.marketDate !== undefined && !isValidMarketDate(query.marketDate)) {
    throw new WhyMovedReviewValidationError('Inbox market date is invalid')
  }
  if (query.dateFrom !== undefined && !isValidMarketDate(query.dateFrom)) {
    throw new WhyMovedReviewValidationError('Inbox start date is invalid')
  }
  if (query.dateTo !== undefined && !isValidMarketDate(query.dateTo)) {
    throw new WhyMovedReviewValidationError('Inbox end date is invalid')
  }
  if (
    query.marketDate !== undefined &&
    (query.dateFrom !== undefined || query.dateTo !== undefined)
  ) {
    throw new WhyMovedReviewValidationError(
      'Inbox marketDate cannot be combined with a date range',
    )
  }
  if (
    query.dateFrom !== undefined &&
    query.dateTo !== undefined &&
    query.dateFrom > query.dateTo
  ) {
    throw new WhyMovedReviewValidationError(
      'Inbox dateFrom cannot follow dateTo',
    )
  }
  return {
    status: query.status,
    session:
      query.session === undefined || query.session === 'all'
        ? undefined
        : query.session,
    marketDate: query.marketDate,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  }
}

function emptyStatusCounts(): Record<WhyMovedReviewStatus, number> {
  return {
    pending: 0,
    needs_work: 0,
    approved: 0,
    dismissed: 0,
  }
}

function encodeInboxCursor(cursor: WhyMovedEditorialInboxCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function decodeInboxCursor(value: string | undefined): WhyMovedEditorialInboxCursor | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as unknown
    if (
      !isRecord(parsed) ||
      (parsed.bucket !== 0 && parsed.bucket !== 1) ||
      !isValidMarketDate(parsed.marketDate) ||
      !isValidTimestamp(parsed.firstSeenAt) ||
      typeof parsed.id !== 'string' ||
      !UUID_RE.test(parsed.id)
    ) {
      throw new Error('Malformed cursor')
    }
    return {
      bucket: parsed.bucket,
      marketDate: parsed.marketDate,
      firstSeenAt: normalizeTimestamp(parsed.firstSeenAt),
      id: parsed.id,
    }
  } catch {
    throw new WhyMovedReviewValidationError('Editorial inbox cursor is invalid')
  }
}

function inboxBucket(status: WhyMovedReviewStatus): 0 | 1 {
  return status === 'pending' || status === 'needs_work' ? 0 : 1
}

function compareInboxTuple(
  left: WhyMovedEditorialInboxCursor,
  right: WhyMovedEditorialInboxCursor,
): number {
  return (
    left.bucket - right.bucket ||
    left.marketDate.localeCompare(right.marketDate) ||
    left.firstSeenAt.localeCompare(right.firstSeenAt) ||
    left.id.localeCompare(right.id)
  )
}

function inboxItem(
  review: WhyMovedEditorialReviewRecord,
  currentKeys: Set<string>,
): WhyMovedEditorialInboxItem {
  return {
    candidate: review.candidateSnapshot,
    catalyst: review.catalystSnapshot,
    review,
    current: currentKeys.has(review.reviewKey),
  }
}

export async function listWhyMovedEditorialInbox(
  query: WhyMovedEditorialInboxQuery = {},
  options: WhyMovedReviewStorageOptions = {},
): Promise<WhyMovedEditorialInboxPage> {
  const currentReviewKeys = validateCurrentReviewKeys(
    query.currentReviewKeys ?? [],
  )
  const currentKeys = new Set(currentReviewKeys)
  const pageSize = validateInboxPageSize(query.pageSize)
  const filters = validateInboxFilters(query)
  const cursor = decodeInboxCursor(query.cursor)

  if (hasDatabaseStorage()) {
    const supabase = createServiceRoleClient()
    const commonArgs = {
      p_current_review_keys: currentReviewKeys,
      p_status: filters.status ?? null,
      p_session: filters.session ?? null,
      p_market_date: filters.marketDate ?? null,
      p_date_from: filters.dateFrom ?? null,
      p_date_to: filters.dateTo ?? null,
    }
    const [listResult, facetsResult] = await Promise.all([
      supabase.rpc('list_stock_why_moving_editorial_inbox', {
        ...commonArgs,
        p_cursor_bucket: cursor?.bucket ?? null,
        p_cursor_market_date: cursor?.marketDate ?? null,
        p_cursor_first_seen_at: cursor?.firstSeenAt ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_limit: pageSize + 1,
      }),
      supabase.rpc('get_stock_why_moving_editorial_inbox_facets', commonArgs),
    ])
    if (!listResult.error && !facetsResult.error) {
      const rows = listResult.data as InboxRow[]
      const facets = (facetsResult.data as InboxFacetRow[])[0]
      const hasMore = rows.length > pageSize
      const visibleRows = rows.slice(0, pageSize)
      const items = visibleRows.map((row) =>
        inboxItem(mapReviewRow(row), currentKeys),
      )
      const lastRow = visibleRows.at(-1)
      return {
        items,
        pageSize,
        total: Number(facets?.total_count ?? 0),
        statusCounts: {
          pending: Number(facets?.pending_count ?? 0),
          needs_work: Number(facets?.needs_work_count ?? 0),
          approved: Number(facets?.approved_count ?? 0),
          dismissed: Number(facets?.dismissed_count ?? 0),
        },
        hasMore,
        nextCursor:
          hasMore && lastRow
            ? encodeInboxCursor({
                bucket: lastRow.sort_bucket as 0 | 1,
                marketDate: lastRow.market_date,
                firstSeenAt: lastRow.first_seen_at,
                id: lastRow.id,
              })
            : null,
      }
    }
    const databaseError = listResult.error ?? facetsResult.error
    if (!isMissingReviewStorageError(databaseError)) {
      throw new Error(
        `Failed to list why-moved inbox: ${databaseError?.message ?? 'Unknown error'}`,
      )
    }
  }

  const storagePath = options.localStoragePath ?? LOCAL_REVIEW_PATH
  const baseScope = readLocalReviews(storagePath)
    .filter(
      (review) =>
        (filters.status !== undefined ||
          review.status === 'pending' ||
          review.status === 'needs_work' ||
          currentKeys.has(review.reviewKey)) &&
        (filters.session === undefined || review.session === filters.session) &&
        (filters.marketDate === undefined ||
          review.marketDate === filters.marketDate) &&
        (filters.dateFrom === undefined ||
          review.marketDate >= filters.dateFrom) &&
        (filters.dateTo === undefined || review.marketDate <= filters.dateTo),
    )
  const statusCounts = emptyStatusCounts()
  for (const review of baseScope) statusCounts[review.status] += 1
  const matching = baseScope.filter(
    (review) =>
      filters.status === undefined ||
      filters.status === 'all' ||
      review.status === filters.status,
  )
  const eligible = matching
    .map((review) => ({
      review,
      cursor: {
        bucket: inboxBucket(review.status),
        marketDate: review.marketDate,
        firstSeenAt: review.firstSeenAt,
        id: review.id,
      } satisfies WhyMovedEditorialInboxCursor,
    }))
    .filter((entry) => !cursor || compareInboxTuple(entry.cursor, cursor) > 0)
    .sort((left, right) => compareInboxTuple(left.cursor, right.cursor))
  const hasMore = eligible.length > pageSize
  const visible = eligible.slice(0, pageSize)
  const lastEntry = visible.at(-1)
  return {
    items: visible.map(({ review }) => inboxItem(review, currentKeys)),
    pageSize,
    total: matching.length,
    statusCounts,
    hasMore,
    nextCursor:
      hasMore && lastEntry ? encodeInboxCursor(lastEntry.cursor) : null,
  }
}

function validateBulkTransition(
  input: WhyMovedBulkReviewTransitionInput,
): WhyMovedBulkReviewTransitionInput {
  if (!BULK_REVIEW_STATUSES.has(input.targetStatus)) {
    throw new WhyMovedReviewValidationError(
      'Bulk approval is not allowed; approve reviews individually',
    )
  }
  if (!UUID_RE.test(input.reviewerId)) {
    throw new WhyMovedReviewValidationError('Reviewer id is invalid')
  }
  if (!IDEMPOTENCY_KEY_RE.test(input.idempotencyKey)) {
    throw new WhyMovedReviewValidationError('Idempotency key is invalid')
  }
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > MAX_BULK_ITEMS
  ) {
    throw new WhyMovedReviewValidationError(
      `Bulk transitions must contain between 1 and ${MAX_BULK_ITEMS} items`,
    )
  }
  const ids = new Set<string>()
  for (const item of input.items) {
    if (!UUID_RE.test(item.id) || !isValidTimestamp(item.expectedUpdatedAt)) {
      throw new WhyMovedReviewValidationError(
        'Bulk items require valid id and expectedUpdatedAt values',
      )
    }
    if (ids.has(item.id)) {
      throw new WhyMovedReviewValidationError(
        'Bulk review ids must be unique',
      )
    }
    ids.add(item.id)
  }
  return input
}

function bulkRequestFingerprint(
  input: WhyMovedBulkReviewTransitionInput,
): string {
  return JSON.stringify({
    targetStatus: input.targetStatus,
    reviewerId: input.reviewerId,
    items: [...input.items].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  })
}

function readLocalBulkReceipts(records: LocalReviewRecord[]): LocalBulkReceipt[] {
  const receipts = new Map<string, LocalBulkReceipt>()
  for (const record of records) {
    for (const receipt of record._bulkReceipts ?? []) {
      if (!receipts.has(receipt.idempotencyKey)) {
        receipts.set(receipt.idempotencyKey, receipt)
      }
    }
  }
  return [...receipts.values()]
}

function attachLocalBulkReceipts(
  records: LocalReviewRecord[],
  receipts: LocalBulkReceipt[],
): LocalReviewRecord[] {
  return records.map((record, index) => {
    const { _bulkReceipts: ignored, ...rest } = record
    void ignored
    return index === 0 ? { ...rest, _bulkReceipts: receipts } : rest
  })
}

export async function bulkTransitionWhyMovedReviews(
  unvalidatedInput: WhyMovedBulkReviewTransitionInput,
  options: WhyMovedReviewStorageOptions = {},
): Promise<WhyMovedBulkReviewTransitionResult[]> {
  const input = validateBulkTransition(unvalidatedInput)

  if (hasDatabaseStorage()) {
    const supabase = createServiceRoleClient()
    const { data, error } = await supabase.rpc(
      'bulk_transition_stock_why_moving_reviews',
      {
        p_target_status: input.targetStatus,
        p_items: input.items.map((item) => ({
          id: item.id,
          expected_updated_at: item.expectedUpdatedAt,
        })) as unknown as Json,
        p_reviewer_id: input.reviewerId,
        p_idempotency_key: input.idempotencyKey,
      },
    )
    if (!error) {
      return (data as BulkTransitionRow[]).map((row) => ({
        id: row.id,
        status: row.status as WhyMovedBulkReviewStatus,
        reviewedAt: row.reviewed_at,
        updatedAt: row.updated_at,
        changed: row.changed,
      }))
    }
    if (!isMissingReviewStorageError(error)) {
      if (
        error.message.includes('changed, are approved, or do not exist')
      ) {
        throw new WhyMovedReviewConflictError(error.message)
      }
      throw new Error(`Failed to bulk-transition why-moved reviews: ${error.message}`)
    }
  }

  const storagePath = options.localStoragePath ?? LOCAL_REVIEW_PATH
  let records = readLocalReviews(storagePath)
  const receipts = readLocalBulkReceipts(records)
  const fingerprint = bulkRequestFingerprint(input)
  const existingReceipt = receipts.find(
    (receipt) => receipt.idempotencyKey === input.idempotencyKey,
  )
  if (existingReceipt) {
    if (
      existingReceipt.targetStatus !== input.targetStatus ||
      existingReceipt.reviewerId !== input.reviewerId ||
      existingReceipt.requestFingerprint !== fingerprint
    ) {
      throw new WhyMovedReviewConflictError(
        'Idempotency key was already used for a different request',
      )
    }
    return existingReceipt.results.map((result) => ({
      ...result,
      changed: false,
    }))
  }

  const recordsById = new Map(
    records.map((record, index) => [record.id, { record, index }]),
  )
  const requested = [...input.items].sort((left, right) =>
    left.id.localeCompare(right.id),
  )
  for (const item of requested) {
    const match = recordsById.get(item.id)?.record
    if (
      !match ||
      match.updatedAt !== item.expectedUpdatedAt ||
      !BULK_REVIEW_STATUSES.has(match.status as WhyMovedBulkReviewStatus)
    ) {
      throw new WhyMovedReviewConflictError(
        'One or more reviews changed, are approved, or do not exist',
      )
    }
  }

  const changedAt = new Date()
  const results = requested.map((item) => {
    const match = recordsById.get(item.id)!
    const changed = match.record.status !== input.targetStatus
    if (!changed) {
      return {
        id: match.record.id,
        status: input.targetStatus,
        reviewedAt: match.record.reviewedAt,
        updatedAt: match.record.updatedAt,
        changed: false,
      }
    }

    const updatedAt = nextVersionTimestamp(match.record.updatedAt, changedAt)
    const updated: LocalReviewRecord = {
      ...match.record,
      status: input.targetStatus,
      reviewerId: input.reviewerId,
      reviewedAt:
        input.targetStatus === 'pending' ? null : changedAt.toISOString(),
      updatedAt,
    }
    records[match.index] = updated
    return {
      id: updated.id,
      status: input.targetStatus,
      reviewedAt: updated.reviewedAt,
      updatedAt,
      changed: true,
    }
  })
  receipts.push({
    idempotencyKey: input.idempotencyKey,
    targetStatus: input.targetStatus,
    reviewerId: input.reviewerId,
    requestFingerprint: fingerprint,
    results,
  })
  records = attachLocalBulkReceipts(records, receipts)
  writeLocalReviews(records, storagePath)
  return results
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

function catalystLookupError(
  symbol: string,
  error: unknown,
): StockWhyMovingResult {
  return {
    symbol,
    status: 'error',
    displayText: null,
    headline: null,
    summary: null,
    bulletPoints: [],
    sentiment: null,
    source: null,
    sourceTimestamp: null,
    isCatalyst: null,
    sourceUrl: '',
    fetchedAt: new Date().toISOString(),
    errorMessage:
      error instanceof Error ? error.message : 'Catalyst lookup failed',
  }
}

export async function loadWhyMovedReviewQueue(
  candidates: WhyMovedCandidate[],
): Promise<WhyMovedQueueItem[]> {
  const reviews = await listReviewRecords(
    candidates.map((candidate) => candidate.reviewKey),
  )
  const reviewsByKey = new Map(
    reviews.map((review) => [review.reviewKey, review]),
  )

  return Promise.all(
    candidates.map(async (candidate) => {
      const review = reviewsByKey.get(candidate.reviewKey) ?? null
      let whyMoving: StockWhyMovingResult
      if (review?.snapshotState === 'captured') {
        whyMoving = review.catalystSnapshot
      } else {
        try {
          whyMoving = await getStockWhyMovingData(candidate.symbol)
        } catch (error) {
          whyMoving = catalystLookupError(candidate.symbol, error)
        }
      }
      return {
        ...candidate,
        whyMoving,
        review,
        reviewStatus: review?.status ?? 'pending',
      }
    }),
  )
}

export async function saveWhyMovedReview(
  input: {
    candidate: WhyMovedCandidate
    status: WhyMovedReviewStatus
    notes: string
    reviewerId: string
    /** null means insert-only; a timestamp is a compare-and-swap update. */
    expectedUpdatedAt?: string | null
  },
  options: WhyMovedReviewStorageOptions = {},
): Promise<WhyMovedReviewRecord> {
  const now = new Date().toISOString()
  const notes = input.notes.trim()
  const reviewedAt = input.status === 'pending' ? null : now
  const candidate = validateCandidate(input.candidate)
  const symbol = candidate.symbol
  const reviewKey = candidate.reviewKey
  if (
    input.expectedUpdatedAt !== undefined &&
    input.expectedUpdatedAt !== null &&
    !isValidTimestamp(input.expectedUpdatedAt)
  ) {
    throw new WhyMovedReviewValidationError('expectedUpdatedAt is invalid')
  }

  if (hasDatabaseStorage()) {
    const supabase = createServiceRoleClient()
    const mutablePayload = {
      status: input.status,
      notes,
      reviewer_id: input.reviewerId,
      reviewed_at: reviewedAt,
    }

    if (typeof input.expectedUpdatedAt === 'string') {
      const { data, error } = await supabase
        .from(REVIEW_TABLE)
        .update(mutablePayload)
        .eq('review_key', reviewKey)
        .eq('updated_at', input.expectedUpdatedAt)
        .select('*')
        .maybeSingle()
      if (!error && data) return mapReviewRow(data as ReviewRow)
      if (!error && !data) {
        throw new WhyMovedReviewConflictError(
          'The catalyst review changed before this update was saved',
        )
      }
      if (!isMissingReviewStorageError(error)) {
        throw new Error(
          `Failed to save why-moved review: ${error?.message ?? 'Unknown error'}`,
        )
      }
    } else if (input.expectedUpdatedAt === null) {
      const { data, error } = await supabase
        .from(REVIEW_TABLE)
        .insert({
          review_key: reviewKey,
          symbol,
          market_date: candidate.marketDate,
          session: candidate.session,
          direction: candidate.direction,
          ...mutablePayload,
          candidate_snapshot: candidate as unknown as Json,
          catalyst_snapshot: legacyCatalystSnapshot(symbol, now) as unknown as Json,
          snapshot_state: 'legacy_missing',
          discovery_run_id: 'legacy-direct-write',
          first_seen_at: now,
          last_seen_at: now,
        })
        .select('*')
        .single()
      if (!error && data) return mapReviewRow(data as ReviewRow)
      if (error?.code === '23505') {
        throw new WhyMovedReviewConflictError(
          'The catalyst review already exists',
        )
      }
      if (!isMissingReviewStorageError(error)) {
        throw new Error(
          `Failed to save why-moved review: ${error?.message ?? 'Unknown error'}`,
        )
      }
    } else {
      const { data, error } = await supabase
        .from(REVIEW_TABLE)
        .upsert(
          {
            review_key: reviewKey,
            symbol,
            market_date: candidate.marketDate,
            session: candidate.session,
            direction: candidate.direction,
            ...mutablePayload,
            updated_at: now,
          },
          { onConflict: 'review_key' },
        )
        .select('*')
        .single()
      if (!error && data) return mapReviewRow(data as ReviewRow)
      if (!isMissingReviewStorageError(error)) {
        throw new Error(
          `Failed to save why-moved review: ${error?.message ?? 'Unknown error'}`,
        )
      }
    }
  }

  const storagePath = options.localStoragePath ?? LOCAL_REVIEW_PATH
  const records = readLocalReviews(storagePath)
  const existingIndex = records.findIndex(
    (record) => record.reviewKey === reviewKey,
  )
  const existing = existingIndex >= 0 ? records[existingIndex] : null
  if (
    input.expectedUpdatedAt === null &&
    existing
  ) {
    throw new WhyMovedReviewConflictError('The catalyst review already exists')
  }
  if (
    typeof input.expectedUpdatedAt === 'string' &&
    (!existing || existing.updatedAt !== input.expectedUpdatedAt)
  ) {
    throw new WhyMovedReviewConflictError(
      'The catalyst review changed before this update was saved',
    )
  }

  const mutableChanged =
    !existing ||
    existing.status !== input.status ||
    existing.notes !== notes ||
    existing.reviewerId !== input.reviewerId ||
    existing.reviewedAt !== reviewedAt
  const updatedAt = existing
    ? mutableChanged
      ? nextVersionTimestamp(existing.updatedAt)
      : existing.updatedAt
    : now
  const record: LocalReviewRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    reviewKey,
    symbol,
    marketDate: candidate.marketDate,
    session: candidate.session,
    direction: candidate.direction,
    status: input.status,
    notes,
    reviewerId: input.reviewerId,
    reviewedAt,
    candidateSnapshot:
      existing?.candidateSnapshot ?? candidate,
    catalystSnapshot:
      existing?.catalystSnapshot ?? legacyCatalystSnapshot(symbol, now),
    snapshotState: existing?.snapshotState ?? 'legacy_missing',
    discoveryRunId: existing?.discoveryRunId ?? 'legacy-direct-write',
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: existing?.lastSeenAt ?? now,
    createdAt: existing?.createdAt ?? now,
    updatedAt,
    _bulkReceipts: existing?._bulkReceipts,
  }

  if (existingIndex >= 0) records[existingIndex] = record
  else records.push(record)
  writeLocalReviews(records, storagePath)
  return record
}
