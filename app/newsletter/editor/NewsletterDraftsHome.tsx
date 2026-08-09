'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import type {
  NewsletterDraftArchiveFacets,
  NewsletterDraftArchivePage,
  NewsletterDraftArchiveVisibility,
  NewsletterDraftStatus,
  NewsletterDraftSummary,
} from '@/lib/newsletter/types'
import {
  getNewsletterWorkflowStage,
  NEWSLETTER_WORKFLOW_STAGES,
} from '@/lib/newsletter/workflow'

const PAGE_SIZE = 25
const SEARCH_DEBOUNCE_MS = 350
const MAX_BULK_SELECTION = 100

interface ArchiveFilters {
  search: string
  status: NewsletterDraftStatus | 'all'
  ticker: string
  from: string
  to: string
  visibility: NewsletterDraftArchiveVisibility
}

interface PendingBulkAction {
  action: 'archive' | 'restore'
  issues: NewsletterDraftSummary[]
  idempotencyKey: string
}

interface BulkArchiveResponse {
  results?: Array<{
    id: string
    archivedAt: string | null
    updatedAt: string
    changed: boolean
  }>
  error?: string
  code?: string
}

interface LoadError {
  kind: 'initial' | 'more'
  message: string
}

const DEFAULT_FILTERS: ArchiveFilters = {
  search: '',
  status: 'all',
  ticker: '',
  from: '',
  to: '',
  visibility: 'active',
}

const EMPTY_FACETS: NewsletterDraftArchiveFacets = {
  statuses: {
    draft: 0,
    review: 0,
    ready: 0,
    published: 0,
  },
  active: 0,
  archived: 0,
}

const VALID_STATUSES = new Set<NewsletterDraftStatus>([
  'draft',
  'review',
  'ready',
  'published',
])

function isNewsletterStatus(value: string | null): value is NewsletterDraftStatus {
  return Boolean(value && VALID_STATUSES.has(value as NewsletterDraftStatus))
}

function isArchiveVisibility(
  value: string | null,
): value is NewsletterDraftArchiveVisibility {
  return value === 'active' || value === 'archived' || value === 'all'
}

function normalizeDateFilter(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

function readFilters(params: URLSearchParams): ArchiveFilters {
  const status = params.get('status')
  const visibility = params.get('archive')

  return {
    search: params.get('q')?.trim() ?? '',
    status: isNewsletterStatus(status) ? status : 'all',
    ticker: params.get('ticker')?.trim().toUpperCase() ?? '',
    from: normalizeDateFilter(params.get('from')),
    to: normalizeDateFilter(params.get('to')),
    visibility: isArchiveVisibility(visibility) ? visibility : 'active',
  }
}

function filtersEqual(left: ArchiveFilters, right: ArchiveFilters): boolean {
  return (
    left.search === right.search &&
    left.status === right.status &&
    left.ticker === right.ticker &&
    left.from === right.from &&
    left.to === right.to &&
    left.visibility === right.visibility
  )
}

function setOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string,
  defaultValue = '',
) {
  if (value && value !== defaultValue) {
    params.set(key, value)
  } else {
    params.delete(key)
  }
}

function filtersToUrlParams(
  filters: ArchiveFilters,
  currentParams: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(currentParams)
  setOptionalParam(params, 'q', filters.search)
  setOptionalParam(params, 'status', filters.status, 'all')
  setOptionalParam(params, 'ticker', filters.ticker)
  setOptionalParam(params, 'from', filters.from)
  setOptionalParam(params, 'to', filters.to)
  setOptionalParam(params, 'archive', filters.visibility, 'active')
  params.delete('cursor')
  return params
}

function buildArchiveRequestUrl(filters: ArchiveFilters, cursor?: string): string {
  const params = new URLSearchParams()
  setOptionalParam(params, 'q', filters.search)
  setOptionalParam(params, 'status', filters.status, 'all')
  setOptionalParam(params, 'ticker', filters.ticker)
  setOptionalParam(params, 'from', filters.from)
  setOptionalParam(params, 'to', filters.to)
  params.set('archive', filters.visibility)
  params.set('limit', String(PAGE_SIZE))
  if (cursor) params.set('cursor', cursor)
  return `/api/newsletter/drafts?${params.toString()}`
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatIssueDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return `${formatted} UTC`
}

function createIdempotencyKey(action: 'archive' | 'restore'): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  return randomId
    ? `newsletter-${action}-${randomId}`
    : `newsletter-${action}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    throw new Error('The newsletter archive returned an unreadable response.')
  }
}

function EmptyArchiveState({
  filters,
  onClear,
  onViewActive,
}: {
  filters: ArchiveFilters
  onClear: () => void
  onViewActive: () => void
}) {
  const hasMatchFilters = Boolean(
    filters.search ||
      filters.status !== 'all' ||
      filters.ticker ||
      filters.from ||
      filters.to,
  )

  if (hasMatchFilters) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center">
        <h3 className="text-base font-semibold text-gray-900">
          No issues match these filters
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          Try a broader date range, another ticker, or clear the filters.
        </p>
        <button
          type="button"
          onClick={onClear}
          className="mt-4 inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-100"
        >
          Clear filters
        </button>
      </div>
    )
  }

  if (filters.visibility === 'archived') {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center">
        <h3 className="text-base font-semibold text-gray-900">
          Archive is empty
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          Archived issues will stay recoverable here.
        </p>
        <button
          type="button"
          onClick={onViewActive}
          className="mt-4 inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-100"
        >
          View active issues
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center">
      <h3 className="text-base font-semibold text-gray-900">
        {filters.visibility === 'all'
          ? 'No newsletter issues yet'
          : 'No active issues yet'}
      </h3>
      <p className="mt-2 text-sm text-gray-600">
        Create a draft to start your newsletter history.
      </p>
      <Link
        href="/newsletter/editor/new"
        className="mt-4 inline-flex rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sage-800"
      >
        Create a draft
      </Link>
    </div>
  )
}

export default function NewsletterDraftsHome() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()
  const [filters, setFilters] = useState<ArchiveFilters>(() =>
    readFilters(new URLSearchParams(searchParamsString)),
  )
  const [searchInput, setSearchInput] = useState(
    () => readFilters(new URLSearchParams(searchParamsString)).search,
  )
  const [tickerInput, setTickerInput] = useState(
    () => readFilters(new URLSearchParams(searchParamsString)).ticker,
  )
  const [pages, setPages] = useState<NewsletterDraftSummary[][]>([])
  const [total, setTotal] = useState(0)
  const [facets, setFacets] = useState<NewsletterDraftArchiveFacets>(EMPTY_FACETS)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<LoadError | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('Loading newsletter issues…')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingBulkAction, setPendingBulkAction] =
    useState<PendingBulkAction | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkConflict, setBulkConflict] = useState(false)
  const [submittingBulkAction, setSubmittingBulkAction] = useState(false)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const requestControllerRef = useRef<AbortController | null>(null)
  const requestSequenceRef = useRef(0)
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const cancelDialogButtonRef = useRef<HTMLButtonElement | null>(null)
  const bulkDialogRef = useRef<HTMLDivElement | null>(null)
  const bulkActionTriggerRef = useRef<HTMLElement | null>(null)
  const newsletterHistoryHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const submittingBulkActionRef = useRef(false)
  const pendingUrlParamsRef = useRef<string | null>(null)
  const skipNextUrlWriteRef = useRef(false)

  const loadedDrafts = useMemo(() => pages.flat(), [pages])
  const selectableLoadedDrafts = useMemo(
    () => loadedDrafts.slice(0, MAX_BULK_SELECTION),
    [loadedDrafts],
  )
  const selectedDrafts = useMemo(
    () => loadedDrafts.filter((draft) => selectedIds.has(draft.id)),
    [loadedDrafts, selectedIds],
  )
  const selectedActiveDrafts = useMemo(
    () => selectedDrafts.filter((draft) => !draft.archivedAt),
    [selectedDrafts],
  )
  const selectedArchivedDrafts = useMemo(
    () => selectedDrafts.filter((draft) => Boolean(draft.archivedAt)),
    [selectedDrafts],
  )
  const allLoadedSelected =
    selectableLoadedDrafts.length > 0 &&
    selectableLoadedDrafts.every((draft) => selectedIds.has(draft.id))
  const someLoadedSelected = loadedDrafts.some((draft) => selectedIds.has(draft.id))
  const hasAnyFilters = Boolean(
    filters.search ||
      filters.status !== 'all' ||
      filters.ticker ||
      filters.from ||
      filters.to ||
      filters.visibility !== 'active',
  )
  const allStatusCount = Object.values(facets.statuses).reduce(
    (sum, count) => sum + count,
    0,
  )

  useEffect(() => {
    if (pendingUrlParamsRef.current === searchParamsString) {
      pendingUrlParamsRef.current = null
      return
    }

    pendingUrlParamsRef.current = null
    skipNextUrlWriteRef.current = true
    const nextFilters = readFilters(new URLSearchParams(searchParamsString))
    setFilters((current) =>
      filtersEqual(current, nextFilters) ? current : nextFilters,
    )
    setSearchInput(nextFilters.search)
    setTickerInput(nextFilters.ticker)
  }, [searchParamsString])

  useEffect(() => {
    if (skipNextUrlWriteRef.current) {
      skipNextUrlWriteRef.current = false
      return
    }

    const currentParams = new URLSearchParams(searchParamsString)
    const nextParams = filtersToUrlParams(filters, currentParams)
    const nextParamsString = nextParams.toString()
    if (nextParamsString === searchParamsString) return

    pendingUrlParamsRef.current = nextParamsString
    router.replace(
      nextParamsString ? `${pathname}?${nextParamsString}` : pathname,
      { scroll: false },
    )
  }, [filters, pathname, router, searchParamsString])

  useEffect(() => {
    if (searchInput === filters.search) return

    const timeout = window.setTimeout(() => {
      setFilters((current) => ({
        ...current,
        search: searchInput.trim(),
      }))
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeout)
  }, [filters.search, searchInput])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        someLoadedSelected && !allLoadedSelected
    }
  }, [allLoadedSelected, someLoadedSelected])

  useEffect(() => {
    const controller = new AbortController()
    requestControllerRef.current?.abort()
    requestControllerRef.current = controller
    const sequence = ++requestSequenceRef.current

    setLoading(true)
    setLoadingMore(false)
    setLoadError(null)
    setPages([])
    setTotal(0)
    setFacets(EMPTY_FACETS)
    setNextCursor(null)
    setHasMore(false)
    setSelectedIds(new Set())
    setAnnouncement('Loading newsletter issues…')

    async function loadFirstPage() {
      try {
        const response = await fetch(buildArchiveRequestUrl(filters), {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = await readJsonResponse<
          NewsletterDraftArchivePage & { error?: string }
        >(response)

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load newsletter issues.')
        }
        if (!Array.isArray(payload.drafts) || !payload.facets) {
          throw new Error('The newsletter archive response was incomplete.')
        }
        if (sequence !== requestSequenceRef.current) return

        setPages([payload.drafts])
        setTotal(payload.total)
        setFacets(payload.facets)
        setNextCursor(payload.nextCursor)
        setHasMore(payload.hasMore)
        setAnnouncement(
          payload.total === 0
            ? 'No newsletter issues found.'
            : `Loaded ${payload.drafts.length} of ${payload.total} newsletter ${
                payload.total === 1 ? 'issue' : 'issues'
              }.`,
        )
      } catch (error) {
        if (controller.signal.aborted || sequence !== requestSequenceRef.current) {
          return
        }
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load newsletter issues.'
        setLoadError({ kind: 'initial', message })
        setAnnouncement('Newsletter issues could not be loaded.')
      } finally {
        if (sequence === requestSequenceRef.current) {
          setLoading(false)
        }
      }
    }

    void loadFirstPage()
    return () => controller.abort()
  }, [filters, refreshNonce])

  useEffect(() => {
    if (!pendingBulkAction) return

    const trigger = bulkActionTriggerRef.current
    const fallback = newsletterHistoryHeadingRef.current
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => {
      cancelDialogButtonRef.current?.focus()
    })

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submittingBulkActionRef.current) {
        setPendingBulkAction(null)
        setBulkError(null)
        setBulkConflict(false)
        return
      }
      if (event.key !== 'Tab') return

      const dialog = bulkDialogRef.current
      if (!dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
      if (trigger?.isConnected) {
        trigger.focus()
      } else {
        fallback?.focus()
      }
    }
  }, [pendingBulkAction])

  function clearFilters() {
    setSearchInput('')
    setTickerInput('')
    setFilters(DEFAULT_FILTERS)
  }

  function clearSearch() {
    setSearchInput('')
    setFilters((current) => ({ ...current, search: '' }))
  }

  function applyTicker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ticker = tickerInput.trim().toUpperCase()
    setTickerInput(ticker)
    setFilters((current) => ({ ...current, ticker }))
  }

  function toggleDraft(draftId: string) {
    if (!selectedIds.has(draftId) && selectedIds.size >= MAX_BULK_SELECTION) {
      const message = `Bulk actions support up to ${MAX_BULK_SELECTION} issues at a time.`
      setNotice(message)
      setAnnouncement(message)
      return
    }
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(draftId)) next.delete(draftId)
      else next.add(draftId)
      return next
    })
  }

  function toggleAllLoaded() {
    if (allLoadedSelected) {
      setSelectedIds((current) => {
        const next = new Set(current)
        for (const draft of selectableLoadedDrafts) next.delete(draft.id)
        return next
      })
      return
    }

    setSelectedIds(
      new Set(selectableLoadedDrafts.map((draft) => draft.id)),
    )
    if (loadedDrafts.length > MAX_BULK_SELECTION) {
      const message = `Selected the first ${MAX_BULK_SELECTION} loaded issues. Run this bulk action, then select the next group.`
      setNotice(message)
      setAnnouncement(message)
    }
  }

  function openBulkConfirmation(
    action: 'archive' | 'restore',
    issues: NewsletterDraftSummary[],
    trigger: HTMLElement,
  ) {
    bulkActionTriggerRef.current = trigger
    setBulkError(null)
    setBulkConflict(false)
    setPendingBulkAction({
      action,
      issues,
      idempotencyKey: createIdempotencyKey(action),
    })
  }

  async function loadNextPage() {
    if (!nextCursor || loadingMore) return

    const cursor = nextCursor
    const controller = new AbortController()
    requestControllerRef.current?.abort()
    requestControllerRef.current = controller
    const sequence = ++requestSequenceRef.current
    setLoadingMore(true)
    setLoadError(null)
    setAnnouncement('Loading more newsletter issues…')

    try {
      const response = await fetch(buildArchiveRequestUrl(filters, cursor), {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const payload = await readJsonResponse<
        NewsletterDraftArchivePage & { error?: string }
      >(response)

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load more newsletter issues.')
      }
      if (!Array.isArray(payload.drafts) || !payload.facets) {
        throw new Error('The newsletter archive response was incomplete.')
      }
      if (sequence !== requestSequenceRef.current) return

      const existingIds = new Set(loadedDrafts.map((draft) => draft.id))
      const uniqueDrafts = payload.drafts.filter(
        (draft) => !existingIds.has(draft.id),
      )
      const loadedCount = loadedDrafts.length + uniqueDrafts.length
      setPages((currentPages) => [...currentPages, uniqueDrafts])
      setAnnouncement(
        `Loaded ${loadedCount} of ${payload.total} newsletter issues.`,
      )
      setTotal(payload.total)
      setFacets(payload.facets)
      setNextCursor(payload.nextCursor)
      setHasMore(payload.hasMore)
    } catch (error) {
      if (controller.signal.aborted || sequence !== requestSequenceRef.current) {
        return
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to load more newsletter issues.'
      setLoadError({ kind: 'more', message })
      setAnnouncement('More newsletter issues could not be loaded.')
    } finally {
      if (sequence === requestSequenceRef.current) {
        setLoadingMore(false)
      }
    }
  }

  async function submitBulkAction() {
    if (!pendingBulkAction || submittingBulkAction) return

    submittingBulkActionRef.current = true
    setSubmittingBulkAction(true)
    setBulkError(null)
    setNotice(null)
    const { action, issues, idempotencyKey } = pendingBulkAction

    try {
      const response = await fetch('/api/newsletter/drafts/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          items: issues.map((issue) => ({
            id: issue.id,
            expectedUpdatedAt: issue.updatedAt,
          })),
          idempotencyKey,
        }),
      })
      const payload = await readJsonResponse<BulkArchiveResponse>(response)
      if (!response.ok) {
        const message =
          payload.error || `Failed to ${action} the selected newsletter issues.`
        setBulkError(message)
        setBulkConflict(payload.code === 'draft_conflict')
        setAnnouncement(
          payload.code === 'draft_conflict'
            ? 'The selected issues changed and must be refreshed.'
            : `The selected issues could not be ${action}d.`,
        )
        return
      }
      const resultIds = new Set(payload.results?.map((result) => result.id))
      if (
        !Array.isArray(payload.results) ||
        payload.results.length !== issues.length ||
        issues.some((issue) => !resultIds.has(issue.id))
      ) {
        throw new Error('The newsletter archive response was incomplete.')
      }

      const count = issues.length
      const pastTense = action === 'archive' ? 'Archived' : 'Restored'
      const nextNotice = `${pastTense} ${count} newsletter ${
        count === 1 ? 'issue' : 'issues'
      }.${
        action === 'archive'
          ? ' You can restore them from Archived.'
          : ' They are active again.'
      }`
      setPendingBulkAction(null)
      setBulkConflict(false)
      setSelectedIds(new Set())
      setNotice(nextNotice)
      setAnnouncement(nextNotice)
      setRefreshNonce((current) => current + 1)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to ${action} the selected newsletter issues.`
      setBulkError(message)
      setBulkConflict(false)
      setAnnouncement(`The selected issues could not be ${action}d.`)
    } finally {
      submittingBulkActionRef.current = false
      setSubmittingBulkAction(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <div
        className="space-y-6"
        inert={pendingBulkAction ? true : undefined}
        aria-hidden={pendingBulkAction ? true : undefined}
      >
      <section className="rounded-2xl border border-gray-300 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 border-b border-gray-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1
              ref={newsletterHistoryHeadingRef}
              tabIndex={-1}
              className="text-lg font-semibold text-gray-900 outline-none"
            >
              Newsletter History
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Find, edit, archive, and restore every issue in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/newsletter/morning-review"
              className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
            >
              Morning queue
            </Link>
            <Link
              href="/newsletter/charts"
              className="inline-flex items-center justify-center rounded-xl border border-sage-700 px-4 py-2 text-sm font-semibold text-sage-800 transition hover:bg-sage-50"
            >
              Chart library
            </Link>
            <Link
              href="/newsletter/editor/new"
              className="inline-flex items-center justify-center rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sage-800"
            >
              New draft
            </Link>
          </div>
        </div>

        <fieldset className="mt-5 rounded-2xl border border-gray-200 bg-cream-100 p-4">
          <legend className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-600">
            Filter issues
          </legend>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <label
                htmlFor="newsletter-search"
                className="block text-xs font-semibold text-gray-700"
              >
                Search
              </label>
              <div className="mt-1 flex rounded-xl border border-gray-300 bg-white focus-within:border-sage-500 focus-within:ring-2 focus-within:ring-sage-500/20">
                <input
                  id="newsletter-search"
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Subject, ticker, or featured ticker"
                  className="min-w-0 flex-1 rounded-xl border-0 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400"
                />
                {searchInput ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="px-3 text-xs font-semibold text-gray-600 hover:text-gray-900"
                    aria-label="Clear search"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            <div className="lg:col-span-3">
              <label
                htmlFor="newsletter-status"
                className="block text-xs font-semibold text-gray-700"
              >
                Status
              </label>
              <select
                id="newsletter-status"
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value as NewsletterDraftStatus | 'all',
                  }))
                }
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
              >
                <option value="all">All statuses ({allStatusCount})</option>
                {NEWSLETTER_WORKFLOW_STAGES.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.shortLabel} ({facets.statuses[stage.id]})
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-4">
              <label
                htmlFor="newsletter-visibility"
                className="block text-xs font-semibold text-gray-700"
              >
                Archive visibility
              </label>
              <select
                id="newsletter-visibility"
                value={filters.visibility}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    visibility: event.target
                      .value as NewsletterDraftArchiveVisibility,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
              >
                <option value="active">Active ({facets.active})</option>
                <option value="archived">Archived ({facets.archived})</option>
                <option value="all">
                  Active and archived ({facets.active + facets.archived})
                </option>
              </select>
            </div>

            <form
              onSubmit={applyTicker}
              className="lg:col-span-4"
              aria-label="Apply ticker filter"
            >
              <label
                htmlFor="newsletter-ticker"
                className="block text-xs font-semibold text-gray-700"
              >
                Primary or featured ticker
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="newsletter-ticker"
                  value={tickerInput}
                  onChange={(event) => setTickerInput(event.target.value.toUpperCase())}
                  placeholder="e.g. AAPL"
                  autoCapitalize="characters"
                  maxLength={12}
                  className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm uppercase text-gray-900 outline-none placeholder:normal-case placeholder:text-gray-400 focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                />
                <button
                  type="submit"
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Apply
                </button>
              </div>
            </form>

            <div className="lg:col-span-3">
              <label
                htmlFor="newsletter-from"
                className="block text-xs font-semibold text-gray-700"
              >
                Issue date from (UTC)
              </label>
              <input
                id="newsletter-from"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
              />
            </div>

            <div className="lg:col-span-3">
              <label
                htmlFor="newsletter-to"
                className="block text-xs font-semibold text-gray-700"
              >
                Issue date to (UTC)
              </label>
              <input
                id="newsletter-to"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
              />
            </div>

            <div className="flex items-end lg:col-span-2">
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasAnyFilters && !searchInput && !tickerInput}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset filters
              </button>
            </div>
          </div>
        </fieldset>

        {filters.visibility === 'archived' ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You are viewing archived issues. They remain available to open and can
            be restored at any time.
          </div>
        ) : null}

        {notice ? (
          <div className="mt-4 rounded-2xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-800">
            {notice}
          </div>
        ) : null}

        {!loading && loadedDrafts.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allLoadedSelected}
                onChange={toggleAllLoaded}
                className="h-4 w-4 rounded border-gray-300 text-sage-700 focus:ring-sage-500"
                aria-label={
                  loadedDrafts.length > MAX_BULK_SELECTION
                    ? `Select first ${MAX_BULK_SELECTION} of ${loadedDrafts.length} loaded issues`
                    : `Select all ${loadedDrafts.length} loaded issues`
                }
              />
              {selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : loadedDrafts.length > MAX_BULK_SELECTION
                  ? `Select first ${MAX_BULK_SELECTION} of ${loadedDrafts.length} loaded`
                  : `Select all ${loadedDrafts.length} loaded`}
            </label>
            <div className="flex flex-wrap gap-2">
              {selectedActiveDrafts.length > 0 ? (
                <button
                  type="button"
                  onClick={(event) =>
                    openBulkConfirmation(
                      'archive',
                      selectedActiveDrafts,
                      event.currentTarget,
                    )
                  }
                  className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-50"
                >
                  Archive selected ({selectedActiveDrafts.length})
                </button>
              ) : null}
              {selectedArchivedDrafts.length > 0 ? (
                <button
                  type="button"
                  onClick={(event) =>
                    openBulkConfirmation(
                      'restore',
                      selectedArchivedDrafts,
                      event.currentTarget,
                    )
                  }
                  className="rounded-xl border border-sage-300 bg-white px-3 py-1.5 text-sm font-semibold text-sage-800 transition hover:bg-sage-50"
                >
                  Restore selected ({selectedArchivedDrafts.length})
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500" aria-hidden="true">
            Loading newsletter issues…
          </div>
        ) : loadError?.kind === 'initial' ? (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-red-800"
          >
            <h3 className="font-semibold">Newsletter history is unavailable</h3>
            <p className="mt-1 text-sm">{loadError.message}</p>
            <button
              type="button"
              onClick={() => setRefreshNonce((current) => current + 1)}
              className="mt-4 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-red-100"
            >
              Try again
            </button>
          </div>
        ) : loadedDrafts.length === 0 ? (
          <div className="mt-4">
            <EmptyArchiveState
              filters={filters}
              onClear={clearFilters}
              onViewActive={() =>
                setFilters((current) => ({
                  ...current,
                  visibility: 'active',
                }))
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-baseline justify-between gap-4">
              <p className="text-sm font-medium text-gray-700">
                Loaded {loadedDrafts.length} of {total}{' '}
                {total === 1 ? 'issue' : 'issues'}
              </p>
              {filters.status !== 'all' ? (
                <p className="text-xs text-gray-500">
                  Status: {getNewsletterWorkflowStage(filters.status).label}
                </p>
              ) : null}
            </div>

            <ul className="mt-3 grid gap-2" aria-label="Newsletter issues">
              {loadedDrafts.map((draft) => {
                const workflowStage = getNewsletterWorkflowStage(draft.status)
                const displayTicker =
                  draft.format === 'market_roundup'
                    ? 'Roundup'
                    : draft.ticker === 'TBD'
                      ? 'Blank'
                      : draft.ticker

                return (
                  <li
                    key={draft.id}
                    className="rounded-2xl border border-gray-200 bg-cream-100 px-4 py-3 transition hover:border-sage-400 hover:bg-sage-50 sm:px-5"
                    style={{
                      contentVisibility: 'auto',
                      containIntrinsicSize: '0 132px',
                    }}
                  >
                    <article className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_260px] lg:items-center lg:gap-4">
                      <div className="pt-0.5 lg:self-start lg:pt-1">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(draft.id)}
                          onChange={() => toggleDraft(draft.id)}
                          aria-label={`Select ${draft.subjectLine}`}
                          className="h-4 w-4 rounded border-gray-300 text-sage-700 focus:ring-sage-500"
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full bg-sage-700 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                            {displayTicker}
                          </span>
                          {draft.format === 'market_roundup' &&
                          draft.featuredTickers.length > 0 ? (
                            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">
                              {draft.featuredTickers.join(', ')}
                            </span>
                          ) : null}
                          <span className="inline-flex rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600">
                            {workflowStage.label}
                          </span>
                          {draft.archivedAt ? (
                            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-900">
                              Archived
                            </span>
                          ) : null}
                        </div>
                        <h2 className="mt-2 text-[15px] font-semibold leading-5 text-gray-900 sm:text-base">
                          <Link
                            href={`/newsletter/editor/${draft.id}`}
                            className="rounded outline-none transition hover:text-sage-900 focus-visible:ring-2 focus-visible:ring-sage-500/30"
                          >
                            {draft.subjectLine}
                          </Link>
                        </h2>
                        <p className="mt-1 text-xs text-gray-500">
                          Issue{' '}
                          <time dateTime={draft.generatedAt}>
                            {formatIssueDate(draft.generatedAt)}
                          </time>
                          {' · '}
                          {draft.attachedChartCount}{' '}
                          {draft.attachedChartCount === 1 ? 'chart' : 'charts'}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 lg:items-end lg:text-right">
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Link
                            href={`/newsletter/editor/${draft.id}`}
                            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-800 transition hover:bg-gray-50"
                          >
                            Open issue
                          </Link>
                          {draft.beehiivUrl ? (
                            <a
                              href={draft.beehiivUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center rounded-lg border border-sage-300 bg-white px-3 py-1 text-xs font-semibold text-sage-800 transition hover:border-sage-500 hover:bg-sage-50"
                            >
                              Published issue
                            </a>
                          ) : null}
                        </div>
                        <div className="text-[11px] leading-4 text-gray-600">
                          {draft.publishedAt ? (
                            <p>
                              Published{' '}
                              <time dateTime={draft.publishedAt}>
                                {formatDateTime(draft.publishedAt)}
                              </time>
                            </p>
                          ) : null}
                          <p>
                            Updated{' '}
                            <time dateTime={draft.updatedAt}>
                              {formatDateTime(draft.updatedAt)}
                            </time>
                          </p>
                          {draft.archivedAt ? (
                            <p>
                              Archived{' '}
                              <time dateTime={draft.archivedAt}>
                                {formatDateTime(draft.archivedAt)}
                              </time>
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ul>

            {loadError?.kind === 'more' ? (
              <div
                role="alert"
                className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                <p>{loadError.message}</p>
                <button
                  type="button"
                  onClick={() => void loadNextPage()}
                  className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold transition hover:bg-red-100"
                >
                  Try loading more again
                </button>
              </div>
            ) : hasMore ? (
              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => void loadNextPage()}
                  disabled={loadingMore}
                  className="rounded-xl border border-sage-300 bg-white px-5 py-2 text-sm font-semibold text-sage-800 transition hover:bg-sage-50 disabled:cursor-wait disabled:opacity-60"
                >
                  {loadingMore ? 'Loading more…' : 'Load more issues'}
                </button>
              </div>
            ) : (
              <p className="mt-5 text-center text-xs font-medium text-gray-500">
                All {loadedDrafts.length} matching{' '}
                {loadedDrafts.length === 1 ? 'issue is' : 'issues are'} loaded.
              </p>
            )}
          </>
        )}
      </section>
      </div>

      {pendingBulkAction ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submittingBulkAction) {
              setPendingBulkAction(null)
              setBulkError(null)
              setBulkConflict(false)
            }
          }}
        >
          <div
            ref={bulkDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-archive-title"
            aria-describedby="bulk-archive-description"
            tabIndex={-1}
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage-700">
              {pendingBulkAction.action === 'archive'
                ? 'Recoverable archive'
                : 'Restore issues'}
            </p>
            <h2
              id="bulk-archive-title"
              className="mt-2 text-xl font-semibold text-gray-900"
            >
              {pendingBulkAction.action === 'archive'
                ? `Archive ${pendingBulkAction.issues.length} selected ${
                    pendingBulkAction.issues.length === 1 ? 'issue' : 'issues'
                  }?`
                : `Restore ${pendingBulkAction.issues.length} selected ${
                    pendingBulkAction.issues.length === 1 ? 'issue' : 'issues'
                  }?`}
            </h2>
            <p
              id="bulk-archive-description"
              className="mt-3 text-sm leading-6 text-gray-600"
            >
              {pendingBulkAction.action === 'archive'
                ? 'These issues will leave the active list, but nothing will be permanently removed. You can restore them later.'
                : 'These issues will return to the active newsletter history.'}
            </p>

            <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                Exact issues
              </p>
              <ul className="mt-2 space-y-2">
                {pendingBulkAction.issues.map((issue) => (
                  <li key={issue.id} className="text-sm font-medium text-gray-900">
                    {issue.subjectLine}
                  </li>
                ))}
              </ul>
            </div>

            {bulkError ? (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {bulkError}{' '}
                {bulkConflict
                  ? 'Refresh the results and review your selection before trying again.'
                  : 'Your selection is unchanged; it is safe to try again.'}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                ref={cancelDialogButtonRef}
                type="button"
                onClick={() => {
                  setPendingBulkAction(null)
                  setBulkError(null)
                  setBulkConflict(false)
                }}
                disabled={submittingBulkAction}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              {bulkConflict ? (
                <button
                  type="button"
                  onClick={() => {
                    setPendingBulkAction(null)
                    setBulkError(null)
                    setBulkConflict(false)
                    setSelectedIds(new Set())
                    setRefreshNonce((current) => current + 1)
                  }}
                  className="rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sage-800"
                >
                  Refresh results
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submitBulkAction()}
                  disabled={submittingBulkAction}
                  className="rounded-xl bg-sage-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingBulkAction
                    ? pendingBulkAction.action === 'archive'
                      ? 'Archiving…'
                      : 'Restoring…'
                    : pendingBulkAction.action === 'archive'
                      ? 'Archive issues'
                      : 'Restore issues'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
