import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join, resolve } from 'path'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import {
  assembleNewsletterHtmlForBeehiiv,
  buildNewsletterHeader,
  buildNewsletterIntroText,
  buildNewsletterStatsCard,
} from './assemble'
import { buildNewsletterBlock } from './build-block'
import {
  captureChart,
} from './capture'
import { uploadNewsletterChartImage } from './chart-library'
import { buildPriceExportEditorBaseSpec } from './chart-editor'
import {
  getDefaultChartingBaseUrl,
  getDefaultPublicChartingBaseUrl,
  resolveChartingPlatformNewsletterChart,
  stripTrailingYearRangeSuffix,
} from './charting-platform-export'
import {
  isPriceNewsletterChartSpec,
  normalizeNewsletterPriceStateSnapshot,
  normalizeNewsletterPriceChartType,
  normalizeNewsletterPriceInterval,
  normalizeNewsletterPriceRange,
} from './chart-spec'
import { generateNewsletterWithBackend } from './generation'
import {
  isSafeNewsletterLink,
  normalizeNewsletterSubject,
} from './delivery-quality'
import type {
  FundamentalsNewsletterChartSpec,
  NewsletterChartSpec,
  NewsletterDraftBlock,
  NewsletterDraftEvent,
  NewsletterDraftEventType,
  NewsletterDraftHeader,
  NewsletterDraftStatsCard,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
  NewsletterDraftSourceType,
  NewsletterDraftStatus,
  NewsletterDraftSummary,
  NewsletterOptions,
  PriceNewsletterChartSpec,
  NewsletterResult,
} from './types'

const NEWSLETTER_DRAFTS_TABLE = 'newsletter_drafts'
const NEWSLETTER_DRAFT_EVENTS_TABLE = 'newsletter_draft_events'
const NEWSLETTER_CHART_OUTPUT_DIR = './.newsletter-output'
const LOCAL_NEWSLETTER_DRAFTS_DIR = './.newsletter-drafts'
const BLANK_NEWSLETTER_TICKER = 'TBD'
const BLANK_DRAFT_PLACEHOLDER_CHART_URL = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="338" viewBox="0 0 600 338" fill="none"><rect width="600" height="338" rx="12" fill="#F8F8F5"/><rect x="12" y="12" width="576" height="314" rx="10" fill="#FFFFFF" stroke="#D1D5DB" stroke-width="2" stroke-dasharray="8 8"/><text x="300" y="154" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="22" font-weight="700" fill="#1A1A1A">Chart placeholder</text><text x="300" y="186" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="14" fill="#6B7280">Open Edit chart to choose a chart for this section.</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
})()
const NEWSLETTER_DRAFT_SESSION_MIGRATION_HINT =
  'Newsletter drafts are missing the anonymous-session migration. Run supabase migration 20260326000003_allow_anonymous_newsletter_drafts.sql.'

interface NewsletterDraftRow {
  id: string
  owner_id: string | null
  session_id: string
  ticker: string
  status: NewsletterDraftStatus
  source_type?: NewsletterDraftSourceType
  source_review_key?: string | null
  beehiiv_url?: string | null
  published_at?: string | null
  subject_line: string
  preview_html: string
  draft_json: NewsletterDraftDocument
  history?: NewsletterDraftEvent[]
  created_at: string
  updated_at: string
}

interface NewsletterDraftEventRow {
  id: string
  draft_id: string
  owner_id: string | null
  session_id: string
  event_type: NewsletterDraftEventType
  from_status: NewsletterDraftStatus | null
  to_status: NewsletterDraftStatus | null
  beehiiv_url: string | null
  dedupe_key?: string | null
  metadata: Record<string, unknown> | null
  created_at: string
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

export class NewsletterDraftConflictError extends Error {
  constructor(id: string) {
    super(
      `Newsletter draft ${id} changed while it was being saved. Reload the latest version and try again.`,
    )
    this.name = 'NewsletterDraftConflictError'
  }
}

export class NewsletterPublishedDraftImmutableError extends Error {
  constructor(id: string) {
    super(
      `Published newsletter draft ${id} is immutable. Create a new draft for further edits.`,
    )
    this.name = 'NewsletterPublishedDraftImmutableError'
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function toRunStamp(date = new Date()): string {
  return date.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
}

function toPublicNewsletterAssetUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (/^data:/i.test(trimmed)) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/newsletter-charts/')) return trimmed
  return `/newsletter-charts/${basename(trimmed)}`
}

function normalizeChartSpec(
  spec: NewsletterChartSpec,
  ticker: string,
): NewsletterChartSpec {
  if (isPriceNewsletterChartSpec(spec)) {
    const symbol = normalizeTicker(spec.symbol || ticker)
    const range = normalizeNewsletterPriceRange(spec.range)
    const interval = normalizeNewsletterPriceInterval(spec.interval)
    const chartType = normalizeNewsletterPriceChartType(spec.chartType)

    return {
      ...spec,
      symbol,
      range,
      interval,
      chartType,
      priceState: normalizeNewsletterPriceStateSnapshot(spec.priceState, {
        symbol,
        range,
        interval,
        chartType,
      }),
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
  const resolvedChartExportUrl = resolveChartingPlatformNewsletterChart(chartSpec, {
    chartBaseUrl: publicChartBaseUrl,
    theme: 'light',
  }).interactiveUrl
  const existingChartExportUrl = block.chartExportUrl?.trim() ?? ''
  const chartExportUrl =
    isSafeNewsletterLink(existingChartExportUrl) &&
    !isSafeNewsletterLink(resolvedChartExportUrl)
      ? existingChartExportUrl
      : resolvedChartExportUrl

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
  const hasExplicitLogoUrl = typeof header?.logoUrl === 'string'
  const rawLogoUrl = hasExplicitLogoUrl
    ? header?.logoUrl?.trim() ?? ''
    : fallback.logoUrl
  const hasExplicitLogoUrls = Array.isArray(header?.logoUrls)
  const rawLogoUrls = hasExplicitLogoUrls
    ? (header?.logoUrls ?? [])
        .map((u) => (typeof u === 'string' ? u.trim() : ''))
        .filter(Boolean)
    : fallback.logoUrls

  return {
    title: header?.title?.trim() || fallback.title,
    dateText: header?.dateText?.trim() || fallback.dateText,
    badgeText: header?.badgeText?.trim() || fallback.badgeText,
    ...(hasExplicitLogoUrl || rawLogoUrl ? { logoUrl: rawLogoUrl } : {}),
    ...(hasExplicitLogoUrls || rawLogoUrls ? { logoUrls: rawLogoUrls } : {}),
  }
}

export function getNewsletterDraftSourceType(
  draft: NewsletterDraftDocument,
): NewsletterDraftSourceType {
  if (draft.source?.type === 'catalyst') return 'catalyst'
  if (draft.source?.type === 'daily_batch') return 'daily_batch'
  return draft.manualDraft ? 'manual' : 'generated'
}

export function preserveNewsletterDraftServerMetadata(
  existing: NewsletterDraftDocument,
  incoming: NewsletterDraftDocument,
): NewsletterDraftDocument {
  return {
    ...incoming,
    source: existing.source,
    publication: existing.publication,
  }
}

function getNewsletterDraftSourceReviewKey(
  draft: NewsletterDraftDocument,
): string | null {
  if (draft.source?.type === 'catalyst') {
    return draft.source.catalyst.reviewKey?.trim() || null
  }
  if (draft.source?.type === 'daily_batch') {
    return draft.source.dailyBatch.itemKey?.trim() || null
  }
  return null
}

function normalizeNewsletterDraftSource(
  draft: NewsletterDraftDocument,
): NewsletterDraftDocument['source'] {
  if (draft.source?.type === 'daily_batch') {
    const dailyBatch = draft.source.dailyBatch
    const ticker = normalizeTicker(dailyBatch.ticker || draft.ticker)
    const itemKey = dailyBatch.itemKey?.trim()
    const runId = dailyBatch.runId?.trim()
    const itemId = dailyBatch.itemId?.trim()
    const sourceWiimRunId = dailyBatch.sourceWiimRunId?.trim()

    if (!itemKey || !runId || !itemId || !sourceWiimRunId) return undefined

    return {
      type: 'daily_batch',
      dailyBatch: {
        ...dailyBatch,
        runId,
        itemId,
        itemKey,
        sourceWiimRunId,
        marketDate:
          dailyBatch.marketDate?.trim() || draft.generatedAt.slice(0, 10),
        rank: Math.max(1, Math.round(Number(dailyBatch.rank) || 1)),
        ticker,
        headline: dailyBatch.headline?.trim() || `${ticker} market update`,
        summary: dailyBatch.summary?.trim() || '',
        keyFact: dailyBatch.keyFact?.trim() || null,
        reasonType: dailyBatch.reasonType?.trim() || null,
        movePercent: Number.isFinite(dailyBatch.movePercent)
          ? dailyBatch.movePercent
          : null,
        confidenceScore: Number.isFinite(dailyBatch.confidenceScore)
          ? dailyBatch.confidenceScore
          : 0,
        relevanceScore: Number.isFinite(dailyBatch.relevanceScore)
          ? dailyBatch.relevanceScore
          : 0,
        qualityBand:
          dailyBatch.qualityBand === 'review' ? 'review' : 'strong',
        sourceRefs: Array.isArray(dailyBatch.sourceRefs)
          ? dailyBatch.sourceRefs
              .filter(
                (source) =>
                  source &&
                  typeof source.kind === 'string' &&
                  typeof source.label === 'string',
              )
              .map((source) => ({
                kind: source.kind.trim(),
                label: source.label.trim(),
                url: source.url?.trim() || undefined,
                publishedAt: source.publishedAt?.trim() || undefined,
              }))
          : [],
      },
      attachedChartIds: Array.isArray(draft.source.attachedChartIds)
        ? [
            ...new Set(
              draft.source.attachedChartIds
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ]
        : [],
      automatedAt:
        draft.source.automatedAt?.trim() ||
        draft.generatedAt ||
        new Date().toISOString(),
      automationStatus:
        draft.source.automationStatus === 'needs_chart'
          ? 'needs_chart'
          : 'complete',
      automationWarning: draft.source.automationWarning?.trim() || undefined,
    }
  }

  if (draft.source?.type !== 'catalyst') return undefined

  const catalyst = draft.source.catalyst
  const symbol = normalizeTicker(catalyst.symbol || draft.ticker)
  const reviewKey = catalyst.reviewKey?.trim()
  if (!reviewKey) return undefined

  return {
    type: 'catalyst',
    catalyst: {
      ...catalyst,
      reviewId: catalyst.reviewId?.trim() || reviewKey,
      reviewKey,
      symbol,
      headline: catalyst.headline?.trim() || `${symbol} catalyst`,
      summary: catalyst.summary?.trim() || '',
      bulletPoints: Array.isArray(catalyst.bulletPoints)
        ? catalyst.bulletPoints.map((value) => value.trim()).filter(Boolean)
        : [],
      source: catalyst.source?.trim() || null,
      sourceUrl: catalyst.sourceUrl?.trim() || '',
      reviewNotes: catalyst.reviewNotes?.trim() || '',
      reviewedAt: catalyst.reviewedAt || null,
    },
    attachedChartIds: Array.isArray(draft.source.attachedChartIds)
      ? [...new Set(draft.source.attachedChartIds.map((value) => value.trim()).filter(Boolean))]
      : [],
    automatedAt:
      draft.source.automatedAt?.trim() || draft.generatedAt || new Date().toISOString(),
    automationStatus:
      draft.source.automationStatus === 'needs_chart' ? 'needs_chart' : 'complete',
    automationWarning: draft.source.automationWarning?.trim() || undefined,
  }
}

function normalizeNewsletterDraftPublication(
  draft: NewsletterDraftDocument,
): NewsletterDraftDocument['publication'] {
  const beehiivUrl = draft.publication?.beehiivUrl?.trim() || null
  const publishedAt = draft.publication?.publishedAt?.trim() || null
  if (!beehiivUrl && !publishedAt) return undefined
  return { beehiivUrl, publishedAt }
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
  const normalizedFeaturedTickers =
    format === 'market_roundup'
      ? featuredTickers
      : featuredTickers.length > 0
        ? featuredTickers
        : [ticker]

  return {
    ...draft,
    ticker,
    format,
    featuredTickers: normalizedFeaturedTickers,
    source: normalizeNewsletterDraftSource(draft),
    publication: normalizeNewsletterDraftPublication(draft),
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
  const sourceType =
    row.source_type ?? getNewsletterDraftSourceType(row.draft_json)
  const sourceReviewKey =
    row.source_review_key ?? getNewsletterDraftSourceReviewKey(row.draft_json)
  const beehiivUrl =
    row.beehiiv_url ?? row.draft_json.publication?.beehiivUrl ?? null
  const publishedAt =
    row.published_at ?? row.draft_json.publication?.publishedAt ?? null

  return {
    id: row.id,
    ownerId: row.owner_id,
    ticker: row.ticker,
    status: row.status,
    sourceType,
    sourceReviewKey,
    beehiivUrl,
    publishedAt,
    attachedChartCount:
      row.draft_json.source?.attachedChartIds.length ??
      row.draft_json.blocks.length,
    subjectLine: row.subject_line,
    previewHtml: row.preview_html,
    draft: row.draft_json,
    history: row.history ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapDraftEventRow(row: NewsletterDraftEventRow): NewsletterDraftEvent {
  return {
    id: row.id,
    draftId: row.draft_id,
    type: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    beehiivUrl: row.beehiiv_url,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
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

function shouldAllowCrossSessionLocalDraftLookup(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true
  }

  return process.env.NEWSLETTER_ALLOW_CROSS_SESSION_LOCAL_DRAFT_ACCESS === 'true'
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

function findLocalDraftRowAcrossSessions(id: string): NewsletterDraftRow | null {
  if (!shouldAllowCrossSessionLocalDraftLookup()) {
    return null
  }

  if (!existsSync(LOCAL_NEWSLETTER_DRAFTS_DIR)) {
    return null
  }

  const sanitizedId = sanitizeDraftStorageKey(id)
  const sessionDirs = readdirSync(LOCAL_NEWSLETTER_DRAFTS_DIR)

  for (const sessionDir of sessionDirs) {
    const candidatePath = resolve(
      LOCAL_NEWSLETTER_DRAFTS_DIR,
      sessionDir,
      `${sanitizedId}.json`,
    )

    if (!existsSync(candidatePath)) {
      continue
    }

    return readLocalDraftRowFromFile(candidatePath)
  }

  return null
}

function getLocalDraftRow(
  scope: NewsletterDraftScope,
  id: string,
): NewsletterDraftRow {
  const filePath = getLocalDraftFilePath(scope, id)
  if (!existsSync(filePath)) {
    const crossSessionRow = findLocalDraftRowAcrossSessions(id)
    if (!crossSessionRow) {
      throw new NewsletterDraftNotFoundError(id)
    }
    return crossSessionRow
  }

  const row = readLocalDraftRowFromFile(filePath)
  if (row.session_id !== scope.sessionId) {
    const crossSessionRow = findLocalDraftRowAcrossSessions(id)
    if (!crossSessionRow) {
      throw new NewsletterDraftNotFoundError(id)
    }
    return crossSessionRow
  }

  return row
}

function deleteLocalDraftRow(scope: NewsletterDraftScope, id: string) {
  const filePath = getLocalDraftFilePath(scope, id)
  if (!existsSync(filePath)) {
    throw new NewsletterDraftNotFoundError(id)
  }

  const row = readLocalDraftRowFromFile(filePath)
  if (row.session_id !== scope.sessionId) {
    throw new NewsletterDraftNotFoundError(id)
  }

  rmSync(filePath, { force: true })
}

function persistLocalDraftRow(
  scope: NewsletterDraftScope,
  id: string | null,
  draft: NewsletterDraftDocument,
  status: NewsletterDraftStatus,
  publicChartBaseUrl = getDefaultPublicChartingBaseUrl(),
  expected?: { updatedAt: string; status: NewsletterDraftStatus },
): NewsletterDraftRecord {
  const normalizedDraft = normalizeNewsletterDraftDocument(draft, publicChartBaseUrl)
  const previewHtml = renderNewsletterDraftPreviewHtml(normalizedDraft, publicChartBaseUrl)
  const existing = id ? getLocalDraftRow(scope, id) : null
  if (
    existing &&
    expected &&
    (existing.updated_at !== expected.updatedAt ||
      existing.status !== expected.status)
  ) {
    throw new NewsletterDraftConflictError(existing.id)
  }
  const now = new Date().toISOString()
  const timestamp =
    existing && now <= existing.updated_at
      ? new Date(Date.parse(existing.updated_at) + 1).toISOString()
      : now
  const row: NewsletterDraftRow = {
    id: existing?.id ?? crypto.randomUUID(),
    owner_id: null,
    session_id: scope.sessionId,
    ticker: normalizedDraft.ticker,
    status,
    source_type: getNewsletterDraftSourceType(normalizedDraft),
    source_review_key: getNewsletterDraftSourceReviewKey(normalizedDraft),
    beehiiv_url: normalizedDraft.publication?.beehiivUrl ?? null,
    published_at: normalizedDraft.publication?.publishedAt ?? null,
    subject_line: normalizedDraft.subjectLine,
    preview_html: previewHtml,
    draft_json: normalizedDraft,
    history: existing?.history ?? [],
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  }

  writeLocalDraftRow(getLocalDraftFilePath(scope, row.id), row)
  return mapDraftRow(row)
}

interface AppendNewsletterDraftEventInput {
  type: NewsletterDraftEventType
  fromStatus?: NewsletterDraftStatus | null
  toStatus?: NewsletterDraftStatus | null
  beehiivUrl?: string | null
  metadata?: Record<string, unknown>
  dedupeKey?: string
  signal?: AbortSignal
}

export async function appendNewsletterDraftEvent(
  scope: NewsletterDraftScope,
  draftId: string,
  input: AppendNewsletterDraftEventInput,
): Promise<NewsletterDraftEvent> {
  input.signal?.throwIfAborted()
  const timestamp = new Date().toISOString()

  if (usesLocalDraftStorage(scope)) {
    const row = getLocalDraftRow(scope, draftId)
    const event: NewsletterDraftEvent = {
      id: crypto.randomUUID(),
      draftId,
      type: input.type,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      beehiivUrl: input.beehiivUrl?.trim() || null,
      metadata: input.metadata ?? {},
      createdAt: timestamp,
    }
    row.history = [...(row.history ?? []), event]
    writeLocalDraftRow(getLocalDraftFilePath(scope, draftId), row)
    input.signal?.throwIfAborted()
    return event
  }

  const supabase = getServiceClient()
  let eventQuery = supabase
    .from(NEWSLETTER_DRAFT_EVENTS_TABLE)
    .insert({
      draft_id: draftId,
      owner_id: scope.ownerId,
      session_id: scope.sessionId,
      event_type: input.type,
      from_status: input.fromStatus ?? null,
      to_status: input.toStatus ?? null,
      beehiiv_url: input.beehiivUrl?.trim() || null,
      metadata: input.metadata ?? {},
      dedupe_key: input.dedupeKey?.trim() || null,
    })
    .select('*')
  if (input.signal) eventQuery = eventQuery.abortSignal(input.signal)
  const { data, error } = await eventQuery.single()

  if (error?.code === '23505' && input.dedupeKey?.trim()) {
    let existingQuery = supabase
      .from(NEWSLETTER_DRAFT_EVENTS_TABLE)
      .select('*')
      .eq('draft_id', draftId)
      .eq('dedupe_key', input.dedupeKey.trim())
    if (input.signal) existingQuery = existingQuery.abortSignal(input.signal)
    const existing = await existingQuery.single()
    if (existing.error || !existing.data) {
      throw new Error(
        `Failed to load deduplicated newsletter history: ${
          existing.error?.message ?? 'No row returned'
        }`,
      )
    }
    return mapDraftEventRow(existing.data as NewsletterDraftEventRow)
  }

  if (error) {
    throw new Error(`Failed to append newsletter history: ${error.message}`)
  }

  return mapDraftEventRow(data as NewsletterDraftEventRow)
}

export async function listNewsletterDraftEvents(
  scope: NewsletterDraftScope,
  draftId: string,
  signal?: AbortSignal,
): Promise<NewsletterDraftEvent[]> {
  signal?.throwIfAborted()
  if (usesLocalDraftStorage(scope)) {
    return [...(getLocalDraftRow(scope, draftId).history ?? [])].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )
  }

  const supabase = getServiceClient()
  let query = supabase
    .from(NEWSLETTER_DRAFT_EVENTS_TABLE)
    .select('*')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: true })

  query = scope.ownerId
    ? query.eq('owner_id', scope.ownerId)
    : query.is('owner_id', null).eq('session_id', scope.sessionId)

  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) {
    throw new Error(`Failed to load newsletter history: ${error.message}`)
  }
  return (data as NewsletterDraftEventRow[]).map(mapDraftEventRow)
}

async function hydrateNewsletterDraftHistory(
  scope: NewsletterDraftScope,
  record: NewsletterDraftRecord,
  signal?: AbortSignal,
): Promise<NewsletterDraftRecord> {
  return {
    ...record,
    history: await listNewsletterDraftEvents(scope, record.id, signal),
  }
}

export function buildNewsletterDraftFromResult(
  result: NewsletterResult,
  publicChartBaseUrl = getDefaultPublicChartingBaseUrl(),
): NewsletterDraftDocument {
  const ticker = normalizeTicker(result.ticker)
  const subjectLine =
    normalizeNewsletterSubject(result.subjectLine) ||
    normalizeNewsletterSubject(
      result.format === 'market_roundup'
        ? 'Market Roundup'
        : `${ticker} market update`,
    )
  const introText = buildNewsletterIntroText(result.todayQuote, result.editorialHook)
  const blocks: NewsletterDraftBlock[] = result.blocks.map((block, index) => {
    const spec = normalizeChartSpec(result.chartSpecs[index], ticker)
    const chartPath = result.chartPaths[index] ?? ''
    const chartFilename = basename(chartPath)
    // Generated files are ephemeral on Vercel. When orchestration publishes
    // them to Supabase Storage, persist that durable URL in the draft instead
    // of a /newsletter-charts path backed by the function filesystem.
    const chartImageUrl =
      result.publishedUrls?.[chartFilename] ??
      toPublicNewsletterAssetUrl(chartPath)
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
    manualDraft: false,
    generationPrompt: result.generationPrompt?.trim() || undefined,
    generatedAt: result.generatedAt,
    subjectLine,
    introText,
    editorialHook: result.editorialHook,
    todayQuote: result.todayQuote,
    header: buildNewsletterHeader(ticker, new Date(result.generatedAt), {
      format: result.format,
      featuredTickers: result.featuredTickers,
      subjectLine,
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

function buildBlankDraftSubjectLine(
  ticker: string,
  format: NewsletterDraftDocument['format'],
): string {
  if (format === 'market_roundup') {
    return 'Untitled market roundup'
  }

  if (ticker === BLANK_NEWSLETTER_TICKER) {
    return 'Untitled newsletter'
  }

  return `Untitled ${ticker} newsletter`
}

function buildBlankDraftHeader(
  ticker: string,
  format: NewsletterDraftDocument['format'],
  generatedAt: string,
  subjectLine: string,
): NewsletterDraftHeader {
  const fallback = buildNewsletterHeader(ticker, new Date(generatedAt), {
    format,
    featuredTickers: format === 'market_roundup' ? [] : [ticker],
    subjectLine,
  })

  return {
    ...fallback,
    title: subjectLine,
    badgeText:
      format === 'market_roundup'
        ? 'Manual Roundup'
        : ticker === BLANK_NEWSLETTER_TICKER
          ? 'Manual Draft'
          : `${ticker} Draft`,
    logoUrl: '',
    logoUrls: [],
  }
}

function buildBlankDraftStatsCard(
  format: NewsletterDraftDocument['format'],
): NewsletterDraftStatsCard | undefined {
  if (format === 'market_roundup') {
    return undefined
  }

  return {
    items: [
      { label: 'Metric 1', value: '—' },
      { label: 'Metric 2', value: '—' },
      { label: 'Metric 3', value: '—' },
    ],
  }
}

function buildBlankDraftBlocks(
  ticker: string,
  format: NewsletterDraftDocument['format'],
): NewsletterDraftBlock[] {
  const chartTicker =
    format === 'market_roundup' || ticker === BLANK_NEWSLETTER_TICKER ? 'AAPL' : ticker

  return Array.from({ length: 3 }, (_, index) => {
    const baseChartSpec: PriceNewsletterChartSpec = {
      mode: 'price',
      symbol: chartTicker,
      range: '6m',
      interval: 'D',
      chartType: 'candles',
      title: `${chartTicker} - Daily`,
      subtitle: 'Manual newsletter chart',
    }

    return {
      id: crypto.randomUUID(),
      layoutId: 'chart_plus_commentary',
      templateId: `manual_section_${index + 1}`,
      selectionReason: 'Manual blank draft starter section.',
      heading: `New section ${index + 1}`,
      body: 'Add your commentary here.',
      chartImageUrl: BLANK_DRAFT_PLACEHOLDER_CHART_URL,
      chartAlt: `${chartTicker} manual price chart`,
      chartExportUrl: '',
      chartSpec: {
        ...baseChartSpec,
        chartExportSpec: buildPriceExportEditorBaseSpec(baseChartSpec, {
          theme: 'light',
        }),
      },
      chartNeedsRegeneration: true,
    }
  })
}

function buildBlankNewsletterDraftDocument(
  ticker: string,
  options?: NewsletterOptions,
): NewsletterDraftDocument {
  const format = options?.format === 'market_roundup' ? 'market_roundup' : 'single_stock'
  const generatedAt = new Date().toISOString()
  const subjectLine = buildBlankDraftSubjectLine(ticker, format)

  return {
    ticker,
    format,
    featuredTickers: format === 'market_roundup' ? [] : [ticker],
    manualDraft: true,
    generatedAt,
    subjectLine,
    introText: '',
    header: buildBlankDraftHeader(ticker, format, generatedAt, subjectLine),
    statsCard: buildBlankDraftStatsCard(format),
    autoPickedStock: false,
    blocks: buildBlankDraftBlocks(ticker, format),
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

  const beehiivPreviewHtml = assembleNewsletterHtmlForBeehiiv(
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

  const previewYear = new Date(normalizedDraft.generatedAt).getUTCFullYear()

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(normalizedDraft.subjectLine)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #ffffff;
      color: #374151;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    a { color: #0C4A6E; }
  </style>
</head>
<body>
  <div style="min-height:100vh;background:#ffffff;padding:24px 0 56px;">
    <div style="max-width:720px;margin:0 auto;padding:0 20px;">
      <div style="width:100%;margin:0 0 16px 0;padding-left:8px;">
        <a href="#" style="font-size:13px;line-height:1.4;color:#6b7280;text-decoration:underline;">Read online</a>
      </div>

      ${beehiivPreviewHtml}

      <div style="max-width:600px;margin:0 auto;padding:28px 12px 0 12px;">
        <div style="padding-top:24px;">
          <p style="margin:0;text-align:center;font-size:13px;line-height:1.6;color:#6b7280;">
            Data sourced from SEC filings and Financial Modeling Prep. Charts generated by
            <a href="https://theintraday.com" target="_blank" style="color:#0C4A6E;">The Intraday</a>.
          </p>
        </div>

        <div style="border-top:1px solid #e5e7eb;padding-top:24px;margin-top:24px;">
          <p style="margin:0 0 12px 0;font-size:13px;line-height:1.6;color:#374151;">© ${previewYear} The Intraday</p>
          <p style="margin:0 0 12px 0;font-size:13px;line-height:1.6;color:#374151;">
            400 S 4th St Ste 410 PMB 712176<br />
            Minneapolis, MN 55415, United States
          </p>
          <a href="#" style="font-size:13px;line-height:1.6;color:#0C4A6E;text-decoration:underline;">Unsubscribe</a>
        </div>

        <div style="padding-top:24px;">
          <span style="display:inline-block;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;line-height:1;color:#374151;background:#ffffff;">
            Powered by beehiiv
          </span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
}

/**
 * Render Beehiiv-compatible HTML for a draft document.
 * This is a snippet ready to paste into Beehiiv's HTML block.
 */
export function renderNewsletterDraftBeehiivHtml(
  draft: NewsletterDraftDocument,
  publicChartBaseUrl = getDefaultPublicChartingBaseUrl(),
): string {
  const normalizedDraft = normalizeNewsletterDraftDocument(draft, publicChartBaseUrl)
  const blocks = normalizedDraft.blocks.map((block) =>
    buildNewsletterBlock(block.layoutId, {
      heading: block.heading,
      body: block.body,
      chartImageUrl: block.chartImageUrl,
      chartAlt: block.chartAlt,
      chartExportUrl: block.chartExportUrl,
      caption: block.caption,
      ctaText: block.ctaText,
      ctaUrl: block.ctaUrl,
      footer: block.footer,
    }),
  )

  return assembleNewsletterHtmlForBeehiiv(
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
  signal?: AbortSignal,
  expected?: { updatedAt: string; status: NewsletterDraftStatus },
): Promise<NewsletterDraftRecord> {
  signal?.throwIfAborted()
  if (usesLocalDraftStorage(scope)) {
    const saved = persistLocalDraftRow(
      scope,
      id,
      draft,
      status,
      publicChartBaseUrl,
      expected,
    )
    signal?.throwIfAborted()
    return saved
  }

  const normalizedDraft = normalizeNewsletterDraftDocument(draft, publicChartBaseUrl)
  const previewHtml = renderNewsletterDraftPreviewHtml(normalizedDraft, publicChartBaseUrl)
  const supabase = getServiceClient()

  const payload = {
    owner_id: scope.ownerId,
    session_id: scope.sessionId,
    ticker: normalizedDraft.ticker,
    status,
    source_type: getNewsletterDraftSourceType(normalizedDraft),
    source_review_key: getNewsletterDraftSourceReviewKey(normalizedDraft),
    beehiiv_url: normalizedDraft.publication?.beehiivUrl ?? null,
    published_at: normalizedDraft.publication?.publishedAt ?? null,
    subject_line: normalizedDraft.subjectLine,
    draft_json: normalizedDraft,
    preview_html: previewHtml,
  }

  let query

  if (id) {
    query = supabase.from(NEWSLETTER_DRAFTS_TABLE).update(payload).eq('id', id)
    if (expected) {
      query = query
        .eq('updated_at', expected.updatedAt)
        .eq('status', expected.status)
    }
    query = scope.ownerId
      ? query.eq('owner_id', scope.ownerId)
      : query.is('owner_id', null).eq('session_id', scope.sessionId)
    query = query.select('*')
  } else {
    query = supabase
      .from(NEWSLETTER_DRAFTS_TABLE)
      .insert(payload)
      .select('*')
  }

  if (signal) query = query.abortSignal(signal)
  const { data, error } = id
    ? await query.maybeSingle()
    : await query.single()

  if (error) {
    throw new Error(
      `Failed to persist newsletter draft: ${formatNewsletterDraftStorageError(error.message)}`,
    )
  }

  if (!data && id) {
    throw new NewsletterDraftConflictError(id)
  }

  return mapDraftRow(data as NewsletterDraftRow)
}

function mapDraftSummary(row: NewsletterDraftRow): NewsletterDraftSummary {
  const format = row.draft_json.format ?? 'single_stock'
  return {
    id: row.id,
    ticker: row.ticker,
    format,
    featuredTickers:
      row.draft_json.featuredTickers ??
      (format === 'market_roundup' ? [] : [row.ticker]),
    status: row.status,
    sourceType:
      row.source_type ?? getNewsletterDraftSourceType(row.draft_json),
    sourceReviewKey:
      row.source_review_key ?? getNewsletterDraftSourceReviewKey(row.draft_json),
    beehiivUrl:
      row.beehiiv_url ?? row.draft_json.publication?.beehiivUrl ?? null,
    publishedAt:
      row.published_at ?? row.draft_json.publication?.publishedAt ?? null,
    attachedChartCount:
      row.draft_json.source?.attachedChartIds.length ?? row.draft_json.blocks.length,
    subjectLine: row.subject_line,
    generatedAt: row.draft_json.generatedAt,
    blockCount: row.draft_json.blocks.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listNewsletterDrafts(
  scope: NewsletterDraftScope,
  signal?: AbortSignal,
): Promise<NewsletterDraftSummary[]> {
  signal?.throwIfAborted()
  if (usesLocalDraftStorage(scope)) {
    return listLocalDraftRows(scope).map(mapDraftSummary)
  }

  const supabase = getServiceClient()
  let query = supabase
    .from(NEWSLETTER_DRAFTS_TABLE)
    .select(
      'id, owner_id, session_id, ticker, status, source_type, source_review_key, beehiiv_url, published_at, subject_line, draft_json, created_at, updated_at',
    )
    .order('updated_at', { ascending: false })

  query = scope.ownerId
    ? query.eq('owner_id', scope.ownerId)
    : query.is('owner_id', null).eq('session_id', scope.sessionId)

  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query

  if (error) {
    throw new Error(
      `Failed to list newsletter drafts: ${formatNewsletterDraftStorageError(error.message)}`,
    )
  }

  return (data as NewsletterDraftRow[]).map(mapDraftSummary)
}

export async function getNewsletterDraft(
  scope: NewsletterDraftScope,
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<NewsletterDraftRecord> {
  options.signal?.throwIfAborted()
  if (usesLocalDraftStorage(scope)) {
    return hydrateNewsletterDraftHistory(
      scope,
      mapDraftRow(getLocalDraftRow(scope, id)),
      options.signal,
    )
  }

  const supabase = getServiceClient()
  let query = supabase.from(NEWSLETTER_DRAFTS_TABLE).select('*').eq('id', id)
  query = scope.ownerId
    ? query.eq('owner_id', scope.ownerId)
    : query.is('owner_id', null).eq('session_id', scope.sessionId)

  if (options.signal) query = query.abortSignal(options.signal)
  const { data, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NewsletterDraftNotFoundError(id)
    }
    throw new Error(
      `Failed to fetch newsletter draft: ${formatNewsletterDraftStorageError(error.message)}`,
    )
  }

  return hydrateNewsletterDraftHistory(
    scope,
    mapDraftRow(data as NewsletterDraftRow),
    options.signal,
  )
}

export async function findNewsletterDraftBySourceReviewKey(
  scope: NewsletterDraftScope,
  reviewKey: string,
  options: { signal?: AbortSignal } = {},
): Promise<NewsletterDraftRecord | null> {
  options.signal?.throwIfAborted()
  const normalizedReviewKey = reviewKey.trim()
  if (!normalizedReviewKey) return null

  if (usesLocalDraftStorage(scope)) {
    const row = listLocalDraftRows(scope).find(
      (candidate) =>
        (candidate.source_review_key ??
          getNewsletterDraftSourceReviewKey(candidate.draft_json)) ===
        normalizedReviewKey,
    )
    return row
      ? hydrateNewsletterDraftHistory(scope, mapDraftRow(row), options.signal)
      : null
  }

  const supabase = getServiceClient()
  let query = supabase
    .from(NEWSLETTER_DRAFTS_TABLE)
    .select('*')
    .eq('source_review_key', normalizedReviewKey)

  query = scope.ownerId
    ? query.eq('owner_id', scope.ownerId)
    : query.is('owner_id', null).eq('session_id', scope.sessionId)

  if (options.signal) query = query.abortSignal(options.signal)
  const { data, error } = await query.maybeSingle()
  if (error) {
    throw new Error(
      `Failed to find catalyst newsletter draft: ${formatNewsletterDraftStorageError(error.message)}`,
    )
  }
  if (!data) return null
  return hydrateNewsletterDraftHistory(
    scope,
    mapDraftRow(data as NewsletterDraftRow),
    options.signal,
  )
}

export async function createNewsletterDraftFromDocument(
  scope: NewsletterDraftScope,
  draft: NewsletterDraftDocument,
  options: {
    status?: NewsletterDraftStatus
    publicChartBaseUrl?: string
    eventMetadata?: Record<string, unknown>
    signal?: AbortSignal
  } = {},
): Promise<NewsletterDraftRecord> {
  const status = options.status ?? 'draft'
  const saved = await persistNewsletterDraftRow(
    scope,
    null,
    draft,
    status,
    options.publicChartBaseUrl,
    options.signal,
  )
  await appendNewsletterDraftEvent(scope, saved.id, {
    type: 'created',
    toStatus: status,
    beehiivUrl: saved.beehiivUrl,
    metadata: {
      sourceType: saved.sourceType,
      sourceReviewKey: saved.sourceReviewKey,
      ...(options.eventMetadata ?? {}),
    },
    signal: options.signal,
  })
  return hydrateNewsletterDraftHistory(scope, saved, options.signal)
}

export async function createNewsletterDraft(
  scope: NewsletterDraftScope,
  ticker: string | undefined,
  options?: NewsletterOptions,
): Promise<NewsletterDraftRecord> {
  const publicChartBaseUrl =
    options?.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl()
  const result = await generateNewsletterWithBackend(ticker, {
    ...options,
    // Signed-in drafts live in Supabase, so their charts must live there too.
    // Anonymous/local drafts keep the filesystem workflow used in development.
    publish: options?.publish ?? Boolean(scope.ownerId),
  })
  const draft = buildNewsletterDraftFromResult(result, publicChartBaseUrl)
  return createNewsletterDraftFromDocument(scope, draft, {
    publicChartBaseUrl,
  })
}

export async function createBlankNewsletterDraft(
  scope: NewsletterDraftScope,
  ticker: string | undefined,
  options?: NewsletterOptions,
): Promise<NewsletterDraftRecord> {
  const format = options?.format === 'market_roundup' ? 'market_roundup' : 'single_stock'
  const effectiveTicker =
    format === 'market_roundup'
      ? 'MARKET'
      : normalizeTicker(ticker ?? BLANK_NEWSLETTER_TICKER)
  const publicChartBaseUrl =
    options?.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl()
  const draft = buildBlankNewsletterDraftDocument(effectiveTicker, options)

  return createNewsletterDraftFromDocument(scope, draft, {
    publicChartBaseUrl,
  })
}

export async function saveNewsletterDraft(
  scope: NewsletterDraftScope,
  id: string,
  draft: NewsletterDraftDocument,
  status: NewsletterDraftStatus = 'draft',
  options: {
    publicChartBaseUrl?: string
    signal?: AbortSignal
    expectedUpdatedAt?: string
    protectPublished?: boolean
  } = {},
): Promise<NewsletterDraftRecord> {
  const existing = await getNewsletterDraft(scope, id, {
    signal: options.signal,
  })
  if (
    options.protectPublished &&
    existing.status === 'published'
  ) {
    return existing
  }
  if (existing.status === 'published') {
    throw new NewsletterPublishedDraftImmutableError(id)
  }
  if (
    options.expectedUpdatedAt &&
    existing.updatedAt !== options.expectedUpdatedAt
  ) {
    throw new NewsletterDraftConflictError(id)
  }

  let saved: NewsletterDraftRecord
  try {
    saved = await persistNewsletterDraftRow(
      scope,
      id,
      draft,
      status,
      options.publicChartBaseUrl,
      options.signal,
      { updatedAt: existing.updatedAt, status: existing.status },
    )
  } catch (error) {
    if (
      error instanceof NewsletterDraftConflictError &&
      options.protectPublished
    ) {
      const current = await getNewsletterDraft(scope, id, {
        signal: options.signal,
      })
      if (current.status === 'published') return current
    }
    throw error
  }

  if (existing.status !== saved.status) {
    await appendNewsletterDraftEvent(scope, id, {
      type: 'status_changed',
      fromStatus: existing.status,
      toStatus: saved.status,
      beehiivUrl: saved.beehiivUrl,
      signal: options.signal,
    })
  }

  if (existing.beehiivUrl !== saved.beehiivUrl && saved.beehiivUrl) {
    await appendNewsletterDraftEvent(scope, id, {
      type: existing.beehiivUrl
        ? 'publication_url_updated'
        : 'publication_recorded',
      fromStatus: existing.status,
      toStatus: saved.status,
      beehiivUrl: saved.beehiivUrl,
      signal: options.signal,
    })
  }

  return hydrateNewsletterDraftHistory(scope, saved, options.signal)
}

export async function deleteNewsletterDraft(
  scope: NewsletterDraftScope,
  id: string,
): Promise<void> {
  if (usesLocalDraftStorage(scope)) {
    const existing = getLocalDraftRow(scope, id)
    if (existing.status === 'published') {
      throw new NewsletterPublishedDraftImmutableError(id)
    }
    deleteLocalDraftRow(scope, id)
    return
  }

  const existing = await getNewsletterDraft(scope, id)
  if (existing.status === 'published') {
    throw new NewsletterPublishedDraftImmutableError(id)
  }
  const supabase = getServiceClient()
  let query = supabase
    .from(NEWSLETTER_DRAFTS_TABLE)
    .delete()
    .eq('id', id)
    .eq('updated_at', existing.updatedAt)
    .neq('status', 'published')
  query = scope.ownerId
    ? query.eq('owner_id', scope.ownerId)
    : query.is('owner_id', null).eq('session_id', scope.sessionId)

  const { data, error } = await query.select('id')

  if (error) {
    throw new Error(
      `Failed to delete newsletter draft: ${formatNewsletterDraftStorageError(error.message)}`,
    )
  }

  if (!Array.isArray(data) || data.length === 0) {
    const current = await getNewsletterDraft(scope, id)
    if (current.status === 'published') {
      throw new NewsletterPublishedDraftImmutableError(id)
    }
    throw new NewsletterDraftConflictError(id)
  }
}

export async function regenerateNewsletterDraft(
  scope: NewsletterDraftScope,
  id: string,
  options?: NewsletterOptions,
  concurrency: { expectedUpdatedAt?: string } = {},
): Promise<NewsletterDraftRecord> {
  const existing = await getNewsletterDraft(scope, id)
  if (existing.status === 'published') {
    throw new NewsletterPublishedDraftImmutableError(id)
  }
  if (
    concurrency.expectedUpdatedAt &&
    existing.updatedAt !== concurrency.expectedUpdatedAt
  ) {
    throw new NewsletterDraftConflictError(id)
  }
  const publicChartBaseUrl =
    options?.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl()
  const isMarketRoundup = existing.draft.format === 'market_roundup'
  const result = await generateNewsletterWithBackend(
    isMarketRoundup ? undefined : existing.ticker,
    {
      ...options,
      publish: options?.publish ?? Boolean(scope.ownerId),
      format: existing.draft.format,
      generationPrompt: options?.generationPrompt ?? existing.draft.generationPrompt,
      featuredTickers: isMarketRoundup
        ? existing.draft.featuredTickers
        : options?.featuredTickers,
    },
  )
  const generatedDraft = buildNewsletterDraftFromResult(result, publicChartBaseUrl)
  const draft: NewsletterDraftDocument = {
    ...generatedDraft,
    source: existing.draft.source,
    publication: existing.draft.publication,
  }

  return saveNewsletterDraft(scope, id, draft, 'draft', {
    publicChartBaseUrl,
    expectedUpdatedAt: concurrency.expectedUpdatedAt ?? existing.updatedAt,
    protectPublished: true,
  })
}

export async function regenerateNewsletterDraftChart(
  scope: NewsletterDraftScope,
  id: string,
  blockId: string,
  draft: NewsletterDraftDocument,
  options?: {
    chartBaseUrl?: string
    publicChartBaseUrl?: string
    width?: number
    height?: number
    expectedUpdatedAt?: string
  },
): Promise<NewsletterDraftRecord> {
  const chartBaseUrl = options?.chartBaseUrl ?? getDefaultChartingBaseUrl()
  const publicChartBaseUrl =
    options?.publicChartBaseUrl ?? getDefaultPublicChartingBaseUrl()
  const width = options?.width
  const height = options?.height
  const existing = await getNewsletterDraft(scope, id)
  if (existing.status === 'published') {
    throw new NewsletterPublishedDraftImmutableError(id)
  }
  if (
    options?.expectedUpdatedAt &&
    existing.updatedAt !== options.expectedUpdatedAt
  ) {
    throw new NewsletterDraftConflictError(id)
  }
  const normalizedDraft = normalizeNewsletterDraftDocument(draft, publicChartBaseUrl)
  const block = normalizedDraft.blocks.find((entry) => entry.id === blockId)

  if (!block) {
    throw new Error(`Draft does not contain block ${blockId}`)
  }

  const filename = `${normalizedDraft.ticker}_${block.templateId}_${toRunStamp()}_draft.png`
  const temporaryDirectory = scope.ownerId
    ? mkdtempSync(join(tmpdir(), 'fin-quote-newsletter-draft-chart-'))
    : null
  const outputDirectory = temporaryDirectory ?? resolve(NEWSLETTER_CHART_OUTPUT_DIR)
  mkdirSync(outputDirectory, { recursive: true })
  const outputPath = resolve(outputDirectory, filename)
  let chartImageUrl = `/newsletter-charts/${filename}`

  try {
    await captureChart(block.chartSpec, {
      outputPath,
      chartBaseUrl,
      width,
      height,
    })

    if (scope.ownerId) {
      const uploaded = await uploadNewsletterChartImage({
        ownerId: scope.ownerId,
        chartId: `draft-${id}-${block.id}`,
        symbol: normalizedDraft.ticker,
        outputPath,
      })
      chartImageUrl = uploaded.imageUrl
    }
  } finally {
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true })
    }
  }

  const updatedBlocks = normalizedDraft.blocks.map((entry) =>
    entry.id === blockId
      ? normalizeDraftBlock(
          {
            ...entry,
            chartImageUrl,
            chartNeedsRegeneration: false,
          },
          normalizedDraft.ticker,
          publicChartBaseUrl,
        )
      : entry,
  )

  const saved = await saveNewsletterDraft(
    scope,
    id,
    {
      ...normalizedDraft,
      blocks: updatedBlocks,
    },
    existing.status === 'ready' ? 'review' : existing.status,
    {
      publicChartBaseUrl,
      expectedUpdatedAt: options?.expectedUpdatedAt ?? existing.updatedAt,
      protectPublished: true,
    },
  )
  await appendNewsletterDraftEvent(scope, id, {
    type: 'chart_attached',
    fromStatus: existing.status,
    toStatus: saved.status,
    beehiivUrl: saved.beehiivUrl,
    metadata: {
      blockId,
      chartImageUrl: updatedBlocks.find((entry) => entry.id === blockId)
        ?.chartImageUrl,
    },
  })
  return hydrateNewsletterDraftHistory(scope, saved)
}
