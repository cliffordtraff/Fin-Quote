'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  NewsletterDraftBlock,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
  NewsletterDraftStatus,
} from '@/lib/newsletter/types'
import { sha256Hex } from '@/lib/newsletter/sha256'
import { copyTextToClipboard } from '@/lib/clipboard'
import { RichTextEditor } from '@/components/newsletter/RichTextEditor'
import NewsletterChartEditorDrawer from '@/components/newsletter/NewsletterChartEditorDrawer'
import NewsletterChartLibraryPicker from '@/components/newsletter/NewsletterChartLibraryPicker'
import NewsletterBeehiivPanel, {
  type NewsletterBeehiivPanelHandle,
} from '@/components/newsletter/NewsletterBeehiivPanel'
import NewsletterPublicationPanel from '@/components/newsletter/NewsletterPublicationPanel'
import NewsletterWorkflowBar from '@/components/newsletter/NewsletterWorkflowBar'
import NewsletterDraftCreate from '@/app/newsletter/editor/NewsletterDraftCreate'

interface DraftResponse {
  draft?: NewsletterDraftRecord
  error?: string
  code?: string
  latest?: NewsletterDraftRecord
}

interface NewsletterDraftEditorProps {
  draftId: string
}

type SelectedPanel = 'overview' | 'header' | 'intro' | 'stats' | string
type DropPosition = 'before' | 'after'

interface DraftConflict {
  latest: NewsletterDraftRecord
  message: string
}

type DeferredChartServerChange = DraftConflict

const FRESHNESS_CHECK_INTERVAL_MS = 60_000
const UNSAVED_HISTORY_STATE_KEY = '__newsletterDraftUnsavedGuard'

function formatEditorTimestamp(value: string | null): string {
  if (!value) return 'Not yet'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function resolveSelectedPanel(
  current: SelectedPanel,
  nextDraft: NewsletterDraftDocument,
): SelectedPanel {
  if (
    current === 'overview' ||
    current === 'header' ||
    current === 'intro' ||
    current === 'stats'
  ) {
    return current
  }

  return nextDraft.blocks.some((block) => block.id === current)
    ? current
    : nextDraft.blocks[0]?.id ?? 'overview'
}

function getExactChartUrl(block: NewsletterDraftBlock | null): string | null {
  if (!block) return null
  return (
    block.chartProvenance?.imageUrl ||
    block.chartImageUrl ||
    block.chartProvenance?.interactiveUrl ||
    block.chartExportUrl ||
    null
  )
}

function mergeSavedChartIntoLocalDraft(
  localDraft: NewsletterDraftDocument,
  savedDraft: NewsletterDraftDocument,
  blockId: string,
): NewsletterDraftDocument {
  const savedBlock = savedDraft.blocks.find((block) => block.id === blockId)
  if (!savedBlock) return localDraft

  return {
    ...localDraft,
    blocks: localDraft.blocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            chartImageUrl: savedBlock.chartImageUrl,
            chartAlt: savedBlock.chartAlt,
            chartExportUrl: savedBlock.chartExportUrl,
            chartSpec: savedBlock.chartSpec,
            chartProvenance: savedBlock.chartProvenance,
            chartNeedsRegeneration: savedBlock.chartNeedsRegeneration,
            caption: savedBlock.caption,
          }
        : block,
    ),
  }
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = items.slice()
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

function reorderArrayItem<T>(
  items: T[],
  fromIndex: number,
  targetIndex: number,
  position: DropPosition,
): T[] {
  if (fromIndex === targetIndex && position === 'before') return items
  if (fromIndex === targetIndex && position === 'after') return items

  let insertIndex = position === 'before' ? targetIndex : targetIndex + 1
  if (fromIndex < insertIndex) {
    insertIndex -= 1
  }

  if (insertIndex === fromIndex) return items
  return moveArrayItem(items, fromIndex, insertIndex)
}

const BLOCK_PREVIEW_SCROLL_TOP_OFFSET = 120
const BLOCK_PAGE_SCROLL_TOP_OFFSET = 96
const DEFAULT_PREVIEW_SCROLL_TOP_OFFSET = 16
const DEFAULT_PAGE_SCROLL_TOP_OFFSET = 24

function CopyIcon({
  copied,
}: {
  copied: boolean
}) {
  if (copied) {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className="h-5 w-5"
      >
        <path
          d="M5.5 12.5L9.5 16.5L18.5 7.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
    >
      <rect
        x="9"
        y="4"
        width="11"
        height="11"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <rect
        x="4"
        y="9"
        width="11"
        height="11"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function CopyableControl({
  copyId,
  value,
  label,
  copiedControlId,
  onCopy,
  renderControl,
}: {
  copyId: string
  value: string
  label?: string
  copiedControlId: string | null
  onCopy: (copyId: string, value: string) => Promise<void>
  renderControl: (controlId: string) => ReactNode
}) {
  const copied = copiedControlId === copyId
  const controlId = `${copyId}-control`
  const accessibleLabel = label ?? 'field value'

  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-2 ${label ? 'justify-between' : 'justify-end'}`}>
        {label ? (
          <label
            htmlFor={controlId}
            className="text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        ) : null}
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void onCopy(copyId, value)
          }}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg bg-transparent transition focus:outline-none focus:ring-2 focus:ring-sage-500/20 ${
            copied
              ? 'text-sage-700'
              : 'text-gray-500 hover:text-sage-800'
          }`}
          aria-label={
            copied ? `${accessibleLabel} copied` : `Copy ${accessibleLabel}`
          }
          title={copied ? 'Copied' : 'Copy'}
        >
          <CopyIcon copied={copied} />
        </button>
      </div>
      {renderControl(controlId)}
    </div>
  )
}

export default function NewsletterDraftEditor({
  draftId,
}: NewsletterDraftEditorProps) {
  const router = useRouter()
  const isNewDraft = draftId === 'new'
  const previewSectionRef = useRef<HTMLElement | null>(null)
  const inspectorSectionRef = useRef<HTMLElement | null>(null)
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null)
  const expandedPreviewFrameRef = useRef<HTMLIFrameElement | null>(null)
  const expandedPreviewDialogRef = useRef<HTMLDivElement | null>(null)
  const expandedPreviewCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  const expandedPreviewTriggerRef = useRef<HTMLButtonElement | null>(null)
  const beehiivPanelRef = useRef<NewsletterBeehiivPanelHandle | null>(null)
  const copyResetTimeoutRef = useRef<number | null>(null)
  const [record, setRecord] = useState<NewsletterDraftRecord | null>(null)
  const [draft, setDraft] = useState<NewsletterDraftDocument | null>(null)
  const [selectedPanel, setSelectedPanel] = useState<SelectedPanel>('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [forking, setForking] = useState(false)
  const [regeneratingNewsletter, setRegeneratingNewsletter] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [publicationUrlDirty, setPublicationUrlDirty] = useState(false)
  const [conflict, setConflict] = useState<DraftConflict | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)
  const [freshnessError, setFreshnessError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false)
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null)
  const [copiedControlId, setCopiedControlId] = useState<string | null>(null)
  const [copyingBeehiiv, setCopyingBeehiiv] = useState(false)
  const [beehiivBusy, setBeehiivBusy] = useState(false)
  const [downloadingHtml, setDownloadingHtml] = useState(false)
  const [chartEditorOpen, setChartEditorOpen] = useState(false)
  const [chartLibraryOpen, setChartLibraryOpen] = useState(false)
  const draftRef = useRef<NewsletterDraftDocument | null>(null)
  const recordRef = useRef<NewsletterDraftRecord | null>(null)
  const dirtyRef = useRef(false)
  const publicationUrlDirtyRef = useRef(false)
  const savingRef = useRef(false)
  const editSequenceRef = useRef(0)
  const chartEditorOpenedEditSequenceRef = useRef(0)
  const freshnessCheckInFlightRef = useRef(false)
  const readOnlyRef = useRef(false)
  const chartEditorSessionOpenRef = useRef(false)
  const navigationGuardEntryRef = useRef<{
    href: string
    token: string
  } | null>(null)
  const deferredChartServerChangeRef =
    useRef<DeferredChartServerChange | null>(null)
  const [newDraftOpenFormat, setNewDraftOpenFormat] = useState<
    'single_stock' | 'market_roundup' | null
  >(null)
  const newDraftPopoverRef = useRef<HTMLDivElement | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    blockId: string
    position: DropPosition
  } | null>(null)

  const ensureNavigationGuardEntry = useCallback(() => {
    if (navigationGuardEntryRef.current) return
    const token = crypto.randomUUID()
    const href = window.location.href
    navigationGuardEntryRef.current = { href, token }
    window.history.pushState(
      {
        ...window.history.state,
        [UNSAVED_HISTORY_STATE_KEY]: token,
      },
      '',
      href,
    )
  }, [])

  const handlePublicationUrlDirtyChange = useCallback((nextDirty: boolean) => {
    publicationUrlDirtyRef.current = nextDirty
    setPublicationUrlDirty(nextDirty)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    recordRef.current = record
  }, [record])

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    publicationUrlDirtyRef.current = publicationUrlDirty
  }, [publicationUrlDirty])

  useEffect(() => {
    savingRef.current = saving
  }, [saving])

  const handlePreviewIframeClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    const img = target.closest('img')
    if (!img) return
    const blockEl = target.closest('[data-newsletter-preview-block-id]') as HTMLElement | null
    if (!blockEl) return
    const blockId = blockEl.dataset.newsletterPreviewBlockId
    if (!blockId) return
    const currentDraft = draftRef.current
    const block = currentDraft?.blocks.find((entry) => entry.id === blockId)
    if (!block) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedPanel(blockId)
    if (readOnlyRef.current) {
      const exactChartUrl = getExactChartUrl(block)
      if (exactChartUrl) {
        window.open(exactChartUrl, '_blank', 'noopener,noreferrer')
      }
      return
    }
    openChartEditor()
  }

  const attachPreviewChartHandler = (iframe: HTMLIFrameElement | null) => {
    const doc = iframe?.contentDocument
    if (!doc) return
    doc.addEventListener('click', handlePreviewIframeClick, true)
    const currentDraft = draftRef.current
    if (!currentDraft) return
    for (const block of currentDraft.blocks) {
      const blockEl = doc.querySelector(
        `[data-newsletter-preview-block-id="${block.id}"]`,
      ) as HTMLElement | null
      const img = blockEl?.querySelector('img') as HTMLElement | null
      if (img) img.style.cursor = 'pointer'
    }
  }

  useEffect(() => {
    if (!newDraftOpenFormat) return
    const onDocumentMouseDown = (event: MouseEvent) => {
      const container = newDraftPopoverRef.current
      if (!container) return
      if (container.contains(event.target as Node)) return
      setNewDraftOpenFormat(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNewDraftOpenFormat(null)
    }
    document.addEventListener('mousedown', onDocumentMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [newDraftOpenFormat])

  useEffect(() => {
    if (isNewDraft) {
      setLoading(false)
      setError(null)
      setRecord(null)
      setDraft(null)
      recordRef.current = null
      draftRef.current = null
      dirtyRef.current = false
      setDirty(false)
      publicationUrlDirtyRef.current = false
      setPublicationUrlDirty(false)
      setConflict(null)
      setLastSavedAt(null)
      setLastCheckedAt(null)
      chartEditorSessionOpenRef.current = false
      deferredChartServerChangeRef.current = null
      setChartEditorOpen(false)
      return
    }

    setLoading(true)
    setError(null)
    setNotice(null)
    setRecord(null)
    setDraft(null)
    setDirty(false)
    setPublicationUrlDirty(false)
    setConflict(null)
    setLastSavedAt(null)
    setLastCheckedAt(null)
    setFreshnessError(null)
    setSelectedPanel('overview')
    setIsPreviewExpanded(false)
    setDraggedBlockId(null)
    setChartEditorOpen(false)
    setChartLibraryOpen(false)
    recordRef.current = null
    draftRef.current = null
    dirtyRef.current = false
    publicationUrlDirtyRef.current = false
    savingRef.current = false
    editSequenceRef.current = 0
    freshnessCheckInFlightRef.current = false
    readOnlyRef.current = false
    chartEditorSessionOpenRef.current = false
    deferredChartServerChangeRef.current = null

    let cancelled = false

    async function loadDraft() {
      try {
        const response = await fetch(`/api/newsletter/drafts/${draftId}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const payload = (await response.json()) as DraftResponse

        if (!response.ok || !payload.draft) {
          throw new Error(payload.error || 'Failed to load newsletter draft')
        }

        if (!cancelled) {
          const loadedDraft = payload.draft
          const checkedAt = new Date().toISOString()
          recordRef.current = loadedDraft
          draftRef.current = loadedDraft.draft
          dirtyRef.current = false
          setRecord(loadedDraft)
          setDraft(loadedDraft.draft)
          setDirty(false)
          setConflict(null)
          setLastSavedAt(loadedDraft.updatedAt)
          setLastCheckedAt(checkedAt)
          setFreshnessError(null)
          setSelectedPanel((current) =>
            resolveSelectedPanel(current, loadedDraft.draft),
          )
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load newsletter draft')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDraft()
    return () => {
      cancelled = true
    }
  }, [draftId, isNewDraft])

  const checkFreshness = useCallback(async () => {
    const currentRecord = recordRef.current
    if (
      isNewDraft ||
      !currentRecord ||
      savingRef.current ||
      freshnessCheckInFlightRef.current
    ) {
      return
    }
    const requestedUpdatedAt = currentRecord.updatedAt

    freshnessCheckInFlightRef.current = true
    try {
      const response = await fetch(`/api/newsletter/drafts/${draftId}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const payload = (await response.json()) as DraftResponse
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || 'Failed to check draft freshness')
      }

      const latest = payload.draft
      const baseline = recordRef.current
      if (
        !baseline ||
        baseline.updatedAt !== requestedUpdatedAt ||
        savingRef.current
      ) {
        return
      }

      const checkedAt = new Date().toISOString()
      setLastCheckedAt(checkedAt)
      setFreshnessError(null)
      if (latest.updatedAt === baseline.updatedAt) return

      if (chartEditorSessionOpenRef.current) {
        deferredChartServerChangeRef.current = {
          latest,
          message:
            latest.status === 'published'
              ? 'This issue was published elsewhere while the chart editor was open. Your chart edits are preserved and can be saved as a new draft.'
              : 'A newer server version is available while the chart editor is open. Your chart edits are preserved until you resolve the conflict.',
        }
        setNotice(
          latest.status === 'published'
            ? 'This issue was published elsewhere while the chart editor was open. Your chart session is preserved; saving it will offer conflict recovery.'
            : 'A newer server version is available while the chart editor is open. Your chart session remains pinned to its original save version so it cannot overwrite that update.',
        )
        return
      }

      if (dirtyRef.current || publicationUrlDirtyRef.current) {
        setConflict({
          latest,
          message:
            latest.status === 'published'
              ? 'This issue was published elsewhere while you had local edits. Your edits are preserved and can be saved as a new draft.'
              : 'A newer server version is available. Your local edits are preserved until you choose how to resolve this conflict.',
        })
        return
      }

      editSequenceRef.current += 1
      recordRef.current = latest
      draftRef.current = latest.draft
      dirtyRef.current = false
      setRecord(latest)
      setDraft(latest.draft)
      setDirty(false)
      setConflict(null)
      setLastSavedAt(latest.updatedAt)
      setSelectedPanel((current) =>
        resolveSelectedPanel(current, latest.draft),
      )
      setNotice('Draft refreshed with the latest saved version.')
    } catch (freshnessCheckError) {
      setFreshnessError(
        freshnessCheckError instanceof Error
          ? freshnessCheckError.message
          : 'Failed to check draft freshness',
      )
    } finally {
      freshnessCheckInFlightRef.current = false
    }
  }, [draftId, isNewDraft])

  useEffect(() => {
    if (isNewDraft || loading || !record) return

    const handleFocus = () => {
      void checkFreshness()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkFreshness()
      }
    }
    const intervalId = window.setInterval(() => {
      void checkFreshness()
    }, FRESHNESS_CHECK_INTERVAL_MS)

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [checkFreshness, isNewDraft, loading, record])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        !dirtyRef.current &&
        !publicationUrlDirtyRef.current &&
        !chartEditorSessionOpenRef.current
      ) {
        return
      }
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  const confirmUnsavedNavigation = useCallback((): boolean => {
    if (
      !dirtyRef.current &&
      !publicationUrlDirtyRef.current &&
      !chartEditorSessionOpenRef.current
    ) {
      return true
    }
    return window.confirm(
      'Leave this editor and discard your unsaved newsletter changes or chart session?',
    )
  }, [])

  useEffect(() => {
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
      const anchor =
        target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      ) {
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
  }, [confirmUnsavedNavigation])

  useEffect(() => {
    if (
      (!dirty && !publicationUrlDirty && !chartEditorOpen) ||
      navigationGuardEntryRef.current
    ) {
      return
    }
    ensureNavigationGuardEntry()
  }, [chartEditorOpen, dirty, ensureNavigationGuardEntry, publicationUrlDirty])

  useEffect(() => {
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
            [UNSAVED_HISTORY_STATE_KEY]: guardEntry.token,
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
  }, [confirmUnsavedNavigation])

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current != null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
    }
  }, [])

  const selectedBlock = useMemo(() => {
    if (
      !draft ||
      selectedPanel === 'overview' ||
      selectedPanel === 'header' ||
      selectedPanel === 'intro' ||
      selectedPanel === 'stats'
    ) {
      return null
    }
    return draft.blocks.find((block) => block.id === selectedPanel) ?? null
  }, [draft, selectedPanel])
  const isPublished =
    record?.status === 'published' || conflict?.latest.status === 'published'
  const mutationBlocked = isPublished || conflict !== null
  const exactChartUrl = getExactChartUrl(selectedBlock)
  const editorStatus = conflict
    ? 'Conflict'
    : isPublished
      ? 'Published'
      : saving
        ? 'Saving'
        : dirty || publicationUrlDirty
          ? 'Unsaved'
          : 'Saved'

  useEffect(() => {
    readOnlyRef.current = isPublished
    if (isPublished || conflict) {
      chartEditorSessionOpenRef.current = false
      deferredChartServerChangeRef.current = null
      setChartEditorOpen(false)
      setChartLibraryOpen(false)
    }
  }, [conflict, isPublished])

  const shouldAutoScrollSelectedPreviewAnchor = selectedBlock != null
  const selectedPreviewAnchorId = useMemo(() => {
    if (selectedPanel === 'overview') return 'newsletter-preview-header'
    if (selectedPanel === 'header') return 'newsletter-preview-header'
    if (selectedPanel === 'intro') return 'newsletter-preview-intro'
    if (selectedPanel === 'stats') return 'newsletter-preview-stats'
    return selectedBlock ? `newsletter-preview-block-${selectedBlock.id}` : null
  }, [selectedBlock, selectedPanel])

  async function handleCopyControlValue(copyId: string, value: string): Promise<void> {
    try {
      await copyTextToClipboard(value)
      setCopiedControlId(copyId)

      if (copyResetTimeoutRef.current != null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }

      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedControlId((current) => (current === copyId ? null : current))
      }, 1600)
    } catch (copyError) {
      console.error('Failed to copy field value:', copyError)
      setError('Failed to copy field value')
    }
  }

  useEffect(() => {
    if (!isPreviewExpanded) return

    const trigger = expandedPreviewTriggerRef.current
    const previousOverflow = document.body.style.overflow
    const focusFrame = window.requestAnimationFrame(() => {
      expandedPreviewCloseButtonRef.current?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewExpanded(false)
        return
      }
      if (event.key !== 'Tab') return

      const dialog = expandedPreviewDialogRef.current
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

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      if (trigger?.isConnected) trigger.focus()
    }
  }, [isPreviewExpanded])

  const scrollPreviewFrameToAnchor = useCallback(
    (
      frame: HTMLIFrameElement | null,
      anchorId: string | null,
      alignPreviewSection: boolean,
    ) => {
      if (!anchorId || !frame) return

      const previewSection = previewSectionRef.current
      const inspectorSection = inspectorSectionRef.current
      const frameWindow = frame?.contentWindow
      const frameDocument = frame?.contentDocument
      if (!frameWindow || !frameDocument) return

      const anchor = frameDocument.getElementById(anchorId)
      if (!anchor) return
      const isBlockAnchor = anchorId.startsWith('newsletter-preview-block-')
      const previewScrollTopOffset = isBlockAnchor
        ? BLOCK_PREVIEW_SCROLL_TOP_OFFSET
        : DEFAULT_PREVIEW_SCROLL_TOP_OFFSET
      const pageScrollTopOffset = isBlockAnchor
        ? BLOCK_PAGE_SCROLL_TOP_OFFSET
        : DEFAULT_PAGE_SCROLL_TOP_OFFSET

      requestAnimationFrame(() => {
        anchor.scrollIntoView({
          block: 'start',
          inline: 'nearest',
          behavior: 'auto',
        })

        frameWindow.scrollBy({
          top: -previewScrollTopOffset,
          left: 0,
          behavior: 'auto',
        })

        if (!alignPreviewSection) return

        requestAnimationFrame(() => {
          const desiredViewportTop = pageScrollTopOffset
          const alignTarget = inspectorSection ?? previewSection
          const targetPageTop = alignTarget
            ? Math.max(
                window.scrollY +
                  alignTarget.getBoundingClientRect().top -
                  desiredViewportTop,
                0,
              )
            : 0
          window.scrollTo({
            top: targetPageTop,
            left: 0,
            behavior: 'auto',
          })
        })
      })
    },
    [],
  )

  const scrollPreviewToSelectedAnchor = useCallback(
    (anchorId: string | null) => {
      scrollPreviewFrameToAnchor(
        previewFrameRef.current,
        anchorId,
        !isPreviewExpanded,
      )
      scrollPreviewFrameToAnchor(
        expandedPreviewFrameRef.current,
        anchorId,
        false,
      )
    },
    [isPreviewExpanded, scrollPreviewFrameToAnchor],
  )

  useEffect(() => {
    if (!shouldAutoScrollSelectedPreviewAnchor) return
    scrollPreviewToSelectedAnchor(selectedPreviewAnchorId)
  }, [
    record?.previewHtml,
    selectedPreviewAnchorId,
    isPreviewExpanded,
    scrollPreviewToSelectedAnchor,
    shouldAutoScrollSelectedPreviewAnchor,
  ])

  function updateDraft(next: NewsletterDraftDocument) {
    if (readOnlyRef.current) return
    ensureNavigationGuardEntry()
    editSequenceRef.current += 1
    draftRef.current = next
    dirtyRef.current = true
    setDraft(next)
    setDirty(true)
    setNotice(null)
    setError(null)
  }

  function updateDraftField<K extends keyof NewsletterDraftDocument>(
    key: K,
    value: NewsletterDraftDocument[K],
  ) {
    if (!draft) return
    updateDraft({ ...draft, [key]: value })
  }

  function updateHeaderField<K extends keyof NonNullable<NewsletterDraftDocument['header']>>(
    key: K,
    value: NonNullable<NewsletterDraftDocument['header']>[K],
  ) {
    if (!draft?.header) return
    updateDraft({
      ...draft,
      header: {
        ...draft.header,
        [key]: value,
      },
    })
  }

  function updateBlock(
    blockId: string,
    updater: (block: NewsletterDraftBlock) => NewsletterDraftBlock,
  ) {
    if (!draft) return
    updateDraft({
      ...draft,
      blocks: draft.blocks.map((block) =>
        block.id === blockId ? updater(block) : block,
      ),
    })
  }

  function updateBlockField<K extends keyof NewsletterDraftBlock>(
    blockId: string,
    key: K,
    value: NewsletterDraftBlock[K],
  ) {
    updateBlock(blockId, (block) => ({ ...block, [key]: value }))
  }

  function updateStatsItem(index: number, key: 'label' | 'value', value: string) {
    if (!draft?.statsCard) return

    updateDraft({
      ...draft,
      statsCard: {
        items: draft.statsCard.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, [key]: value } : item,
        ),
      },
    })
  }

  function moveBlockToPosition(
    draggedId: string,
    targetId: string,
    position: DropPosition,
  ) {
    if (!draft) return
    const draggedIndex = draft.blocks.findIndex((block) => block.id === draggedId)
    const targetIndex = draft.blocks.findIndex((block) => block.id === targetId)
    if (draggedIndex < 0 || targetIndex < 0) return

    const nextBlocks = reorderArrayItem(draft.blocks, draggedIndex, targetIndex, position)
    if (nextBlocks === draft.blocks) return

    updateDraft({
      ...draft,
      blocks: nextBlocks,
    })
  }

  function handleBlockDragStart(blockId: string, event: React.DragEvent<HTMLButtonElement>) {
    if (readOnlyRef.current) {
      event.preventDefault()
      return
    }
    setDraggedBlockId(blockId)
    setDropTarget(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', blockId)
  }

  function handleBlockDragOver(
    blockId: string,
    event: React.DragEvent<HTMLButtonElement>,
  ) {
    if (!draggedBlockId || draggedBlockId === blockId) return

    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const position: DropPosition =
      event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'

    setDropTarget((current) =>
      current?.blockId === blockId && current.position === position
        ? current
        : { blockId, position },
    )
  }

  function handleBlockDrop(blockId: string, event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    if (!draggedBlockId || draggedBlockId === blockId || !dropTarget) {
      setDraggedBlockId(null)
      setDropTarget(null)
      return
    }

    moveBlockToPosition(draggedBlockId, blockId, dropTarget.position)
    setDraggedBlockId(null)
    setDropTarget(null)
  }

  function handleBlockDragEnd() {
    setDraggedBlockId(null)
    setDropTarget(null)
  }

  async function persistDraft(
    status: NewsletterDraftStatus | undefined,
    successMessage: string,
  ) {
    const submittedDraft = draftRef.current
    const submittedRecord = recordRef.current
    if (
      !submittedDraft ||
      !submittedRecord ||
      readOnlyRef.current ||
      conflict ||
      savingRef.current
    ) {
      return
    }
    const submittedEditSequence = editSequenceRef.current

    try {
      savingRef.current = true
      setSaving(true)
      setError(null)
      setNotice(null)

      const response = await fetch(`/api/newsletter/drafts/${draftId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          draft: submittedDraft,
          expectedUpdatedAt: submittedRecord.updatedAt,
          ...(status ? { status } : {}),
        }),
      })

      const payload = (await response.json()) as DraftResponse

      if (response.status === 409 && payload.latest) {
        setLastCheckedAt(new Date().toISOString())
        setFreshnessError(null)
        setConflict({
          latest: payload.latest,
          message:
            payload.latest.status === 'published'
              ? 'This issue was published elsewhere before your save completed. Your local work is preserved and can be forked into a new draft.'
              : payload.error ||
                'The server has a newer version. Your local work is preserved until you resolve the conflict.',
        })
        setError(null)
        return
      }

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || 'Failed to save newsletter draft')
      }

      const savedRecord = payload.draft
      recordRef.current = savedRecord
      setRecord(savedRecord)
      setLastSavedAt(savedRecord.updatedAt)
      setLastCheckedAt(new Date().toISOString())
      setConflict(null)

      if (editSequenceRef.current === submittedEditSequence) {
        draftRef.current = savedRecord.draft
        dirtyRef.current = false
        setDraft(savedRecord.draft)
        setDirty(false)
        setSelectedPanel((current) =>
          resolveSelectedPanel(current, savedRecord.draft),
        )
        setNotice(successMessage)
      } else {
        dirtyRef.current = true
        setDirty(true)
        if (savedRecord.status === 'published') {
          setConflict({
            latest: savedRecord,
            message:
              'This issue was published while newer local edits were still in progress. Your local work is preserved and can be saved as a new draft.',
          })
          setNotice(null)
        } else {
          setNotice(
            'Earlier edits were saved. Newer edits made during the save are still unsaved.',
          )
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save newsletter draft')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function saveDraft() {
    await persistDraft(undefined, 'Draft saved and preview refreshed.')
  }

  async function updateWorkflowStatus(status: NewsletterDraftStatus) {
    await persistDraft(
      status,
      `Publishing stage updated to ${status === 'ready' ? 'ready to publish' : status}.`,
    )
  }

  function reloadLatestConflictVersion() {
    if (!conflict) return
    if (
      dirtyRef.current &&
      !window.confirm(
        'Reload the latest server version and discard your unsaved local edits?',
      )
    ) {
      return
    }

    const latest = conflict.latest
    editSequenceRef.current += 1
    recordRef.current = latest
    draftRef.current = latest.draft
    dirtyRef.current = false
    setRecord(latest)
    setDraft(latest.draft)
    setDirty(false)
    setConflict(null)
    setLastSavedAt(latest.updatedAt)
    setLastCheckedAt(new Date().toISOString())
    setSelectedPanel((current) =>
      resolveSelectedPanel(current, latest.draft),
    )
    setError(null)
    setNotice('Loaded the latest server version.')
  }

  async function forkLocalDraft() {
    const localDraft = draftRef.current
    if (!localDraft || forking) return
    const submittedEditSequence = editSequenceRef.current
    const idempotencyKey = `fork-${sha256Hex(
      JSON.stringify({ sourceDraftId: draftId, draft: localDraft }),
    )}`

    try {
      setForking(true)
      setError(null)
      const response = await fetch(`/api/newsletter/drafts/${draftId}/fork`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: localDraft, idempotencyKey }),
      })
      const payload = (await response.json()) as DraftResponse
      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || 'Failed to save local work as a new draft')
      }

      if (editSequenceRef.current === submittedEditSequence) {
        dirtyRef.current = false
        setDirty(false)
        router.push(`/newsletter/editor/${payload.draft.id}`)
      } else {
        dirtyRef.current = true
        setDirty(true)
        setNotice(
          'A new draft was saved from the earlier snapshot, but newer edits are still unsaved. Save local work as a new draft again to include them.',
        )
      }
    } catch (forkError) {
      setError(
        forkError instanceof Error
          ? forkError.message
          : 'Failed to save local work as a new draft',
      )
    } finally {
      setForking(false)
    }
  }

  function closeChartEditor() {
    chartEditorSessionOpenRef.current = false
    setChartEditorOpen(false)

    const deferredChange = deferredChartServerChangeRef.current
    deferredChartServerChangeRef.current = null
    if (!deferredChange) return

    const latest = deferredChange.latest
    editSequenceRef.current += 1
    recordRef.current = latest
    setRecord(latest)
    setLastSavedAt(latest.updatedAt)
    setLastCheckedAt(new Date().toISOString())
    setFreshnessError(null)
    setError(null)

    if (dirtyRef.current) {
      setConflict(deferredChange)
      setNotice(null)
      return
    }

    draftRef.current = latest.draft
    dirtyRef.current = false
    setDraft(latest.draft)
    setDirty(false)
    setConflict(null)
    setSelectedPanel((current) =>
      resolveSelectedPanel(current, latest.draft),
    )
    setNotice('Draft refreshed with the latest saved version.')
  }

  function openChartEditor() {
    if (readOnlyRef.current) return
    setIsPreviewExpanded(false)
    ensureNavigationGuardEntry()
    deferredChartServerChangeRef.current = null
    chartEditorSessionOpenRef.current = true
    chartEditorOpenedEditSequenceRef.current = editSequenceRef.current
    setChartEditorOpen(true)
  }

  async function copyBeehiivHtml(openBeehiiv = false) {
    const beehiivWindow = openBeehiiv
      ? window.open('https://beehiiv.new', 'finquote-beehiiv-fallback')
      : null
    if (beehiivWindow) {
      beehiivWindow.opener = null
    }

    try {
      setCopyingBeehiiv(true)
      setError(null)

      const response = await fetch(`/api/newsletter/drafts/${draftId}/beehiiv-html`, {
        credentials: 'include',
      })

      const payload = (await response.json()) as { html?: string; error?: string }

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to get Beehiiv HTML')
      }

      if (!payload.html) {
        throw new Error('No HTML returned')
      }

      await copyTextToClipboard(payload.html)
      setNotice(
        openBeehiiv
          ? 'HTML copied. Add an HTML Snippet block in Beehiiv and paste.'
          : 'Beehiiv HTML copied to clipboard.',
      )
    } catch (err) {
      beehiivWindow?.close()
      setError(err instanceof Error ? err.message : 'Failed to copy Beehiiv HTML')
    } finally {
      setCopyingBeehiiv(false)
    }
  }

  async function downloadNewsletterHtml() {
    try {
      setDownloadingHtml(true)
      setError(null)
      setNotice(null)

      const response = await fetch(`/api/newsletter/drafts/${draftId}/beehiiv-html`, {
        credentials: 'include',
      })

      const payload = (await response.json()) as { html?: string; error?: string }

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to get newsletter HTML')
      }

      if (!payload.html) {
        throw new Error('No HTML returned')
      }

      const slugSource =
        draft?.subjectLine?.trim() || draft?.ticker?.trim() || `newsletter-${draftId}`
      const safeSlug = slugSource
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || `newsletter-${draftId}`
      const datePart = new Date().toISOString().slice(0, 10)
      const filename = `${datePart}-${safeSlug}.html`

      const blob = new Blob([payload.html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      setNotice(`Downloaded ${filename}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download newsletter HTML')
    } finally {
      setDownloadingHtml(false)
    }
  }

  async function regenerateNewsletter() {
    if (readOnlyRef.current || conflict) return
    if (draft?.manualDraft) {
      setError(
        'Blank manual drafts do not support regenerate. Start with Generate, or keep editing this draft manually.',
      )
      return
    }

    if (dirty) {
      const confirmed = window.confirm(
        'Regenerate newsletter will replace your current unsaved edits with a new AI-generated draft for this ticker. Continue?',
      )
      if (!confirmed) {
        return
      }
    }

    const currentRecord = recordRef.current
    if (!currentRecord) return
    const submittedEditSequence = editSequenceRef.current

    try {
      savingRef.current = true
      setRegeneratingNewsletter(true)
      setError(null)
      setNotice(null)

      const response = await fetch(
        `/api/newsletter/drafts/${draftId}/regenerate-newsletter`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedUpdatedAt: currentRecord.updatedAt }),
        },
      )

      const payload = (await response.json()) as DraftResponse

      if (response.status === 409 && payload.latest) {
        setLastCheckedAt(new Date().toISOString())
        setConflict({
          latest: payload.latest,
          message:
            payload.error ||
            'The server has a newer version. Your local work is preserved until you resolve the conflict.',
        })
        return
      }

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || 'Failed to regenerate newsletter')
      }

      const regeneratedRecord = payload.draft
      setLastCheckedAt(new Date().toISOString())

      if (editSequenceRef.current !== submittedEditSequence) {
        dirtyRef.current = true
        setDirty(true)
        setConflict({
          latest: regeneratedRecord,
          message:
            'Newsletter regeneration completed while you were making newer local edits. Your edits are preserved and can be saved as a new draft.',
        })
        setNotice(null)
        return
      }

      recordRef.current = regeneratedRecord
      draftRef.current = regeneratedRecord.draft
      dirtyRef.current = false
      setRecord(regeneratedRecord)
      setDraft(regeneratedRecord.draft)
      setLastSavedAt(regeneratedRecord.updatedAt)
      setSelectedPanel((current) =>
        resolveSelectedPanel(current, regeneratedRecord.draft),
      )
      setDirty(false)
      setConflict(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate newsletter')
    } finally {
      savingRef.current = false
      setRegeneratingNewsletter(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-300 bg-white p-8 text-sm text-gray-600 shadow-sm">
        Loading newsletter draft…
      </div>
    )
  }

  if (isNewDraft) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-gray-300 bg-white px-5 py-3.5 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Link
                href="/newsletter/editor"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-cream-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-gray-700 transition hover:border-sage-300 hover:bg-sage-50 hover:text-sage-800"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="h-3.5 w-3.5"
                >
                  <path
                    d="M9.5 3.5L5 8L9.5 12.5"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back
              </Link>
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">
              New newsletter draft
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
              New
            </span>
            <div ref={newDraftPopoverRef} className="relative">
              <button
                type="button"
                onClick={() =>
                  setNewDraftOpenFormat((prev) => (prev ? null : 'single_stock'))
                }
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                  newDraftOpenFormat
                    ? 'border-sage-800 bg-sage-800 text-white'
                    : 'border-sage-700 text-sage-800 hover:bg-sage-50'
                }`}
                aria-haspopup="dialog"
                aria-expanded={newDraftOpenFormat !== null}
              >
                + New
              </button>
              {newDraftOpenFormat ? (
                <div className="absolute right-0 top-full z-30 mt-2 w-[420px] max-w-[calc(100vw-2rem)]">
                  <NewsletterDraftCreate
                    defaultFormat={newDraftOpenFormat}
                    beforeCreate={confirmUnsavedNavigation}
                    getEditSequence={() => editSequenceRef.current}
                    beforeNavigate={(submittedEditSequence) =>
                      (submittedEditSequence === editSequenceRef.current &&
                        !chartEditorSessionOpenRef.current) ||
                      confirmUnsavedNavigation()
                    }
                  />
                </div>
              ) : null}
            </div>
            <button
              type="button"
              disabled
              className="rounded-lg border border-sage-700 px-2.5 py-1.5 text-xs font-semibold text-sage-800 opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              disabled
              className="rounded-lg border border-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-900 opacity-40"
            >
              Regenerate
            </button>
            <button
              type="button"
              disabled
              className="rounded-lg bg-sage-700 px-2.5 py-1.5 text-xs font-semibold text-white opacity-40"
            >
              Edit chart
            </button>
            <button
              type="button"
              disabled
              className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white opacity-40"
            >
              Sync Beehiiv draft
            </button>
            <button
              type="button"
              disabled
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 opacity-40"
              title="Fullscreen preview"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="10 2 14 2 14 6" />
                <polyline points="6 14 2 14 2 10" />
                <line x1="14" y1="2" x2="9.5" y2="6.5" />
                <line x1="2" y1="14" x2="6.5" y2="9.5" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-gray-300 bg-white p-4 shadow-sm xl:sticky xl:top-6 xl:self-start">
            <div className="space-y-2">
              {['Subject Line', 'Header', 'Intro', 'Metrics Snapshot'].map((label, index) => (
                <div
                  key={label}
                  className={`w-full rounded-xl px-4 py-3 text-left ${
                    index === 0
                      ? 'bg-sage-700 text-white'
                      : 'bg-cream-100 text-gray-400'
                  }`}
                >
                  <div className="text-sm font-medium">{label}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t border-gray-200 pt-4">
              <div className="space-y-2">
                {[1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-gray-400"
                  >
                    <div className="text-sm font-medium">Block {index}</div>
                    <div className="mt-2 text-sm font-semibold leading-5">
                      New section
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className="rounded-2xl border border-gray-300 bg-[#f8f8f5] p-4 shadow-sm">
            <div className="mx-auto max-w-[760px] overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
              <div className="flex min-h-[58px] items-center border-b border-[#d9d9d4] bg-[#f3f3f0] px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                  <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                  <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                </div>
                <div className="ml-auto flex items-center gap-2 text-right">
                  <div className="text-[13px] font-medium text-[#4b5563]">
                    Email Style Preview
                  </div>
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#b9c0cb] text-[10px] font-semibold leading-none text-[#7b8491]">
                    i
                  </span>
                </div>
              </div>

              <div className="flex h-[1000px] items-center justify-center bg-white px-8 text-center">
                <div className="max-w-md space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage-700">
                    New Newsletter
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
                    Generate a new draft
                  </h2>
                  <p className="text-sm leading-6 text-gray-500">
                    Use the + New button in the top bar to choose a format and
                    either generate a newsletter or start from a blank draft. The
                    preview will appear here after creation.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    )
  }

  if (!draft || !record) {
    return (
      <div
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50 p-8 text-sm text-red-700 shadow-sm"
      >
        {error || 'Unable to load this newsletter draft.'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div
        data-testid="newsletter-editor-surface"
        className="space-y-4"
        inert={
          chartEditorOpen || chartLibraryOpen || isPreviewExpanded
            ? true
            : undefined
        }
        aria-hidden={
          chartEditorOpen || chartLibraryOpen || isPreviewExpanded
            ? true
            : undefined
        }
      >
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-300 bg-white px-5 py-3.5 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Link
              href="/newsletter/editor"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-cream-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-gray-700 transition hover:border-sage-300 hover:bg-sage-50 hover:text-sage-800"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                className="h-3.5 w-3.5"
              >
                <path
                  d="M9.5 3.5L5 8L9.5 12.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back
            </Link>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">
            {draft.subjectLine}
          </h1>
          <div
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500"
            aria-live="polite"
          >
            <span
              data-testid="editor-status"
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                editorStatus === 'Conflict'
                  ? 'bg-red-100 text-red-800'
                  : editorStatus === 'Unsaved'
                    ? 'bg-amber-100 text-amber-800'
                    : editorStatus === 'Saving'
                      ? 'bg-blue-100 text-blue-800'
                      : editorStatus === 'Published'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-sage-100 text-sage-800'
              }`}
            >
              {editorStatus}
            </span>
            <span>
              Last saved{' '}
              <time dateTime={lastSavedAt ?? undefined}>
                {formatEditorTimestamp(lastSavedAt)}
              </time>
            </span>
            <span>
              Last checked{' '}
              <time dateTime={lastCheckedAt ?? undefined}>
                {formatEditorTimestamp(lastCheckedAt)}
              </time>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div ref={newDraftPopoverRef} className="relative">
            <button
              type="button"
              onClick={() =>
                setNewDraftOpenFormat((prev) => (prev ? null : 'single_stock'))
              }
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                newDraftOpenFormat
                  ? 'border-sage-800 bg-sage-800 text-white'
                  : 'border-sage-700 text-sage-800 hover:bg-sage-50'
              }`}
              aria-haspopup="dialog"
              aria-expanded={newDraftOpenFormat !== null}
            >
              + New
            </button>
            {newDraftOpenFormat ? (
              <div className="absolute right-0 top-full z-30 mt-2 w-[420px] max-w-[calc(100vw-2rem)]">
                <NewsletterDraftCreate
                  defaultFormat={newDraftOpenFormat}
                  beforeCreate={confirmUnsavedNavigation}
                  getEditSequence={() => editSequenceRef.current}
                  beforeNavigate={(submittedEditSequence) =>
                    (submittedEditSequence === editSequenceRef.current &&
                      !chartEditorSessionOpenRef.current) ||
                    confirmUnsavedNavigation()
                  }
                />
              </div>
            ) : null}
          </div>

          {!isPublished ? (
            <>
              <button
                type="button"
                onClick={saveDraft}
                disabled={!dirty || saving || regeneratingNewsletter || mutationBlocked}
                className="rounded-lg border border-sage-700 px-2.5 py-1.5 text-xs font-semibold text-sage-800 transition hover:bg-sage-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>

              <button
                type="button"
                onClick={regenerateNewsletter}
                disabled={
                  regeneratingNewsletter ||
                  saving ||
                  draft.manualDraft === true ||
                  mutationBlocked
                }
                className="rounded-lg border border-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {regeneratingNewsletter ? 'Regenerating…' : 'Regenerate'}
              </button>

              <button
                type="button"
                onClick={openChartEditor}
                disabled={
                  !selectedBlock ||
                  saving ||
                  regeneratingNewsletter ||
                  mutationBlocked
                }
                className="rounded-lg bg-sage-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Edit chart
              </button>

              <button
                type="button"
                onClick={() => setChartLibraryOpen(true)}
                disabled={
                  !selectedBlock ||
                  saving ||
                  regeneratingNewsletter ||
                  isNewDraft ||
                  mutationBlocked
                }
                className="rounded-lg border border-sage-700 px-2.5 py-1.5 text-xs font-semibold text-sage-800 transition hover:bg-sage-50 disabled:cursor-not-allowed disabled:opacity-50"
                title={isNewDraft ? 'Create or save the draft before choosing a saved chart' : 'Choose a saved chart'}
              >
                Choose chart
              </button>

              <button
                type="button"
                onClick={() => void beehiivPanelRef.current?.deliver()}
                disabled={
                  beehiivBusy ||
                  copyingBeehiiv ||
                  dirty ||
                  mutationBlocked
                }
                className="rounded-lg bg-gray-950 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                title={dirty ? 'Save the draft before syncing the latest version' : 'Create or sync the Beehiiv draft'}
              >
                {beehiivBusy ? 'Syncing…' : 'Sync Beehiiv draft'}
              </button>
            </>
          ) : exactChartUrl ? (
            <a
              href={exactChartUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-sage-700 px-2.5 py-1.5 text-xs font-semibold text-sage-800 transition hover:bg-sage-50"
            >
              View exact chart
            </a>
          ) : null}

          <button
            type="button"
            onClick={downloadNewsletterHtml}
            disabled={downloadingHtml || dirty || conflict !== null}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-sage-400 hover:text-sage-800 disabled:cursor-not-allowed disabled:opacity-50"
            title={dirty ? 'Save draft first to download latest HTML' : 'Download newsletter as HTML file'}
          >
            {downloadingHtml ? 'Downloading…' : 'Download'}
          </button>

          <button
            type="button"
            onClick={(event) => {
              expandedPreviewTriggerRef.current = event.currentTarget
              setIsPreviewExpanded(true)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:border-sage-400 hover:text-sage-800"
            aria-label="Open fullscreen preview"
            title="Fullscreen preview"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="10 2 14 2 14 6" />
              <polyline points="6 14 2 14 2 10" />
              <line x1="14" y1="2" x2="9.5" y2="6.5" />
              <line x1="2" y1="14" x2="6.5" y2="9.5" />
            </svg>
          </button>
        </div>
      </div>

      <NewsletterWorkflowBar
        draft={draft}
        status={conflict?.latest.status ?? record.status}
        busy={
          saving ||
          regeneratingNewsletter ||
          publicationUrlDirty ||
          mutationBlocked
        }
        onStatusChange={(status) => void updateWorkflowStatus(status)}
      />

      <NewsletterBeehiivPanel
        ref={beehiivPanelRef}
        record={record}
        disabled={
          saving ||
          regeneratingNewsletter ||
          dirty ||
          publicationUrlDirty ||
          copyingBeehiiv ||
          mutationBlocked
        }
        onNotice={(message) => {
          setError(null)
          setNotice(message)
        }}
        onError={(message) => {
          setNotice(null)
          setError(message)
        }}
        onBusyChange={setBeehiivBusy}
        onCopyFallback={() => copyBeehiivHtml(true)}
      />

      <NewsletterPublicationPanel
        record={record}
        disabled={
          saving ||
          regeneratingNewsletter ||
          beehiivBusy ||
          dirty ||
          mutationBlocked
        }
        getEditSequence={() => editSequenceRef.current}
        onDirtyChange={handlePublicationUrlDirtyChange}
        onRecordChange={(nextRecord, submittedEditSequence) => {
          if (
            !chartEditorSessionOpenRef.current &&
            !dirtyRef.current &&
            recordRef.current?.updatedAt === nextRecord.updatedAt
          ) {
            setLastSavedAt(nextRecord.updatedAt)
            setLastCheckedAt(new Date().toISOString())
            setFreshnessError(null)
            setError(null)
            setConflict(null)
            return
          }

          const hasNewerLocalEdits =
            editSequenceRef.current !== submittedEditSequence

          if (chartEditorSessionOpenRef.current) {
            deferredChartServerChangeRef.current = {
              latest: nextRecord,
              message:
                nextRecord.status === 'published'
                  ? 'Publication completed while the chart editor was open. Your chart edits are preserved and can be saved as a new draft.'
                  : 'Publication details changed while the chart editor was open. Your chart edits are preserved until you resolve the conflict.',
            }
            setLastCheckedAt(new Date().toISOString())
            setFreshnessError(null)
            setError(null)
            setNotice(
              nextRecord.status === 'published'
                ? 'Publication completed while the chart editor was open. Save the chart to recover your attempted chart edits safely.'
                : 'Publication details changed while the chart editor was open. Save the chart to resolve the newer server version safely.',
            )
            return
          }

          editSequenceRef.current += 1
          recordRef.current = nextRecord
          setRecord(nextRecord)
          setLastSavedAt(nextRecord.updatedAt)
          setLastCheckedAt(new Date().toISOString())
          setFreshnessError(null)
          setError(null)

          if (hasNewerLocalEdits) {
            dirtyRef.current = true
            setDirty(true)
            setConflict({
              latest: nextRecord,
              message:
                nextRecord.status === 'published'
                  ? 'Publication completed while you were making newer local edits. Your edits are preserved and can be saved as a new draft.'
                  : 'Publication details changed while you were making newer local edits. Your edits are preserved until you resolve the conflict.',
            })
            setNotice(null)
            return
          }

          draftRef.current = nextRecord.draft
          dirtyRef.current = false
          setDraft(nextRecord.draft)
          setDirty(false)
          setConflict(null)
        }}
      />

      {conflict ? (
        <section
          role="alert"
          aria-label="Newsletter draft conflict"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900"
        >
          <p className="font-semibold">A newer version of this issue exists.</p>
          <p className="mt-1 leading-6">{conflict.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reloadLatestConflictVersion}
              disabled={forking}
              className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reload latest
            </button>
            <button
              type="button"
              onClick={() => void forkLocalDraft()}
              disabled={forking}
              className="rounded-lg bg-red-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {forking ? 'Saving new draft…' : 'Save local work as new draft'}
            </button>
          </div>
        </section>
      ) : null}

      {isPublished && !conflict ? (
        <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900">
          Published content is read-only. The saved preview, download, published
          issue link, and exact chart assets remain available for reference.
        </div>
      ) : null}

      {freshnessError ? (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Freshness check failed: {freshnessError}. Your current work is unchanged.
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="rounded-2xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-800"
        >
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <aside className="rounded-2xl border border-gray-300 bg-white p-4 shadow-sm xl:sticky xl:top-6 xl:self-start">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setSelectedPanel('overview')}
              className={`w-full rounded-xl px-4 py-3 text-left transition ${
                selectedPanel === 'overview'
                  ? 'bg-sage-700 text-white'
                  : 'bg-cream-100 text-gray-700 hover:bg-sage-50'
              }`}
            >
              <div className="text-sm font-medium">Subject Line</div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPanel('header')}
              className={`w-full rounded-xl px-4 py-3 text-left transition ${
                selectedPanel === 'header'
                  ? 'bg-sage-700 text-white'
                  : 'bg-cream-100 text-gray-700 hover:bg-sage-50'
              }`}
            >
              <div className="text-sm font-medium">Header</div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPanel('intro')}
              className={`w-full rounded-xl px-4 py-3 text-left transition ${
                selectedPanel === 'intro'
                  ? 'bg-sage-700 text-white'
                  : 'bg-cream-100 text-gray-700 hover:bg-sage-50'
              }`}
            >
              <div className="text-sm font-medium">Intro</div>
            </button>

            {draft.statsCard ? (
              <button
                type="button"
                onClick={() => setSelectedPanel('stats')}
              className={`w-full rounded-xl px-4 py-3 text-left transition ${
                selectedPanel === 'stats'
                  ? 'bg-sage-700 text-white'
                  : 'bg-cream-100 text-gray-700 hover:bg-sage-50'
              }`}
            >
                <div className="text-sm font-medium">Metrics Snapshot</div>
              </button>
            ) : null}
          </div>

          <div className="mt-6 border-t border-gray-200 pt-4">
            <div className="space-y-2">
              {draft.blocks.map((block, index) => {
                const isActive = selectedPanel === block.id
                const isDragged = draggedBlockId === block.id
                const dropBefore = dropTarget?.blockId === block.id && dropTarget.position === 'before'
                const dropAfter = dropTarget?.blockId === block.id && dropTarget.position === 'after'
                return (
                  <button
                    key={block.id}
                    type="button"
                    draggable={!isPublished}
                    onClick={() => setSelectedPanel(block.id)}
                    onDragStart={(event) => handleBlockDragStart(block.id, event)}
                    onDragOver={(event) => handleBlockDragOver(block.id, event)}
                    onDrop={(event) => handleBlockDrop(block.id, event)}
                    onDragEnd={handleBlockDragEnd}
	                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
	                      isActive
	                        ? 'border-sage-700 bg-sage-700 text-white'
	                        : 'border-gray-200 bg-white text-gray-700 hover:border-sage-300 hover:bg-sage-50'
	                    } ${isDragged ? 'opacity-60' : ''} ${dropBefore ? 'border-t-4 border-t-sage-500' : ''} ${dropAfter ? 'border-b-4 border-b-sage-500' : ''} ${isPublished ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
	                  >
	                    <div className="flex items-center justify-between gap-3">
	                      <span className="text-sm font-medium">
	                        Block {index + 1}
	                      </span>
                    </div>
                    <div className="mt-2 text-sm font-semibold leading-5">
                      {block.heading}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        <section
          ref={previewSectionRef}
          className="rounded-2xl border border-gray-300 bg-[#f8f8f5] p-4 shadow-sm"
        >
          <div className="mx-auto max-w-[760px] overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
            <div className="flex min-h-[58px] items-center border-b border-[#d9d9d4] bg-[#f3f3f0] px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              </div>
              <div className="ml-auto flex items-center gap-2 text-right">
                <div className="text-[13px] font-medium text-[#4b5563]">
                  Email Style Preview
                </div>
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#b9c0cb] text-[10px] font-semibold leading-none text-[#7b8491]">
                  i
                </span>
              </div>
            </div>

            <iframe
              ref={previewFrameRef}
              key={`${record.id}:${record.updatedAt}`}
              title="Newsletter preview"
              srcDoc={record.previewHtml}
              onLoad={() => {
                attachPreviewChartHandler(previewFrameRef.current)
                if (!shouldAutoScrollSelectedPreviewAnchor) return
                scrollPreviewToSelectedAnchor(selectedPreviewAnchorId)
              }}
              className="h-[1000px] w-full bg-white"
            />
          </div>
        </section>

        <section
          ref={inspectorSectionRef}
          className="rounded-2xl border border-gray-300 bg-white p-4 shadow-sm xl:sticky xl:top-6 xl:self-start"
        >
          {selectedPanel === 'overview' ? (
            <div className="space-y-3">
              <div className="block">
                <CopyableControl
                  copyId="draft-subject-line"
                  value={draft.subjectLine}
                  label="Subject line"
                  copiedControlId={copiedControlId}
                  onCopy={handleCopyControlValue}
                  renderControl={(controlId) => (
                    <textarea
                      id={controlId}
                      value={draft.subjectLine}
                      onChange={(event) => updateDraftField('subjectLine', event.target.value)}
                      readOnly={isPublished}
                      aria-readonly={isPublished}
                      rows={3}
                      className="w-full resize-y rounded-2xl border border-gray-300 px-5 py-3 text-sm leading-6 text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 read-only:bg-gray-50"
                    />
                  )}
                />
              </div>
            </div>
          ) : selectedPanel === 'header' && draft.header ? (
            <div className="space-y-3">
              <div className="block">
                <CopyableControl
                  copyId="header-title"
                  value={draft.header!.title}
                  label="Title"
                  copiedControlId={copiedControlId}
                  onCopy={handleCopyControlValue}
                  renderControl={(controlId) => (
                    <input
                      id={controlId}
                      value={draft.header!.title}
                      onChange={(event) => updateHeaderField('title', event.target.value)}
                      readOnly={isPublished}
                      aria-readonly={isPublished}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 read-only:bg-gray-50"
                    />
                  )}
                />
              </div>

              <div className="block">
                <CopyableControl
                  copyId="header-date-text"
                  value={draft.header!.dateText}
                  label="Date text"
                  copiedControlId={copiedControlId}
                  onCopy={handleCopyControlValue}
                  renderControl={(controlId) => (
                    <input
                      id={controlId}
                      value={draft.header!.dateText}
                      onChange={(event) => updateHeaderField('dateText', event.target.value)}
                      readOnly={isPublished}
                      aria-readonly={isPublished}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 read-only:bg-gray-50"
                    />
                  )}
                />
              </div>

              <div className="block">
                <CopyableControl
                  copyId="header-badge-text"
                  value={draft.header!.badgeText}
                  label="Badge text"
                  copiedControlId={copiedControlId}
                  onCopy={handleCopyControlValue}
                  renderControl={(controlId) => (
                    <input
                      id={controlId}
                      value={draft.header!.badgeText}
                      onChange={(event) => updateHeaderField('badgeText', event.target.value)}
                      readOnly={isPublished}
                      aria-readonly={isPublished}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 read-only:bg-gray-50"
                    />
                  )}
                />
              </div>
            </div>
          ) : selectedPanel === 'intro' ? (
            <div className="space-y-3">
              <div className="block">
                <CopyableControl
                  copyId="draft-intro-text"
                  value={draft.introText}
                  label="Intro"
                  copiedControlId={copiedControlId}
                  onCopy={handleCopyControlValue}
                  renderControl={(controlId) => (
                    <textarea
                      id={controlId}
                      value={draft.introText}
                      onChange={(event) => updateDraftField('introText', event.target.value)}
                      readOnly={isPublished}
                      aria-readonly={isPublished}
                      rows={16}
                      className="min-h-[420px] w-full rounded-2xl border border-gray-300 px-4 py-2.5 text-sm leading-6 text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 read-only:bg-gray-50"
                    />
                  )}
                />
              </div>
            </div>
          ) : selectedPanel === 'stats' && draft.statsCard ? (
            <div className="space-y-3">
              {draft.statsCard.items.map((item, index) => (
                <div
                  key={`stats-item-${index}`}
                  className="rounded-2xl border border-gray-200 bg-cream-100 p-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Metric {index + 1}
                  </p>

                  <div className="mt-3 grid gap-3">
                    <div className="block">
                      <CopyableControl
                        copyId={`stats-item-${index}-label`}
                        value={item.label}
                        label="Label"
                        copiedControlId={copiedControlId}
                        onCopy={handleCopyControlValue}
                        renderControl={(controlId) => (
                          <input
                            id={controlId}
                            value={item.label}
                            onChange={(event) =>
                              updateStatsItem(index, 'label', event.target.value)
                            }
                            readOnly={isPublished}
                            aria-readonly={isPublished}
                            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 read-only:bg-gray-50"
                          />
                        )}
                      />
                    </div>

                    <div className="block">
                      <CopyableControl
                        copyId={`stats-item-${index}-value`}
                        value={item.value}
                        label="Value"
                        copiedControlId={copiedControlId}
                        onCopy={handleCopyControlValue}
                        renderControl={(controlId) => (
                          <input
                            id={controlId}
                            value={item.value}
                            onChange={(event) =>
                              updateStatsItem(index, 'value', event.target.value)
                            }
                            readOnly={isPublished}
                            aria-readonly={isPublished}
                            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 read-only:bg-gray-50"
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : selectedBlock ? (
            <div className="space-y-3">
              <div className="grid gap-3">
                <div className="block">
                  <CopyableControl
                    copyId={`${selectedBlock.id}-heading`}
                    value={selectedBlock.heading}
                    label="Heading"
                    copiedControlId={copiedControlId}
                    onCopy={handleCopyControlValue}
                    renderControl={(controlId) => (
                      <input
                        id={controlId}
                        value={selectedBlock.heading}
                        onChange={(event) =>
                          updateBlockField(selectedBlock.id, 'heading', event.target.value)
                        }
                        readOnly={isPublished}
                        aria-readonly={isPublished}
                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 read-only:bg-gray-50"
                      />
                    )}
                  />
                </div>

                <div className="block">
                  <CopyableControl
                    copyId={`${selectedBlock.id}-body`}
                    value={selectedBlock.body}
                    label="Commentary"
                    copiedControlId={copiedControlId}
                    onCopy={handleCopyControlValue}
                    renderControl={(controlId) => (
                      <RichTextEditor
                        id={controlId}
                        value={selectedBlock.body}
                        ariaLabel="Commentary"
                        readOnly={isPublished}
                        onChange={(html) =>
                          updateBlockField(selectedBlock.id, 'body', html)
                        }
                      />
                    )}
                  />
                </div>
              </div>

              {isPublished && exactChartUrl ? (
                <a
                  href={exactChartUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full rounded-xl border border-sage-700 px-4 py-2.5 text-center text-sm font-semibold text-sage-800 transition hover:bg-sage-50"
                >
                  View exact chart
                </a>
              ) : !isPublished ? (
                <button
                  type="button"
                  onClick={() => setChartLibraryOpen(true)}
                  disabled={
                    saving ||
                    regeneratingNewsletter ||
                    isNewDraft ||
                    mutationBlocked
                  }
                  className="w-full rounded-xl border border-sage-700 px-4 py-2.5 text-sm font-semibold text-sage-800 transition hover:bg-sage-50 disabled:cursor-not-allowed disabled:opacity-50"
                  title={isNewDraft ? 'Create or save the draft before choosing a saved chart' : 'Choose a saved chart'}
                >
                  Choose saved chart
                </button>
              ) : null}

            </div>
          ) : null}
        </section>
      </div>
      </div>

      {chartEditorOpen && record && draft && selectedBlock && !mutationBlocked ? (
        <NewsletterChartEditorDrawer
          key={selectedBlock.id}
          draftId={draftId}
          draft={draft}
          block={selectedBlock}
          expectedUpdatedAt={record.updatedAt}
          openedEditSequence={chartEditorOpenedEditSequenceRef.current}
          onClose={closeChartEditor}
          onConflict={(latest, attemptedDraft, message) => {
            chartEditorSessionOpenRef.current = false
            deferredChartServerChangeRef.current = null
            editSequenceRef.current += 1
            draftRef.current = attemptedDraft
            dirtyRef.current = true
            setDraft(attemptedDraft)
            setDirty(true)
            setConflict({ latest, message })
            setLastCheckedAt(new Date().toISOString())
            setFreshnessError(null)
            setError(null)
            setNotice(null)
          }}
          onSaved={(updatedRecord, openedEditSequence) => {
            if (editSequenceRef.current !== openedEditSequence) {
              const localDraft = draftRef.current ?? draft
              const recoverableDraft = mergeSavedChartIntoLocalDraft(
                localDraft,
                updatedRecord.draft,
                selectedBlock.id,
              )
              chartEditorSessionOpenRef.current = false
              deferredChartServerChangeRef.current = null
              setChartEditorOpen(false)
              editSequenceRef.current += 1
              recordRef.current = updatedRecord
              draftRef.current = recoverableDraft
              dirtyRef.current = true
              setRecord(updatedRecord)
              setDraft(recoverableDraft)
              setDirty(true)
              setConflict({
                latest: updatedRecord,
                message:
                  'The chart finished saving after newer local edits were made. Your text and the newly captured chart are preserved together; reload the saved chart or save this work as a new draft.',
              })
              setLastSavedAt(updatedRecord.updatedAt)
              setLastCheckedAt(new Date().toISOString())
              setFreshnessError(null)
              setError(null)
              setNotice(null)
              return false
            }

            deferredChartServerChangeRef.current = null
            editSequenceRef.current += 1
            recordRef.current = updatedRecord
            draftRef.current = updatedRecord.draft
            dirtyRef.current = false
            setRecord(updatedRecord)
            setDraft(updatedRecord.draft)
            setDirty(false)
            setConflict(null)
            setLastSavedAt(updatedRecord.updatedAt)
            setLastCheckedAt(new Date().toISOString())
            setNotice('Chart updated and preview refreshed.')
            return editSequenceRef.current
          }}
        />
      ) : null}

      {chartLibraryOpen && record && draft && selectedBlock && !mutationBlocked ? (
        <NewsletterChartLibraryPicker
          key={selectedBlock.id}
          draftId={draftId}
          draft={draft}
          block={selectedBlock}
          expectedUpdatedAt={record.updatedAt}
          onClose={() => setChartLibraryOpen(false)}
          getEditSequence={() => editSequenceRef.current}
          onConflict={(latest, attemptedDraft, message) => {
            editSequenceRef.current += 1
            draftRef.current = attemptedDraft
            dirtyRef.current = true
            setDraft(attemptedDraft)
            setDirty(true)
            setConflict({ latest, message })
            setLastCheckedAt(new Date().toISOString())
            setFreshnessError(null)
            setError(null)
            setNotice(null)
          }}
          onInserted={(updatedRecord, submittedEditSequence) => {
            if (
              !dirtyRef.current &&
              recordRef.current?.updatedAt === updatedRecord.updatedAt
            ) {
              setLastSavedAt(updatedRecord.updatedAt)
              setLastCheckedAt(new Date().toISOString())
              setFreshnessError(null)
              setError(null)
              setConflict(null)
              setNotice('Saved chart inserted and preview refreshed.')
              return
            }

            if (editSequenceRef.current !== submittedEditSequence) {
              const localDraft = draftRef.current ?? draft
              const recoverableDraft = mergeSavedChartIntoLocalDraft(
                localDraft,
                updatedRecord.draft,
                selectedBlock.id,
              )
              setChartLibraryOpen(false)
              editSequenceRef.current += 1
              recordRef.current = updatedRecord
              draftRef.current = recoverableDraft
              dirtyRef.current = true
              setRecord(updatedRecord)
              setDraft(recoverableDraft)
              setDirty(true)
              setConflict({
                latest: updatedRecord,
                message:
                  'The saved chart was inserted while newer local edits were still in progress. Your local work and the inserted chart are preserved together; reload the server version or save this work as a new draft.',
              })
              setLastSavedAt(updatedRecord.updatedAt)
              setLastCheckedAt(new Date().toISOString())
              setFreshnessError(null)
              setError(null)
              setNotice(null)
              return
            }

            editSequenceRef.current += 1
            recordRef.current = updatedRecord
            draftRef.current = updatedRecord.draft
            dirtyRef.current = false
            setRecord(updatedRecord)
            setDraft(updatedRecord.draft)
            setDirty(false)
            setConflict(null)
            setLastSavedAt(updatedRecord.updatedAt)
            setLastCheckedAt(new Date().toISOString())
            setNotice('Saved chart inserted and preview refreshed.')
          }}
        />
      ) : null}

      {isPreviewExpanded ? (
        <div
          ref={expandedPreviewDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="expanded-newsletter-preview-title"
          tabIndex={-1}
          className="fixed inset-0 z-50 bg-gray-950/55 p-4 backdrop-blur-sm"
        >
          <button
            ref={expandedPreviewCloseButtonRef}
            type="button"
            onClick={() => setIsPreviewExpanded(false)}
            className="absolute right-8 top-8 z-10 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-sage-400 hover:text-sage-800"
          >
            Close
          </button>

          <div className="flex h-full flex-col rounded-3xl border border-gray-200 bg-[#f8f8f5] shadow-2xl">
            <div className="min-h-0 flex-1 overflow-hidden p-4">
              <div className="mx-auto flex h-full max-w-[900px] flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                <div className="flex min-h-[58px] items-center border-b border-[#d9d9d4] bg-[#f3f3f0] px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span className="h-3 w-3 rounded-full bg-[#28c840]" />
                  </div>
                  <div className="ml-auto flex items-center gap-2 text-right">
                    <h2
                      id="expanded-newsletter-preview-title"
                      className="text-[13px] font-medium text-[#4b5563]"
                    >
                      Email Style Preview
                    </h2>
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#b9c0cb] text-[10px] font-semibold leading-none text-[#7b8491]">
                      i
                    </span>
                  </div>
                </div>

                <iframe
                  ref={expandedPreviewFrameRef}
                  key={`expanded-${record.id}:${record.updatedAt}`}
                  title="Expanded newsletter preview"
                  srcDoc={record.previewHtml}
                  onLoad={() => {
                attachPreviewChartHandler(expandedPreviewFrameRef.current)
                if (!shouldAutoScrollSelectedPreviewAnchor) return
                scrollPreviewToSelectedAnchor(selectedPreviewAnchorId)
              }}
                  className="min-h-0 flex-1 w-full bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
