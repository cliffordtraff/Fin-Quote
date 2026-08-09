import type {
  NewsletterDailyAutomationRun,
  NewsletterDailyAutomationStage,
  NewsletterDailyAutomationStatus,
} from './daily-automation'
import type {
  NewsletterBeehiivLifecycleStatus,
  NewsletterDailyItemStatus,
  NewsletterDailyQualityBand,
  NewsletterDailyRun,
  NewsletterDailyRunItem,
  NewsletterDailyRunStatus,
  NewsletterDailySettings,
  NewsletterDailySourceRef,
} from './daily-types'

export interface PublicNewsletterMorningDelivery {
  lifecycleStatus: NewsletterBeehiivLifecycleStatus
  publishedAt: string | null
  /** Present only after Beehiiv reports the issue as published. */
  webUrl: string | null
}

export interface PublicNewsletterMorningItem {
  /** Display-only stable key; never a database, draft, chart, or provider ID. */
  key: string
  rank: number
  ticker: string
  status: NewsletterDailyItemStatus
  qualityBand: NewsletterDailyQualityBand
  relevanceScore: number
  confidenceScore: number
  movePercent: number | null
  reasonType: string | null
  headline: string
  summaryText: string
  sourceRefs: NewsletterDailySourceRef[]
  chartImageUrl: string | null
  subjectLine: string | null
  hasDraft: boolean
  delivery: PublicNewsletterMorningDelivery | null
}

export interface PublicNewsletterMorningReport {
  /** Display-only stable key; never the newsletter_daily_runs primary key. */
  key: string
  marketDate: string
  edition: 'morning'
  status: NewsletterDailyRunStatus
  targetCount: number
  sourceGeneratedAt: string | null
  selectedCount: number
  generatedCount: number
  readyCount: number
  attentionCount: number
  failedCount: number
  editorialCounts: {
    sourceCandidates: number
    currentSummaries: number
    strongSelections: number
  }
  items: PublicNewsletterMorningItem[]
}

export interface PublicNewsletterMorningAutomation {
  marketDate: string
  status: NewsletterDailyAutomationStatus
  stage: NewsletterDailyAutomationStage
  candidateCount: number
  finvizCompletedCount: number
  summaryGeneratedCount: number
  newsletterSelectedCount: number
  newsletterReadyCount: number
  startedAt: string | null
  /** Sanitized status copy; never a stored provider, model, or delivery error. */
  message: string | null
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function finiteCount(value: unknown): number {
  return Math.max(0, Math.floor(finiteNumber(value)))
}

function ipv4Octets(hostname: string): number[] | null {
  const parts = hostname.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((part) => Number(part))
  return octets.every(
    (octet, index) =>
      Number.isInteger(octet) &&
      octet >= 0 &&
      octet <= 255 &&
      String(octet) === parts[index],
  )
    ? octets
    : null
}

function isNonPublicIpv4([first, second]: number[]): boolean {
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  )
}

function embeddedIpv4(hostname: string): number[] | null {
  const match = hostname.match(
    /(?:^|[.-])(\d{1,3})[.-](\d{1,3})[.-](\d{1,3})[.-](\d{1,3})(?:[.-]|$)/,
  )
  if (!match) return null
  const octets = match.slice(1).map(Number)
  return octets.every((octet) => octet >= 0 && octet <= 255)
    ? octets
    : null
}

function isNonPublicHostname(value: string): boolean {
  const hostname = value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.arpa')
  ) {
    return true
  }

  const ipv4 = ipv4Octets(hostname)
  if (ipv4) return isNonPublicIpv4(ipv4)

  const embedded = embeddedIpv4(hostname)
  if (embedded && isNonPublicIpv4(embedded)) return true

  if (hostname.includes(':')) {
    if (
      hostname === '::' ||
      hostname === '::1' ||
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      /^fe[89ab]/.test(hostname) ||
      hostname.startsWith('2001:db8:') ||
      hostname.startsWith('::ffff:')
    ) {
      return true
    }
    // Only the allocated 2000::/3 global-unicast range is appropriate for a
    // customer-facing URL.
    return !/^[23][0-9a-f]{3}:/.test(hostname)
  }

  // A single-label host is necessarily local or ambiguous from a public
  // browser's perspective.
  return !hostname.includes('.')
}

function safePublicUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      (parsed.port && parsed.port !== '443') ||
      isNonPublicHostname(parsed.hostname)
    ) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function safePublicChartUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (trimmed?.startsWith('/') && !trimmed.startsWith('//')) {
    try {
      const parsed = new URL(trimmed, 'https://public-report.invalid')
      if (
        parsed.origin === 'https://public-report.invalid' &&
        parsed.pathname.startsWith('/newsletter-charts/') &&
        !trimmed.includes('\\') &&
        !/[\u0000-\u001f\u007f]/.test(trimmed)
      ) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`
      }
    } catch {
      return null
    }
  }
  return safePublicUrl(trimmed)
}

function projectSourceRefs(
  sourceRefs: NewsletterDailySourceRef[],
): NewsletterDailySourceRef[] {
  return sourceRefs.map((source) => {
    const url = safePublicUrl(source.url)
    return {
      kind: source.kind,
      label: source.label,
      ...(url ? { url } : {}),
      ...(source.publishedAt ? { publishedAt: source.publishedAt } : {}),
    }
  })
}

function projectDelivery(
  item: NewsletterDailyRunItem,
): PublicNewsletterMorningDelivery | null {
  const delivery = item.beehiivDelivery
  if (!delivery) return null

  const isPublished = delivery.lifecycleStatus === 'published'
  return {
    lifecycleStatus: delivery.lifecycleStatus,
    publishedAt: isPublished ? delivery.publishedAt : null,
    webUrl: isPublished ? safePublicUrl(delivery.webUrl) : null,
  }
}

function projectItem(
  marketDate: string,
  item: NewsletterDailyRunItem,
): PublicNewsletterMorningItem {
  return {
    key: `${marketDate}:${item.rank}:${item.ticker}`,
    rank: item.rank,
    ticker: item.ticker,
    status: item.status,
    qualityBand: item.qualityBand,
    relevanceScore: finiteNumber(item.relevanceScore),
    confidenceScore: finiteNumber(item.confidenceScore),
    movePercent:
      item.movePercent == null || !Number.isFinite(item.movePercent)
        ? null
        : item.movePercent,
    reasonType: item.reasonType,
    headline: item.headline,
    summaryText: item.summaryText,
    sourceRefs: projectSourceRefs(item.sourceRefs),
    chartImageUrl: safePublicChartUrl(item.chartImageUrl),
    subjectLine: item.subjectLine,
    hasDraft: Boolean(item.draftId),
    delivery: projectDelivery(item),
  }
}

/**
 * Public Morning Report is a deliberately smaller product than the operator
 * queue. Keep this projector as an allowlist: adding a field to the internal
 * database DTO must never add it to an anonymous response by accident.
 */
export function projectPublicNewsletterMorningReport(
  run: NewsletterDailyRun,
): PublicNewsletterMorningReport {
  return {
    key: `morning:${run.marketDate}`,
    marketDate: run.marketDate,
    edition: 'morning',
    status: run.status,
    targetCount: finiteCount(run.targetCount),
    sourceGeneratedAt: run.sourceGeneratedAt,
    selectedCount: finiteCount(run.selectedCount),
    generatedCount: finiteCount(run.generatedCount),
    readyCount: finiteCount(run.readyCount),
    attentionCount: finiteCount(run.attentionCount),
    failedCount: finiteCount(run.failedCount),
    editorialCounts: {
      sourceCandidates: finiteCount(run.metadata.sourceCandidateCount),
      currentSummaries: finiteCount(run.metadata.currentSummaryCount),
      strongSelections: finiteCount(run.metadata.strongCount),
    },
    items: run.items.map((item) => projectItem(run.marketDate, item)),
  }
}

export function projectPublicNewsletterMorningAutomation(
  automation: NewsletterDailyAutomationRun | null,
): PublicNewsletterMorningAutomation | null {
  if (!automation) return null

  const message =
    automation.status === 'failed'
      ? 'Morning production needs operator attention.'
      : automation.status === 'partial'
        ? 'Morning production completed with some issues needing review.'
        : null

  return {
    marketDate: automation.marketDate,
    status: automation.status,
    stage: automation.stage,
    candidateCount: finiteCount(automation.candidateCount),
    finvizCompletedCount: finiteCount(automation.finvizCompletedCount),
    summaryGeneratedCount: finiteCount(automation.summaryGeneratedCount),
    newsletterSelectedCount: finiteCount(automation.newsletterSelectedCount),
    newsletterReadyCount: finiteCount(automation.newsletterReadyCount),
    startedAt: automation.startedAt,
    message,
  }
}

export function projectPublicNewsletterMorningSettings(
  settings: NewsletterDailySettings,
): NewsletterDailySettings {
  return {
    enabled: settings.enabled,
    targetCount: finiteCount(settings.targetCount),
    timezone: settings.timezone,
    generationHour: Math.max(0, Math.min(23, finiteCount(settings.generationHour))),
  }
}

/**
 * The existing report component also serves the authenticated operator queue.
 * Hydrate the narrow public wire DTO into that component's view model only in
 * the browser; the placeholders below never cross the public API boundary.
 */
export function hydratePublicNewsletterMorningReport(
  report: PublicNewsletterMorningReport,
): NewsletterDailyRun {
  const displayTimestamp =
    report.sourceGeneratedAt ?? `${report.marketDate}T00:00:00.000Z`

  return {
    id: report.key,
    marketDate: report.marketDate,
    edition: report.edition,
    status: report.status,
    targetCount: report.targetCount,
    sourceWiimRunId: null,
    sourceGeneratedAt: report.sourceGeneratedAt,
    selectedCount: report.selectedCount,
    generatedCount: report.generatedCount,
    readyCount: report.readyCount,
    attentionCount: report.attentionCount,
    failedCount: report.failedCount,
    errorMessage: null,
    metadata: {
      sourceCandidateCount: report.editorialCounts.sourceCandidates,
      currentSummaryCount: report.editorialCounts.currentSummaries,
      strongCount: report.editorialCounts.strongSelections,
    },
    startedAt: null,
    completedAt: null,
    createdAt: displayTimestamp,
    updatedAt: displayTimestamp,
    items: report.items.map((item) => ({
      id: item.key,
      runId: report.key,
      rank: item.rank,
      ticker: item.ticker,
      status: item.status,
      qualityBand: item.qualityBand,
      relevanceScore: item.relevanceScore,
      confidenceScore: item.confidenceScore,
      candidateType: 'public-report',
      stateLabel: null,
      movePercent: item.movePercent,
      reasonType: item.reasonType,
      headline: item.headline,
      summaryText: item.summaryText,
      keyFact: null,
      sourceRefs: item.sourceRefs,
      candidateMetadata: {},
      // A display-only key preserves lifecycle/shortlist behavior without
      // putting the real draft primary key on the wire.
      draftId: item.hasDraft ? item.key : null,
      draftStatus:
        item.status === 'ready' || item.status === 'published'
          ? 'ready'
          : item.hasDraft
            ? 'draft'
            : null,
      chartId: null,
      chartImageUrl: item.chartImageUrl,
      subjectLine: item.subjectLine,
      beehiivDelivery: item.delivery
        ? {
            id: item.key,
            postId: '',
            editorUrl: '',
            previewUrl: null,
            webUrl: item.delivery.webUrl,
            lifecycleStatus: item.delivery.lifecycleStatus,
            beehiivStatus: null,
            scheduledAt: null,
            publishedAt: item.delivery.publishedAt,
            syncedAt: displayTimestamp,
            lastReconciledAt: null,
            lastReconcileError: null,
            needsSync: false,
          }
        : null,
      errorMessage: null,
      retryCount: 0,
      startedAt: null,
      completedAt: null,
      createdAt: displayTimestamp,
      updatedAt: displayTimestamp,
    })),
  }
}

export function hydratePublicNewsletterMorningAutomation(
  automation: PublicNewsletterMorningAutomation | null | undefined,
): NewsletterDailyAutomationRun | null {
  if (!automation) return null
  const displayTimestamp =
    automation.startedAt ?? `${automation.marketDate}T00:00:00.000Z`

  return {
    id: `morning:${automation.marketDate}`,
    marketDate: automation.marketDate,
    status: automation.status,
    stage: automation.stage,
    candidateSymbols: [],
    candidateCount: automation.candidateCount,
    finvizCompletedCount: automation.finvizCompletedCount,
    finvizFoundCount: 0,
    finvizErrorCount: 0,
    summaryCompletedCount: automation.summaryGeneratedCount,
    summaryGeneratedCount: automation.summaryGeneratedCount,
    summaryNoResultCount: 0,
    summaryErrorCount: 0,
    wiimRunId: null,
    newsletterScopeCount: 0,
    newsletterCompletedScopeCount: 0,
    newsletterSelectedCount: automation.newsletterSelectedCount,
    newsletterGeneratedCount: 0,
    newsletterReadyCount: automation.newsletterReadyCount,
    newsletterAttentionCount: 0,
    newsletterFailedCount: 0,
    invocationCount: 0,
    lastError: automation.message,
    notificationAppliedAt: null,
    notificationAttemptCount: 0,
    notificationLastError: null,
    metadata: {},
    startedAt: automation.startedAt,
    completedAt: null,
    lastHeartbeatAt: null,
    createdAt: displayTimestamp,
    updatedAt: displayTimestamp,
  }
}
