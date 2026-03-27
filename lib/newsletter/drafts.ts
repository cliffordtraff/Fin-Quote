import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs'
import { basename, resolve } from 'path'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  assembleNewsletterHtml,
  buildNewsletterHeader,
  buildNewsletterIntroText,
  buildNewsletterStatsCard,
} from './assemble'
import { buildNewsletterBlock } from './build-block'
import {
  captureChart,
  DEFAULT_EDITOR_CHART_RENDER_HEIGHT,
  DEFAULT_EDITOR_CHART_RENDER_WIDTH,
} from './capture'
import {
  getDefaultChartingBaseUrl,
  getDefaultPublicChartingBaseUrl,
  resolveChartingPlatformNewsletterChart,
  stripTrailingYearRangeSuffix,
} from './charting-platform-export'
import {
  isPriceNewsletterChartSpec,
  normalizeNewsletterPriceChartType,
  normalizeNewsletterPriceInterval,
  normalizeNewsletterPriceRange,
} from './chart-spec'
import { generateNewsletter } from './orchestrate'
import type {
  FundamentalsNewsletterChartSpec,
  NewsletterChartSpec,
  NewsletterDraftBlock,
  NewsletterDraftHeader,
  NewsletterDraftStatsCard,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
  NewsletterDraftStatus,
  NewsletterDraftSummary,
  NewsletterOptions,
  NewsletterResult,
} from './types'

const NEWSLETTER_DRAFTS_TABLE = 'newsletter_drafts'
const NEWSLETTER_CHART_OUTPUT_DIR = './public/newsletter-charts'
const LOCAL_NEWSLETTER_DRAFTS_DIR = './.newsletter-drafts'
const NEWSLETTER_DRAFT_SESSION_MIGRATION_HINT =
  'Newsletter drafts are missing the anonymous-session migration. Run supabase migration 20260326000003_allow_anonymous_newsletter_drafts.sql.'

interface NewsletterDraftRow {
  id: string
  owner_id: string | null
  session_id: string
  ticker: string
  status: NewsletterDraftStatus
  subject_line: string
  preview_html: string
  draft_json: NewsletterDraftDocument
  created_at: string
  updated_at: string
}

export class NewsletterDraftAuthError extends Error {
  constructor(message = 'You must be signed in to manage newsletter drafts.') {
    super(message)
    this.name = 'NewsletterDraftAuthError'
  }
}

export interface NewsletterDraftScope {
  ownerId: string | null
  sessionId: string
}

export class NewsletterDraftNotFoundError extends Error {
  constructor(id: string) {
    super(`Newsletter draft not found: ${id}`)
    this.name = 'NewsletterDraftNotFoundError'
  }
}

function formatNewsletterDraftStorageError(message: string): string {
  const normalized = message.toLowerCase()
  if (
    normalized.includes('newsletter_drafts') &&
    normalized.includes('session_id')
  ) {
    return NEWSLETTER_DRAFT_SESSION_MIGRATION_HINT
  }
  return message
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase service role configuration for newsletter drafts')
  }

  return createSupabaseClient(url, key)
}

function normalizeTicker(value: string): string {
  const ticker = value.trim().toUpperCase()
  if (!ticker) {
    throw new Error('Ticker is required')
  }
  return ticker
}

function toRunStamp(date = new Date()): string {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
}

function toPublicNewsletterAssetUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/newsletter-charts/')) return trimmed
  return `/newsletter-charts/${basename(trimmed)}`
}

function normalizeChartSpec(
  spec: NewsletterChartSpec,
  ticker: string,
): NewsletterChartSpec {
  if (isPriceNewsletterChartSpec(spec)) {
    return {
      ...spec,
      symbol: normalizeTicker(spec.symbol || ticker),
      range: normalizeNewsletterPriceRange(spec.range),
      interval: normalizeNewsletterPriceInterval(spec.interval),
      chartType: normalizeNewsletterPriceChartType(spec.chartType),
      title: spec.title?.trim() || undefined,
      subtitle: spec.subtitle?.trim() || undefined,
    }
  }

  const fundamentalsSpec = spec as FundamentalsNewsletterChartSpec
  const normalizedStocks = Array.isArray(fundamentalsSpec.stocks)
    ? fundamentalsSpec.stocks
        .map((stock) => stock.trim().toUpperCase())
        .filter(Boolean)
    : []
  const primaryTicker = normalizeTicker(normalizedStocks[0] ?? ticker)
  const compareSymbols = normalizedStocks.slice(1)

  return {
    ...fundamentalsSpec,
    stocks: [primaryTicker, ...compareSymbols],
    metrics: Array.isArray(fundamentalsSpec.metrics)
      ? fundamentalsSpec.metrics.map((metric) => metric.trim()).filter(Boolean)
      : [],
    title: fundamentalsSpec.title?.trim()
      ? stripTrailingYearRangeSuffix(fundamentalsSpec.title.trim()) || undefined
      : undefined,
    subtitle: fundamentalsSpec.subtitle?.trim()
      ? stripTrailingYearRangeSuffix(fundamentalsSpec.subtitle.trim()) || undefined
      : undefined,
  }
}

function normalizeDraftBlock(
  block: NewsletterDraftBlock,
  ticker: string,
  publicChartBaseUrl: string,
): NewsletterDraftBlock {
  const chartSpec = normalizeChartSpec(block.chartSpec, ticker)
  const blockTicker = isPriceNewsletterChartSpec(chartSpec)
    ? chartSpec.symbol
    : chartSpec.stocks[0] ?? ticker
  const chartExportUrl = resolveChartingPlatformNewsletterChart(chartSpec, {
    chartBaseUrl: publicChartBaseUrl,
    theme: 'light',
  }).interactiveUrl

  return {
    ...block,
    heading: block.heading ?? '',
    body: block.body ?? '',
    chartImageUrl: toPublicNewsletterAssetUrl(block.chartImageUrl),
    chartAlt:
      block.chartAlt?.trim() ||
      chartSpec.title?.trim() ||
      `${blockTicker} newsletter chart`,
    chartExportUrl,
    chartSpec,
    chartNeedsRegeneration: block.chartNeedsRegeneration === true,
  }
}

function normalizeDraftStatsCard(
  statsCard: NewsletterDraftStatsCard | undefined,
  quote: NewsletterDraftDocument['todayQuote'],
): NewsletterDraftStatsCard | undefined {
  const defaultCard = buildNewsletterStatsCard(quote)
  const sourceItems = statsCard?.items?.length ? statsCard.items : defaultCard?.items ?? []

  if (!sourceItems.length) return undefined

  const items = [0, 1, 2].map((index) => {
    const fallback = defaultCard?.items[index]
    const item = sourceItems[index]
    return {
      label: item?.label?.trim() || fallback?.label || '',
      value: item?.value?.trim() || fallback?.value || '',
    }
  })

  if (items.every((item) => !item.label && !item.value)) return undefined
  return { items }
}

function normalizeDraftHeader(
  header: NewsletterDraftHeader | undefined,
  ticker: string,
  generatedAt: string,
  format: NewsletterDraftDocument['format'],
  featuredTickers: string[],
  subjectLine?: string,
): NewsletterDraftHeader {
  const fallback = buildNewsletterHeader(ticker, new Date(generatedAt), {
    format,
    featuredTickers,
    subjectLine,
  })
  return {
    title: header?.title?.trim() || fallback.title,
    dateText: header?.dateText?.trim() || fallback.dateText,
    badgeText: header?.badgeText?.trim() || fallback.badgeText,
    logoUrl: header?.logoUrl?.trim() || fallback.logoUrl,
  }
}

export function normalizeNewsletterDraftDocument(
  draft: NewsletterDraftDocument,
  publicChartBaseUrl = getDefaultPublicChartingBaseUrl(),
): NewsletterDraftDocument {
  const ticker = normalizeTicker(draft.ticker)
  const format = draft.format === 'market_roundup' ? 'market_roundup' : 'single_stock'
  const generatedAt =
    typeof draft.generatedAt === 'string' && draft.generatedAt.trim()
      ? draft.generatedAt
      : new Date().toISOString()
  const featuredTickers = Array.isArray(draft.featuredTickers)
    ? draft.featuredTickers.map((value) => normalizeTicker(value)).filter(Boolean)
    : []
  const normalizedFeaturedTickers = featuredTickers.length > 0 ? featuredTickers : [ticker]

  return {
    ...draft,
    ticker,
    format,
    featuredTickers: normalizedFeaturedTickers,
    generationPrompt: draft.generationPrompt?.trim() || undefined,
    generatedAt,
    subjectLine:
      draft.subjectLine?.trim() ||
      (format === 'market_roundup' ? 'Market Roundup' : `${ticker} Snapshot`),
    introText: draft.introText?.trim() || '',
    header: normalizeDraftHeader(
      draft.header,
      ticker,
      generatedAt,
      format,
      normalizedFeaturedTickers,
      draft.subjectLine?.trim(),
    ),
    statsCard: normalizeDraftStatsCard(draft.statsCard, draft.todayQuote),
    blocks: Array.isArray(draft.blocks)
      ? draft.blocks.map((block) =>
          normalizeDraftBlock(block, ticker, publicChartBaseUrl),
        )
      : [],
  }
}

function mapDraftRow(row: NewsletterDraftRow): NewsletterDraftRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ticker: row.ticker,
    status: row.status,
    subjectLine: row.subject_line,
    previewHtml: row.preview_html,
    draft: row.draft_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function usesLocalDraftStorage(scope: NewsletterDraftScope): boolean {
  return !scope.ownerId
}

function sanitizeDraftStorageKey(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Draft storage key is required')
  }
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function getLocalDraftSessionDir(sessionId: string): string {
  return resolve(
    LOCAL_NEWSLETTER_DRAFTS_DIR,
    sanitizeDraftStorageKey(sessionId),
  )
}

function getLocalDraftFilePath(scope: NewsletterDraftScope, id: string): string {
  return resolve(
    getLocalDraftSessionDir(scope.sessionId),
    `${sanitizeDraftStorageKey(id)}.json`,
  )
}

function readLocalDraftRowFromFile(filePath: string): NewsletterDraftRow {
  return JSON.parse(readFileSync(filePath, 'utf8')) as NewsletterDraftRow
}

function writeLocalDraftRow(filePath: string, row: NewsletterDraftRow) {
  mkdirSync(getLocalDraftSessionDir(row.session_id), { recursive: true })
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`
  writeFileSync(tempPath, JSON.stringify(row, null, 2))
  renameSync(tempPath, filePath)
}

function listLocalDraftRows(scope: NewsletterDraftScope): NewsletterDraftRow[] {
  const sessionDir = getLocalDraftSessionDir(scope.sessionId)
  if (!existsSync(sessionDir)) {
    return []
  }

  const rows = readdirSync(sessionDir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => readLocalDraftRowFromFile(resolve(sessionDir, entry)))
    .filter((row) => row.session_id === scope.sessionId)

  rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return rows
}

function getLocalDraftRow(
  scope: NewsletterDraftScope,
  id: string,
): NewsletterDraftRow {
  const filePath = getLocalDraftFilePath(scope, id)
  if (!existsSync(filePath)) {
    throw new NewsletterDraftNotFoundError(id)
  }

  const row = readLocalDraftRowFromFile(filePath)
  if (row.session_id !== scope.sessionId) {
    throw new NewsletterDraftNotFoundError(id)
  }

  return row
}

function persistLocalDraftRow(
  scope: NewsletterDraftScope,
  id: string | null,
  draft: NewsletterDraftDocument,
  status: NewsletterDraftStatus,
  publicChartBaseUrl = getDefaultPublicChartingBaseUrl(),
): NewsletterDraftRecord {
  const normalizedDraft = normalizeNewsletterDraftDocument(draft, publicChartBaseUrl)
  const previewHtml = renderNewsletterDraftPreviewHtml(normalizedDraft, publicChartBaseUrl)
  const existing = id ? getLocalDraftRow(scope, id) : null
  const timestamp = new Date().toISOString()
  const row: NewsletterDraftRow = {
    id: existing?.id ?? crypto.randomUUID(),
    owner_id: null,
    session_id: scope.sessionId,
    ticker: normalizedDraft.ticker,
    status,
    subject_line: normalizedDraft.subjectLine,
    preview_html: previewHtml,
    draft_json: normalizedDraft,
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  }

  writeLocalDraftRow(getLocalDraftFilePath(scope, row.id), row)
  return mapDraftRow(row)
}

export function buildNewsletterDraftFromResult(
  result: NewsletterResult,
  publicChartBaseUrl = getDefaultPublicChartingBaseUrl(),
): NewsletterDraftDocument {
  const ticker = normalizeTicker(result.ticker)
  const introText = buildNewsletterIntroText(result.todayQuote, result.editorialHook)
  const blocks: NewsletterDraftBlock[] = result.blocks.map((block, index) => {
    const spec = normalizeChartSpec(result.chartSpecs[index], ticker)
    const chartPath = result.chartPaths[index] ?? ''
    const chartImageUrl = toPublicNewsletterAssetUrl(chartPath)
    const chartExportUrl = resolveChartingPlatformNewsletterChart(spec, {
      chartBaseUrl: publicChartBaseUrl,
      theme: 'light',
    }).interactiveUrl

    return {
      id: crypto.randomUUID(),
      layoutId: block.layoutId,
      templateId: result.selections[index]?.templateId ?? `block_${index + 1}`,
      selectionReason: result.selections[index]?.reason ?? '',
      heading: block.data.heading ?? '',
      body: block.data.body ?? '',
      chartImageUrl,
      chartAlt:
        block.data.chartAlt ??
        spec.title?.trim() ??
        `${isPriceNewsletterChartSpec(spec) ? spec.symbol : spec.stocks[0] ?? ticker} newsletter chart`,
      chartExportUrl,
      chartSpec: spec,
      chartNeedsRegeneration: false,
      caption: block.data.caption,
      ctaText: block.data.ctaText,
      ctaUrl: block.data.ctaUrl,
      footer: block.data.footer,
    }
  })

  return {
    ticker,
    format: result.format,
    featuredTickers: result.featuredTickers.map((value) => normalizeTicker(value)),
    generationPrompt: result.generationPrompt?.trim() || undefined,
    generatedAt: result.generatedAt,
    subjectLine: result.subjectLine,
    introText,
    editorialHook: result.editorialHook,
    todayQuote: result.todayQuote,
    header: buildNewsletterHeader(ticker, new Date(result.generatedAt), {
      format: result.format,
      featuredTickers: result.featuredTickers,
      subjectLine: result.subjectLine,
    }),
    statsCard:
      result.format === 'market_roundup'
        ? undefined
        : buildNewsletterStatsCard(result.todayQuote),
    autoPickedStock: result.autoPickedStock,
    stockPickerResult: result.stockPickerResult,
    blocks,
  }
}

export function renderNewsletterDraftPreviewHtml(
  draft: NewsletterDraftDocument,
  publicChartBaseUrl = getDefaultPublicChartingBaseUrl(),
): string {
  const normalizedDraft = normalizeNewsletterDraftDocument(draft, publicChartBaseUrl)
  const blocks = normalizedDraft.blocks.map((block) => {
    const renderedBlock = buildNewsletterBlock(block.layoutId, {
      heading: block.heading,
      body: block.body,
      chartImageUrl: block.chartImageUrl,
      chartAlt: block.chartAlt,
      chartExportUrl: block.chartExportUrl,
      caption: block.caption,
      ctaText: block.ctaText,
      ctaUrl: block.ctaUrl,
      footer: block.footer,
    })

    return {
      ...renderedBlock,
      html: `<div id="newsletter-preview-block-${block.id}" data-newsletter-preview-block-id="${block.id}">${renderedBlock.html}</div>`,
    }
  })

  return assembleNewsletterHtml(
    normalizedDraft.ticker,
    blocks,
    new Date(normalizedDraft.generatedAt),
    normalizedDraft.todayQuote,
    normalizedDraft.editorialHook,
    normalizedDraft.subjectLine,
    {
      headerOverride: normalizedDraft.header,
      introTextOverride: normalizedDraft.introText,
      statsCardOverride: normalizedDraft.statsCard,
    },
  )
}

async function persistNewsletterDraftRow(
  scope: NewsletterDraftScope,
  id: string | null,
  draft: NewsletterDraftDocument,
  status: NewsletterDraftStatus,
  publicChartBaseUrl = getDefaultPublicChartingBaseUrl(),
): Promise<NewsletterDraftRecord> {
  if (usesLocalDraftStorage(scope)) {
    return persistLocalDraftRow(scope, id, draft, status, publicChartBaseUrl)
  }

  const normalizedDraft = normalizeNewsletterDraftDocument(draft, publicChartBaseUrl)
  const previewHtml = renderNewsletterDraftPreviewHtml(normalizedDraft, publicChartBaseUrl)
  const supabase = getServiceClient()

  const payload = {
    owner_id: scope.ownerId,
    session_id: scope.sessionId,
    ticker: normalizedDraft.ticker,
    status,
    subject_line: normalizedDraft.subjectLine,
    draft_json: normalizedDraft,
    preview_html: previewHtml,
  }

  let query

  if (id) {
    query = supabase.from(NEWSLETTER_DRAFTS_TABLE).update(payload).eq('id', id)
    query = scope.ownerId
      ? query.eq('owner_id', scope.ownerId)
      : query.is('owner_id', null).eq('session_id', scope.sessionId)
    query = query.select('*').single()
  } else {
    query = supabase
      .from(NEWSLETTER_DRAFTS_TABLE)
      .insert(payload)
      .select('*')
      .single()
  }

  const { data, error } = await query

  if (error) {
    throw new Error(
      `Failed to persist newsletter draft: ${formatNewsletterDraftStorageError(error.message)}`,
    )
  }

  return mapDraftRow(data as NewsletterDraftRow)
}

export async function listNewsletterDrafts(
  scope: NewsletterDraftScope,
): Promise<NewsletterDraftSummary[]> {
  if (usesLocalDraftStorage(scope)) {
    return listLocalDraftRows(scope).map((row) => ({
      id: row.id,
      ticker: row.ticker,
      format: row.draft_json.format ?? 'single_stock',
      featuredTickers: row.draft_json.featuredTickers ?? [row.ticker],
      status: row.status,
      subjectLine: row.subject_line,
      generatedAt: row.draft_json.generatedAt,
      blockCount: row.draft_json.blocks.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  const supabase = getServiceClient()
  let query = supabase
    .from(NEWSLETTER_DRAFTS_TABLE)
    .select('id, ticker, status, subject_line, draft_json, created_at, updated_at')
    .order('updated_at', { ascending: false })

  query = scope.ownerId
    ? query.eq('owner_id', scope.ownerId)
    : query.is('owner_id', null).eq('session_id', scope.sessionId)

  const { data, error } = await query

  if (error) {
    throw new Error(
      `Failed to list newsletter drafts: ${formatNewsletterDraftStorageError(error.message)}`,
    )
  }

  return (data as Array<Omit<NewsletterDraftRow, 'preview_html' | 'owner_id'>>).map((row) => ({
    id: row.id,
    ticker: row.ticker,
    format: row.draft_json.format ?? 'single_stock',
    featuredTickers: row.draft_json.featuredTickers ?? [row.ticker],
    status: row.status,
    subjectLine: row.subject_line,
    generatedAt: row.draft_json.generatedAt,
    blockCount: row.draft_json.blocks.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function getNewsletterDraft(
  scope: NewsletterDraftScope,
  id: string,
): Promise<NewsletterDraftRecord> {
  if (usesLocalDraftStorage(scope)) {
    return mapDraftRow(getLocalDraftRow(scope, id))
  }

  const supabase = getServiceClient()
  let query = supabase.from(NEWSLETTER_DRAFTS_TABLE).select('*').eq('id', id)
  query = scope.ownerId
    ? query.eq('owner_id', scope.ownerId)
    : query.is('owner_id', null).eq('session_id', scope.sessionId)

  const { data, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NewsletterDraftNotFoundError(id)
    }
    throw new Error(
      `Failed to fetch newsletter draft: ${formatNewsletterDraftStorageError(error.message)}`,
    )
  }

  return mapDraftRow(data as NewsletterDraftRow)
}

export async function createNewsletterDraft(
  scope: NewsletterDraftScope,
  ticker: string | undefined,
  options?: NewsletterOptions,
): Promise<NewsletterDraftRecord> {
  const publicChartBaseUrl =
    options?.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl()
  const result = await generateNewsletter(ticker, options)
  const draft = buildNewsletterDraftFromResult(result, publicChartBaseUrl)
  return persistNewsletterDraftRow(scope, null, draft, 'draft', publicChartBaseUrl)
}

export async function saveNewsletterDraft(
  scope: NewsletterDraftScope,
  id: string,
  draft: NewsletterDraftDocument,
  status: NewsletterDraftStatus = 'draft',
): Promise<NewsletterDraftRecord> {
  return persistNewsletterDraftRow(scope, id, draft, status)
}

export async function regenerateNewsletterDraft(
  scope: NewsletterDraftScope,
  id: string,
  options?: NewsletterOptions,
): Promise<NewsletterDraftRecord> {
  const existing = await getNewsletterDraft(scope, id)
  const publicChartBaseUrl =
    options?.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl()
  const isMarketRoundup = existing.draft.format === 'market_roundup'
  const result = await generateNewsletter(
    isMarketRoundup ? undefined : existing.ticker,
    {
      ...options,
      format: existing.draft.format,
      generationPrompt: options?.generationPrompt ?? existing.draft.generationPrompt,
      featuredTickers: isMarketRoundup
        ? existing.draft.featuredTickers
        : options?.featuredTickers,
    },
  )
  const draft = buildNewsletterDraftFromResult(result, publicChartBaseUrl)

  return persistNewsletterDraftRow(scope, id, draft, existing.status, publicChartBaseUrl)
}

export async function regenerateNewsletterDraftChart(
  scope: NewsletterDraftScope,
  id: string,
  blockId: string,
  draft: NewsletterDraftDocument,
  options?: {
    chartBaseUrl?: string
    publicChartBaseUrl?: string
    editorMode?: boolean
    width?: number
    height?: number
  },
): Promise<NewsletterDraftRecord> {
  const chartBaseUrl = options?.chartBaseUrl ?? getDefaultChartingBaseUrl()
  const publicChartBaseUrl =
    options?.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl()
  const width =
    options?.width ??
    (options?.editorMode === true
      ? DEFAULT_EDITOR_CHART_RENDER_WIDTH
      : undefined)
  const height =
    options?.height ??
    (options?.editorMode === true
      ? DEFAULT_EDITOR_CHART_RENDER_HEIGHT
      : undefined)
  const normalizedDraft = normalizeNewsletterDraftDocument(draft, publicChartBaseUrl)
  const block = normalizedDraft.blocks.find((entry) => entry.id === blockId)

  if (!block) {
    throw new Error(`Draft does not contain block ${blockId}`)
  }

  mkdirSync(resolve(NEWSLETTER_CHART_OUTPUT_DIR), { recursive: true })
  const filename = `${normalizedDraft.ticker}_${block.templateId}_${toRunStamp()}_draft.png`
  const outputPath = resolve(NEWSLETTER_CHART_OUTPUT_DIR, filename)
  await captureChart(block.chartSpec, {
    outputPath,
    chartBaseUrl,
    width,
    height,
  })

  const updatedBlocks = normalizedDraft.blocks.map((entry) =>
    entry.id === blockId
      ? normalizeDraftBlock(
          {
            ...entry,
            chartImageUrl: `/newsletter-charts/${filename}`,
            chartNeedsRegeneration: false,
          },
          normalizedDraft.ticker,
          publicChartBaseUrl,
        )
      : entry,
  )

  return persistNewsletterDraftRow(
    scope,
    id,
    {
      ...normalizedDraft,
      blocks: updatedBlocks,
    },
    'draft',
    publicChartBaseUrl,
  )
}
