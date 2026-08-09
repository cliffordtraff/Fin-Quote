'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import {
  getWhyMovedEditorialFreshness,
  type WhyMovedFreshnessState,
} from '@/lib/why-moved-freshness'
import type { MarketSession } from '@/lib/market-hours'
import type { StockWhyMovingResult } from '@/lib/stock-why-moving'
import type {
  WhyMovedBulkReviewStatus,
  WhyMovedBulkReviewTransitionResult,
  WhyMovedEditorialInboxItem,
  WhyMovedEditorialInboxPage,
  WhyMovedEditorialReviewRecord,
  WhyMovedReviewStatus,
} from '@/lib/why-moved-types'

const REVIEW_STATUSES: Array<{
  id: WhyMovedReviewStatus
  label: string
}> = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'needs_work', label: 'Needs work' },
  { id: 'dismissed', label: 'Dismissed' },
]
const BULK_STATUSES: Array<{
  id: WhyMovedBulkReviewStatus
  label: string
}> = [
  { id: 'pending', label: 'Return to pending' },
  { id: 'needs_work', label: 'Mark needs work' },
  { id: 'dismissed', label: 'Dismiss' },
]
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export interface WhyMovedReviewQueueItem extends WhyMovedEditorialInboxItem {
  newsletterDraft: {
    id: string
    status: string
    subjectLine: string
    chartsAttached: number
    beehiivUrl: string | null
  } | null
}

interface WhyMovedReviewQueuePage
  extends Omit<WhyMovedEditorialInboxPage, 'items'> {
  items: WhyMovedReviewQueueItem[]
}

export interface WhyMovedReviewQueueFilters {
  status: WhyMovedReviewStatus | 'all' | 'inbox'
  session: MarketSession | 'all'
  marketDate: string
  dateFrom: string
  dateTo: string
  pageSize: 25 | 50 | 100
  cursor?: string
}

interface WhyMovedReviewQueueProps {
  initialPage: WhyMovedReviewQueuePage
  globalTotal: number
  globalStatusCounts: Record<WhyMovedReviewStatus, number>
  marketDate: string
  currentCandidateCount: number
  filters: WhyMovedReviewQueueFilters
  renderedAt: string
}

interface BulkConfirmation {
  targetStatus: WhyMovedBulkReviewStatus
  items: Array<{ id: string; expectedUpdatedAt: string }>
  idempotencyKey: string
}

interface NoteConflict {
  remoteNotes: string
  remoteUpdatedAt: string
}

interface MutationCommand {
  controller: AbortController
  generation: number
}

interface CommandResult {
  success: boolean
  conflict?: boolean
  error?: string
}

interface SaveReviewResult extends CommandResult {
  review?: WhyMovedEditorialReviewRecord
  newsletterDraft?: {
    id: string
    status: string
    subjectLine: string
    chartsAttached: number
    created: boolean
    warning: string | null
    beehiivUrl: string | null
  }
  automationError?: string
}

interface BulkReviewResult extends CommandResult {
  results?: WhyMovedBulkReviewTransitionResult[]
}

interface CaptureCurrentResult extends CommandResult {
  captured?: number
  marketDate?: string
  reviewKeys?: string[]
}

interface PreviewResult extends CommandResult {
  whyMoving?: StockWhyMovingResult
}

async function sendWhyMovedCommand<T extends CommandResult>(
  endpoint: string,
  options: {
    method: 'PATCH' | 'POST'
    body?: unknown
    signal?: AbortSignal
  },
): Promise<T> {
  const response = await fetch(endpoint, {
    method: options.method,
    credentials: 'same-origin',
    signal: options.signal,
    headers:
      options.body === undefined
        ? { Accept: 'application/json' }
        : {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = (await response.json().catch(() => null)) as T | null
  if (payload && typeof payload.success === 'boolean') return payload
  throw new Error(
    response.ok
      ? 'The Why Moved command returned an invalid response.'
      : `The Why Moved command failed (${response.status}).`,
  )
}

function statusClass(status: WhyMovedReviewStatus): string {
  if (status === 'approved') return 'bg-green-100 text-green-800'
  if (status === 'needs_work') return 'bg-amber-100 text-amber-900'
  if (status === 'dismissed') return 'bg-gray-200 text-gray-700'
  return 'bg-blue-100 text-blue-800'
}

function freshnessClass(state: WhyMovedFreshnessState): string {
  if (state === 'stale') return 'border-red-200 bg-red-50 text-red-800'
  if (state === 'aging') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (state === 'missing') return 'border-gray-300 bg-gray-100 text-gray-700'
  return 'border-sage-200 bg-sage-50 text-sage-800'
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Time unavailable'
  return DATE_TIME_FORMATTER.format(date)
}

function quoteSummary(item: WhyMovedReviewQueueItem): string {
  const percentage = item.candidate.changesPercentage
  const price = item.candidate.price
  if (percentage == null && price == null) return 'Discovery quote unavailable'
  const percentageText =
    percentage == null
      ? null
      : `${percentage >= 0 ? '+' : ''}${percentage.toFixed(2)}%`
  const priceText = price == null ? null : `$${price.toFixed(2)}`
  return [percentageText, priceText].filter(Boolean).join(' · ')
}

function statusLabel(status: WhyMovedReviewStatus): string {
  return (
    REVIEW_STATUSES.find((candidate) => candidate.id === status)?.label ?? status
  )
}

function buildInboxHref(
  filters: WhyMovedReviewQueueFilters,
  overrides: Omit<Partial<WhyMovedReviewQueueFilters>, 'cursor'> & {
    cursor?: string | null
  } = {},
): string {
  const next = { ...filters, ...overrides }
  const params = new URLSearchParams()
  if (next.status !== 'inbox') params.set('status', next.status)
  if (next.session !== 'all') params.set('session', next.session)
  if (next.marketDate) params.set('marketDate', next.marketDate)
  if (!next.marketDate && next.dateFrom) params.set('dateFrom', next.dateFrom)
  if (!next.marketDate && next.dateTo) params.set('dateTo', next.dateTo)
  if (next.pageSize !== 25) params.set('pageSize', String(next.pageSize))
  if (next.cursor) params.set('cursor', next.cursor)
  const query = params.toString()
  return query ? `/admin/why-moved?${query}` : '/admin/why-moved'
}

function notesFromItems(
  items: WhyMovedReviewQueueItem[],
): Record<string, string> {
  return Object.fromEntries(
    items.map((item) => [item.review.reviewKey, item.review.notes]),
  )
}

function mutationIdempotencyKey(): string {
  return `why_moved_${crypto.randomUUID()}`
}

export default function WhyMovedReviewQueue({
  initialPage,
  globalTotal,
  globalStatusCounts,
  marketDate,
  currentCandidateCount,
  filters,
  renderedAt,
}: WhyMovedReviewQueueProps) {
  const router = useRouter()
  const [isRouting, startRouting] = useTransition()
  const [items, setItems] = useState(initialPage.items)
  const [notesByKey, setNotesByKey] = useState<Record<string, string>>(() =>
    notesFromItems(initialPage.items),
  )
  const dirtyNoteBaseRef = useRef(new Map<string, string>())
  const [noteConflicts, setNoteConflicts] = useState<
    Record<string, NoteConflict>
  >({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set())
  const [previewingIds, setPreviewingIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [previewById, setPreviewById] = useState<
    Record<string, StockWhyMovingResult>
  >({})
  const [bulkTarget, setBulkTarget] =
    useState<WhyMovedBulkReviewStatus>('needs_work')
  const [bulkConfirmation, setBulkConfirmation] =
    useState<BulkConfirmation | null>(null)
  const [bulkPending, setBulkPending] = useState(false)
  const [capturePending, setCapturePending] = useState(false)
  const [mutationPending, setMutationPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const dataGenerationRef = useRef(0)
  const previewControllersRef = useRef(new Set<AbortController>())
  const mutationControllerRef = useRef<AbortController | null>(null)
  const saveSequenceRef = useRef(new Map<string, number>())
  const previewSequenceRef = useRef(new Map<string, number>())
  const confirmationDialogRef = useRef<HTMLDialogElement>(null)
  const confirmationButtonRef = useRef<HTMLButtonElement>(null)
  const bulkTriggerRef = useRef<HTMLButtonElement>(null)
  const bulkActionRef = useRef<HTMLSelectElement>(null)
  const focusAfterDialogRef = useRef<'trigger' | 'bulk_action' | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const dialogErrorRef = useRef<HTMLParagraphElement>(null)
  const bulkPendingRef = useRef(false)

  useEffect(() => {
    dataGenerationRef.current += 1
    for (const controller of previewControllersRef.current) controller.abort()
    previewControllersRef.current.clear()
    setItems(initialPage.items)
    setNotesByKey((current) =>
      Object.fromEntries(
        initialPage.items.map((item) => {
          const key = item.review.reviewKey
          return [
            key,
            dirtyNoteBaseRef.current.has(key)
              ? (current[key] ?? item.review.notes)
              : item.review.notes,
          ]
        }),
      ),
    )
    const loadedKeys = new Set(
      initialPage.items.map((item) => item.review.reviewKey),
    )
    for (const key of dirtyNoteBaseRef.current.keys()) {
      if (!loadedKeys.has(key)) dirtyNoteBaseRef.current.delete(key)
    }
    setNoteConflicts(
      Object.fromEntries(
        initialPage.items.flatMap((item) => {
          const key = item.review.reviewKey
          const editBase = dirtyNoteBaseRef.current.get(key)
          return editBase && editBase !== item.review.updatedAt
            ? [
                [
                  key,
                  {
                    remoteNotes: item.review.notes,
                    remoteUpdatedAt: item.review.updatedAt,
                  },
                ] as const,
              ]
            : []
        }),
      ),
    )
    setSelectedIds((current) => {
      const selectable = new Set(
        initialPage.items
          .filter((item) => item.review.status !== 'approved')
          .map((item) => item.review.id),
      )
      return new Set([...current].filter((id) => selectable.has(id)))
    })
    setPreviewingIds(new Set())
    setPreviewById({})
  }, [initialPage.items])

  useEffect(
    () => () => {
      dataGenerationRef.current += 1
      for (const controller of previewControllersRef.current) controller.abort()
      previewControllersRef.current.clear()
      const mutationController = mutationControllerRef.current
      mutationControllerRef.current = null
      mutationController?.abort()
    },
    [],
  )

  useEffect(() => {
    if (!error) return
    if (bulkConfirmation) dialogErrorRef.current?.focus()
    else errorRef.current?.focus()
  }, [bulkConfirmation, error])

  useEffect(() => {
    bulkPendingRef.current = bulkPending
  }, [bulkPending])

  useEffect(() => {
    if (!bulkConfirmation) return
    const dialog = confirmationDialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    confirmationButtonRef.current?.focus()
    const handleCancel = (event: Event) => {
      event.preventDefault()
      if (!bulkPendingRef.current) {
        focusAfterDialogRef.current = 'trigger'
        setBulkConfirmation(null)
      }
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      if (dialog.open) dialog.close()
    }
  }, [bulkConfirmation])

  useEffect(() => {
    const focusTarget = focusAfterDialogRef.current
    if (bulkConfirmation || mutationPending || !focusTarget) return
    focusAfterDialogRef.current = null
    const target =
      focusTarget === 'trigger'
        ? bulkTriggerRef.current
        : bulkActionRef.current
    target?.focus()
  }, [bulkConfirmation, mutationPending])

  const freshnessById = useMemo(() => {
    const now = new Date(renderedAt)
    return new Map(
      items.map((item) => [
        item.review.id,
        getWhyMovedEditorialFreshness(item, now),
      ]),
    )
  }, [items, renderedAt])
  const selectableItems = useMemo(
    () => items.filter((item) => item.review.status !== 'approved').slice(0, 100),
    [items],
  )
  const selectedItems = useMemo(() => {
    const selected = selectedIds
    return selectableItems.filter((item) => selected.has(item.review.id))
  }, [selectableItems, selectedIds])
  const allSelectableSelected =
    selectableItems.length > 0 && selectedItems.length === selectableItems.length

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedItems.length > 0 && !allSelectableSelected
    }
  }, [allSelectableSelected, selectedItems.length])

  function setBusyId(
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
    busy: boolean,
  ) {
    setter((current) => {
      const next = new Set(current)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function refreshPage() {
    startRouting(() => router.refresh())
  }

  function beginPreviewCommand() {
    const controller = new AbortController()
    previewControllersRef.current.add(controller)
    return {
      controller,
      generation: dataGenerationRef.current,
    }
  }

  function beginMutationCommand(): MutationCommand | null {
    if (mutationControllerRef.current) return null
    const controller = new AbortController()
    mutationControllerRef.current = controller
    setMutationPending(true)
    return { controller, generation: dataGenerationRef.current }
  }

  function finishMutationCommand(controller: AbortController): boolean {
    if (mutationControllerRef.current !== controller) return false
    mutationControllerRef.current = null
    setMutationPending(false)
    return true
  }

  function loadLatestNotes(item: WhyMovedReviewQueueItem) {
    const key = item.review.reviewKey
    const conflict = noteConflicts[key]
    if (!conflict) return
    dirtyNoteBaseRef.current.delete(key)
    setNotesByKey((current) => ({
      ...current,
      [key]: conflict.remoteNotes,
    }))
    setNoteConflicts((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setNotice(`${item.review.symbol} latest notes loaded.`)
  }

  function keepLocalNotesOnLatest(item: WhyMovedReviewQueueItem) {
    const key = item.review.reviewKey
    const conflict = noteConflicts[key]
    if (!conflict) return
    dirtyNoteBaseRef.current.set(key, conflict.remoteUpdatedAt)
    setNoteConflicts((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setNotice(
      `${item.review.symbol} local notes rebased. Review them, then save explicitly.`,
    )
  }

  async function saveReview(
    item: WhyMovedReviewQueueItem,
    status: WhyMovedReviewStatus,
  ) {
    const mutationCommand = beginMutationCommand()
    if (!mutationCommand) return
    let refreshQueued = false
    const id = item.review.id
    const sequence = (saveSequenceRef.current.get(id) ?? 0) + 1
    saveSequenceRef.current.set(id, sequence)
    setBusyId(setSavingIds, id, true)
    setError(null)
    setNotice(null)
    try {
      const command = {
        candidate: item.candidate,
        status,
        notes: notesByKey[item.review.reviewKey] ?? '',
        expectedUpdatedAt:
          dirtyNoteBaseRef.current.get(item.review.reviewKey) ??
          item.review.updatedAt,
      }
      const result = await sendWhyMovedCommand<SaveReviewResult>(
        status === 'approved'
          ? '/api/admin/why-moved/reviews/approve'
          : '/api/admin/why-moved/reviews',
        {
          method: status === 'approved' ? 'POST' : 'PATCH',
          body: command,
          signal: mutationCommand.controller.signal,
        },
      )
      if (saveSequenceRef.current.get(id) !== sequence) return
      if (!result.success || !result.review) {
        if (result.conflict) {
          refreshPage()
          refreshQueued = true
        }
        throw new Error(
          result.error ||
            (result.conflict
              ? 'This review changed. The inbox is being refreshed.'
              : 'Failed to save catalyst review'),
        )
      }

      if (dataGenerationRef.current === mutationCommand.generation) {
        dirtyNoteBaseRef.current.delete(item.review.reviewKey)
        setNoteConflicts((current) => {
          const next = { ...current }
          delete next[item.review.reviewKey]
          return next
        })
        setItems((current) =>
          current.map((entry) =>
            entry.review.id === id
              ? {
                  ...entry,
                  candidate: result.review!.candidateSnapshot,
                  catalyst: result.review!.catalystSnapshot,
                  review: result.review!,
                  newsletterDraft: result.newsletterDraft
                    ? {
                        id: result.newsletterDraft.id,
                        status: result.newsletterDraft.status,
                        subjectLine: result.newsletterDraft.subjectLine,
                        chartsAttached: result.newsletterDraft.chartsAttached,
                        beehiivUrl: result.newsletterDraft.beehiivUrl,
                      }
                    : entry.newsletterDraft,
                }
              : entry,
          ),
        )
        setSelectedIds((current) => {
          if (result.review?.status !== 'approved') return current
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }
      if (result.automationError) {
        setError(
          `${item.review.symbol} was approved, but draft automation needs attention: ${result.automationError}`,
        )
      } else if (result.newsletterDraft) {
        const charts = result.newsletterDraft.chartsAttached
        setNotice(
          result.newsletterDraft.warning
            ? `${item.review.symbol} draft saved; ${result.newsletterDraft.warning}`
            : `${item.review.symbol} draft ${result.newsletterDraft.created ? 'created' : 'ready'} with ${charts} ${charts === 1 ? 'chart' : 'charts'}.`,
        )
      } else {
        setNotice(`${item.review.symbol} review saved.`)
      }
      refreshPage()
      refreshQueued = true
    } catch (caught) {
      if (
        !mutationCommand.controller.signal.aborted &&
        saveSequenceRef.current.get(id) === sequence
      ) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Failed to save catalyst review',
        )
      }
    } finally {
      if (
        dataGenerationRef.current !== mutationCommand.generation &&
        !refreshQueued
      ) {
        refreshPage()
      }
      const stillMounted = finishMutationCommand(mutationCommand.controller)
      if (stillMounted && saveSequenceRef.current.get(id) === sequence) {
        setBusyId(setSavingIds, id, false)
      }
    }
  }

  async function previewCurrentCatalyst(item: WhyMovedReviewQueueItem) {
    const id = item.review.id
    const sequence = (previewSequenceRef.current.get(id) ?? 0) + 1
    previewSequenceRef.current.set(id, sequence)
    const commandRequest = beginPreviewCommand()
    setBusyId(setPreviewingIds, id, true)
    setError(null)
    setNotice(null)
    try {
      const result = await sendWhyMovedCommand<PreviewResult>(
        '/api/admin/why-moved/preview',
        {
          method: 'POST',
          body: { symbol: item.review.symbol },
          signal: commandRequest.controller.signal,
        },
      )
      const whyMoving = result.whyMoving
      if (
        dataGenerationRef.current !== commandRequest.generation ||
        previewSequenceRef.current.get(id) !== sequence
      ) {
        return
      }
      if (!result.success || !whyMoving) {
        throw new Error(result.error || 'Failed to preview current catalyst')
      }
      setPreviewById((current) => ({
        ...current,
        [id]: whyMoving,
      }))
      setNotice(
        `${item.review.symbol} preview loaded. The discovery snapshot was not changed.`,
      )
    } catch (caught) {
      if (
        !commandRequest.controller.signal.aborted &&
        dataGenerationRef.current === commandRequest.generation &&
        previewSequenceRef.current.get(id) === sequence
      ) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Failed to preview current catalyst',
        )
      }
    } finally {
      previewControllersRef.current.delete(commandRequest.controller)
      if (
        dataGenerationRef.current === commandRequest.generation &&
        previewSequenceRef.current.get(id) === sequence
      ) {
        setBusyId(setPreviewingIds, id, false)
      }
    }
  }

  async function captureCurrentMarket() {
    const mutationCommand = beginMutationCommand()
    if (!mutationCommand) return
    let refreshQueued = false
    setCapturePending(true)
    setError(null)
    setNotice(null)
    try {
      const result = await sendWhyMovedCommand<CaptureCurrentResult>(
        '/api/admin/why-moved/capture',
        { method: 'POST', signal: mutationCommand.controller.signal },
      )
      if (!result.success) {
        throw new Error(result.error || 'Failed to capture current market')
      }
      setNotice(
        result.captured === 0
          ? `No current candidates were available for ${result.marketDate ?? marketDate}.`
          : `Captured ${result.captured} current catalyst ${result.captured === 1 ? 'snapshot' : 'snapshots'} for ${result.marketDate ?? marketDate}.`,
      )
      refreshPage()
      refreshQueued = true
    } catch (caught) {
      if (!mutationCommand.controller.signal.aborted) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Failed to capture current market',
        )
      }
    } finally {
      if (
        dataGenerationRef.current !== mutationCommand.generation &&
        !refreshQueued
      ) {
        refreshPage()
      }
      if (finishMutationCommand(mutationCommand.controller)) {
        setCapturePending(false)
      }
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (next.size < 100) next.add(id)
      return next
    })
  }

  function toggleAllLoaded() {
    setSelectedIds(
      allSelectableSelected
        ? new Set()
        : new Set(selectableItems.map((item) => item.review.id)),
    )
  }

  function requestBulkConfirmation() {
    if (selectedItems.length === 0) {
      setError('Select at least one non-approved loaded review.')
      return
    }
    setError(null)
    setNotice(null)
    setBulkConfirmation({
      targetStatus: bulkTarget,
      items: selectedItems.map((item) => ({
        id: item.review.id,
        expectedUpdatedAt: item.review.updatedAt,
      })),
      idempotencyKey: mutationIdempotencyKey(),
    })
  }

  function dismissBulkConfirmation() {
    if (bulkPending) return
    focusAfterDialogRef.current = 'trigger'
    setBulkConfirmation(null)
  }

  async function confirmBulkTransition() {
    if (!bulkConfirmation) return
    const mutationCommand = beginMutationCommand()
    if (!mutationCommand) return
    let refreshQueued = false
    setBulkPending(true)
    setError(null)
    setNotice(null)
    try {
      const result = await sendWhyMovedCommand<BulkReviewResult>(
        '/api/admin/why-moved/reviews/bulk',
        {
          method: 'POST',
          body: { ...bulkConfirmation, confirmed: true },
          signal: mutationCommand.controller.signal,
        },
      )
      if (!result.success || !result.results) {
        if (result.conflict) {
          setBulkConfirmation(null)
          refreshPage()
          refreshQueued = true
        }
        throw new Error(
          result.error ||
            (result.conflict
              ? 'One or more reviews changed. The inbox is being refreshed.'
              : 'Failed to update selected reviews'),
        )
      }
      const resultById = new Map(
        result.results.map((entry) => [entry.id, entry]),
      )
      if (dataGenerationRef.current === mutationCommand.generation) {
        setItems((current) =>
          current.map((item) => {
            const changed = resultById.get(item.review.id)
            return changed
              ? {
                  ...item,
                  review: {
                    ...item.review,
                    status: changed.status,
                    reviewedAt: changed.reviewedAt,
                    updatedAt: changed.updatedAt,
                  },
                }
              : item
          }),
        )
      }
      const count = result.results.length
      setSelectedIds(new Set())
      focusAfterDialogRef.current = 'bulk_action'
      setBulkConfirmation(null)
      setNotice(
        `Updated ${count} loaded ${count === 1 ? 'review' : 'reviews'} to ${statusLabel(bulkConfirmation.targetStatus)}.`,
      )
      refreshPage()
      refreshQueued = true
    } catch (caught) {
      if (!mutationCommand.controller.signal.aborted) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Failed to update selected reviews',
        )
      }
    } finally {
      if (
        dataGenerationRef.current !== mutationCommand.generation &&
        !refreshQueued
      ) {
        refreshPage()
      }
      if (finishMutationCommand(mutationCommand.controller)) {
        setBulkPending(false)
      }
    }
  }

  return (
    <div
      className="space-y-4"
      aria-busy={isRouting || mutationPending}
    >
      <section className="border-y border-gray-200 bg-white" aria-label="Inbox totals">
        <div className="grid sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Market date', value: marketDate },
            { label: 'All records', value: globalTotal },
            { label: 'Pending', value: globalStatusCounts.pending },
            { label: 'Needs work', value: globalStatusCounts.needs_work },
            { label: 'Approved', value: globalStatusCounts.approved },
            { label: 'Dismissed', value: globalStatusCounts.dismissed },
          ].map((summary, index) => (
            <div
              key={summary.label}
              className={`px-4 py-3 ${
                index > 0
                  ? 'border-t border-gray-200 sm:border-l sm:border-t-0'
                  : ''
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                {summary.label}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-950">
                {summary.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 border border-sage-200 bg-sage-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-sage-950">
            Capture current market evidence
          </h2>
          <p className="mt-1 text-xs leading-5 text-sage-800">
            {currentCandidateCount} current mover candidates are available. Capture
            records each candidate and catalyst together; loading this page never
            writes to the inbox.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void captureCurrentMarket()}
          disabled={mutationPending}
          className="shrink-0 rounded-lg bg-sage-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sage-800 disabled:cursor-wait disabled:opacity-60"
        >
          {capturePending ? 'Capturing…' : 'Capture current market'}
        </button>
      </section>

      {error && !bulkConfirmation ? (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 outline-none focus:ring-2 focus:ring-red-400"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className="border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-800"
        >
          {notice}
        </div>
      ) : null}

      <section className="border border-gray-200 bg-white p-4" aria-labelledby="why-moved-filter-heading">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 id="why-moved-filter-heading" className="text-sm font-semibold text-gray-950">
              Server filters
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Totals cover the full filtered history, not only this loaded page.
            </p>
          </div>
          <form method="get" action="/admin/why-moved" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <label className="text-xs font-semibold text-gray-700">
              Status
              <select
                name="status"
                defaultValue={filters.status === 'inbox' ? '' : filters.status}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm font-normal"
              >
                <option value="">Operational inbox</option>
                <option value="all">All history</option>
                {REVIEW_STATUSES.map((status) => (
                  <option key={status.id} value={status.id}>{status.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-700">
              Session
              <select
                name="session"
                defaultValue={filters.session === 'all' ? '' : filters.session}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm font-normal"
              >
                <option value="">All sessions</option>
                <option value="premarket">Premarket</option>
                <option value="cash">Regular</option>
                <option value="afterhours">After hours</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-gray-700">
              Exact date
              <input
                type="date"
                name="marketDate"
                defaultValue={filters.marketDate}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold text-gray-700">
              From
              <input
                type="date"
                name="dateFrom"
                defaultValue={filters.dateFrom}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-semibold text-gray-700">
              To
              <input
                type="date"
                name="dateTo"
                defaultValue={filters.dateTo}
                className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm font-normal"
              />
            </label>
            <div className="flex items-end gap-2">
              <label className="grow text-xs font-semibold text-gray-700">
                Rows
                <select
                  name="pageSize"
                  defaultValue={String(filters.pageSize)}
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm font-normal"
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700"
              >
                Apply
              </button>
            </div>
          </form>
        </div>
        <nav className="mt-4 flex max-w-full gap-1 overflow-x-auto border-t border-gray-200 pt-3" aria-label="Review status facets">
          {[
            { id: 'inbox' as const, label: 'Inbox', count: null },
            { id: 'all' as const, label: 'All', count: globalTotal },
            ...REVIEW_STATUSES.map((status) => ({
              ...status,
              count: globalStatusCounts[status.id],
            })),
          ].map((status) => (
            <Link
              key={status.id}
              href={buildInboxHref(filters, {
                status: status.id,
                cursor: null,
              })}
              aria-current={filters.status === status.id ? 'page' : undefined}
              className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold transition ${
                filters.status === status.id
                  ? 'bg-sage-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-950'
              }`}
            >
              {status.label}{status.count == null ? '' : ` ${status.count}`}
            </Link>
          ))}
          <Link
            href="/admin/why-moved"
            className="ml-auto shrink-0 px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-950"
          >
            Reset filters
          </Link>
        </nav>
      </section>

      <section className="flex flex-col gap-3 border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Bulk review controls">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelectableSelected}
            onChange={toggleAllLoaded}
            disabled={selectableItems.length === 0 || mutationPending}
            className="size-4 rounded border-gray-300 text-sage-700 focus:ring-sage-500"
          />
          Select loaded non-approved rows ({selectedItems.length}/100)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-gray-700">
            Bulk action
            <select
              ref={bulkActionRef}
              value={bulkTarget}
              onChange={(event) =>
                setBulkTarget(event.target.value as WhyMovedBulkReviewStatus)
              }
              disabled={mutationPending}
              className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-2 text-sm font-normal"
            >
              {BULK_STATUSES.map((status) => (
                <option key={status.id} value={status.id}>{status.label}</option>
              ))}
            </select>
          </label>
          <button
            ref={bulkTriggerRef}
            type="button"
            onClick={requestBulkConfirmation}
            disabled={selectedItems.length === 0 || mutationPending}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Review {selectedItems.length} changes
          </button>
        </div>
      </section>

      <section className="overflow-hidden border border-gray-200 bg-white" aria-label="Catalyst review inbox">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
          <span>
            Loaded {items.length} of {initialPage.total} matching records
          </span>
          <span>Discovery evidence is immutable</span>
        </div>
        {items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No durable catalyst records match these filters. Capture the current
            market or adjust the filters.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {items.map((item) => {
              const review = item.review
              const freshness = freshnessById.get(review.id)!
              const preview = previewById[review.id]
              const saving = savingIds.has(review.id)
              const previewing = previewingIds.has(review.id)
              const selected = selectedIds.has(review.id)
              const noteConflict = noteConflicts[review.reviewKey]
              return (
                <article
                  key={review.id}
                  className="grid gap-4 px-4 py-5 lg:grid-cols-[210px_minmax(0,1fr)_370px]"
                >
                  <div>
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelected(review.id)}
                        disabled={
                          review.status === 'approved' || mutationPending
                        }
                        aria-label={`Select ${review.symbol} for a bulk action`}
                        className="mt-1 size-4 rounded border-gray-300 text-sage-700 focus:ring-sage-500"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/stock/${encodeURIComponent(review.symbol)}`}
                            className="text-base font-bold text-sage-700 hover:text-sage-900"
                          >
                            {review.symbol}
                          </Link>
                          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${statusClass(review.status)}`}>
                            {statusLabel(review.status)}
                          </span>
                          {item.current ? (
                            <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-blue-700">
                              Current
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {item.candidate.name ?? 'Company name unavailable'}
                        </p>
                      </div>
                    </div>
                    <p className={`mt-3 text-sm font-semibold ${item.candidate.direction === 'gainer' ? 'text-green-700' : 'text-red-700'}`}>
                      {quoteSummary(item)}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-gray-500">
                      {item.candidate.marketDate} ·{' '}
                      {item.candidate.session === 'cash' ? 'regular' : item.candidate.session}{' '}
                      · {item.candidate.direction}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {[freshness.queue, freshness.catalyst].map((signal) => (
                        <span
                          key={signal.label}
                          className={`rounded border px-2 py-1 text-[10px] font-semibold ${freshnessClass(signal.state)}`}
                        >
                          {signal.label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-gray-500">
                      First seen {formatDateTime(review.firstSeenAt)}
                      <br />
                      Last seen {formatDateTime(review.lastSeenAt)}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${item.catalyst.status === 'found' ? 'bg-sage-100 text-sage-800' : item.catalyst.status === 'error' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'}`}>
                        Captured · {item.catalyst.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDateTime(item.catalyst.fetchedAt)}
                      </span>
                    </div>
                    <h2 className="mt-2 text-sm font-semibold leading-6 text-gray-950">
                      {item.catalyst.headline ??
                        item.catalyst.displayText ??
                        'No discovery-time catalyst found'}
                    </h2>
                    {item.catalyst.summary && item.catalyst.summary !== item.catalyst.headline ? (
                      <p className="mt-1 text-sm leading-6 text-gray-600">
                        {item.catalyst.summary}
                      </p>
                    ) : null}
                    {item.catalyst.bulletPoints.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-gray-600">
                        {item.catalyst.bulletPoints.map((bulletPoint) => (
                          <li key={bulletPoint}>{bulletPoint}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-3">
                      {item.catalyst.sourceUrl ? (
                        <a
                          href={item.catalyst.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-sage-700 hover:text-sage-900"
                        >
                          Open captured source
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void previewCurrentCatalyst(item)}
                        disabled={previewing}
                        className="text-xs font-semibold text-gray-600 hover:text-gray-950 disabled:opacity-50"
                      >
                        {previewing ? 'Loading preview…' : 'Preview current catalyst'}
                      </button>
                    </div>
                    {preview ? (
                      <aside className="mt-4 border-l-4 border-blue-300 bg-blue-50 px-3 py-3" aria-label={`Current ${review.symbol} catalyst preview`}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-800">
                            Current preview · not saved
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewById((current) => {
                                const next = { ...current }
                                delete next[review.id]
                                return next
                              })
                            }
                            className="text-xs font-semibold text-blue-800 hover:text-blue-950"
                          >
                            Dismiss
                          </button>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-blue-950">
                          {preview.headline ?? preview.displayText ?? 'No current catalyst found'}
                        </p>
                        <p className="mt-1 text-xs text-blue-800">
                          Previewed {formatDateTime(preview.fetchedAt)}. Approval still uses the captured evidence above.
                        </p>
                      </aside>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor={`why-moved-notes-${review.id}`} className="block text-xs font-semibold text-gray-700">
                      Reviewer notes
                    </label>
                    <textarea
                      id={`why-moved-notes-${review.id}`}
                      value={notesByKey[review.reviewKey] ?? ''}
                      onChange={(event) => {
                        const notes = event.target.value
                        if (notes === review.notes) {
                          dirtyNoteBaseRef.current.delete(review.reviewKey)
                          setNoteConflicts((current) => {
                            const next = { ...current }
                            delete next[review.reviewKey]
                            return next
                          })
                        } else if (
                          !dirtyNoteBaseRef.current.has(review.reviewKey)
                        ) {
                          dirtyNoteBaseRef.current.set(
                            review.reviewKey,
                            review.updatedAt,
                          )
                        }
                        setNotesByKey((current) => ({
                          ...current,
                          [review.reviewKey]: notes,
                        }))
                      }}
                      maxLength={1000}
                      rows={3}
                      disabled={mutationPending}
                      className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm leading-5 text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 disabled:bg-gray-50"
                    />
                    {noteConflict ? (
                      <div
                        role="alert"
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
                      >
                        <p>
                          These notes changed after you began editing. Your local
                          text is preserved, but saving is locked until you choose
                          which version to continue from.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => loadLatestNotes(item)}
                            disabled={mutationPending}
                            className="rounded-md border border-amber-400 bg-white px-2 py-1 font-semibold hover:bg-amber-100 disabled:opacity-50"
                          >
                            Load latest notes
                          </button>
                          <button
                            type="button"
                            onClick={() => keepLocalNotesOnLatest(item)}
                            disabled={mutationPending}
                            className="rounded-md bg-amber-900 px-2 py-1 font-semibold text-white hover:bg-amber-950 disabled:opacity-50"
                          >
                            Keep mine on latest
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
                      {REVIEW_STATUSES.map((status) => (
                        <button
                          key={status.id}
                          type="button"
                          onClick={() => void saveReview(item, status.id)}
                          disabled={mutationPending || Boolean(noteConflict)}
                          className={`min-h-9 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${review.status === status.id ? 'border-sage-700 bg-sage-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-sage-400 hover:text-sage-900'}`}
                        >
                          {saving
                            ? status.id === 'approved'
                              ? 'Building draft…'
                              : 'Saving…'
                            : status.id === 'approved'
                              ? 'Approve + draft'
                              : status.label}
                        </button>
                      ))}
                    </div>
                    {item.newsletterDraft ? (
                      <Link
                        href={`/newsletter/editor/${item.newsletterDraft.id}`}
                        className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-sage-300 bg-sage-50 px-3 py-2 text-xs font-semibold text-sage-900 transition hover:border-sage-500 hover:bg-sage-100"
                      >
                        <span className="truncate">Open automated draft</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-sage-700">
                          {item.newsletterDraft.status} · {item.newsletterDraft.chartsAttached}{' '}
                          {item.newsletterDraft.chartsAttached === 1 ? 'chart' : 'charts'}
                        </span>
                      </Link>
                    ) : review.status === 'approved' ? (
                      <p className="text-xs leading-5 text-amber-700">
                        Approval is saved. Select Approve + draft again to retry draft automation from the captured evidence.
                      </p>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <nav className="flex items-center justify-between gap-3" aria-label="Inbox pagination">
        {filters.cursor ? (
          <Link
            href={buildInboxHref(filters, { cursor: null })}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-sage-400"
          >
            Back to first page
          </Link>
        ) : (
          <span />
        )}
        {initialPage.hasMore && initialPage.nextCursor ? (
          <Link
            href={buildInboxHref(filters, { cursor: initialPage.nextCursor })}
            className="rounded-md bg-sage-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sage-800"
          >
            Next page
          </Link>
        ) : (
          <span className="text-xs text-gray-500">End of results</span>
        )}
      </nav>

      {bulkConfirmation ? (
        <dialog
          ref={confirmationDialogRef}
          role="alertdialog"
          aria-labelledby="why-moved-bulk-title"
          aria-describedby="why-moved-bulk-description"
          className="w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-300 bg-white p-5 shadow-2xl backdrop:bg-gray-950/40"
        >
            <h2 id="why-moved-bulk-title" className="text-lg font-semibold text-gray-950">
              Confirm bulk review update
            </h2>
            <p id="why-moved-bulk-description" className="mt-2 text-sm leading-6 text-gray-600">
              Change {bulkConfirmation.items.length}{' '}
              {bulkConfirmation.items.length === 1 ? 'loaded review' : 'loaded reviews'} to{' '}
              <strong>{statusLabel(bulkConfirmation.targetStatus)}</strong>? Approval is never available in bulk.
            </p>
            {error ? (
              <p
                ref={dialogErrorRef}
                role="alert"
                tabIndex={-1}
                className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 outline-none focus:ring-2 focus:ring-red-400"
              >
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={dismissBulkConfirmation}
                disabled={bulkPending}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                ref={confirmationButtonRef}
                type="button"
                onClick={() => void confirmBulkTransition()}
                disabled={bulkPending}
                className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-wait disabled:opacity-60"
              >
                {bulkPending ? 'Applying…' : 'Confirm update'}
              </button>
            </div>
        </dialog>
      ) : null}
    </div>
  )
}
