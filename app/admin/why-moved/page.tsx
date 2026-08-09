import Link from 'next/link'
import { redirect } from 'next/navigation'
import WhyMovedReviewQueue, {
  type WhyMovedReviewQueueItem,
} from '@/components/WhyMovedReviewQueue'
import { getCurrentUserAdminContext } from '@/lib/auth/admin'
import {
  getMarketStatus,
  getTradingDate,
  type MarketSession,
} from '@/lib/market-hours'
import { listNewsletterDraftSummariesBySourceReviewKeys } from '@/lib/newsletter/draft-summary-read'
import { getProvider, type ProviderQuote } from '@/lib/providers'
import {
  listWhyMovedEditorialInbox,
  selectWhyMovedCandidates,
  WhyMovedReviewValidationError,
} from '@/lib/why-moved-review'
import type {
  WhyMovedEditorialInboxPage,
  WhyMovedEditorialInboxQuery,
  WhyMovedReviewStatus,
} from '@/lib/why-moved-types'

export const dynamic = 'force-dynamic'

type RawSearchParams = Record<string, string | string[] | undefined>

interface WhyMovedReviewPageProps {
  searchParams: Promise<RawSearchParams>
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CURSOR_RE = /^[A-Za-z0-9_-]{1,500}$/
const STATUSES = new Set<WhyMovedReviewStatus | 'all'>([
  'pending',
  'approved',
  'needs_work',
  'dismissed',
  'all',
])
const SESSIONS = new Set<MarketSession>([
  'premarket',
  'cash',
  'afterhours',
  'closed',
])

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function dateParam(value: string | undefined): string | undefined {
  if (!value || !DATE_RE.test(value)) return undefined
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined
}

function moverData(quotes: ProviderQuote[], session: MarketSession) {
  const movers = quotes.map((quote) => ({
    symbol: quote.symbol,
    name: quote.name,
    price: quote.price,
    change: quote.change,
    changesPercentage: quote.changesPercentage,
  }))
  return {
    premarket: movers,
    cash: movers,
    afterhours: movers,
    currentSession: session,
  }
}

async function loadCurrentCandidatesReadOnly(marketDate: string) {
  const provider = getProvider()
  const session = getMarketStatus().session
  const [gainers, losers] = await Promise.all([
    provider.getGainers().catch(() => []),
    provider.getLosers().catch(() => []),
  ])
  return selectWhyMovedCandidates(
    moverData(gainers, session),
    moverData(losers, session),
    marketDate,
  )
}

function parseInboxQuery(searchParams: RawSearchParams): {
  query: Omit<WhyMovedEditorialInboxQuery, 'currentReviewKeys'>
  filters: {
    status: WhyMovedReviewStatus | 'all' | 'inbox'
    session: MarketSession | 'all'
    marketDate: string
    dateFrom: string
    dateTo: string
    pageSize: 25 | 50 | 100
    cursor?: string
  }
} {
  const statusValue = firstParam(searchParams.status)
  const status = STATUSES.has(statusValue as WhyMovedReviewStatus | 'all')
    ? (statusValue as WhyMovedReviewStatus | 'all')
    : undefined
  const sessionValue = firstParam(searchParams.session)
  const session = SESSIONS.has(sessionValue as MarketSession)
    ? (sessionValue as MarketSession)
    : undefined
  const marketDate = dateParam(firstParam(searchParams.marketDate))
  let dateFrom = marketDate
    ? undefined
    : dateParam(firstParam(searchParams.dateFrom))
  let dateTo = marketDate
    ? undefined
    : dateParam(firstParam(searchParams.dateTo))
  if (dateFrom && dateTo && dateFrom > dateTo) {
    const originalDateFrom = dateFrom
    dateFrom = dateTo
    dateTo = originalDateFrom
  }
  const requestedPageSize = Number(firstParam(searchParams.pageSize))
  const pageSize =
    requestedPageSize === 50 || requestedPageSize === 100
      ? requestedPageSize
      : 25
  const cursorValue = firstParam(searchParams.cursor)
  const cursor =
    cursorValue && CURSOR_RE.test(cursorValue) ? cursorValue : undefined

  return {
    query: {
      status,
      session,
      marketDate,
      dateFrom,
      dateTo,
      cursor,
      pageSize,
    },
    filters: {
      status: status ?? 'inbox',
      session: session ?? 'all',
      marketDate: marketDate ?? '',
      dateFrom: dateFrom ?? '',
      dateTo: dateTo ?? '',
      pageSize,
      cursor,
    },
  }
}

async function listInboxWithSafeCursor(
  query: WhyMovedEditorialInboxQuery,
): Promise<WhyMovedEditorialInboxPage> {
  try {
    return await listWhyMovedEditorialInbox(query)
  } catch (error) {
    if (error instanceof WhyMovedReviewValidationError && query.cursor) {
      return listWhyMovedEditorialInbox({ ...query, cursor: undefined })
    }
    throw error
  }
}

export default async function WhyMovedReviewPage({
  searchParams,
}: WhyMovedReviewPageProps) {
  const { user, isAdmin } = await getCurrentUserAdminContext()
  if (!user) redirect('/auth?redirect=/admin/why-moved')
  if (!isAdmin) redirect('/dashboard/pulse-today')

  const marketDate = getTradingDate()
  const currentCandidatesPromise = loadCurrentCandidatesReadOnly(marketDate)
  // Search params may resolve after the provider. Observe the early promise now
  // so a provider failure is not reported as unhandled before its later await.
  void currentCandidatesPromise.catch(() => undefined)
  const rawSearchParams = await searchParams
  const { query: requestedQuery, filters } = parseInboxQuery(rawSearchParams)
  const globalFacetsPromise = listInboxWithSafeCursor({
    ...requestedQuery,
    status: 'all',
    cursor: undefined,
    pageSize: 1,
    currentReviewKeys: [],
  })
  // This read intentionally overlaps the provider and inbox waves. Keep the
  // original rejecting promise for propagation while marking the delayed await
  // as observed immediately.
  void globalFacetsPromise.catch(() => undefined)
  const currentCandidates = await currentCandidatesPromise
  const inboxQuery: WhyMovedEditorialInboxQuery = {
    ...requestedQuery,
    currentReviewKeys: currentCandidates.map(
      (candidate) => candidate.reviewKey,
    ),
  }
  const inboxPromise = listInboxWithSafeCursor(inboxQuery)
  const inbox = await inboxPromise

  const loadedReviewKeys = inbox.items.map(
    (item) => item.review.reviewKey,
  )
  const [globalFacets, newsletterDrafts] = await Promise.all([
    globalFacetsPromise,
    listNewsletterDraftSummariesBySourceReviewKeys(
      {
        ownerId: user.id,
      },
      loadedReviewKeys,
    ),
  ])
  const draftsByReviewKey = new Map(
    newsletterDrafts
      .filter((draft) => draft.sourceReviewKey)
      .map((draft) => [draft.sourceReviewKey!, draft]),
  )
  const items: WhyMovedReviewQueueItem[] = inbox.items.map((item) => {
    const draft = draftsByReviewKey.get(item.review.reviewKey)
    return {
      ...item,
      newsletterDraft: draft
        ? {
            id: draft.id,
            status: draft.status,
            subjectLine: draft.subjectLine,
            chartsAttached: draft.attachedChartCount,
            beehiivUrl: draft.beehiivUrl,
          }
        : null,
    }
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sage-700">
              Editorial operations
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-950">
              Why This Stock Moved
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Work the unresolved catalyst backlog using evidence captured when
              each mover entered the inbox.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Admin shortcuts">
            <Link
              href="/newsletter/editor"
              className="rounded-lg border border-sage-300 bg-sage-50 px-3 py-2 text-sm font-semibold text-sage-800 transition hover:border-sage-500"
            >
              Newsletter History
            </Link>
            <Link
              href="/dashboard/pulse-today"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800"
            >
              Pulse Today
            </Link>
            <Link
              href="/admin"
              className="rounded-lg bg-sage-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sage-800"
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-6">
        <WhyMovedReviewQueue
          initialPage={{ ...inbox, items }}
          globalTotal={globalFacets.total}
          globalStatusCounts={globalFacets.statusCounts}
          marketDate={marketDate}
          currentCandidateCount={currentCandidates.length}
          filters={filters}
          renderedAt={new Date().toISOString()}
        />
      </main>
    </div>
  )
}
