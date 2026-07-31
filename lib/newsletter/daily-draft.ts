import type { NewsletterChartLibraryItem } from './chart-library'
import type {
  NewsletterDailyCandidate,
  NewsletterDailyRunItem,
} from './daily-types'
import type {
  NewsletterDraftDocument,
  NewsletterDailyBatchSource,
  PriceNewsletterChartSpec,
} from './types'

interface DailyDraftInput {
  runId: string
  itemId: string
  sourceWiimRunId: string
  marketDate: string
  candidate: NewsletterDailyCandidate | NewsletterDailyRunItem
  chart: NewsletterChartLibraryItem | null
  warning?: string | null
  generatedAt?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  const candidate = normalized.slice(0, maxLength - 3)
  const lastSpace = candidate.lastIndexOf(' ')
  return `${(lastSpace > 0 ? candidate.slice(0, lastSpace) : candidate).trim()}...`
}

function formatMarketDate(value: string): string {
  const parsed = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  }).format(parsed)
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 10 ? 2 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatMove(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'N/A'
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function readMetadata(
  candidate: NewsletterDailyCandidate | NewsletterDailyRunItem,
): Record<string, unknown> {
  return candidate.candidateMetadata ?? {}
}

function metadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function metadataNumber(
  metadata: Record<string, unknown>,
  key: string,
): number | null {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function companyName(
  candidate: NewsletterDailyCandidate | NewsletterDailyRunItem,
): string {
  if ('companyName' in candidate && candidate.companyName.trim()) {
    return candidate.companyName.trim()
  }
  return metadataString(readMetadata(candidate), 'name') ?? candidate.ticker
}

function candidatePrice(
  candidate: NewsletterDailyCandidate | NewsletterDailyRunItem,
): number | null {
  if ('price' in candidate) return candidate.price
  return metadataNumber(readMetadata(candidate), 'price')
}

function primarySource(
  candidate: NewsletterDailyCandidate | NewsletterDailyRunItem,
) {
  return (
    candidate.sourceRefs.find(
      (source) =>
        Boolean(source.url) &&
        (source.kind === 'news' || source.kind === 'finviz'),
    ) ??
    candidate.sourceRefs.find((source) => Boolean(source.url)) ??
    null
  )
}

function watchText(reasonType: string | null, ticker: string): string {
  switch (reasonType) {
    case 'earnings':
      return `Watch whether management's outlook and the first analyst revisions confirm the initial ${ticker} reaction.`
    case 'analyst_action':
      return `Watch for follow-through from other analysts and whether estimate revisions support the new valuation view.`
    case 'deal':
      return `Watch the deal timeline, financing details, and any regulatory or integration risks that could change the setup.`
    case 'capital_return':
      return `Watch the size, timing, and funding of the capital return relative to free cash flow.`
    case 'macro':
      return `Watch whether the macro move persists and whether peers confirm the same read-through.`
    default:
      return `Watch for confirming volume, follow-up company commentary, and whether the move holds through the next session.`
  }
}

function fallbackChartSpec(ticker: string): PriceNewsletterChartSpec {
  return {
    mode: 'price',
    symbol: ticker,
    range: '1m',
    interval: 'D',
    chartType: 'candles',
    title: `${ticker} 1-Month Price Action`,
  }
}

function fallbackChartImage(ticker: string): string {
  const safeTicker = escapeHtml(ticker)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#f4f4f5"/><rect x="34" y="34" width="1132" height="607" fill="#fff" stroke="#d4d4d8" stroke-width="3" stroke-dasharray="12 12"/><text x="600" y="310" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="42" font-weight="700" fill="#18181b">${safeTicker} chart pending</text><text x="600" y="366" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="25" fill="#71717a">Retry chart generation from the morning review queue.</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function toSource(
  input: DailyDraftInput,
  generatedAt: string,
): NewsletterDailyBatchSource {
  const candidate = input.candidate
  return {
    runId: input.runId,
    itemId: input.itemId,
    itemKey: `daily:${input.runId}:${candidate.ticker}`,
    sourceWiimRunId: input.sourceWiimRunId,
    marketDate: input.marketDate,
    rank: candidate.rank,
    ticker: candidate.ticker,
    headline: candidate.headline,
    summary: candidate.summaryText,
    keyFact: candidate.keyFact,
    reasonType: candidate.reasonType,
    movePercent: candidate.movePercent,
    confidenceScore: candidate.confidenceScore,
    relevanceScore: candidate.relevanceScore,
    qualityBand: candidate.qualityBand,
    sourceRefs: candidate.sourceRefs,
  }
}

export function buildDailyNewsletterDraft(
  input: DailyDraftInput,
): NewsletterDraftDocument {
  const candidate = input.candidate
  const ticker = candidate.ticker.trim().toUpperCase()
  const name = companyName(candidate)
  const price = candidatePrice(candidate)
  const move = formatMove(candidate.movePercent)
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const source = primarySource(candidate)
  const moveVerb =
    candidate.movePercent == null
      ? 'in focus'
      : candidate.movePercent >= 0
        ? `up ${Math.abs(candidate.movePercent).toFixed(1)}%`
        : `down ${Math.abs(candidate.movePercent).toFixed(1)}%`
  const subjectLine = truncate(
    `${ticker} ${moveVerb}: ${candidate.headline}`,
    118,
  )
  const summary = truncate(candidate.summaryText || candidate.headline, 420)
  const keyFact = candidate.keyFact
    ? `<p><strong>Key fact:</strong> ${escapeHtml(candidate.keyFact)}</p>`
    : ''
  const body = [
    `<p><strong>What happened:</strong> ${escapeHtml(summary)}</p>`,
    `<p><strong>Why it matters:</strong> ${escapeHtml(candidate.headline)} The stock is ${escapeHtml(move)} in the current session, putting this catalyst near the top of today's WIIM ranking.</p>`,
    keyFact,
    `<p><strong>What to watch:</strong> ${escapeHtml(watchText(candidate.reasonType, ticker))}</p>`,
  ].filter(Boolean).join('')
  const chartSpec = input.chart?.chartSpec ?? fallbackChartSpec(ticker)

  return {
    ticker,
    format: 'single_stock',
    featuredTickers: [ticker],
    source: {
      type: 'daily_batch',
      dailyBatch: toSource(input, generatedAt),
      attachedChartIds: input.chart ? [input.chart.id] : [],
      automatedAt: generatedAt,
      automationStatus: input.chart ? 'complete' : 'needs_chart',
      automationWarning: input.warning?.trim() || undefined,
    },
    generatedAt,
    subjectLine,
    introText: `${name} (${ticker}) is ${moveVerb} as investors process a fresh ${candidate.reasonType?.replace(/_/g, ' ') || 'market'} catalyst. Here is the evidence, the chart, and the next signal to watch.`,
    editorialHook: summary,
    todayQuote:
      price == null
        ? undefined
        : {
            ticker,
            name,
            price,
            change: metadataNumber(readMetadata(candidate), 'change') ?? 0,
            changesPercentage: candidate.movePercent ?? 0,
          },
    header: {
      title: `${ticker}: The Market Read`,
      dateText: formatMarketDate(input.marketDate),
      badgeText: `Daily WIIM #${candidate.rank}`,
      logoUrl: '',
      logoUrls: [],
    },
    statsCard: {
      items: [
        { label: 'Last', value: formatMoney(price) },
        { label: 'Session move', value: move },
        {
          label: 'Relevance',
          value: `${Math.round(candidate.relevanceScore)}/100`,
        },
      ],
    },
    autoPickedStock: false,
    blocks: [
      {
        id: crypto.randomUUID(),
        layoutId: 'chart_plus_commentary',
        templateId: 'daily_wiim_catalyst',
        selectionReason:
          'Selected from the full WIIM universe using freshness, catalyst strength, move size, novelty, and source depth.',
        heading: truncate(candidate.headline, 150),
        body,
        chartImageUrl:
          input.chart?.chartImageUrl ?? fallbackChartImage(ticker),
        chartAlt: `${ticker} one-month price chart`,
        chartExportUrl: input.chart?.chartExportUrl ?? '',
        chartSpec,
        chartNeedsRegeneration: !input.chart,
        caption: `${ticker} price action through ${formatMarketDate(input.marketDate)}. Source set: WIIM ranking, market data, and ${source?.kind ?? 'current catalyst'} evidence.`,
        ctaText: source?.url ? 'Read primary source' : undefined,
        ctaUrl: source?.url,
        footer:
          'For informational purposes only. Market data may be delayed.',
      },
    ],
  }
}
