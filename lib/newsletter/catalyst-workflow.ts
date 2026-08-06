import type { StockWhyMovingResult } from '@/lib/stock-why-moving'
import type {
  WhyMovedCandidate,
  WhyMovedReviewRecord,
} from '@/lib/why-moved-types'
import {
  listNewsletterChartLibraryItems,
  saveNewsletterChartLibraryItem,
  type NewsletterChartLibraryItem,
} from './chart-library'
import {
  appendNewsletterDraftEvent,
  createNewsletterDraftFromDocument,
  findNewsletterDraftBySourceReviewKey,
  saveNewsletterDraft,
  type NewsletterDraftScope,
} from './drafts'
import {
  getDefaultChartingBaseUrl,
  getDefaultPublicChartingBaseUrl,
} from './charting-platform-export'
import { normalizeNewsletterSubject } from './delivery-quality'
import type {
  NewsletterDraftBlock,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
  PriceNewsletterChartSpec,
} from './types'

const MAX_AUTOMATIC_CHARTS = 3

export interface ApprovedCatalystNewsletterInput {
  candidate: WhyMovedCandidate
  review: WhyMovedReviewRecord
  whyMoving: StockWhyMovingResult
}

export interface CatalystNewsletterAutomationResult {
  draft: NewsletterDraftRecord
  created: boolean
  chartsAttached: number
  generatedChart: boolean
  warning: string | null
}

interface CatalystNewsletterDependencies {
  listCharts?: (
    scope: NewsletterDraftScope,
  ) => Promise<NewsletterChartLibraryItem[]>
  createChart?: (
    scope: NewsletterDraftScope,
    input: ApprovedCatalystNewsletterInput,
  ) => Promise<NewsletterChartLibraryItem>
  now?: () => Date
  publicChartBaseUrl?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function catalystHeadline(input: ApprovedCatalystNewsletterInput): string {
  return (
    input.whyMoving.headline?.trim() ||
    input.whyMoving.displayText?.trim() ||
    `${input.candidate.symbol} is moving on a reviewed catalyst`
  )
}

function catalystSummary(input: ApprovedCatalystNewsletterInput): string {
  return (
    input.whyMoving.summary?.trim() ||
    input.whyMoving.displayText?.trim() ||
    input.review.notes.trim() ||
    `The ${input.candidate.symbol} move was reviewed and approved for editorial coverage.`
  )
}

function buildCatalystBody(input: ApprovedCatalystNewsletterInput): string {
  const paragraphs = [catalystSummary(input)]
  if (
    input.review.notes.trim() &&
    input.review.notes.trim() !== paragraphs[0]
  ) {
    paragraphs.push(`Editorial note: ${input.review.notes.trim()}`)
  }

  const paragraphHtml = paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('')
  const bullets = input.whyMoving.bulletPoints
    .map((bullet) => bullet.trim())
    .filter(Boolean)
  const bulletHtml = bullets.length
    ? `<ul>${bullets
        .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
        .join('')}</ul>`
    : ''

  return `${paragraphHtml}${bulletHtml}`
}

function formatMarketDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00`)
  if (!Number.isFinite(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function buildFallbackChartImage(symbol: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#f8f8f5"/><rect x="36" y="36" width="1128" height="603" rx="12" fill="#fff" stroke="#d1d5db" stroke-width="3" stroke-dasharray="12 12"/><text x="600" y="310" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="44" font-weight="700" fill="#1a1a1a">${escapeHtml(symbol)} chart pending</text><text x="600" y="365" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="26" fill="#6b7280">Open the chart editor to capture a final image.</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function fallbackPriceSpec(symbol: string): PriceNewsletterChartSpec {
  return {
    mode: 'price',
    symbol,
    range: '1m',
    interval: 'D',
    chartType: 'candles',
    title: `${symbol} - Catalyst Reaction`,
  }
}

function buildCatalystBlocks(
  input: ApprovedCatalystNewsletterInput,
  chartItems: NewsletterChartLibraryItem[],
): NewsletterDraftBlock[] {
  const symbol = input.candidate.symbol.trim().toUpperCase()
  const heading = catalystHeadline(input)
  const body = buildCatalystBody(input)
  const sourceName = input.whyMoving.source?.trim() || 'Reviewed source'

  if (chartItems.length === 0) {
    return [
      {
        id: crypto.randomUUID(),
        layoutId: 'chart_plus_commentary',
        templateId: 'approved_catalyst',
        selectionReason:
          'Created automatically from an approved catalyst; final chart capture is still required.',
        heading,
        body,
        chartImageUrl: buildFallbackChartImage(symbol),
        chartAlt: `${symbol} catalyst chart pending`,
        chartExportUrl: '',
        chartSpec: fallbackPriceSpec(symbol),
        chartNeedsRegeneration: true,
        caption: `${sourceName} catalyst reviewed for the ${input.candidate.session} session.`,
        ctaText: input.whyMoving.sourceUrl ? 'Read catalyst source' : undefined,
        ctaUrl: input.whyMoving.sourceUrl || undefined,
      },
    ]
  }

  return chartItems.map((chart, index) => ({
    id: crypto.randomUUID(),
    layoutId: 'chart_plus_commentary',
    templateId: index === 0 ? 'approved_catalyst' : 'catalyst_chart_context',
    selectionReason:
      'Automatically attached from the saved chart library for the approved ticker.',
    heading: index === 0 ? heading : chart.title,
    body:
      index === 0
        ? body
        : `<p>${escapeHtml(
            `Additional saved chart context for the approved ${symbol} catalyst.`,
          )}</p>`,
    chartImageUrl: chart.chartImageUrl,
    chartAlt: chart.title,
    chartExportUrl: chart.chartExportUrl,
    chartSpec: chart.chartSpec,
    chartNeedsRegeneration: false,
    caption:
      index === 0
        ? `${sourceName} catalyst with saved chart "${chart.title}".`
        : `Saved chart: ${chart.title}.`,
    ctaText:
      index === 0 && input.whyMoving.sourceUrl
        ? 'Read catalyst source'
        : undefined,
    ctaUrl:
      index === 0 && input.whyMoving.sourceUrl
        ? input.whyMoving.sourceUrl
        : undefined,
  }))
}

export function buildApprovedCatalystNewsletterDraft(
  input: ApprovedCatalystNewsletterInput,
  chartItems: NewsletterChartLibraryItem[],
  options: {
    now?: Date
    warning?: string | null
  } = {},
): NewsletterDraftDocument {
  const symbol = input.candidate.symbol.trim().toUpperCase()
  const now = options.now ?? new Date()
  const headline = catalystHeadline(input)
  const summary = catalystSummary(input)
  const attachedChartIds = chartItems.map((chart) => chart.id)
  const move = `${input.candidate.changesPercentage >= 0 ? '+' : ''}${input.candidate.changesPercentage.toFixed(2)}%`

  return {
    ticker: symbol,
    format: 'single_stock',
    featuredTickers: [symbol],
    source: {
      type: 'catalyst',
      catalyst: {
        reviewId: input.review.id,
        reviewKey: input.review.reviewKey,
        symbol,
        marketDate: input.candidate.marketDate,
        session: input.candidate.session,
        direction: input.candidate.direction,
        headline,
        summary,
        bulletPoints: input.whyMoving.bulletPoints,
        source: input.whyMoving.source,
        sourceUrl: input.whyMoving.sourceUrl,
        reviewNotes: input.review.notes,
        reviewedAt: input.review.reviewedAt,
      },
      attachedChartIds,
      automatedAt: now.toISOString(),
      automationStatus: chartItems.length > 0 ? 'complete' : 'needs_chart',
      automationWarning: options.warning?.trim() || undefined,
    },
    manualDraft: false,
    generationPrompt:
      'Automatically created from an approved Why This Stock Moved catalyst.',
    generatedAt: now.toISOString(),
    subjectLine: normalizeNewsletterSubject(`${symbol}: ${headline}`),
    introText: `${input.candidate.name} (${symbol}) is ${move} in the ${input.candidate.session.replace('cash', 'regular')} session. ${summary}`,
    editorialHook: summary,
    todayQuote: {
      ticker: symbol,
      name: input.candidate.name,
      price: input.candidate.price,
      change: input.candidate.change,
      changesPercentage: input.candidate.changesPercentage,
    },
    header: {
      title: `${symbol}: Why It Moved`,
      dateText: formatMarketDate(input.candidate.marketDate),
      badgeText: 'Approved Catalyst',
    },
    statsCard: {
      items: [
        { label: 'Session move', value: move },
        { label: 'Price', value: `$${input.candidate.price.toFixed(2)}` },
        {
          label: 'Review',
          value: input.review.status === 'approved' ? 'Approved' : input.review.status,
        },
      ],
    },
    autoPickedStock: false,
    blocks: buildCatalystBlocks(input, chartItems),
  }
}

async function createDefaultCatalystChart(
  scope: NewsletterDraftScope,
  input: ApprovedCatalystNewsletterInput,
): Promise<NewsletterChartLibraryItem> {
  const symbol = input.candidate.symbol.trim().toUpperCase()
  return saveNewsletterChartLibraryItem(
    scope,
    {
      title: `${symbol} Catalyst Reaction`,
      chartExportSpec: {
        symbol,
        range: '1m',
        interval: 'D',
        chartType: 'candles',
        theme: 'light',
        companyName: input.candidate.name,
        renderProfile: 'newsletter',
        width: 1860,
        height: 1320,
      },
    },
    {
      chartBaseUrl: getDefaultChartingBaseUrl(),
      publicChartBaseUrl: getDefaultPublicChartingBaseUrl(),
    },
  )
}

async function resolveCatalystCharts(
  scope: NewsletterDraftScope,
  input: ApprovedCatalystNewsletterInput,
  dependencies: CatalystNewsletterDependencies,
): Promise<{
  charts: NewsletterChartLibraryItem[]
  generatedChart: boolean
  warning: string | null
}> {
  const symbol = input.candidate.symbol.trim().toUpperCase()
  const listCharts =
    dependencies.listCharts ?? listNewsletterChartLibraryItems
  const allCharts = await listCharts(scope)
  const matching = allCharts
    .filter((chart) => chart.symbol.trim().toUpperCase() === symbol)
    .slice(0, MAX_AUTOMATIC_CHARTS)
  if (matching.length > 0) {
    return { charts: matching, generatedChart: false, warning: null }
  }

  try {
    const createChart =
      dependencies.createChart ?? createDefaultCatalystChart
    const generated = await createChart(scope, input)
    return { charts: [generated], generatedChart: true, warning: null }
  } catch (error) {
    return {
      charts: [],
      generatedChart: false,
      warning:
        error instanceof Error
          ? `Automatic chart capture failed: ${error.message}`
          : 'Automatic chart capture failed.',
    }
  }
}

export async function ensureApprovedCatalystNewsletterDraft(
  scope: NewsletterDraftScope,
  input: ApprovedCatalystNewsletterInput,
  dependencies: CatalystNewsletterDependencies = {},
): Promise<CatalystNewsletterAutomationResult> {
  if (input.review.status !== 'approved') {
    throw new Error('Catalyst must be approved before creating a newsletter draft')
  }

  const existing = await findNewsletterDraftBySourceReviewKey(
    scope,
    input.review.reviewKey,
  )
  if (
    existing &&
    existing.draft.source?.type === 'catalyst' &&
    existing.draft.source.automationStatus === 'complete'
  ) {
    return {
      draft: existing,
      created: false,
      chartsAttached: existing.draft.source.attachedChartIds.length,
      generatedChart: false,
      warning: existing.draft.source.automationWarning ?? null,
    }
  }

  const resolved = await resolveCatalystCharts(scope, input, dependencies)
  const now = dependencies.now?.() ?? new Date()
  const draftDocument = buildApprovedCatalystNewsletterDraft(
    input,
    resolved.charts,
    {
      now,
      warning: resolved.warning,
    },
  )

  let draft: NewsletterDraftRecord
  let created = false
  if (existing) {
    const repairedBlocks = draftDocument.blocks.map((block, index) => {
      const editedBlock = existing.draft.blocks[index]
      if (!editedBlock) return block
      return {
        ...block,
        id: editedBlock.id,
        heading: editedBlock.heading,
        body: editedBlock.body,
        caption: editedBlock.caption ?? block.caption,
        ctaText: editedBlock.ctaText ?? block.ctaText,
        ctaUrl: editedBlock.ctaUrl ?? block.ctaUrl,
        footer: editedBlock.footer ?? block.footer,
      }
    })
    const repairedDocument: NewsletterDraftDocument = {
      ...existing.draft,
      source: draftDocument.source,
      publication: existing.draft.publication,
      blocks: repairedBlocks,
    }
    draft = await saveNewsletterDraft(
      scope,
      existing.id,
      repairedDocument,
      existing.status,
      {
        publicChartBaseUrl: dependencies.publicChartBaseUrl,
        expectedUpdatedAt: existing.updatedAt,
        protectPublished: true,
      },
    )
  } else {
    let reusedConcurrentDraft = false
    draft = await createNewsletterDraftFromDocument(scope, draftDocument, {
      publicChartBaseUrl: dependencies.publicChartBaseUrl,
      eventMetadata: {
        reviewKey: input.review.reviewKey,
        chartIds: resolved.charts.map((chart) => chart.id),
        generatedChart: resolved.generatedChart,
      },
    }).catch(async (error) => {
      const concurrent = await findNewsletterDraftBySourceReviewKey(
        scope,
        input.review.reviewKey,
      )
      if (concurrent) {
        reusedConcurrentDraft = true
        return concurrent
      }
      throw error
    })
    created = !reusedConcurrentDraft
  }

  if (!existing && !created) {
    return {
      draft,
      created: false,
      chartsAttached: draft.draft.source?.attachedChartIds.length ?? 0,
      generatedChart: false,
      warning: draft.draft.source?.automationWarning ?? null,
    }
  }

  if (resolved.charts.length > 0) {
    await appendNewsletterDraftEvent(scope, draft.id, {
      type: 'chart_attached',
      fromStatus: draft.status,
      toStatus: draft.status,
      beehiivUrl: draft.beehiivUrl,
      metadata: {
        chartIds: resolved.charts.map((chart) => chart.id),
        generatedChart: resolved.generatedChart,
      },
    })
    draft =
      (await findNewsletterDraftBySourceReviewKey(
        scope,
        input.review.reviewKey,
      )) ?? draft
  }

  return {
    draft,
    created,
    chartsAttached: resolved.charts.length,
    generatedChart: resolved.generatedChart,
    warning: resolved.warning,
  }
}
