'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  X,
} from 'lucide-react'
import type { NewsletterDailyRun } from '@/lib/newsletter/daily-types'
import type {
  NewsletterEditorialShortlistIntentKind,
  NewsletterEditorialShortlistPresentation,
  NewsletterEditorialShortlistReasonCode,
  NewsletterEditorialShortlistRevision,
} from '@/lib/newsletter/editorial-shortlist'
import { fingerprintNewsletterEditorialShortlistEvidence } from '@/lib/newsletter/editorial-shortlist-evidence'
import { selectNewsletterRecommendedIssues } from '@/lib/newsletter/shortlist'

interface ShortlistResponse {
  run?: NewsletterDailyRun | null
  presentation?: NewsletterEditorialShortlistPresentation
  shortlist?: NewsletterEditorialShortlistRevision | null
  latest?: NewsletterEditorialShortlistRevision | null
  currentRevision?: number
  changed?: boolean
  receiptRevisionId?: string
  isCurrent?: boolean
  conflictSnapshotComplete?: boolean
  code?: string
  error?: string
}

interface LocalIntent {
  itemId: string
  kind: NewsletterEditorialShortlistIntentKind
  reasonCode: NewsletterEditorialShortlistReasonCode | ''
  note: string
}

export interface NewsletterEditorialShortlistDirtyState {
  runIdentity: string
  dirty: boolean
}

const REASONS: Array<{
  value: NewsletterEditorialShortlistReasonCode
  label: string
}> = [
  { value: 'stronger_catalyst', label: 'Stronger catalyst' },
  { value: 'better_source_depth', label: 'Better source depth' },
  { value: 'fresh_earnings', label: 'Fresh earnings evidence' },
  { value: 'audience_fit', label: 'Better audience fit' },
  { value: 'chart_quality', label: 'Better chart quality' },
  { value: 'duplicate_coverage', label: 'Duplicate coverage' },
  { value: 'weak_evidence', label: 'Weak evidence' },
  { value: 'stale_story', label: 'Stale story' },
  { value: 'other', label: 'Other' },
]

const selectableStatuses = new Set([
  'generated',
  'ready',
  'needs_attention',
  'published',
])

const SHORTLIST_HEAD_REFRESH_MS = 60_000
const SHORTLIST_UNSAVED_HISTORY_STATE_KEY = '__newsletterShortlistUnsavedGuard'

function intentFromRevision(
  shortlist: NewsletterEditorialShortlistRevision,
): LocalIntent[] {
  return shortlist.entries.flatMap((entry) => {
    if (entry.decision === 'retained' || !entry.reasonCode) return []
    return [{
      itemId: entry.itemId,
      kind:
        entry.decision === 'added'
          ? 'added' as const
          : entry.decision === 'removed'
            ? 'removed' as const
            : 'moved' as const,
      reasonCode: entry.reasonCode,
      note: entry.note ?? '',
    }]
  })
}

function canonicalEditorState(selectedIds: string[], intents: LocalIntent[]) {
  return JSON.stringify({
    selectedIds,
    intents: [...intents].sort((left, right) =>
      left.itemId.localeCompare(right.itemId)),
  })
}

function presentationKey(
  presentation: NewsletterEditorialShortlistPresentation,
  selectedIds: string[],
  currentRevision: number,
) {
  const evidenceIds = new Set([
    ...presentation.baseline.itemIds,
    ...selectedIds,
  ])
  return JSON.stringify({
    currentRevision,
    baseline: presentation.baseline,
    selector: presentation.catalog.map((item) => ({
      itemId: item.itemId,
      status: item.status,
      qualityBand: item.qualityBand,
      draftId: item.draftId,
      rank: item.rank,
      relevanceScore: item.relevanceScore,
      confidenceScore: item.confidenceScore,
      evidenceFingerprint: evidenceIds.has(item.itemId)
        ? item.evidenceFingerprint
        : undefined,
    })),
  })
}

function reasonComplete(intent: LocalIntent) {
  return Boolean(intent.reasonCode) &&
    (intent.reasonCode !== 'other' || Boolean(intent.note.trim()))
}

function hasCompleteConflictSnapshot(
  payload: ShortlistResponse | null,
): payload is ShortlistResponse & {
  presentation: NewsletterEditorialShortlistPresentation
} {
  if (
    !payload?.run ||
    !payload.presentation
  ) return false
  if (
    payload.code === 'shortlist_conflict' &&
    payload.conflictSnapshotComplete !== true
  ) return false
  const revision = payload.currentRevision ?? 0
  const latest = payload.shortlist ?? payload.latest ?? null
  return revision === 0 ? latest == null : latest?.revision === revision
}

function PublicShortlist({ run }: { run: NewsletterDailyRun }) {
  const issues = selectNewsletterRecommendedIssues(run.items)
  if (issues.length === 0) return null
  return (
    <section
      aria-labelledby="recommended-issues-title"
      className="mt-5 border-y border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex items-end justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div>
          <p className="text-[10px] font-semibold uppercase text-sage-700 dark:text-sage-400">
            Editorial shortlist
          </p>
          <h2 id="recommended-issues-title" className="mt-0.5 text-base font-semibold text-gray-950 dark:text-white">
            Recommended first
          </h2>
        </div>
        <span className="text-xs text-gray-500">{issues.length} issues</span>
      </div>
      <ol className="divide-y divide-gray-100 dark:divide-gray-800">
        {issues.map((issue) => (
          <li key={issue.itemId} className="grid min-w-0 items-center gap-3 px-4 py-3 sm:grid-cols-[2rem_4rem_minmax(0,1fr)_auto]">
            <span className="text-sm font-semibold text-gray-400">
              {issue.position.toString().padStart(2, '0')}
            </span>
            <span className="text-sm font-bold text-gray-950 dark:text-white">{issue.ticker}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{issue.subjectLine}</p>
              <p className="mt-0.5 truncate text-xs text-gray-500">{issue.reason}</p>
            </div>
            <Link href="/auth?redirect=%2Fnewsletter%2Fmorning-review" className="inline-flex h-8 items-center gap-1.5 rounded border border-gray-300 px-3 text-xs font-semibold text-gray-700 transition hover:border-gray-500 hover:text-gray-950 dark:border-gray-700 dark:text-gray-300">
              Review
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function NewsletterEditorialShortlist({
  run,
  readOnly,
  onDirtyStateChange,
}: {
  run: NewsletterDailyRun
  readOnly: boolean
  onDirtyStateChange?: (
    state: NewsletterEditorialShortlistDirtyState,
  ) => void
}) {
  const [presentation, setPresentation] =
    useState<NewsletterEditorialShortlistPresentation | null>(null)
  const [editorRun, setEditorRun] = useState<NewsletterDailyRun | null>(null)
  const [shortlist, setShortlist] =
    useState<NewsletterEditorialShortlistRevision | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [intents, setIntents] = useState<LocalIntent[]>([])
  const [candidateId, setCandidateId] = useState('')
  const [currentRevision, setCurrentRevision] = useState(0)
  const [loading, setLoading] = useState(!readOnly)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [needsReview, setNeedsReview] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remotePayload, setRemotePayload] = useState<ShortlistResponse | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const dirtyRef = useRef(false)
  const needsReviewRef = useRef(false)
  const intentsRef = useRef<LocalIntent[]>([])
  const savingRef = useRef(false)
  const presentationRef = useRef<NewsletterEditorialShortlistPresentation | null>(null)
  const selectedIdsRef = useRef<string[]>([])
  const currentRevisionRef = useRef(0)
  const savedStateRef = useRef('')
  const saveKeyRef = useRef<string | null>(null)
  const explicitReloadRef = useRef(false)
  const loadGenerationRef = useRef(0)
  const loadControllerRef = useRef<AbortController | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigationGuardEntryRef = useRef<{
    href: string
    token: string
  } | null>(null)
  const onDirtyStateChangeRef = useRef(onDirtyStateChange)
  const runIdentity = `${run.marketDate}:${run.edition}:${run.id}`
  const runEvidenceVersion = useMemo(() => JSON.stringify(
    run.items.map((item) => ({
      id: item.id,
      status: item.status,
      qualityBand: item.qualityBand,
      draftId: item.draftId,
      draftUpdatedAt: item.draftUpdatedAt ?? null,
      rank: item.rank,
      relevanceScore: item.relevanceScore,
      confidenceScore: item.confidenceScore,
      updatedAt: item.updatedAt,
    })),
  ), [run.items])

  useEffect(() => {
    onDirtyStateChangeRef.current = onDirtyStateChange
  }, [onDirtyStateChange])

  const reportDirtyState = useCallback((nextDirty: boolean) => {
    dirtyRef.current = nextDirty
    setDirty(nextDirty)
    onDirtyStateChangeRef.current?.({
      runIdentity,
      dirty: nextDirty,
    })
  }, [runIdentity])

  useEffect(() => {
    onDirtyStateChangeRef.current?.({
      runIdentity,
      dirty: dirtyRef.current,
    })
  }, [runIdentity])

  const resumeHeadRefresh = useCallback(() => {
    if (
      readOnly ||
      document.visibilityState !== 'visible' ||
      saveKeyRef.current
    ) return
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    pollTimerRef.current = setTimeout(() => {
      pollTimerRef.current = null
      setReloadNonce((value) => value + 1)
    }, SHORTLIST_HEAD_REFRESH_MS)
  }, [readOnly])

  const applyPayload = useCallback((
    payload: ShortlistResponse,
    options: { resumePolling?: boolean } = {},
  ) => {
    if (!payload.run || !payload.presentation) {
      throw new Error('Shortlist response did not include its evidence snapshot')
    }
    const latest = payload.shortlist ?? null
    const baselineMatches =
      !latest ||
      latest.baselineFingerprint === payload.presentation.baseline.fingerprint
    const liveCatalog = new Map(
      payload.presentation.catalog.map((item) => [item.itemId, item]),
    )
    const selectedItemsRemainActionable = !latest || latest.selectedItemIds.every(
      (itemId) => {
        const item = liveCatalog.get(itemId)
        return Boolean(
          item?.draftId &&
          selectableStatuses.has(item.status),
        )
      },
    )
    const selectedEvidenceRemainsCurrent = !latest || latest.selectedItemIds.every(
      (itemId) => {
        const liveItem = liveCatalog.get(itemId)
        const savedEntry = latest.entries.find((entry) => entry.itemId === itemId)
        return Boolean(
          liveItem &&
          savedEntry &&
          liveItem.evidenceFingerprint ===
            fingerprintNewsletterEditorialShortlistEvidence(savedEntry.evidence),
        )
      },
    )
    const savedRevisionIsCurrent = baselineMatches &&
      selectedItemsRemainActionable &&
      selectedEvidenceRemainsCurrent
    const nextSelected = savedRevisionIsCurrent && latest
      ? latest.selectedItemIds
      : payload.presentation.baseline.itemIds
    const nextIntents = savedRevisionIsCurrent && latest
      ? intentFromRevision(latest)
      : []
    const nextRevision = payload.currentRevision ?? latest?.revision ?? 0

    presentationRef.current = payload.presentation
    selectedIdsRef.current = nextSelected
    currentRevisionRef.current = nextRevision
    const nextNeedsReview = Boolean(latest && !savedRevisionIsCurrent)
    savedStateRef.current = latest
      ? canonicalEditorState(latest.selectedItemIds, intentFromRevision(latest))
      : canonicalEditorState(nextSelected, nextIntents)
    needsReviewRef.current = nextNeedsReview
    intentsRef.current = nextIntents
    saveKeyRef.current = null
    setPresentation(payload.presentation)
    setEditorRun(payload.run)
    setShortlist(latest)
    setSelectedIds(nextSelected)
    setCandidateId('')
    setIntents(nextIntents)
    setCurrentRevision(nextRevision)
    reportDirtyState(nextNeedsReview)
    setNeedsReview(nextNeedsReview)
    setRemotePayload(null)
    setError(null)
    setMessage(
      savedRevisionIsCurrent
        ? null
        : 'The saved shortlist no longer matches the live report. A current, saveable suggestion is loaded for fresh review.',
    )
    if (options.resumePolling) resumeHeadRefresh()
  }, [reportDirtyState, resumeHeadRefresh])

  const confirmUnsavedNavigation = useCallback(() => {
    if (!dirtyRef.current) return true
    return window.confirm(
      'Leave this report and discard your unsaved editorial shortlist decisions?',
    )
  }, [])

  useEffect(() => {
    if (readOnly) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [readOnly])

  useEffect(() => {
    if (readOnly) return
    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const target = event.target
      const anchor = target instanceof Element
        ? target.closest<HTMLAnchorElement>('a[href]')
        : null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) {
        return
      }
      const destination = new URL(anchor.href, window.location.href)
      const current = new URL(window.location.href)
      if (
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search
      ) {
        return
      }
      if (confirmUnsavedNavigation()) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
    document.addEventListener('click', handleDocumentClick, true)
    return () => document.removeEventListener('click', handleDocumentClick, true)
  }, [confirmUnsavedNavigation, readOnly])

  useEffect(() => {
    if (readOnly || !dirty || navigationGuardEntryRef.current) return
    const token = crypto.randomUUID()
    const href = window.location.href
    navigationGuardEntryRef.current = { href, token }
    window.history.pushState(
      {
        ...window.history.state,
        [SHORTLIST_UNSAVED_HISTORY_STATE_KEY]: token,
      },
      '',
      href,
    )
  }, [dirty, readOnly])

  useEffect(() => {
    if (readOnly) return
    const handlePopState = () => {
      const guardEntry = navigationGuardEntryRef.current
      if (!guardEntry || window.location.href !== guardEntry.href) {
        navigationGuardEntryRef.current = null
        return
      }
      if (!confirmUnsavedNavigation()) {
        window.history.pushState(
          {
            ...window.history.state,
            [SHORTLIST_UNSAVED_HISTORY_STATE_KEY]: guardEntry.token,
          },
          '',
          guardEntry.href,
        )
        return
      }
      navigationGuardEntryRef.current = null
      window.history.back()
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [confirmUnsavedNavigation, readOnly])

  useEffect(() => {
    intentsRef.current = intents
  }, [intents])

  useEffect(() => {
    selectedIdsRef.current = selectedIds
  }, [selectedIds])

  useEffect(() => {
    if (
      readOnly ||
      savingRef.current ||
      (saveKeyRef.current && !explicitReloadRef.current)
    ) return
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    const controller = new AbortController()
    loadControllerRef.current?.abort()
    loadControllerRef.current = controller
    const generation = ++loadGenerationRef.current

    void (async () => {
      try {
        if (!presentationRef.current) setLoading(true)
        const response = await fetch(
          `/api/newsletter/daily-runs/${encodeURIComponent(run.id)}/shortlist`,
          {
            cache: 'no-store',
            credentials: 'include',
            signal: controller.signal,
          },
        )
        const payload = (await response.json().catch(() => ({}))) as ShortlistResponse
        if (!response.ok) throw new Error(payload.error || 'Failed to load editorial shortlist')
        if (controller.signal.aborted || generation !== loadGenerationRef.current) return
        const remoteRevision = payload.currentRevision ?? payload.shortlist?.revision ?? 0
        if (remoteRevision < currentRevisionRef.current) return
        if (explicitReloadRef.current) {
          explicitReloadRef.current = false
          applyPayload(payload)
          return
        }
        if (dirtyRef.current && payload.presentation) {
          const localPresentation = presentationRef.current
          if (
            !localPresentation ||
            presentationKey(
              localPresentation,
              selectedIdsRef.current,
              currentRevisionRef.current,
            ) !== presentationKey(
              payload.presentation,
              selectedIdsRef.current,
              remoteRevision,
            )
          ) {
            setRemotePayload(payload)
            setMessage('The report changed while you were editing. Your choices are preserved; reload before saving.')
          }
          return
        }
        applyPayload(payload)
      } catch (caught) {
        if (controller.signal.aborted || generation !== loadGenerationRef.current) return
        explicitReloadRef.current = false
        setError(caught instanceof Error ? caught.message : 'Failed to load editorial shortlist')
      } finally {
        if (!controller.signal.aborted && generation === loadGenerationRef.current) {
          setLoading(false)
          resumeHeadRefresh()
        }
      }
    })()

    return () => {
      controller.abort()
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [
    applyPayload,
    readOnly,
    reloadNonce,
    resumeHeadRefresh,
    run.id,
    run.updatedAt,
    runEvidenceVersion,
  ])

  useEffect(() => {
    if (readOnly) return
    const refresh = () => {
      if (
        document.visibilityState !== 'visible' ||
        savingRef.current ||
        saveKeyRef.current
      ) return
      loadControllerRef.current?.abort()
      setReloadNonce((value) => value + 1)
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      } else {
        loadControllerRef.current?.abort()
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current)
          pollTimerRef.current = null
        }
      }
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [readOnly])

  const itemsById = useMemo(
    () => new Map((editorRun?.items ?? []).map((item) => [item.id, item])),
    [editorRun],
  )
  const baselineIds = presentation?.baseline.itemIds ?? []
  const availableCandidates = (editorRun?.items ?? []).filter((item) =>
    !selectedIds.includes(item.id) &&
    Boolean(item.draftId) &&
    selectableStatuses.has(item.status))
  const candidateIsAvailable = availableCandidates.some((item) =>
    item.id === candidateId)
  const removedIntents = intents.filter((intent) => intent.kind === 'removed')
  const incompleteReasons = intents.some((intent) => !reasonComplete(intent))
  const editingLocked = saving || Boolean(remotePayload)

  function commitEditorState(nextSelected: string[], nextIntents: LocalIntent[]) {
    const abandonedPendingSave = saveKeyRef.current != null
    selectedIdsRef.current = nextSelected
    const nextState = canonicalEditorState(nextSelected, nextIntents)
    const nextDirty = needsReviewRef.current || nextState !== savedStateRef.current
    intentsRef.current = nextIntents
    saveKeyRef.current = null
    setSelectedIds(nextSelected)
    setIntents(nextIntents)
    reportDirtyState(nextDirty)
    setMessage(null)
    setError(null)
    if (abandonedPendingSave) resumeHeadRefresh()
  }

  function hasMovedFromBaseline(itemId: string, nextSelected: string[]) {
    if (!baselineIds.includes(itemId) || !nextSelected.includes(itemId)) {
      return false
    }
    const selectedSet = new Set(nextSelected)
    const baselineSet = new Set(baselineIds)
    const commonBaselinePosition = baselineIds
      .filter((id) => selectedSet.has(id))
      .indexOf(itemId)
    const commonSelectedPosition = nextSelected
      .filter((id) => baselineSet.has(id))
      .indexOf(itemId)
    return commonBaselinePosition !== commonSelectedPosition
  }

  function reconcileMovedIntents(
    nextSelected: string[],
    clickedItemId: string | null,
    current: LocalIntent[],
  ) {
    const clickedIntent = clickedItemId == null
      ? null
      : current.find((intent) => intent.itemId === clickedItemId) ?? null
    const next = current.filter((intent) => {
      if (
        clickedItemId != null &&
        intent.itemId === clickedItemId &&
        baselineIds.includes(clickedItemId)
      ) {
        return false
      }
      return intent.kind !== 'moved' ||
        hasMovedFromBaseline(intent.itemId, nextSelected)
    })
    if (
      clickedItemId != null &&
      baselineIds.includes(clickedItemId) &&
      hasMovedFromBaseline(clickedItemId, nextSelected)
    ) {
      next.push({
        itemId: clickedItemId,
        kind: 'moved',
        reasonCode: clickedIntent?.reasonCode ?? '',
        note: clickedIntent?.note ?? '',
      })
    }
    return next
  }

  function replaceIntent(itemId: string, nextIntent: LocalIntent | null) {
    const next = intents.filter((intent) => intent.itemId !== itemId)
    if (nextIntent) next.push(nextIntent)
    return next
  }

  function removeItem(itemId: string) {
    if (editingLocked) return
    const nextSelected = selectedIds.filter((id) => id !== itemId)
    const existing = intents.find((intent) => intent.itemId === itemId)
    const nextIntent = baselineIds.includes(itemId)
      ? {
          itemId,
          kind: 'removed' as const,
          reasonCode: existing?.reasonCode ?? '',
          note: existing?.note ?? '',
        }
      : null
    const nextIntents = reconcileMovedIntents(
      nextSelected,
      null,
      replaceIntent(itemId, nextIntent),
    )
    commitEditorState(nextSelected, nextIntents)
  }

  function moveItem(itemId: string, offset: -1 | 1) {
    if (editingLocked) return
    const from = selectedIds.indexOf(itemId)
    const to = from + offset
    if (from < 0 || to < 0 || to >= selectedIds.length) return
    const nextSelected = [...selectedIds]
    nextSelected.splice(from, 1)
    nextSelected.splice(to, 0, itemId)
    const existing = intents.find((intent) => intent.itemId === itemId)
    const nextIntent = baselineIds.includes(itemId)
      ? null
      : existing ?? {
          itemId,
          kind: 'added' as const,
          reasonCode: '' as const,
          note: '',
        }
    const nextIntents = baselineIds.includes(itemId)
      ? reconcileMovedIntents(nextSelected, itemId, intents)
      : replaceIntent(itemId, nextIntent)
    commitEditorState(nextSelected, nextIntents)
  }

  function addItem() {
    if (editingLocked || !candidateIsAvailable || selectedIds.length >= 5) return
    const nextSelected = [...selectedIds, candidateId]
    const existing = intents.find((intent) => intent.itemId === candidateId)
    const nextIntent: LocalIntent | null = baselineIds.includes(candidateId)
      ? null
      : {
          itemId: candidateId,
          kind: 'added',
          reasonCode: existing?.reasonCode ?? '',
          note: existing?.note ?? '',
        }
    const nextIntents = baselineIds.includes(candidateId)
      ? reconcileMovedIntents(nextSelected, candidateId, intents)
      : replaceIntent(candidateId, nextIntent)
    commitEditorState(nextSelected, nextIntents)
    setCandidateId('')
  }

  function updateIntent(itemId: string, patch: Partial<LocalIntent>) {
    if (editingLocked) return
    const existing = intents.find((intent) => intent.itemId === itemId)
    if (!existing) return
    commitEditorState(
      selectedIds,
      intents.map((intent) =>
        intent.itemId === itemId ? { ...intent, ...patch } : intent),
    )
  }

  async function saveShortlist() {
    if (
      !presentation ||
      (!dirty && Boolean(shortlist) && !needsReview) ||
      incompleteReasons ||
      saving
    ) return
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    loadControllerRef.current?.abort()
    loadGenerationRef.current += 1
    const idempotencyKey = saveKeyRef.current ?? crypto.randomUUID()
    saveKeyRef.current = idempotencyKey
    const submittedState = canonicalEditorState(selectedIds, intents)
    let completed = false
    try {
      savingRef.current = true
      setSaving(true)
      setError(null)
      const response = await fetch(
        `/api/newsletter/daily-runs/${encodeURIComponent(run.id)}/shortlist`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedRevision: currentRevision,
            presentation,
            selectedItemIds: selectedIds,
            intents: intents.map((intent) => ({
              ...intent,
              reasonCode: intent.reasonCode,
              note: intent.note.trim() || null,
            })),
            idempotencyKey,
          }),
        },
      )
      const payload = (await response.json().catch(() => ({}))) as ShortlistResponse
      loadControllerRef.current?.abort()
      loadGenerationRef.current += 1
      if (!response.ok) {
        if (response.status === 409) {
          setRemotePayload({
            ...payload,
            shortlist: payload.shortlist ?? payload.latest ?? null,
          })
          setMessage('Another update won the shortlist revision. Your choices are preserved; reload the latest version to continue.')
          return
        }
        throw new Error(payload.error || 'Failed to save editorial shortlist')
      }
      completed = true
      const currentLocalState = canonicalEditorState(
        selectedIdsRef.current,
        intentsRef.current,
      )
      if (currentLocalState !== submittedState) {
        if (
          payload.isCurrent !== false &&
          payload.run &&
          payload.presentation &&
          payload.shortlist
        ) {
          const currentSelectedIds = selectedIdsRef.current
          const submittedEvidence = presentationKey(
            presentation,
            currentSelectedIds,
            0,
          )
          const returnedEvidence = presentationKey(
            payload.presentation,
            currentSelectedIds,
            0,
          )
          if (submittedEvidence !== returnedEvidence) {
            setRemotePayload(payload)
            setMessage('The submitted snapshot was saved, but the report evidence changed while newer edits were in progress. Those edits are preserved for review; reload before continuing.')
            return
          }
          const nextRevision = payload.currentRevision ?? payload.shortlist.revision
          presentationRef.current = payload.presentation
          currentRevisionRef.current = nextRevision
          savedStateRef.current = submittedState
          saveKeyRef.current = null
          needsReviewRef.current = false
          setPresentation(payload.presentation)
          setEditorRun(payload.run)
          setShortlist(payload.shortlist)
          setCurrentRevision(nextRevision)
          setNeedsReview(false)
          reportDirtyState(true)
          setMessage('The submitted snapshot was saved. Newer edits remain unsaved as the next revision.')
          return
        }
        setRemotePayload(payload)
        setMessage('The submitted snapshot was recorded, but a newer shortlist also exists. Your later edits are preserved; reload before continuing.')
        return
      }
      applyPayload(payload)
      setMessage(payload.isCurrent === false
        ? 'Your request was recorded, and a newer shortlist is now loaded.'
        : payload.changed === false
          ? 'This editorial decision was already recorded.'
          : 'Editorial shortlist saved as durable decision evidence.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save editorial shortlist')
    } finally {
      savingRef.current = false
      setSaving(false)
      if (completed) setReloadNonce((value) => value + 1)
    }
  }

  if (readOnly) return <PublicShortlist run={run} />

  return (
    <section aria-labelledby="editorial-shortlist-title" className="mt-5 border-y border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase text-sage-700 dark:text-sage-400">Editorial decision memory</p>
          <h2 id="editorial-shortlist-title" className="mt-0.5 text-base font-semibold text-gray-950 dark:text-white">Today&apos;s shortlist</h2>
          <p className="mt-1 text-xs text-gray-500">Accept the algorithm or record exactly what you changed and why.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{selectedIds.length}/5 issues</span>
          <span aria-live="polite">{saving ? 'Saving…' : dirty ? 'Unsaved' : shortlist ? `Saved r${currentRevision}` : 'Not saved'}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          Loading editorial decision…
        </div>
      ) : presentation ? (
        <>
          <ol className="divide-y divide-gray-100 dark:divide-gray-800">
            {selectedIds.map((itemId, index) => {
              const item = itemsById.get(itemId)
              const intent = intents.find((entry) => entry.itemId === itemId)
              if (!item) return null
              return (
                <li key={itemId} className="grid gap-3 px-4 py-3 lg:grid-cols-[2rem_4rem_minmax(0,1fr)_auto] lg:items-center">
                  <span className="text-sm font-semibold text-gray-400">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-sm font-bold text-gray-950 dark:text-white">{item.ticker}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{item.subjectLine || item.headline}</p>
                    {intent ? (
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <select value={intent.reasonCode} disabled={editingLocked} onChange={(event) => updateIntent(itemId, { reasonCode: event.target.value as NewsletterEditorialShortlistReasonCode | '' })} className="h-8 rounded border border-gray-300 bg-white px-2 text-xs text-gray-800 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200" aria-label={`Reason for ${intent.kind} ${item.ticker}`}>
                          <option value="">Choose reason…</option>
                          {REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                        </select>
                        {intent.reasonCode === 'other' ? (
                          <input value={intent.note} disabled={editingLocked} onChange={(event) => updateIntent(itemId, { note: event.target.value })} maxLength={500} placeholder="Explain the decision" className="h-8 min-w-0 flex-1 rounded border border-gray-300 px-2 text-xs disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950" aria-label={`Note for ${item.ticker}`} />
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-0.5 truncate text-xs text-gray-500">Algorithm suggestion retained</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveItem(itemId, -1)} disabled={index === 0 || editingLocked} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 disabled:opacity-30 dark:border-gray-700" aria-label={`Move ${item.ticker} up`}><ArrowUp className="h-3.5 w-3.5" aria-hidden /></button>
                    <button type="button" onClick={() => moveItem(itemId, 1)} disabled={index === selectedIds.length - 1 || editingLocked} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 disabled:opacity-30 dark:border-gray-700" aria-label={`Move ${item.ticker} down`}><ArrowDown className="h-3.5 w-3.5" aria-hidden /></button>
                    <button type="button" onClick={() => removeItem(itemId)} disabled={editingLocked} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-red-700 disabled:opacity-30 dark:border-gray-700 dark:text-red-300" aria-label={`Remove ${item.ticker}`}><X className="h-3.5 w-3.5" aria-hidden /></button>
                    {item.draftId ? <Link href={`/newsletter/editor/${item.draftId}`} className="ml-1 inline-flex h-8 items-center gap-1 rounded border border-gray-300 px-2 text-xs font-semibold dark:border-gray-700">Review<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Link> : null}
                  </div>
                </li>
              )
            })}
          </ol>

          {removedIntents.length > 0 ? (
            <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
              <p className="mb-2 text-[10px] font-semibold uppercase text-gray-500">Removed from suggestion</p>
              <div className="space-y-2">
                {removedIntents.map((intent) => {
                  const item = itemsById.get(intent.itemId)
                  if (!item) return null
                  return (
                    <div key={intent.itemId} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="w-16 text-xs font-bold">{item.ticker}</span>
                      <select value={intent.reasonCode} disabled={editingLocked} onChange={(event) => updateIntent(intent.itemId, { reasonCode: event.target.value as NewsletterEditorialShortlistReasonCode | '' })} className="h-8 rounded border border-gray-300 bg-white px-2 text-xs disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950" aria-label={`Reason for removing ${item.ticker}`}>
                        <option value="">Choose reason…</option>
                        {REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
                      </select>
                      {intent.reasonCode === 'other' ? <input value={intent.note} disabled={editingLocked} onChange={(event) => updateIntent(intent.itemId, { note: event.target.value })} maxLength={500} placeholder="Explain the decision" className="h-8 min-w-0 flex-1 rounded border border-gray-300 px-2 text-xs disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950" aria-label={`Note for ${item.ticker}`} /> : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <select value={candidateId} onChange={(event) => setCandidateId(event.target.value)} disabled={selectedIds.length >= 5 || editingLocked} className="h-9 min-w-0 max-w-sm rounded border border-gray-300 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-950" aria-label="Add issue to shortlist">
                <option value="">Choose another issue…</option>
                {availableCandidates.map((item) => <option key={item.id} value={item.id}>{item.ticker} — {item.subjectLine || item.headline}</option>)}
              </select>
              <button type="button" onClick={addItem} disabled={!candidateIsAvailable || selectedIds.length >= 5 || editingLocked} className="inline-flex h-9 items-center gap-1.5 rounded border border-gray-300 px-3 text-xs font-semibold disabled:opacity-40 dark:border-gray-700"><Plus className="h-3.5 w-3.5" aria-hidden />Add</button>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => {
                if (hasCompleteConflictSnapshot(remotePayload)) {
                  applyPayload(remotePayload, { resumePolling: true })
                } else if (remotePayload) {
                  explicitReloadRef.current = true
                  setError(null)
                  setMessage('Reloading the current shortlist…')
                  setReloadNonce((value) => value + 1)
                } else if (editorRun) {
                  applyPayload({
                    run: editorRun,
                    presentation,
                    shortlist,
                    currentRevision,
                  }, { resumePolling: true })
                }
              }} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded border border-gray-300 px-3 text-xs font-semibold disabled:opacity-40 dark:border-gray-700"><RotateCcw className="h-3.5 w-3.5" aria-hidden />{remotePayload ? 'Reload latest' : 'Reset'}</button>
              <button type="button" onClick={() => void saveShortlist()} disabled={saving || incompleteReasons || Boolean(remotePayload) || (!dirty && Boolean(shortlist) && !needsReview)} className="inline-flex h-9 items-center gap-1.5 rounded bg-sage-700 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-3.5 w-3.5" aria-hidden />{saving ? 'Saving…' : dirty || needsReview ? 'Save decision' : shortlist ? 'Save revision' : 'Accept suggestion'}</button>
            </div>
          </div>
        </>
      ) : null}

      {message ? <p className="border-t border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200" aria-live="polite">{message}</p> : null}
      {error ? <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" role="alert">{error}</p> : null}
    </section>
  )
}
