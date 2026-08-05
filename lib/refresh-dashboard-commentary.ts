import 'server-only'

import { getCalendarSummaries } from '@/app/actions/calendar-summaries'
import { getMarketSummary } from '@/app/actions/market-summary'
import { getMarketTrendsResponses } from '@/app/actions/market-trends-responses'
import { fetchAllMarketData } from '@/lib/fetch-market-data'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export type DashboardCommentaryComponent =
  | 'marketSummary'
  | 'marketTrends'
  | 'calendar'

const DASHBOARD_COMMENTARY_COMPONENTS: DashboardCommentaryComponent[] = [
  'marketSummary',
  'marketTrends',
  'calendar',
]

interface DashboardCommentaryReadiness {
  marketSummary: {
    ready: boolean
    available: boolean
  }
  marketTrends: {
    ready: boolean
    bulletCount: number
  }
  calendar: {
    ready: boolean
    economicAvailable: boolean
    earningsAvailable: boolean
  }
}

export interface DashboardCommentaryRefreshResult {
  marketDate: string
  attempted: DashboardCommentaryComponent[]
  skippedComponents: DashboardCommentaryComponent[]
  complete: boolean
  marketSummary: {
    ready: boolean
    available: boolean
    refreshed: boolean
    error: string | null
  }
  marketTrends: {
    ready: boolean
    bulletCount: number
    refreshed: boolean
    error: string | null
  }
  calendar: {
    ready: boolean
    economicAvailable: boolean
    earningsAvailable: boolean
    refreshed: boolean
    error: string | null
  }
}

const MARKET_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function marketDateForTimestamp(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${read('year')}-${read('month')}-${read('day')}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Read persisted cache state through the service role. A failed read throws
 * instead of triggering blind regeneration: if the database cannot prove a
 * component is missing, spending another AI request would not be idempotent.
 */
export async function getDashboardCommentaryReadiness(
  marketDate: string,
): Promise<DashboardCommentaryReadiness> {
  if (!MARKET_DATE_PATTERN.test(marketDate)) {
    throw new Error(`Invalid dashboard commentary market date: ${marketDate}`)
  }

  const supabase = createServiceRoleClient()
  const [summaryResult, trendsResult, calendarResult] = await Promise.all([
    supabase
      .from('market_summary_cache')
      .select('summary, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('market_trends_cache')
      .select('bullets, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('calendar_summaries_cache')
      .select('economic_summary, earnings_summary, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const cacheErrors = [
    ['market summary', summaryResult.error],
    ['market trends', trendsResult.error],
    ['calendar summaries', calendarResult.error],
  ] as const
  const failedRead = cacheErrors.find(([, error]) => error)
  if (failedRead) {
    throw new Error(
      `Failed to read latest ${failedRead[0]} cache row: ${failedRead[1]?.message}`,
    )
  }

  const summaryIsToday =
    marketDateForTimestamp(summaryResult.data?.created_at) === marketDate
  const summaryAvailable = isNonEmptyString(summaryResult.data?.summary)
  const summaryReady = summaryIsToday && summaryAvailable

  const trendsAreToday =
    marketDateForTimestamp(trendsResult.data?.created_at) === marketDate
  const bulletCount = Array.isArray(trendsResult.data?.bullets)
    ? trendsResult.data.bullets.length
    : 0
  // The generator contract promises exactly six. Treat a partial model result
  // as retryable instead of publishing an incomplete market-trends panel.
  const trendsReady = trendsAreToday && bulletCount === 6

  const calendarIsToday =
    marketDateForTimestamp(calendarResult.data?.created_at) === marketDate
  const economicAvailable = isNonEmptyString(
    calendarResult.data?.economic_summary,
  )
  const earningsAvailable = isNonEmptyString(
    calendarResult.data?.earnings_summary,
  )
  const calendarReady =
    calendarIsToday && economicAvailable && earningsAvailable

  return {
    marketSummary: {
      ready: summaryReady,
      available: summaryReady,
    },
    marketTrends: {
      ready: trendsReady,
      bulletCount: trendsAreToday ? bulletCount : 0,
    },
    calendar: {
      ready: calendarReady,
      economicAvailable: calendarIsToday && economicAvailable,
      earningsAvailable: calendarIsToday && earningsAvailable,
    },
  }
}

/**
 * Refresh only dashboard commentary components that do not already have a
 * complete persisted row for the supplied America/New_York market date.
 * Repeated scheduler attempts therefore recover partial failures without
 * regenerating components that succeeded earlier in the same trading day.
 */
export async function refreshDashboardCommentary(input: {
  marketDate: string
}): Promise<DashboardCommentaryRefreshResult> {
  const before = await getDashboardCommentaryReadiness(input.marketDate)
  const attempted = DASHBOARD_COMMENTARY_COMPONENTS.filter(
    (component) => !before[component].ready,
  )
  const skippedComponents = DASHBOARD_COMMENTARY_COMPONENTS.filter(
    (component) => before[component].ready,
  )

  if (attempted.length === 0) {
    return {
      marketDate: input.marketDate,
      attempted,
      skippedComponents,
      complete: true,
      marketSummary: {
        ...before.marketSummary,
        refreshed: false,
        error: null,
      },
      marketTrends: {
        ...before.marketTrends,
        refreshed: false,
        error: null,
      },
      calendar: {
        ...before.calendar,
        refreshed: false,
        error: null,
      },
    }
  }

  const data = await fetchAllMarketData()
  const marketInput = {
    gainers: data.gainers.cash,
    losers: data.losers.cash,
    sectors: data.sectors,
    indices: data.sparklineIndices,
    forexBonds: data.forexBonds,
    vix: data.vix,
  }

  const [summary, trends, calendar] = await Promise.all([
    before.marketSummary.ready
      ? Promise.resolve(null)
      : getMarketSummary(
          {
            ...marketInput,
            marketNews: data.marketNews,
          },
          true,
        ),
    before.marketTrends.ready
      ? Promise.resolve(null)
      : getMarketTrendsResponses(marketInput, true),
    before.calendar.ready
      ? Promise.resolve(null)
      : getCalendarSummaries(data.economicEvents, data.earnings, true),
  ])

  // The generators await their cache writes. Read back through the service
  // role so a successful model response with a failed persistence write stays
  // retryable on the next scheduled attempt.
  const after = await getDashboardCommentaryReadiness(input.marketDate)
  const complete = DASHBOARD_COMMENTARY_COMPONENTS.every(
    (component) => after[component].ready,
  )

  return {
    marketDate: input.marketDate,
    attempted,
    skippedComponents,
    complete,
    marketSummary: {
      ...after.marketSummary,
      refreshed: !before.marketSummary.ready && after.marketSummary.ready,
      error:
        summary?.error ??
        (after.marketSummary.ready
          ? null
          : 'No complete market-summary cache row was persisted'),
    },
    marketTrends: {
      ...after.marketTrends,
      refreshed: !before.marketTrends.ready && after.marketTrends.ready,
      error:
        trends?.error ??
        (after.marketTrends.ready
          ? null
          : 'No complete market-trends cache row was persisted'),
    },
    calendar: {
      ...after.calendar,
      refreshed: !before.calendar.ready && after.calendar.ready,
      error:
        calendar?.error ??
        (after.calendar.ready
          ? null
          : 'No complete calendar-summary cache row was persisted'),
    },
  }
}
