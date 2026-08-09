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
import {
  hasSameNewsletterDraftChartEvidence,
  isNewsletterChartCaptureCurrentForMarketDate,
  isNewsletterChartLibraryEvidenceCurrent,
  isNewsletterChartProvenanceCurrent,
} from './chart-provenance'
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
    chartProvenance: {
      version: 1,
      source: 'chart_library',
      libraryItemId: chart.id,
      capturedAt: chart.capturedAt,
      rendererContract: chart.rendererContract,
      imageUrl: chart.chartImageUrl,
      imageSha256: chart.imageSha256,
      interactiveUrl: chart.chartExportUrl,
      scene: chart.chartSpec,
      sceneSha256: chart.sceneHash,
    },
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

function isCatalystLibraryChartCurrent(
  chart: NewsletterChartLibraryItem,
  marketDate: string,
): boolean {
  return (
    isNewsletterChartCaptureCurrentForMarketDate(
      chart.capturedAt,
      marketDate,
    ) && isNewsletterChartLibraryEvidenceCurrent(chart)
  )
}

function isCatalystBlockChartCurrent(
  block: NewsletterDraftBlock,
  marketDate: string,
): boolean {
  return (
    !block.chartNeedsRegeneration &&
    block.chartProvenance?.source !== 'legacy' &&
    isNewsletterChartCaptureCurrentForMarketDate(
      block.chartProvenance?.capturedAt,
      marketDate,
    ) &&
    isNewsletterChartProvenanceCurrent(block.chartProvenance, {
      imageUrl: block.chartImageUrl,
      interactiveUrl: block.chartExportUrl,
      scene: block.chartSpec,
    })
  )
}

function mergeCatalystChartRepair(
  editedBlock: NewsletterDraftBlock,
  repairedBlock: NewsletterDraftBlock,
): NewsletterDraftBlock {
  const editedLibraryItemId =
    editedBlock.chartProvenance?.libraryItemId?.trim() ?? ''
  const repairedLibraryItemId =
    repairedBlock.chartProvenance?.libraryItemId?.trim() ?? ''
  const sameLibraryItem =
    Boolean(editedLibraryItemId) &&
    editedLibraryItemId === repairedLibraryItemId
  const editedHeadingWasCustomized =
    editedBlock.heading.trim() !== editedBlock.chartAlt.trim()

  return {
    ...repairedBlock,
    id: editedBlock.id,
    heading:
      sameLibraryItem ||
      editedBlock.templateId === 'approved_catalyst' ||
      editedHeadingWasCustomized
        ? editedBlock.heading
        : repairedBlock.heading,
    body: editedBlock.body,
    caption: sameLibraryItem
      ? editedBlock.caption ?? repairedBlock.caption
      : repairedBlock.caption,
    ctaText: editedBlock.ctaText ?? repairedBlock.ctaText,
    ctaUrl: editedBlock.ctaUrl ?? repairedBlock.ctaUrl,
    footer: editedBlock.footer ?? repairedBlock.footer,
  }
}

function reconcileCatalystRepairBlocks(
  existingBlocks: NewsletterDraftBlock[],
  repairedBlocks: NewsletterDraftBlock[],
  marketDate: string,
): NewsletterDraftBlock[] {
  const repairedByLibraryItemId = new Map<string, number>()
  repairedBlocks.forEach((block, index) => {
    const libraryItemId = block.chartProvenance?.libraryItemId?.trim()
    if (libraryItemId && !repairedByLibraryItemId.has(libraryItemId)) {
      repairedByLibraryItemId.set(libraryItemId, index)
    }
  })
  const stableRepairIndexes = new Set<number>()
  const repairAssignments = existingBlocks.map((block) => {
    const libraryItemId = block.chartProvenance?.libraryItemId?.trim()
    const repairIndex = libraryItemId
      ? repairedByLibraryItemId.get(libraryItemId)
      : undefined
    if (repairIndex == null || stableRepairIndexes.has(repairIndex)) {
      return null
    }
    stableRepairIndexes.add(repairIndex)
    return repairIndex
  })
  const assignedRepairIndexes = new Set(stableRepairIndexes)

  const assignUniqueSemanticRoles = () => {
    const unmatchedExistingByTemplate = new Map<string, number[]>()
    existingBlocks.forEach((block, index) => {
      if (
        repairAssignments[index] != null ||
        isCatalystBlockChartCurrent(block, marketDate)
      ) {
        return
      }
      const indexes = unmatchedExistingByTemplate.get(block.templateId) ?? []
      indexes.push(index)
      unmatchedExistingByTemplate.set(block.templateId, indexes)
    })
    const unmatchedRepairsByTemplate = new Map<string, number[]>()
    repairedBlocks.forEach((block, index) => {
      if (assignedRepairIndexes.has(index)) return
      const indexes = unmatchedRepairsByTemplate.get(block.templateId) ?? []
      indexes.push(index)
      unmatchedRepairsByTemplate.set(block.templateId, indexes)
    })
    for (const [templateId, existingIndexes] of unmatchedExistingByTemplate) {
      const repairIndexes = unmatchedRepairsByTemplate.get(templateId) ?? []
      if (existingIndexes.length === 1 && repairIndexes.length === 1) {
        repairAssignments[existingIndexes[0]] = repairIndexes[0]
        assignedRepairIndexes.add(repairIndexes[0])
      }
    }
  }
  assignUniqueSemanticRoles()

  const remainingExistingIndexes = existingBlocks
    .map((_block, index) => index)
    .filter(
      (index) =>
        repairAssignments[index] == null &&
        !isCatalystBlockChartCurrent(existingBlocks[index], marketDate),
    )
  const remainingRepairIndexes = repairedBlocks
    .map((_block, index) => index)
    .filter((index) => !assignedRepairIndexes.has(index))
  if (
    remainingExistingIndexes.length === 1 &&
    remainingRepairIndexes.length === 1
  ) {
    repairAssignments[remainingExistingIndexes[0]] = remainingRepairIndexes[0]
    assignedRepairIndexes.add(remainingRepairIndexes[0])
  }

  const reconciled = existingBlocks.map((editedBlock, existingIndex) => {
    const repairIndex = repairAssignments[existingIndex]
    if (repairIndex != null) {
      return mergeCatalystChartRepair(
        editedBlock,
        repairedBlocks[repairIndex],
      )
    }

    if (isCatalystBlockChartCurrent(editedBlock, marketDate)) {
      return editedBlock
    }

    return {
      ...editedBlock,
      chartNeedsRegeneration: true,
    }
  })

  repairedBlocks.forEach((block, index) => {
    if (!assignedRepairIndexes.has(index)) reconciled.push(block)
  })
  return reconciled
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
  const currentChartItems = chartItems.filter(
    (chart) =>
      isCatalystLibraryChartCurrent(chart, input.candidate.marketDate),
  )
  const attachedChartIds = currentChartItems.map((chart) => chart.id)
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
      automationStatus:
        currentChartItems.length > 0 ? 'complete' : 'needs_chart',
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
    blocks: buildCatalystBlocks(input, currentChartItems),
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
    .filter(
      (chart) =>
        chart.symbol.trim().toUpperCase() === symbol &&
        isCatalystLibraryChartCurrent(chart, input.candidate.marketDate),
    )
    .slice(0, MAX_AUTOMATIC_CHARTS)
  if (matching.length > 0) {
    return { charts: matching, generatedChart: false, warning: null }
  }

  try {
    const createChart =
      dependencies.createChart ?? createDefaultCatalystChart
    const generated = await createChart(scope, input)
    if (
      !isCatalystLibraryChartCurrent(
        generated,
        input.candidate.marketDate,
      )
    ) {
      return {
        charts: [],
        generatedChart: false,
        warning:
          'Automatic chart capture returned unverified provenance and must be retried.',
      }
    }
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

function isCompletedCatalystDraftReusable(
  draft: NewsletterDraftDocument,
): boolean {
  const source = draft.source
  return (
    source?.type === 'catalyst' &&
    source.automationStatus === 'complete' &&
    draft.blocks.length > 0 &&
    draft.blocks.every((block) =>
      isCatalystBlockChartCurrent(block, source.catalyst.marketDate),
    )
  )
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
    isCompletedCatalystDraftReusable(existing.draft)
  ) {
    return {
      draft: existing,
      created: false,
      chartsAttached:
        existing.draft.source?.attachedChartIds.length ?? 0,
      generatedChart: false,
      warning: existing.draft.source?.automationWarning ?? null,
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
    const repairedBlocks = reconcileCatalystRepairBlocks(
      existing.draft.blocks,
      draftDocument.blocks,
      input.candidate.marketDate,
    )
    const repairedChartsComplete =
      repairedBlocks.length > 0 &&
      repairedBlocks.every((block) =>
        isCatalystBlockChartCurrent(block, input.candidate.marketDate),
      )
    const attachedChartIds = Array.from(
      new Set(
        repairedBlocks
          .filter((block) =>
            isCatalystBlockChartCurrent(block, input.candidate.marketDate),
          )
          .map((block) => block.chartProvenance?.libraryItemId?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const source =
      draftDocument.source?.type === 'catalyst'
        ? {
            ...draftDocument.source,
            attachedChartIds,
            automationStatus: repairedChartsComplete
              ? ('complete' as const)
              : ('needs_chart' as const),
            automationWarning: repairedChartsComplete
              ? draftDocument.source.automationWarning
              : draftDocument.source.automationWarning ??
                'One or more catalyst charts still require recapture.',
          }
        : draftDocument.source
    const repairedDocument: NewsletterDraftDocument = {
      ...existing.draft,
      source,
      publication: existing.draft.publication,
      blocks: repairedBlocks,
    }
    const chartEvidenceChanged =
      existing.draft.blocks.length !== repairedBlocks.length ||
      existing.draft.blocks.some(
        (block, index) =>
          !repairedBlocks[index] ||
          !hasSameNewsletterDraftChartEvidence(block, repairedBlocks[index]),
      )
    draft = await saveNewsletterDraft(
      scope,
      existing.id,
      repairedDocument,
      existing.status === 'ready' && chartEvidenceChanged
        ? 'review'
        : existing.status,
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

export const __testOnly = {
  isCompletedCatalystDraftReusable,
  mergeCatalystChartRepair,
  reconcileCatalystRepairBlocks,
}
