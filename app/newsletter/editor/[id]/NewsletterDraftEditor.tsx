'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  NewsletterDraftBlock,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
} from '@/lib/newsletter/types'
import { RichTextEditor } from '@/components/newsletter/RichTextEditor'
import NewsletterChartEditorDrawer from '@/components/newsletter/NewsletterChartEditorDrawer'
import NewsletterDraftCreate from '@/app/newsletter/editor/NewsletterDraftCreate'

interface DraftResponse {
  draft: NewsletterDraftRecord
  error?: string
}

interface NewsletterDraftEditorProps {
  draftId: string
}

type SelectedPanel = 'overview' | 'header' | 'intro' | 'stats' | string
type DropPosition = 'before' | 'after'

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
async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const fallback = document.createElement('textarea')
  fallback.value = value
  fallback.setAttribute('readonly', '')
  fallback.style.position = 'fixed'
  fallback.style.opacity = '0'
  fallback.style.pointerEvents = 'none'
  document.body.appendChild(fallback)
  fallback.select()

  const copied = document.execCommand('copy')
  document.body.removeChild(fallback)

  if (!copied) {
    throw new Error('Copy failed')
  }
}

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
  renderControl: () => ReactNode
}) {
  const copied = copiedControlId === copyId

  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-2 ${label ? 'justify-between' : 'justify-end'}`}>
        {label ? (
          <span className="text-sm font-medium text-gray-700">{label}</span>
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
          aria-label={copied ? 'Copied' : 'Copy field value'}
          title={copied ? 'Copied' : 'Copy'}
        >
          <CopyIcon copied={copied} />
        </button>
      </div>
      {renderControl()}
    </div>
  )
}

export default function NewsletterDraftEditor({
  draftId,
}: NewsletterDraftEditorProps) {
  const previewSectionRef = useRef<HTMLElement | null>(null)
  const inspectorSectionRef = useRef<HTMLElement | null>(null)
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null)
  const expandedPreviewFrameRef = useRef<HTMLIFrameElement | null>(null)
  const copyResetTimeoutRef = useRef<number | null>(null)
  const [record, setRecord] = useState<NewsletterDraftRecord | null>(null)
  const [draft, setDraft] = useState<NewsletterDraftDocument | null>(null)
  const [selectedPanel, setSelectedPanel] = useState<SelectedPanel>('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regeneratingNewsletter, setRegeneratingNewsletter] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false)
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null)
  const [copiedControlId, setCopiedControlId] = useState<string | null>(null)
  const [copyingBeehiiv, setCopyingBeehiiv] = useState(false)
  const [copiedBeehiiv, setCopiedBeehiiv] = useState(false)
  const [chartEditorOpen, setChartEditorOpen] = useState(false)
  const draftRef = useRef<NewsletterDraftDocument | null>(null)
  const [newDraftOpenFormat, setNewDraftOpenFormat] = useState<
    'single_stock' | 'market_roundup' | null
  >(null)
  const newDraftPopoverRef = useRef<HTMLDivElement | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    blockId: string
    position: DropPosition
  } | null>(null)

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
    setChartEditorOpen(true)
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
    let cancelled = false

    async function loadDraft() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/newsletter/drafts/${draftId}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const payload = (await response.json()) as DraftResponse

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load newsletter draft')
        }

        if (!cancelled) {
          setRecord(payload.draft)
          setDraft(payload.draft.draft)
          setSelectedPanel((current) =>
            current === 'overview' ||
            current === 'header' ||
            current === 'intro' ||
            current === 'stats'
              ? current
              : payload.draft.draft.blocks.some((block) => block.id === current)
                ? current
                : payload.draft.draft.blocks[0]?.id ?? 'overview',
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
  }, [draftId])

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

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPreviewExpanded(false)
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPreviewExpanded])

  function scrollPreviewFrameToAnchor(
    frame: HTMLIFrameElement | null,
    anchorId: string | null,
    alignPreviewSection: boolean,
  ) {
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
  }

  function scrollPreviewToSelectedAnchor(anchorId: string | null) {
    scrollPreviewFrameToAnchor(previewFrameRef.current, anchorId, !isPreviewExpanded)
    scrollPreviewFrameToAnchor(expandedPreviewFrameRef.current, anchorId, false)
  }

  useEffect(() => {
    if (!shouldAutoScrollSelectedPreviewAnchor) return
    scrollPreviewToSelectedAnchor(selectedPreviewAnchorId)
  }, [
    record?.previewHtml,
    selectedPreviewAnchorId,
    isPreviewExpanded,
    shouldAutoScrollSelectedPreviewAnchor,
  ])

  function updateDraft(next: NewsletterDraftDocument) {
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

  async function saveDraft() {
    if (!draft) return

    try {
      setSaving(true)
      setError(null)
      setNotice(null)

      const response = await fetch(`/api/newsletter/drafts/${draftId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ draft }),
      })

      const payload = (await response.json()) as DraftResponse

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save newsletter draft')
      }

      setRecord(payload.draft)
      setDraft(payload.draft.draft)
      setDirty(false)
      setNotice('Draft saved and preview refreshed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save newsletter draft')
    } finally {
      setSaving(false)
    }
  }

  async function copyBeehiivHtml() {
    try {
      setCopyingBeehiiv(true)
      setCopiedBeehiiv(false)
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
      setCopiedBeehiiv(true)
      setNotice('Beehiiv HTML copied to clipboard!')

      setTimeout(() => {
        setCopiedBeehiiv(false)
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy Beehiiv HTML')
    } finally {
      setCopyingBeehiiv(false)
    }
  }

  async function regenerateNewsletter() {
    if (dirty) {
      const confirmed = window.confirm(
        'Regenerate newsletter will replace your current unsaved edits with a new AI-generated draft for this ticker. Continue?',
      )
      if (!confirmed) {
        return
      }
    }

    try {
      setRegeneratingNewsletter(true)
      setError(null)
      setNotice(null)

      const response = await fetch(
        `/api/newsletter/drafts/${draftId}/regenerate-newsletter`,
        {
          method: 'POST',
          credentials: 'include',
        },
      )

      const payload = (await response.json()) as DraftResponse

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to regenerate newsletter')
      }

      setRecord(payload.draft)
      setDraft(payload.draft.draft)
      setSelectedPanel((current) =>
        current === 'overview' ||
        current === 'header' ||
        current === 'intro' ||
        current === 'stats'
          ? current
          : payload.draft.draft.blocks[0]?.id ?? 'overview',
      )
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate newsletter')
    } finally {
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

  if (!draft || !record) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-sm text-red-700 shadow-sm">
        {error || 'Unable to load this newsletter draft.'}
      </div>
    )
  }

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
            {draft.subjectLine}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-800">
              Unsaved
            </span>
          ) : (
            <span className="rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sage-800">
              Synced
            </span>
          )}

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
                <NewsletterDraftCreate defaultFormat={newDraftOpenFormat} />
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={saveDraft}
            disabled={saving || regeneratingNewsletter}
            className="rounded-lg border border-sage-700 px-2.5 py-1.5 text-xs font-semibold text-sage-800 transition hover:bg-sage-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>

          <button
            type="button"
            onClick={regenerateNewsletter}
            disabled={regeneratingNewsletter || saving}
            className="rounded-lg border border-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-900 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {regeneratingNewsletter ? 'Regenerating…' : 'Regenerate'}
          </button>

          <button
            type="button"
            onClick={() => setChartEditorOpen(true)}
            disabled={!selectedBlock || saving || regeneratingNewsletter}
            className="rounded-lg bg-sage-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Edit chart
          </button>

          <button
            type="button"
            onClick={copyBeehiivHtml}
            disabled={copyingBeehiiv || dirty}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              copiedBeehiiv
                ? 'bg-sage-600 text-white'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
            title={dirty ? 'Save draft first to copy latest HTML' : 'Copy HTML for Beehiiv'}
          >
            {copyingBeehiiv ? 'Copying…' : copiedBeehiiv ? 'Copied!' : 'Copy for Beehiiv'}
          </button>

          <button
            type="button"
            onClick={() => setIsPreviewExpanded(true)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition hover:border-sage-400 hover:text-sage-800"
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

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-sage-200 bg-sage-50 px-4 py-3 text-sm text-sage-800">
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
                    draggable
                    onClick={() => setSelectedPanel(block.id)}
                    onDragStart={(event) => handleBlockDragStart(block.id, event)}
                    onDragOver={(event) => handleBlockDragOver(block.id, event)}
                    onDrop={(event) => handleBlockDrop(block.id, event)}
                    onDragEnd={handleBlockDragEnd}
	                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
	                      isActive
	                        ? 'border-sage-700 bg-sage-700 text-white'
	                        : 'border-gray-200 bg-white text-gray-700 hover:border-sage-300 hover:bg-sage-50'
	                    } ${isDragged ? 'opacity-60' : ''} ${dropBefore ? 'border-t-4 border-t-sage-500' : ''} ${dropAfter ? 'border-b-4 border-b-sage-500' : ''} cursor-grab active:cursor-grabbing`}
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
          className="rounded-2xl border border-gray-300 bg-white p-4 shadow-sm"
        >
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-cream-100">
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
              <label className="block">
                <CopyableControl
                  copyId="draft-subject-line"
                  value={draft.subjectLine}
                  label="Subject line"
                  copiedControlId={copiedControlId}
                  onCopy={handleCopyControlValue}
                  renderControl={() => (
                    <textarea
                      value={draft.subjectLine}
                      onChange={(event) => updateDraftField('subjectLine', event.target.value)}
                      rows={3}
                      className="w-full resize-y rounded-2xl border border-gray-300 px-5 py-3 text-sm leading-6 text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                    />
                  )}
                />
              </label>
            </div>
          ) : selectedPanel === 'header' && draft.header ? (
            <div className="space-y-3">
              <label className="block">
                <CopyableControl
                  copyId="header-title"
                  value={draft.header!.title}
                  label="Title"
                  copiedControlId={copiedControlId}
                  onCopy={handleCopyControlValue}
                  renderControl={() => (
                    <input
                      value={draft.header!.title}
                      onChange={(event) => updateHeaderField('title', event.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                    />
                  )}
                />
              </label>

              <label className="block">
                <CopyableControl
                  copyId="header-date-text"
                  value={draft.header!.dateText}
                  label="Date text"
                  copiedControlId={copiedControlId}
                  onCopy={handleCopyControlValue}
                  renderControl={() => (
                    <input
                      value={draft.header!.dateText}
                      onChange={(event) => updateHeaderField('dateText', event.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                    />
                  )}
                />
              </label>

              <label className="block">
                <CopyableControl
                  copyId="header-badge-text"
                  value={draft.header!.badgeText}
                  label="Badge text"
                  copiedControlId={copiedControlId}
                  onCopy={handleCopyControlValue}
                  renderControl={() => (
                    <input
                      value={draft.header!.badgeText}
                      onChange={(event) => updateHeaderField('badgeText', event.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                    />
                  )}
                />
              </label>
            </div>
          ) : selectedPanel === 'intro' ? (
            <div className="space-y-3">
              <label className="block">
                <CopyableControl
                  copyId="draft-intro-text"
                  value={draft.introText}
                  label="Intro"
                  copiedControlId={copiedControlId}
                  onCopy={handleCopyControlValue}
                  renderControl={() => (
                    <textarea
                      value={draft.introText}
                      onChange={(event) => updateDraftField('introText', event.target.value)}
                      rows={16}
                      className="min-h-[420px] w-full rounded-2xl border border-gray-300 px-4 py-2.5 text-sm leading-6 text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                    />
                  )}
                />
              </label>
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
                    <label className="block">
                      <CopyableControl
                        copyId={`stats-item-${index}-label`}
                        value={item.label}
                        label="Label"
                        copiedControlId={copiedControlId}
                        onCopy={handleCopyControlValue}
                        renderControl={() => (
                          <input
                            value={item.label}
                            onChange={(event) =>
                              updateStatsItem(index, 'label', event.target.value)
                            }
                            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                          />
                        )}
                      />
                    </label>

                    <label className="block">
                      <CopyableControl
                        copyId={`stats-item-${index}-value`}
                        value={item.value}
                        label="Value"
                        copiedControlId={copiedControlId}
                        onCopy={handleCopyControlValue}
                        renderControl={() => (
                          <input
                            value={item.value}
                            onChange={(event) =>
                              updateStatsItem(index, 'value', event.target.value)
                            }
                            className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                          />
                        )}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          ) : selectedBlock ? (
            <div className="space-y-3">
              <div className="grid gap-3">
                <label className="block">
                  <CopyableControl
                    copyId={`${selectedBlock.id}-heading`}
                    value={selectedBlock.heading}
                    label="Heading"
                    copiedControlId={copiedControlId}
                    onCopy={handleCopyControlValue}
                    renderControl={() => (
                      <input
                        value={selectedBlock.heading}
                        onChange={(event) =>
                          updateBlockField(selectedBlock.id, 'heading', event.target.value)
                        }
                        className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20"
                      />
                    )}
                  />
                </label>

                <label className="block">
                  <CopyableControl
                    copyId={`${selectedBlock.id}-body`}
                    value={selectedBlock.body}
                    label="Commentary"
                    copiedControlId={copiedControlId}
                    onCopy={handleCopyControlValue}
                    renderControl={() => (
                      <RichTextEditor
                        value={selectedBlock.body}
                        onChange={(html) =>
                          updateBlockField(selectedBlock.id, 'body', html)
                        }
                      />
                    )}
                  />
                </label>
              </div>

            </div>
          ) : null}
        </section>
      </div>

      {chartEditorOpen && draft && selectedBlock ? (
        <NewsletterChartEditorDrawer
          key={selectedBlock.id}
          draftId={draftId}
          draft={draft}
          block={selectedBlock}
          onClose={() => setChartEditorOpen(false)}
          onSaved={(updatedRecord) => {
            setRecord(updatedRecord)
            setDraft(updatedRecord.draft)
            setDirty(false)
            setNotice('Chart updated and preview refreshed.')
          }}
        />
      ) : null}

      {isPreviewExpanded ? (
        <div className="fixed inset-0 z-50 bg-gray-950/55 p-4 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setIsPreviewExpanded(false)}
            className="absolute right-8 top-8 z-10 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-sage-400 hover:text-sage-800"
          >
            Close
          </button>

          <div className="flex h-full flex-col rounded-3xl border border-gray-200 bg-white shadow-2xl">
            <div className="min-h-0 flex-1 overflow-hidden p-4">
              <div className="h-full overflow-hidden rounded-2xl border border-gray-200 bg-cream-100">
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
                  className="h-full w-full bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
