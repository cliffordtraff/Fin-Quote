import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { captureChart } from './capture'
import {
  getDefaultChartingBaseUrl,
  getDefaultPublicChartingBaseUrl,
  resolveChartingPlatformNewsletterChart,
} from './charting-platform-export'
import {
  normalizeNewsletterPriceChartType,
  normalizeNewsletterPriceInterval,
  normalizeNewsletterPriceRange,
} from './chart-spec'
import type {
  NewsletterDraftScope,
} from './drafts'
import type {
  PriceChartExportSpec,
  PriceNewsletterChartSpec,
} from './types'
import {
  describeImmutableNewsletterImage,
  isImmutableAssetAlreadyStored,
} from './immutable-assets'
import {
  hashNewsletterChartScene,
  materializeNewsletterChartScene,
  NEWSLETTER_CHART_RENDERER_CONTRACT,
} from './chart-provenance'
import {
  normalizeNewsletterCaptureSymbol,
  resolveNewsletterCaptureOutputPath,
} from './capture-output-path'
import {
  NewsletterChartLibraryNotFoundError,
  NewsletterChartLibraryRequestConflictError,
} from './chart-library-errors'

export {
  NewsletterChartLibraryNotFoundError,
  NewsletterChartLibraryRequestConflictError,
} from './chart-library-errors'

const NEWSLETTER_CHART_LIBRARY_DIR = './.newsletter-chart-library'
const NEWSLETTER_CHART_OUTPUT_DIR = './.newsletter-output'
const NEWSLETTER_CHART_LIBRARY_TABLE = 'newsletter_chart_library'
const NEWSLETTER_CHART_STORAGE_BUCKET = 'newsletter-charts'

export interface NewsletterChartLibraryItem {
  id: string
  ownerId: string | null
  sessionId: string
  title: string
  symbol: string
  chartSpec: PriceNewsletterChartSpec
  chartImageUrl: string
  thumbnailUrl: string
  chartExportUrl: string
  capturedAt: string
  rendererContract: string
  sceneHash: string
  imageSha256: string | null
  createdAt: string
  updatedAt: string
}

export interface NewsletterChartLibrarySummary {
  id: string
  title: string
  symbol: string
  range: string | null
  interval: string | null
  chartType: string | null
  chartImageUrl: string
  thumbnailUrl: string
  chartExportUrl: string
  createdAt: string
  updatedAt: string
}

export interface NewsletterChartLibraryPage {
  charts: NewsletterChartLibrarySummary[]
  nextCursor: string | null
  /** Exact filtered total on the first page; omitted on continuation pages. */
  total: number | null
}

export interface NewsletterChartLibraryPageOptions {
  cursor?: string | null
  limit?: number
  query?: string
  symbol?: string
}

export class NewsletterChartLibraryPageInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NewsletterChartLibraryPageInputError'
  }
}

export interface SaveNewsletterChartLibraryInput {
  title?: string
  chartExportSpec: PriceChartExportSpec
}

export interface NormalizedNewsletterChartLibrarySaveInput {
  title: string
  chartExportSpec: PriceChartExportSpec
}

export interface SaveNewsletterChartLibraryOptions {
  chartBaseUrl?: string
  publicChartBaseUrl?: string
  width?: number
  height?: number
  /** Absolute budget for the render portion, excluding upload/persistence. */
  captureTotalTimeoutMs?: number
  /** Durable POST identity; only authenticated route saves may supply it. */
  durableRequest?: {
    chartId: string
    requestKeyHash: string
    fingerprint: string
  }
  signal?: AbortSignal
}

export interface UpdateNewsletterChartLibraryInput {
  title: string
}

interface NewsletterChartLibraryRow {
  id: string
  owner_id: string | null
  session_id: string
  title: string
  symbol: string
  chart_spec: PriceNewsletterChartSpec
  image_path: string
  image_url: string
  thumbnail_path: string | null
  thumbnail_url: string | null
  chart_export_url: string
  captured_at?: string | null
  renderer_contract?: string | null
  scene_hash?: string | null
  image_sha256?: string | null
  post_request_key_hash?: string | null
  post_request_fingerprint?: string | null
  created_at: string
  updated_at: string
}

interface NewsletterChartLibrarySummaryRow {
  id: string
  title: string
  symbol: string
  range?: string | null
  interval?: string | null
  chart_type?: string | null
  image_url: string
  thumbnail_url: string | null
  chart_export_url: string
  created_at: string
  updated_at: string
}

interface NewsletterChartLibraryCursor {
  /** Kept verbatim so PostgreSQL microsecond precision is not truncated. */
  updatedAt: string
  id: string
}

const NEWSLETTER_CHART_LIBRARY_PAGE_DEFAULT = 18
const NEWSLETTER_CHART_LIBRARY_PAGE_MAX = 48
const NEWSLETTER_CHART_LIBRARY_SUMMARY_SELECT = [
  'id',
  'title',
  'symbol',
  'range:chart_spec->>range',
  'interval:chart_spec->>interval',
  'chart_type:chart_spec->>chartType',
  'image_url',
  'thumbnail_url',
  'chart_export_url',
  'created_at',
  'updated_at',
].join(',')

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/

function getServiceClient(signal?: AbortSignal) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase service role configuration for newsletter chart library')
  }

  if (!signal) {
    return createSupabaseClient(url, key)
  }

  const abortableFetch: typeof fetch = (input, init) => {
    const requestSignal = init?.signal
    const combinedSignal = requestSignal && requestSignal !== signal
      ? AbortSignal.any([requestSignal, signal])
      : signal
    return globalThis.fetch(input, {
      ...init,
      signal: combinedSignal,
    })
  }

  return createSupabaseClient(url, key, {
    global: { fetch: abortableFetch },
  })
}

function sanitizeStorageKey(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Chart library storage key is required')
  }
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function normalizeSymbol(value: unknown): string {
  return normalizeNewsletterCaptureSymbol(value)
}

function normalizeTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : ''
  if (!title) {
    throw new Error('Chart title is required')
  }
  if (title.length > 120) {
    throw new Error('Chart title must be 120 characters or fewer')
  }
  return title
}

function toRunStamp(date = new Date()): string {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
}

function getLibrarySessionDir(scope: NewsletterDraftScope): string {
  return resolve(NEWSLETTER_CHART_LIBRARY_DIR, sanitizeStorageKey(scope.sessionId))
}

function getLibraryItemPath(scope: NewsletterDraftScope, id: string): string {
  return resolve(getLibrarySessionDir(scope), `${sanitizeStorageKey(id)}.json`)
}

function writeLibraryItem(item: NewsletterChartLibraryItem) {
  const sessionDir = getLibrarySessionDir({
    ownerId: item.ownerId,
    sessionId: item.sessionId,
  })
  mkdirSync(sessionDir, { recursive: true })
  const path = resolve(sessionDir, `${sanitizeStorageKey(item.id)}.json`)
  const tempPath = `${path}.${crypto.randomUUID()}.tmp`
  writeFileSync(tempPath, JSON.stringify(item, null, 2))
  renameSync(tempPath, path)
}

function readLibraryItem(path: string): NewsletterChartLibraryItem {
  const item = JSON.parse(readFileSync(path, 'utf8')) as NewsletterChartLibraryItem
  return {
    ...item,
    capturedAt: item.capturedAt ?? item.createdAt,
    rendererContract: item.rendererContract ?? 'legacy-reconstructed-v0',
    sceneHash: item.sceneHash ?? hashNewsletterChartScene(item.chartSpec),
    imageSha256: item.imageSha256 ?? null,
  }
}

function mapLibraryRow(row: NewsletterChartLibraryRow): NewsletterChartLibraryItem {
  return {
    id: row.id,
    ownerId: row.owner_id,
    sessionId: row.session_id,
    title: row.title,
    symbol: row.symbol,
    chartSpec: row.chart_spec,
    chartImageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url || row.image_url,
    chartExportUrl: row.chart_export_url,
    capturedAt: row.captured_at ?? row.created_at,
    rendererContract: row.renderer_contract ?? 'legacy-reconstructed-v0',
    sceneHash: row.scene_hash ?? hashNewsletterChartScene(row.chart_spec),
    imageSha256: row.image_sha256 ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

type DurableChartSaveIdentity = NonNullable<
  SaveNewsletterChartLibraryOptions['durableRequest']
>

function normalizeDurableChartSaveIdentity(
  scope: NewsletterDraftScope,
  identity: DurableChartSaveIdentity | undefined,
): DurableChartSaveIdentity | null {
  if (!identity) return null
  if (
    !scope.ownerId ||
    !UUID_PATTERN.test(identity.chartId) ||
    !SHA256_PATTERN.test(identity.requestKeyHash) ||
    !SHA256_PATTERN.test(identity.fingerprint)
  ) {
    throw new Error('Durable newsletter chart request identity is invalid')
  }
  return {
    chartId: identity.chartId.toLowerCase(),
    requestKeyHash: identity.requestKeyHash,
    fingerprint: identity.fingerprint,
  }
}

async function findDurableChartSave(
  ownerId: string,
  identity: DurableChartSaveIdentity,
  signal?: AbortSignal,
): Promise<NewsletterChartLibraryItem | null> {
  signal?.throwIfAborted()
  const supabase = getServiceClient(signal)
  let query = supabase
    .from(NEWSLETTER_CHART_LIBRARY_TABLE)
    .select('*')
    .eq('owner_id', ownerId)
    .eq('post_request_key_hash', identity.requestKeyHash)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  signal?.throwIfAborted()

  if (error) {
    throw new Error(
      `Failed to recover durable newsletter chart save: ${error.message}`,
    )
  }
  if (!data) return null

  const row = data as NewsletterChartLibraryRow
  if (
    row.id.toLowerCase() !== identity.chartId ||
    row.post_request_key_hash !== identity.requestKeyHash ||
    row.post_request_fingerprint !== identity.fingerprint
  ) {
    throw new NewsletterChartLibraryRequestConflictError()
  }
  return mapLibraryRow(row)
}

function mapLibrarySummaryRow(
  row: NewsletterChartLibrarySummaryRow,
): NewsletterChartLibrarySummary {
  return {
    id: row.id,
    title: row.title,
    symbol: row.symbol,
    range: row.range ?? null,
    interval: row.interval ?? null,
    chartType: row.chart_type ?? null,
    chartImageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url || row.image_url,
    chartExportUrl: row.chart_export_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function summarizeLibraryItem(
  item: NewsletterChartLibraryItem,
): NewsletterChartLibrarySummary {
  return {
    id: item.id,
    title: item.title,
    symbol: item.symbol,
    range: item.chartSpec.range ?? null,
    interval: item.chartSpec.interval ?? null,
    chartType: item.chartSpec.chartType ?? null,
    chartImageUrl: item.chartImageUrl,
    thumbnailUrl: item.thumbnailUrl || item.chartImageUrl,
    chartExportUrl: item.chartExportUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function encodeLibraryCursor(
  item: Pick<NewsletterChartLibrarySummary, 'updatedAt' | 'id'>,
): string {
  return Buffer.from(
    JSON.stringify({ updatedAt: item.updatedAt, id: item.id }),
    'utf8',
  ).toString('base64url')
}

function decodeLibraryCursor(value: string): NewsletterChartLibraryCursor {
  try {
    if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error('invalid cursor encoding')
    }
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<NewsletterChartLibraryCursor>
    if (
      typeof parsed.updatedAt !== 'string' ||
      !TIMESTAMP_PATTERN.test(parsed.updatedAt) ||
      !Number.isFinite(Date.parse(parsed.updatedAt)) ||
      typeof parsed.id !== 'string' ||
      !UUID_PATTERN.test(parsed.id)
    ) {
      throw new Error('invalid cursor fields')
    }
    return {
      // Do not round-trip through Date: that would silently truncate the six
      // fractional digits PostgreSQL uses to three JavaScript milliseconds.
      updatedAt: parsed.updatedAt,
      id: parsed.id,
    }
  } catch {
    throw new NewsletterChartLibraryPageInputError(
      'Chart library cursor is invalid',
    )
  }
}

function normalizeLibraryPageOptions(
  options: NewsletterChartLibraryPageOptions,
): {
  cursor: NewsletterChartLibraryCursor | null
  limit: number
  query: string
  symbol: string
} {
  const requestedLimit = Number(options.limit ?? NEWSLETTER_CHART_LIBRARY_PAGE_DEFAULT)
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new NewsletterChartLibraryPageInputError(
      'Chart library page limit must be a positive integer',
    )
  }

  const rawQuery = typeof options.query === 'string' ? options.query.trim() : ''
  if (rawQuery.length > 80) {
    throw new NewsletterChartLibraryPageInputError(
      'Chart library search must be 80 characters or fewer',
    )
  }
  // PostgREST's `or` expression is a small query language. Reject its control
  // characters rather than interpolating them into a server-side filter.
  if (/[(),%_\\]/.test(rawQuery)) {
    throw new NewsletterChartLibraryPageInputError(
      'Chart library search contains unsupported characters',
    )
  }

  const rawSymbol = typeof options.symbol === 'string'
    ? options.symbol.trim().toUpperCase()
    : ''
  if (rawSymbol && !/^[A-Z0-9.-]{1,15}$/.test(rawSymbol)) {
    throw new NewsletterChartLibraryPageInputError(
      'Chart library symbol filter is invalid',
    )
  }

  return {
    cursor: options.cursor ? decodeLibraryCursor(options.cursor) : null,
    limit: Math.min(requestedLimit, NEWSLETTER_CHART_LIBRARY_PAGE_MAX),
    query: rawQuery,
    symbol: rawSymbol,
  }
}

function compareLibrarySummaries(
  left: NewsletterChartLibrarySummary,
  right: NewsletterChartLibrarySummary,
): number {
  const updatedOrder = right.updatedAt.localeCompare(left.updatedAt)
  if (updatedOrder !== 0) return updatedOrder
  return right.id.localeCompare(left.id)
}

function isAfterLibraryCursor(
  item: NewsletterChartLibrarySummary,
  cursor: NewsletterChartLibraryCursor,
): boolean {
  return item.updatedAt < cursor.updatedAt ||
    (item.updatedAt === cursor.updatedAt && item.id < cursor.id)
}

function coerceChartExportSpec(value: PriceChartExportSpec): PriceChartExportSpec {
  const symbol = normalizeSymbol(value.symbol)
  const range = normalizeNewsletterPriceRange(value.range)
  const interval = normalizeNewsletterPriceInterval(value.interval)
  const chartType = normalizeNewsletterPriceChartType(value.chartType)

  return {
    ...JSON.parse(JSON.stringify(value)),
    symbol,
    range,
    interval,
    chartType,
    theme: value.theme === 'dark' ? 'dark' : 'light',
    renderProfile: typeof value.renderProfile === 'string'
      ? value.renderProfile
      : 'newsletter',
    width: Number.isFinite(Number(value.width)) ? Number(value.width) : 1860,
    height: Number.isFinite(Number(value.height)) ? Number(value.height) : 1320,
  }
}

function buildPriceChartSpec(
  input: SaveNewsletterChartLibraryInput,
  capturedAt: string,
): PriceNewsletterChartSpec {
  const normalizedInput = normalizeNewsletterChartLibrarySaveInput(input)
  const chartExportSpec = normalizedInput.chartExportSpec
  const symbol = normalizeSymbol(chartExportSpec.symbol)

  const lightweightSpec: PriceNewsletterChartSpec = {
    mode: 'price',
    symbol,
    range: normalizeNewsletterPriceRange(chartExportSpec.range),
    interval: normalizeNewsletterPriceInterval(chartExportSpec.interval),
    chartType: normalizeNewsletterPriceChartType(chartExportSpec.chartType),
    title: normalizedInput.title,
    chartExportSpec,
  }
  return materializeNewsletterChartScene(
    lightweightSpec,
    capturedAt,
  ) as PriceNewsletterChartSpec
}

/**
 * Canonicalize the logical save request before admission/idempotency checks.
 * The save path calls the same helper, so semantically equivalent requests
 * get one fingerprint and title validation cannot drift from persistence.
 */
export function normalizeNewsletterChartLibrarySaveInput(
  input: SaveNewsletterChartLibraryInput,
): NormalizedNewsletterChartLibrarySaveInput {
  const chartExportSpec = coerceChartExportSpec(input.chartExportSpec)
  const symbol = normalizeSymbol(chartExportSpec.symbol)
  const fallbackTitle =
    typeof chartExportSpec.companyName === 'string' &&
    chartExportSpec.companyName.trim()
      ? chartExportSpec.companyName
      : `${symbol} chart`

  return {
    title: normalizeTitle(
      input.title === undefined ? fallbackTitle : input.title,
    ),
    chartExportSpec,
  }
}

export async function listNewsletterChartLibraryItems(
  scope: NewsletterDraftScope,
  signal?: AbortSignal,
): Promise<NewsletterChartLibraryItem[]> {
  signal?.throwIfAborted()
  if (scope.ownerId) {
    const supabase = getServiceClient()
    let query = supabase
      .from(NEWSLETTER_CHART_LIBRARY_TABLE)
      .select('*')
      .eq('owner_id', scope.ownerId)
      .order('updated_at', { ascending: false })
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
    signal?.throwIfAborted()

    if (error) {
      throw new Error(`Failed to list newsletter chart library: ${error.message}`)
    }

    return (data as NewsletterChartLibraryRow[]).map(mapLibraryRow)
  }

  const sessionDir = getLibrarySessionDir(scope)
  if (!existsSync(sessionDir)) return []

  const items = readdirSync(sessionDir)
    .filter((entry) => entry.endsWith('.json'))
    .flatMap((entry) => {
      try {
        return [readLibraryItem(resolve(sessionDir, entry))]
      } catch (error) {
        console.error(
          `[newsletter-chart-library] Skipping unreadable item ${entry}:`,
          error,
        )
        return []
      }
    })
    .filter((item) => item.sessionId === scope.sessionId)

  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return items
}

/**
 * Lightweight, keyset-paginated cards for interactive library screens.
 *
 * The legacy `listNewsletterChartLibraryItems` above deliberately remains a
 * complete, full-spec list because daily automation uses it to build its
 * symbol map. UI callers should use this summary path and fetch one full item
 * only after a user selects it.
 */
export async function listNewsletterChartLibrarySummaries(
  scope: NewsletterDraftScope,
  options: NewsletterChartLibraryPageOptions = {},
  signal?: AbortSignal,
): Promise<NewsletterChartLibraryPage> {
  signal?.throwIfAborted()
  const normalized = normalizeLibraryPageOptions(options)

  if (scope.ownerId) {
    const supabase = getServiceClient()
    let query = supabase
      .from(NEWSLETTER_CHART_LIBRARY_TABLE)
      .select(
        NEWSLETTER_CHART_LIBRARY_SUMMARY_SELECT,
        normalized.cursor ? undefined : { count: 'exact' },
      )
      .eq('owner_id', scope.ownerId)

    if (normalized.symbol) {
      query = query.eq('symbol', normalized.symbol)
    }
    if (normalized.query) {
      query = query.or(
        `title.ilike.%${normalized.query}%,symbol.ilike.%${normalized.query}%`,
      )
    }
    if (normalized.cursor) {
      const { updatedAt, id } = normalized.cursor
      query = query.or(
        `updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${id})`,
      )
    }

    query = query
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .range(0, normalized.limit)
    if (signal) query = query.abortSignal(signal)

    const { data, error, count } = await query
    signal?.throwIfAborted()
    if (error) {
      throw new Error(`Failed to list newsletter chart library: ${error.message}`)
    }

    const fetched = (data as unknown as NewsletterChartLibrarySummaryRow[])
      .map(mapLibrarySummaryRow)
    const hasMore = fetched.length > normalized.limit
    const charts = hasMore ? fetched.slice(0, normalized.limit) : fetched
    return {
      charts,
      nextCursor: hasMore && charts.length > 0
        ? encodeLibraryCursor(charts[charts.length - 1])
        : null,
      total: normalized.cursor ? null : count ?? charts.length,
    }
  }

  // Anonymous mode is a local-development fallback backed by one JSON file
  // per chart. It still exposes the exact same deterministic page contract;
  // signed-in production traffic uses the bounded projection above.
  const normalizedQuery = normalized.query.toLowerCase()
  const filtered = (await listNewsletterChartLibraryItems(scope, signal))
    .map(summarizeLibraryItem)
    .filter((item) => {
      if (normalized.symbol && item.symbol.toUpperCase() !== normalized.symbol) {
        return false
      }
      return !normalizedQuery ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.symbol.toLowerCase().includes(normalizedQuery)
    })
    .sort(compareLibrarySummaries)
  const afterCursor = normalized.cursor
    ? filtered.filter((item) => isAfterLibraryCursor(item, normalized.cursor!))
    : filtered
  const fetched = afterCursor.slice(0, normalized.limit + 1)
  const hasMore = fetched.length > normalized.limit
  const charts = hasMore ? fetched.slice(0, normalized.limit) : fetched
  return {
    charts,
    nextCursor: hasMore && charts.length > 0
      ? encodeLibraryCursor(charts[charts.length - 1])
      : null,
    total: normalized.cursor ? null : filtered.length,
  }
}

export async function getNewsletterChartLibraryItem(
  scope: NewsletterDraftScope,
  id: string,
  signal?: AbortSignal,
): Promise<NewsletterChartLibraryItem | null> {
  signal?.throwIfAborted()
  const normalizedId = id.trim()
  if (!normalizedId) return null

  if (scope.ownerId) {
    const supabase = getServiceClient()
    let query = supabase
      .from(NEWSLETTER_CHART_LIBRARY_TABLE)
      .select('*')
      .eq('id', normalizedId)
      .eq('owner_id', scope.ownerId)
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query.maybeSingle()
    signal?.throwIfAborted()

    if (error) {
      throw new Error(`Failed to fetch newsletter chart library item: ${error.message}`)
    }
    return data ? mapLibraryRow(data as NewsletterChartLibraryRow) : null
  }

  const path = getLibraryItemPath(scope, normalizedId)
  if (!existsSync(path)) return null
  const item = readLibraryItem(path)
  signal?.throwIfAborted()
  return item.sessionId === scope.sessionId ? item : null
}

export async function uploadNewsletterChartImage(options: {
  ownerId: string
  chartId: string
  symbol: string
  outputPath: string
  signal?: AbortSignal
}): Promise<{ imagePath: string; imageUrl: string }> {
  options.signal?.throwIfAborted()
  // StorageFileApi.upload does not expose a signal parameter. Build this
  // operation's client with a fetch wrapper so cancellation reaches the
  // actual network request.
  const supabase = getServiceClient(options.signal)
  options.signal?.throwIfAborted()
  const fileBuffer = readFileSync(options.outputPath)
  options.signal?.throwIfAborted()
  const asset = describeImmutableNewsletterImage(fileBuffer)
  const imagePath = asset.storagePath

  const upload = supabase.storage
    .from(NEWSLETTER_CHART_STORAGE_BUCKET)
    .upload(imagePath, fileBuffer, {
      contentType: asset.contentType,
      cacheControl: asset.cacheControl,
      upsert: false,
      metadata: {
        sha256: asset.digest,
        width: asset.width,
        height: asset.height,
      },
    })
  // Await the actual transport promise. The abort-aware fetch above cancels
  // I/O, while callers can independently stop waiting at the route boundary.
  // This keeps admission slots occupied until the physical upload settles.
  const { error } = await upload
  options.signal?.throwIfAborted()

  if (error && !isImmutableAssetAlreadyStored(error)) {
    throw new Error(`Failed to upload newsletter chart image: ${error.message}`)
  }

  const { data } = supabase.storage
    .from(NEWSLETTER_CHART_STORAGE_BUCKET)
    .getPublicUrl(imagePath)

  return {
    imagePath,
    imageUrl: data.publicUrl,
  }
}

export async function saveNewsletterChartLibraryItem(
  scope: NewsletterDraftScope,
  input: SaveNewsletterChartLibraryInput,
  options: SaveNewsletterChartLibraryOptions = {},
): Promise<NewsletterChartLibraryItem> {
  options.signal?.throwIfAborted()
  const durableRequest = normalizeDurableChartSaveIdentity(
    scope,
    options.durableRequest,
  )
  if (scope.ownerId && durableRequest) {
    const existing = await findDurableChartSave(
      scope.ownerId,
      durableRequest,
      options.signal,
    )
    if (existing) return existing
  }
  const timestamp = new Date().toISOString()
  const chartSpec = buildPriceChartSpec(input, timestamp)
  const chartBaseUrl = options.chartBaseUrl ?? getDefaultChartingBaseUrl()
  const publicChartBaseUrl = options.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl()
  const id = durableRequest?.chartId ?? crypto.randomUUID()

  const filename = `${chartSpec.symbol}_library_${toRunStamp()}_${id.slice(0, 8)}.png`
  // Vercel's application bundle is mounted read-only at /var/task. Signed-in
  // charts are durable Supabase assets, so render them in the runtime's
  // writable temp directory and remove the file after upload. Anonymous local
  // sessions keep the existing repository-backed output behavior.
  const temporaryDirectory = scope.ownerId
    ? mkdtempSync(join(tmpdir(), 'fin-quote-newsletter-chart-'))
    : null
  const outputDirectory = temporaryDirectory ?? resolve(NEWSLETTER_CHART_OUTPUT_DIR)

  try {
    options.signal?.throwIfAborted()
    mkdirSync(outputDirectory, { recursive: true })
    const outputPath = resolveNewsletterCaptureOutputPath(
      outputDirectory,
      filename,
    )
    options.signal?.throwIfAborted()
    await captureChart(chartSpec, {
      outputPath,
      chartBaseUrl,
      width: options.width,
      height: options.height,
      totalTimeoutMs: options.captureTotalTimeoutMs,
      signal: options.signal,
    })
    options.signal?.throwIfAborted()
    const imageSha256 = describeImmutableNewsletterImage(
      readFileSync(outputPath),
    ).digest
    options.signal?.throwIfAborted()
    const sceneHash = hashNewsletterChartScene(chartSpec)

    const chartImageUrl = `/newsletter-charts/${filename}`
    const chartExportUrl = resolveChartingPlatformNewsletterChart(chartSpec, {
      chartBaseUrl: publicChartBaseUrl,
      theme: 'light',
    }).interactiveUrl

    if (scope.ownerId) {
      options.signal?.throwIfAborted()
      const { imagePath, imageUrl } = await uploadNewsletterChartImage({
        ownerId: scope.ownerId,
        chartId: id,
        symbol: chartSpec.symbol,
        outputPath,
        signal: options.signal,
      })
      options.signal?.throwIfAborted()
      const supabase = getServiceClient()
      const payload = {
        id,
        owner_id: scope.ownerId,
        session_id: scope.sessionId,
        title: chartSpec.title ?? `${chartSpec.symbol} chart`,
        symbol: chartSpec.symbol,
        chart_spec: chartSpec,
        image_path: imagePath,
        image_url: imageUrl,
        thumbnail_path: imagePath,
        thumbnail_url: imageUrl,
        chart_export_url: chartExportUrl,
        captured_at: timestamp,
        renderer_contract: NEWSLETTER_CHART_RENDERER_CONTRACT,
        scene_hash: sceneHash,
        image_sha256: imageSha256,
        post_request_key_hash: durableRequest?.requestKeyHash ?? null,
        post_request_fingerprint: durableRequest?.fingerprint ?? null,
      }

      let insert = supabase
        .from(NEWSLETTER_CHART_LIBRARY_TABLE)
        .insert(payload)
        .select('*')
      if (options.signal) insert = insert.abortSignal(options.signal)
      const { data, error } = await insert.single()
      options.signal?.throwIfAborted()

      if (error) {
        if (durableRequest && error.code === '23505') {
          const existing = await findDurableChartSave(
            scope.ownerId,
            durableRequest,
            options.signal,
          )
          if (existing) return existing
        }
        throw new Error(`Failed to save newsletter chart library item: ${error.message}`)
      }
      if (!data) {
        throw new Error('Failed to save newsletter chart library item: empty response')
      }

      return mapLibraryRow(data as NewsletterChartLibraryRow)
    }

    const item: NewsletterChartLibraryItem = {
      id,
      ownerId: scope.ownerId,
      sessionId: scope.sessionId,
      title: chartSpec.title ?? `${chartSpec.symbol} chart`,
      symbol: chartSpec.symbol,
      chartSpec,
      chartImageUrl,
      thumbnailUrl: chartImageUrl,
      chartExportUrl,
      capturedAt: timestamp,
      rendererContract: NEWSLETTER_CHART_RENDERER_CONTRACT,
      sceneHash,
      imageSha256,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    options.signal?.throwIfAborted()
    writeLibraryItem(item)
    options.signal?.throwIfAborted()
    return item
  } finally {
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true })
    }
  }
}

export async function updateNewsletterChartLibraryItem(
  scope: NewsletterDraftScope,
  id: string,
  input: UpdateNewsletterChartLibraryInput,
  signal?: AbortSignal,
): Promise<NewsletterChartLibraryItem> {
  signal?.throwIfAborted()
  const title = normalizeTitle(input.title)

  if (scope.ownerId) {
    const supabase = getServiceClient()
    let query = supabase
      .from(NEWSLETTER_CHART_LIBRARY_TABLE)
      .update({ title })
      .eq('id', id)
      .eq('owner_id', scope.ownerId)
      .select('*')
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
      .single()
    signal?.throwIfAborted()

    if (error || !data) {
      if (error?.code === 'PGRST116') {
        throw new NewsletterChartLibraryNotFoundError(id)
      }
      throw new Error(
        `Failed to update newsletter chart library item: ${
          error?.message ?? 'Unknown error'
        }`,
      )
    }

    return mapLibraryRow(data as NewsletterChartLibraryRow)
  }

  const path = getLibraryItemPath(scope, id)
  if (!existsSync(path)) {
    throw new NewsletterChartLibraryNotFoundError(id)
  }

  const current = readLibraryItem(path)
  signal?.throwIfAborted()
  if (current.sessionId !== scope.sessionId) {
    throw new NewsletterChartLibraryNotFoundError(id)
  }

  const updated: NewsletterChartLibraryItem = {
    ...current,
    title,
    updatedAt: new Date().toISOString(),
  }
  writeLibraryItem(updated)
  signal?.throwIfAborted()
  return updated
}

export async function deleteNewsletterChartLibraryItem(
  scope: NewsletterDraftScope,
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  if (scope.ownerId) {
    const supabase = getServiceClient()
    // Content-addressed images may be shared by other library records, active
    // drafts, and already-sent email. Deleting a library row must never delete
    // the immutable blob; storage cleanup requires a separate reference-aware
    // retention job.
    let query = supabase
      .from(NEWSLETTER_CHART_LIBRARY_TABLE)
      .delete()
      .eq('id', id)
      .eq('owner_id', scope.ownerId)
      .select('id')
    if (signal) query = query.abortSignal(signal)
    const { data, error: deleteError } = await query
      .maybeSingle()
    signal?.throwIfAborted()

    if (deleteError) {
      throw new Error(`Failed to delete newsletter chart library item: ${deleteError.message}`)
    }
    if (!data) {
      throw new NewsletterChartLibraryNotFoundError(id)
    }
    return
  }

  const path = getLibraryItemPath(scope, id)
  if (!existsSync(path)) {
    throw new NewsletterChartLibraryNotFoundError(id)
  }

  const item = readLibraryItem(path)
  signal?.throwIfAborted()
  if (item.sessionId !== scope.sessionId) {
    throw new NewsletterChartLibraryNotFoundError(id)
  }

  rmSync(path, { force: true })
  signal?.throwIfAborted()
  // Match production: a draft or already-delivered issue may still reference
  // the image after the library row is removed. Asset cleanup must be a
  // separate reference-aware retention job.
}

export const __testOnly = {
  decodeLibraryCursor,
  encodeLibraryCursor,
  summarySelect: NEWSLETTER_CHART_LIBRARY_SUMMARY_SELECT,
  pageDefault: NEWSLETTER_CHART_LIBRARY_PAGE_DEFAULT,
  pageMax: NEWSLETTER_CHART_LIBRARY_PAGE_MAX,
}
