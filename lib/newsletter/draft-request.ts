import { z } from 'zod'
import type { NewsletterDraftDocument } from './types'

export const NEWSLETTER_DRAFT_FORK_MAX_REQUEST_BYTES = 1024 * 1024
export const NEWSLETTER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MAX_JSON_DEPTH = 20
const MAX_JSON_NODES = 50_000
const MAX_JSON_ARRAY_ITEMS = 1_000
const MAX_JSON_OBJECT_KEYS = 512
const MAX_JSON_KEY_LENGTH = 256
const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const shortText = (maximum = 256) => z.string().max(maximum)
const optionalText = (maximum = 256) => shortText(maximum).optional()
const nullableText = (maximum = 256) => shortText(maximum).nullable()
const finiteNumber = z.number().finite()
const timestamp = shortText(64).refine(
  (value) => Number.isFinite(Date.parse(value)),
  'must be a valid timestamp',
)
const marketDate = shortText(10).refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'must be a valid calendar date')

const boundedJsonObject = z.record(shortText(MAX_JSON_KEY_LENGTH), z.unknown())

const fundamentalsChartSpec = z
  .object({
    mode: z.literal('fundamentals').optional(),
    stocks: z.array(shortText(32)).max(20),
    metrics: z.array(shortText(128)).max(50),
    periodType: z.enum(['annual', 'quarterly']).optional(),
    minYear: z.number().int().min(1800).max(3000).optional(),
    maxYear: z.number().int().min(1800).max(3000).optional(),
    showStockPrice: z.boolean().optional(),
    chartType: z.enum(['bar', 'line', 'area']).optional(),
    showLabels: z.boolean().optional(),
    stacked: z.boolean().optional(),
    indexToZero: z.boolean().optional(),
    title: optionalText(2_000),
    subtitle: optionalText(2_000),
    colors: z.record(shortText(128), shortText(128)).optional(),
    editorState: boundedJsonObject.optional(),
  })
  .strict()

const priceChartExportSpec = z
  .object({
    symbol: shortText(32),
    interval: optionalText(32),
    range: optionalText(32),
    chartType: optionalText(32),
    theme: z.enum(['light', 'dark']).optional(),
    width: z.number().int().positive().max(20_000).optional(),
    height: z.number().int().positive().max(20_000).optional(),
    companyName: optionalText(500),
    renderProfile: optionalText(128),
  })
  .catchall(z.unknown())

const priceChartSpec = z
  .object({
    mode: z.literal('price'),
    symbol: shortText(32),
    range: z.enum(['1d', '5d', '1m', '3m', '6m', '1y', '2y', '5y']),
    interval: z.enum([
      '1sec',
      '10sec',
      '1min',
      '2min',
      '5min',
      '15min',
      '30min',
      '1hour',
      '4hour',
      'D',
      'W',
      'M',
    ]),
    chartType: z.enum([
      'candles',
      'hollow-candles',
      'ohlc-bars',
      'line',
      'heikin-ashi',
    ]),
    priceState: boundedJsonObject.optional(),
    title: optionalText(2_000),
    subtitle: optionalText(2_000),
    chartExportSpec: priceChartExportSpec.optional(),
  })
  .strict()

const chartSpec = z.union([priceChartSpec, fundamentalsChartSpec])

const chartProvenance = z
  .object({
    version: z.literal(1),
    source: z.enum([
      'generated',
      'automation',
      'chart_editor',
      'chart_library',
      'legacy',
    ]),
    libraryItemId: optionalText(128),
    capturedAt: timestamp,
    rendererContract: shortText(256),
    imageUrl: shortText(524_288),
    imageSha256: z.string().regex(/^[0-9a-f]{64}$/i).nullable(),
    interactiveUrl: shortText(16_384),
    scene: chartSpec,
    sceneSha256: z.string().regex(/^[0-9a-f]{64}$/i),
  })
  .strict()

const draftBlock = z
  .object({
    id: shortText(128).min(1),
    layoutId: shortText(128),
    templateId: shortText(128),
    selectionReason: shortText(4_000),
    heading: shortText(2_000),
    body: shortText(100_000),
    chartImageUrl: shortText(524_288),
    chartAlt: shortText(2_000),
    chartExportUrl: shortText(16_384),
    chartSpec,
    chartProvenance: chartProvenance.optional(),
    chartNeedsRegeneration: z.boolean(),
    caption: optionalText(5_000),
    ctaText: optionalText(500),
    ctaUrl: optionalText(16_384),
    footer: optionalText(10_000),
  })
  .strict()

const catalystSource = z
  .object({
    type: z.literal('catalyst'),
    catalyst: z
      .object({
        reviewId: shortText(180),
        reviewKey: shortText(180),
        symbol: shortText(32),
        marketDate,
        session: shortText(64),
        direction: z.enum(['gainer', 'loser']),
        headline: shortText(2_000),
        summary: shortText(20_000),
        bulletPoints: z.array(shortText(4_000)).max(50),
        source: nullableText(500),
        sourceUrl: shortText(16_384),
        reviewNotes: shortText(20_000),
        reviewedAt: timestamp.nullable(),
      })
      .strict(),
    attachedChartIds: z.array(shortText(128)).max(50),
    automatedAt: timestamp,
    automationStatus: z.enum(['complete', 'needs_chart']),
    automationWarning: optionalText(4_000),
  })
  .strict()

const dailyBatchSource = z
  .object({
    type: z.literal('daily_batch'),
    dailyBatch: z
      .object({
        runId: shortText(128),
        itemId: shortText(128),
        itemKey: shortText(256),
        sourceWiimRunId: shortText(128),
        marketDate,
        rank: z.number().int().min(1).max(10_000),
        ticker: shortText(32),
        companyName: optionalText(500),
        headline: shortText(2_000),
        summary: shortText(20_000),
        keyFact: nullableText(10_000),
        reasonType: nullableText(256),
        movePercent: finiteNumber.nullable(),
        confidenceScore: finiteNumber,
        relevanceScore: finiteNumber,
        qualityBand: z.enum(['strong', 'review']),
        sourceRefs: z
          .array(
            z
              .object({
                kind: shortText(128),
                label: shortText(1_000),
                url: optionalText(16_384),
                publishedAt: optionalText(64),
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
    attachedChartIds: z.array(shortText(128)).max(50),
    automatedAt: timestamp,
    automationStatus: z.enum(['complete', 'needs_chart']),
    automationWarning: optionalText(4_000),
  })
  .strict()

const stockNewsItem = z
  .object({
    title: shortText(2_000),
    text: shortText(20_000),
    url: shortText(16_384),
    publishedDate: shortText(64),
    site: shortText(500),
  })
  .strict()

const stockPickerResult = z
  .object({
    ticker: shortText(32),
    name: shortText(500),
    changesPercentage: finiteNumber,
    editorialHook: shortText(20_000),
    topHeadlines: z.array(stockNewsItem).max(50),
    pickSource: z
      .enum(['earnings', 'big_mover', 'news_catalyst', 'fallback'])
      .optional(),
    subjectLine: shortText(1_000),
  })
  .strict()

const newsletterDraftDocument = z
  .object({
    ticker: shortText(32).min(1),
    format: z.enum(['single_stock', 'market_roundup']),
    featuredTickers: z.array(shortText(32)).max(50),
    source: z.discriminatedUnion('type', [catalystSource, dailyBatchSource]).optional(),
    publication: z
      .object({
        beehiivUrl: nullableText(16_384),
        publishedAt: nullableText(64),
      })
      .strict()
      .optional(),
    manualDraft: z.boolean().optional(),
    generationPrompt: optionalText(500),
    generatedAt: timestamp,
    subjectLine: shortText(1_000),
    introText: shortText(20_000),
    editorialHook: optionalText(20_000),
    todayQuote: z
      .object({
        ticker: shortText(32),
        name: shortText(500),
        price: finiteNumber,
        change: finiteNumber,
        changesPercentage: finiteNumber,
        marketCap: finiteNumber.optional(),
        pe: finiteNumber.optional(),
        yearHigh: finiteNumber.optional(),
        yearLow: finiteNumber.optional(),
        ytdReturn: finiteNumber.optional(),
      })
      .strict()
      .optional(),
    header: z
      .object({
        title: shortText(1_000),
        dateText: shortText(500),
        badgeText: shortText(500),
        logoUrl: optionalText(16_384),
        logoUrls: z.array(shortText(16_384)).max(20).optional(),
      })
      .strict()
      .optional(),
    statsCard: z
      .object({
        items: z
          .array(
            z
              .object({
                label: shortText(500),
                value: shortText(2_000),
              })
              .strict(),
          )
          .max(10),
      })
      .strict()
      .optional(),
    autoPickedStock: z.boolean(),
    stockPickerResult: stockPickerResult.optional(),
    blocks: z.array(draftBlock).max(50),
  })
  .strict()

const newsletterDraftForkRequest = z
  .object({
    draft: newsletterDraftDocument,
    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
  })
  .strict()

export class NewsletterDraftInputValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NewsletterDraftInputValidationError'
  }
}

export function isNewsletterUuid(value: unknown): value is string {
  return typeof value === 'string' && NEWSLETTER_UUID_PATTERN.test(value)
}

function assertBoundedJsonStructure(value: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  let nodeCount = 0

  while (pending.length > 0) {
    const current = pending.pop()!
    nodeCount += 1
    if (nodeCount > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) {
      throw new NewsletterDraftInputValidationError(
        'Newsletter draft JSON is too complex.',
      )
    }

    if (Array.isArray(current.value)) {
      if (current.value.length > MAX_JSON_ARRAY_ITEMS) {
        throw new NewsletterDraftInputValidationError(
          'Newsletter draft JSON contains too many array items.',
        )
      }
      for (const item of current.value) {
        pending.push({ value: item, depth: current.depth + 1 })
      }
      continue
    }

    if (current.value && typeof current.value === 'object') {
      const entries = Object.entries(current.value)
      if (entries.length > MAX_JSON_OBJECT_KEYS) {
        throw new NewsletterDraftInputValidationError(
          'Newsletter draft JSON contains too many object fields.',
        )
      }
      for (const [key, item] of entries) {
        if (
          key.length > MAX_JSON_KEY_LENGTH ||
          FORBIDDEN_JSON_KEYS.has(key)
        ) {
          throw new NewsletterDraftInputValidationError(
            'Newsletter draft JSON contains an invalid object field.',
          )
        }
        pending.push({ value: item, depth: current.depth + 1 })
      }
    }
  }
}

async function readBoundedRequestBody(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > NEWSLETTER_DRAFT_FORK_MAX_REQUEST_BYTES
  ) {
    throw new NewsletterDraftInputValidationError(
      'Newsletter draft request is too large.',
    )
  }

  const reader = request.body?.getReader()
  if (!reader) {
    throw new NewsletterDraftInputValidationError(
      'Newsletter draft request must be valid JSON.',
    )
  }

  const decoder = new TextDecoder()
  let totalBytes = 0
  let serialized = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > NEWSLETTER_DRAFT_FORK_MAX_REQUEST_BYTES) {
      await reader.cancel()
      throw new NewsletterDraftInputValidationError(
        'Newsletter draft request is too large.',
      )
    }
    serialized += decoder.decode(value, { stream: true })
  }
  return serialized + decoder.decode()
}

export async function parseNewsletterDraftForkRequest(request: Request): Promise<{
  draft: NewsletterDraftDocument
  idempotencyKey: string
}> {
  const mediaType =
    request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  if (mediaType !== 'application/json') {
    throw new NewsletterDraftInputValidationError(
      'Content-Type must be application/json.',
    )
  }

  const serialized = await readBoundedRequestBody(request)
  let input: unknown
  try {
    input = JSON.parse(serialized)
  } catch {
    throw new NewsletterDraftInputValidationError(
      'Newsletter draft request must be valid JSON.',
    )
  }

  assertBoundedJsonStructure(input)
  const parsed = newsletterDraftForkRequest.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path.length ? `${issue.path.join('.')}: ` : ''
    throw new NewsletterDraftInputValidationError(
      `Invalid newsletter draft request. ${field}${issue?.message ?? ''}`.trim(),
    )
  }

  return parsed.data as {
    draft: NewsletterDraftDocument
    idempotencyKey: string
  }
}
