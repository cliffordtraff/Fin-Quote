import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join, resolve } from 'path'
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
  createdAt: string
  updatedAt: string
}

export interface SaveNewsletterChartLibraryInput {
  title?: string
  chartExportSpec: PriceChartExportSpec
}

export interface SaveNewsletterChartLibraryOptions {
  chartBaseUrl?: string
  publicChartBaseUrl?: string
  width?: number
  height?: number
  /** Absolute budget for the render portion, excluding upload/persistence. */
  captureTotalTimeoutMs?: number
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
  created_at: string
  updated_at: string
}

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
  const symbol = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!symbol) {
    throw new Error('Chart export spec is missing a symbol')
  }
  return symbol
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
  return JSON.parse(readFileSync(path, 'utf8')) as NewsletterChartLibraryItem
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
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
): PriceNewsletterChartSpec {
  const chartExportSpec = coerceChartExportSpec(input.chartExportSpec)
  const symbol = normalizeSymbol(chartExportSpec.symbol)
  const title =
    (input.title ? normalizeTitle(input.title) : '') ||
    (typeof chartExportSpec.companyName === 'string' && chartExportSpec.companyName.trim()
      ? chartExportSpec.companyName.trim()
      : `${symbol} chart`)

  return {
    mode: 'price',
    symbol,
    range: normalizeNewsletterPriceRange(chartExportSpec.range),
    interval: normalizeNewsletterPriceInterval(chartExportSpec.interval),
    chartType: normalizeNewsletterPriceChartType(chartExportSpec.chartType),
    title,
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
  // actual network request in addition to releasing the caller below.
  const supabase = getServiceClient(options.signal)
  const fileBuffer = readFileSync(options.outputPath)
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
  let removeAbortListener: () => void = () => undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    if (!options.signal) return
    const onAbort = () =>
      reject(
        options.signal?.reason ?? new Error('Chart upload was cancelled'),
      )
    if (options.signal.aborted) onAbort()
    else {
      options.signal.addEventListener('abort', onAbort, { once: true })
      removeAbortListener = () =>
        options.signal?.removeEventListener('abort', onAbort)
    }
  })
  const { error } = await Promise.race([upload, aborted]).finally(
    removeAbortListener,
  )

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
  const chartSpec = buildPriceChartSpec(input)
  const chartBaseUrl = options.chartBaseUrl ?? getDefaultChartingBaseUrl()
  const publicChartBaseUrl = options.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl()
  const timestamp = new Date().toISOString()
  const id = crypto.randomUUID()

  const filename = `${chartSpec.symbol}_library_${toRunStamp()}_${id.slice(0, 8)}.png`
  // Vercel's application bundle is mounted read-only at /var/task. Signed-in
  // charts are durable Supabase assets, so render them in the runtime's
  // writable temp directory and remove the file after upload. Anonymous local
  // sessions keep the existing repository-backed output behavior.
  const temporaryDirectory = scope.ownerId
    ? mkdtempSync(join(tmpdir(), 'fin-quote-newsletter-chart-'))
    : null
  const outputDirectory = temporaryDirectory ?? resolve(NEWSLETTER_CHART_OUTPUT_DIR)
  mkdirSync(outputDirectory, { recursive: true })
  const outputPath = resolve(outputDirectory, filename)

  try {
    await captureChart(chartSpec, {
      outputPath,
      chartBaseUrl,
      width: options.width,
      height: options.height,
      totalTimeoutMs: options.captureTotalTimeoutMs,
      signal: options.signal,
    })
    options.signal?.throwIfAborted()

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
      }

      let insert = supabase
        .from(NEWSLETTER_CHART_LIBRARY_TABLE)
        .insert(payload)
        .select('*')
      if (options.signal) insert = insert.abortSignal(options.signal)
      const { data, error } = await insert.single()

      if (error) {
        throw new Error(`Failed to save newsletter chart library item: ${error.message}`)
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
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    writeLibraryItem(item)
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
): Promise<NewsletterChartLibraryItem> {
  const title = normalizeTitle(input.title)

  if (scope.ownerId) {
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from(NEWSLETTER_CHART_LIBRARY_TABLE)
      .update({ title })
      .eq('id', id)
      .eq('owner_id', scope.ownerId)
      .select('*')
      .single()

    if (error || !data) {
      if (error?.code === 'PGRST116') {
        throw new Error(`Newsletter chart library item not found: ${id}`)
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
    throw new Error(`Newsletter chart library item not found: ${id}`)
  }

  const current = readLibraryItem(path)
  if (current.sessionId !== scope.sessionId) {
    throw new Error(`Newsletter chart library item not found: ${id}`)
  }

  const updated: NewsletterChartLibraryItem = {
    ...current,
    title,
    chartSpec: {
      ...current.chartSpec,
      title,
    },
    updatedAt: new Date().toISOString(),
  }
  writeLibraryItem(updated)
  return updated
}

export async function deleteNewsletterChartLibraryItem(
  scope: NewsletterDraftScope,
  id: string,
): Promise<void> {
  if (scope.ownerId) {
    const supabase = getServiceClient()
    // Content-addressed images may be shared by other library records, active
    // drafts, and already-sent email. Deleting a library row must never delete
    // the immutable blob; storage cleanup requires a separate reference-aware
    // retention job.
    const { data, error: deleteError } = await supabase
      .from(NEWSLETTER_CHART_LIBRARY_TABLE)
      .delete()
      .eq('id', id)
      .eq('owner_id', scope.ownerId)
      .select('id')
      .maybeSingle()

    if (deleteError) {
      throw new Error(`Failed to delete newsletter chart library item: ${deleteError.message}`)
    }
    if (!data) {
      throw new Error(`Newsletter chart library item not found: ${id}`)
    }
    return
  }

  const path = getLibraryItemPath(scope, id)
  if (!existsSync(path)) {
    throw new Error(`Newsletter chart library item not found: ${id}`)
  }

  const item = readLibraryItem(path)
  if (item.sessionId !== scope.sessionId) {
    throw new Error(`Newsletter chart library item not found: ${id}`)
  }

  rmSync(path, { force: true })
  if (item.chartImageUrl && item.chartImageUrl.startsWith('/newsletter-charts/')) {
    rmSync(resolve(NEWSLETTER_CHART_OUTPUT_DIR, basename(item.chartImageUrl)), {
      force: true,
    })
  }
}
