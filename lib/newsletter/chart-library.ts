import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { basename, resolve } from 'path'
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

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase service role configuration for newsletter chart library')
  }

  return createSupabaseClient(url, key)
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
): Promise<NewsletterChartLibraryItem[]> {
  if (scope.ownerId) {
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from(NEWSLETTER_CHART_LIBRARY_TABLE)
      .select('*')
      .eq('owner_id', scope.ownerId)
      .order('updated_at', { ascending: false })

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

async function uploadNewsletterChartImage(options: {
  ownerId: string
  chartId: string
  symbol: string
  outputPath: string
}): Promise<{ imagePath: string; imageUrl: string }> {
  const supabase = getServiceClient()
  const safeSymbol = options.symbol.replace(/[^A-Z0-9._-]/g, '_')
  const imagePath = `owners/${options.ownerId}/${options.chartId}/${safeSymbol}.png`
  const fileBuffer = readFileSync(options.outputPath)

  const { error } = await supabase.storage
    .from(NEWSLETTER_CHART_STORAGE_BUCKET)
    .upload(imagePath, fileBuffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (error) {
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

  mkdirSync(resolve(NEWSLETTER_CHART_OUTPUT_DIR), { recursive: true })
  const filename = `${chartSpec.symbol}_library_${toRunStamp()}_${id.slice(0, 8)}.png`
  const outputPath = resolve(NEWSLETTER_CHART_OUTPUT_DIR, filename)

  await captureChart(chartSpec, {
    outputPath,
    chartBaseUrl,
    width: options.width,
    height: options.height,
  })

  const chartImageUrl = `/newsletter-charts/${filename}`
  const chartExportUrl = resolveChartingPlatformNewsletterChart(chartSpec, {
    chartBaseUrl: publicChartBaseUrl,
    theme: 'light',
  }).interactiveUrl

  if (scope.ownerId) {
    const { imagePath, imageUrl } = await uploadNewsletterChartImage({
      ownerId: scope.ownerId,
      chartId: id,
      symbol: chartSpec.symbol,
      outputPath,
    })
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

    const { data, error } = await supabase
      .from(NEWSLETTER_CHART_LIBRARY_TABLE)
      .insert(payload)
      .select('*')
      .single()

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
    const { data, error: fetchError } = await supabase
      .from(NEWSLETTER_CHART_LIBRARY_TABLE)
      .select('id,image_path,thumbnail_path')
      .eq('id', id)
      .eq('owner_id', scope.ownerId)
      .single()

    if (fetchError || !data) {
      if (fetchError?.code === 'PGRST116') {
        throw new Error(`Newsletter chart library item not found: ${id}`)
      }
      throw new Error(
        `Failed to find newsletter chart library item: ${
          fetchError?.message ?? 'Unknown error'
        }`,
      )
    }

    const row = data as Pick<NewsletterChartLibraryRow, 'id' | 'image_path' | 'thumbnail_path'>
    const paths = [row.image_path, row.thumbnail_path]
      .filter((value): value is string => Boolean(value))
      .filter((value, index, values) => values.indexOf(value) === index)

    if (paths.length > 0) {
      const { error: removeError } = await supabase.storage
        .from(NEWSLETTER_CHART_STORAGE_BUCKET)
        .remove(paths)
      if (removeError) {
        throw new Error(`Failed to delete newsletter chart image: ${removeError.message}`)
      }
    }

    const { error: deleteError } = await supabase
      .from(NEWSLETTER_CHART_LIBRARY_TABLE)
      .delete()
      .eq('id', id)
      .eq('owner_id', scope.ownerId)

    if (deleteError) {
      throw new Error(`Failed to delete newsletter chart library item: ${deleteError.message}`)
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
