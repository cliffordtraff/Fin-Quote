import type { ImgHTMLAttributes } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NewsletterChartEditorDrawer from '@/components/newsletter/NewsletterChartEditorDrawer'
import NewsletterChartLibraryPicker from '@/components/newsletter/NewsletterChartLibraryPicker'
import type { NewsletterChartLibraryItem } from '@/lib/newsletter/chart-library'
import type {
  NewsletterDraftBlock,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
} from '@/lib/newsletter/types'

const chartEditorMocks = vi.hoisted(() => ({
  parseFundState: vi.fn(),
}))

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    unoptimized: _unoptimized,
    alt,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean
    unoptimized?: boolean
  }) => {
    void _fill
    void _unoptimized
    // The native element lets the test deterministically emit load/error.
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt ?? ''} {...props} />
  },
}))

vi.mock('@/lib/newsletter/chart-spec', () => ({
  isPriceNewsletterChartSpec: () => false,
}))

vi.mock('@/lib/newsletter/chart-editor', () => ({
  parseFundamentalsNewsletterChartSpecFromFundState:
    chartEditorMocks.parseFundState,
  resolveNewsletterChartEditor: vi.fn(() => ({
    iframePath: '/charts/editor?symbol=AAPL',
    fundState: { metrics: ['revenue'] },
    symbol: 'AAPL',
  })),
  resolveNewsletterPriceExportEditor: vi.fn(() => ({
    iframePath: '/charts/export-editor?symbol=AAPL',
    symbol: 'AAPL',
    baseSpec: { symbol: 'AAPL' },
  })),
}))

const chartBlock: NewsletterDraftBlock = {
  id: 'block-1',
  layoutId: 'chart-commentary',
  templateId: 'revenue',
  selectionReason: 'Test chart',
  heading: 'Apple revenue',
  body: '<p>Revenue commentary</p>',
  chartImageUrl: 'https://assets.example/apple.png',
  chartAlt: 'Apple revenue chart',
  chartExportUrl: 'https://charts.example/apple',
  chartSpec: {} as NewsletterDraftBlock['chartSpec'],
  chartNeedsRegeneration: false,
}

const draft: NewsletterDraftDocument = {
  ticker: 'AAPL',
  format: 'single_stock',
  featuredTickers: ['AAPL'],
  generatedAt: '2026-08-07T12:00:00.000Z',
  subjectLine: 'Apple update',
  introText: 'Apple moved today.',
  autoPickedStock: false,
  blocks: [chartBlock],
}

const libraryItem: NewsletterChartLibraryItem = {
  id: 'chart-1',
  ownerId: 'user-1',
  sessionId: 'session-1',
  title: 'Apple exact chart',
  symbol: 'AAPL',
  chartSpec: {
    mode: 'price',
    symbol: 'AAPL',
    range: '6m',
    interval: 'D',
    chartType: 'candles',
  },
  chartImageUrl: 'https://assets.example/apple-exact.png',
  thumbnailUrl: 'https://assets.example/apple-thumb.png',
  chartExportUrl: 'https://charts.example/exact/apple',
  capturedAt: '2026-08-07T12:00:00.000Z',
  rendererContract: 'newsletter-chart-v1',
  sceneHash: 'scene-hash',
  imageSha256: 'image-hash',
  createdAt: '2026-08-07T12:00:00.000Z',
  updatedAt: '2026-08-07T12:00:00.000Z',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderDrawer(options?: {
  onConflict?: (
    latest: NewsletterDraftRecord,
    attemptedDraft: NewsletterDraftDocument,
    message: string,
  ) => void
  onClose?: () => void
  onSaved?: (record: NewsletterDraftRecord) => void
}) {
  return render(
    <NewsletterChartEditorDrawer
      draftId="draft-1"
      draft={draft}
      block={chartBlock}
      expectedUpdatedAt="2026-08-07T12:00:00.000Z"
      openedEditSequence={0}
      onClose={options?.onClose ?? vi.fn()}
      onSaved={options?.onSaved ?? vi.fn()}
      onConflict={options?.onConflict ?? vi.fn()}
    />,
  )
}

function makeDraftRecord(
  overrides: Partial<NewsletterDraftRecord> = {},
): NewsletterDraftRecord {
  return {
    id: 'draft-1',
    ownerId: 'user-1',
    ticker: 'AAPL',
    status: 'draft',
    sourceType: 'manual',
    sourceReviewKey: null,
    beehiivUrl: null,
    publishedAt: null,
    archivedAt: null,
    attachedChartCount: 1,
    subjectLine: draft.subjectLine,
    previewHtml: '<html></html>',
    draft,
    history: [],
    createdAt: '2026-08-07T11:00:00.000Z',
    updatedAt: '2026-08-07T12:30:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  chartEditorMocks.parseFundState.mockReturnValue(null)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('NewsletterChartEditorDrawer load resilience', () => {
  it('moves focus into the modal and traps keyboard navigation there', () => {
    renderDrawer()
    const dialog = screen.getByRole('dialog', {
      name: /Edit chart/i,
    })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(cancel).toHaveFocus()

    const outside = document.createElement('button')
    outside.textContent = 'Outside editor control'
    document.body.append(outside)
    outside.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(cancel).toHaveFocus()
    outside.remove()
  })

  it('ends the loading state at a bounded deadline and offers retry and direct-open recovery', () => {
    vi.useFakeTimers()
    renderDrawer()

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading chart editor',
    )

    act(() => {
      vi.advanceTimersByTime(11_999)
    })
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chart editor is taking too long to load',
    )
    expect(
      screen.getByRole('link', { name: 'Open editor in new tab' }),
    ).toHaveAttribute('href', '/charts/editor?symbol=AAPL')

    fireEvent.click(screen.getByRole('button', { name: 'Retry editor' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading chart editor',
    )

    act(() => {
      vi.advanceTimersByTime(12_000)
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chart editor is taking too long to load',
    )
  })

  it('cancels readiness and deferred UI timers when READY arrives or the drawer unmounts', () => {
    vi.useFakeTimers()
    const { container, unmount } = renderDrawer()
    const iframe = container.querySelector('iframe')
    expect(iframe?.contentWindow).toBeTruthy()

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: iframe?.contentWindow ?? null,
          data: { v: 1, type: 'READY' },
        }),
      )
    })

    expect(screen.getByRole('button', { name: 'Save chart' })).toBeEnabled()
    act(() => {
      vi.advanceTimersByTime(12_000)
    })
    expect(
      screen.queryByText('Chart editor is taking too long to load'),
    ).not.toBeInTheDocument()

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps its opening save token and draft when parent freshness advances underneath it', async () => {
    const changedSpec = {
      mode: 'fundamentals',
      stocks: ['AAPL'],
      metrics: ['revenue'],
    } satisfies NewsletterDraftBlock['chartSpec']
    chartEditorMocks.parseFundState.mockReturnValue(changedSpec)
    const remoteDraft = {
      ...draft,
      subjectLine: 'Remote subject',
      blocks: [
        {
          ...chartBlock,
          heading: 'Remote chart heading',
          chartSpec: {
            mode: 'fundamentals',
            stocks: ['AAPL'],
            metrics: ['gross_profit'],
          } satisfies NewsletterDraftBlock['chartSpec'],
        },
      ],
    } satisfies NewsletterDraftDocument
    const latest = {
      id: 'draft-1',
      ownerId: 'user-1',
      ticker: 'AAPL',
      status: 'draft',
      sourceType: 'manual',
      sourceReviewKey: null,
      beehiivUrl: null,
      publishedAt: null,
      archivedAt: null,
      attachedChartCount: 1,
      subjectLine: remoteDraft.subjectLine,
      previewHtml: '<html></html>',
      draft: remoteDraft,
      history: [],
      createdAt: '2026-08-07T11:00:00.000Z',
      updatedAt: '2026-08-07T12:30:00.000Z',
    } satisfies NewsletterDraftRecord
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            code: 'draft_conflict',
            error: 'Draft changed while the chart rendered.',
            latest,
          },
          409,
        ),
      ),
    )
    const onConflict = vi.fn()
    const onClose = vi.fn()
    const onSaved = vi.fn()
    const { container, rerender } = renderDrawer({ onConflict })
    const iframe = container.querySelector('iframe')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: iframe?.contentWindow ?? null,
          data: { v: 1, type: 'READY' },
        }),
      )
    })

    rerender(
      <NewsletterChartEditorDrawer
        draftId="draft-1"
        draft={remoteDraft}
        block={remoteDraft.blocks[0]}
        expectedUpdatedAt={latest.updatedAt}
        openedEditSequence={0}
        onClose={onClose}
        onSaved={onSaved}
        onConflict={onConflict}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save chart' }))
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: iframe?.contentWindow ?? null,
          data: {
            v: 1,
            type: 'FUND_STATE',
            payload: {
              fundState: { metrics: ['revenue'] },
              symbol: 'AAPL',
            },
          },
        }),
      )
    })

    await vi.waitFor(() => {
      expect(onConflict).toHaveBeenCalledTimes(1)
    })
    const request = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      expectedUpdatedAt: '2026-08-07T12:00:00.000Z',
      draft: {
        subjectLine: 'Apple update',
        blocks: [expect.objectContaining({ chartSpec: changedSpec })],
      },
    })
    expect(onConflict).toHaveBeenCalledWith(
      latest,
      expect.objectContaining({
        subjectLine: 'Apple update',
        blocks: [expect.objectContaining({ chartSpec: changedSpec })],
      }),
      'Draft changed while the chart rendered.',
    )
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('pauses iframe editing throughout a deferred save before returning to the editor', async () => {
    const submittedSpec = {
      mode: 'fundamentals',
      stocks: ['AAPL'],
      metrics: ['revenue'],
    } satisfies NewsletterDraftBlock['chartSpec']
    chartEditorMocks.parseFundState.mockReturnValue(submittedSpec)
    let resolveSave!: (response: Response) => void
    const saveResponse = new Promise<Response>((resolve) => {
      resolveSave = resolve
    })
    vi.stubGlobal('fetch', vi.fn(() => saveResponse))
    const onClose = vi.fn()
    const onSaved = vi.fn()
    const { container } = renderDrawer({ onClose, onSaved })
    const iframe = container.querySelector('iframe')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: iframe?.contentWindow ?? null,
          data: { v: 1, type: 'READY' },
        }),
      )
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Save and return to Editor' }),
    )
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: iframe?.contentWindow ?? null,
          data: {
            v: 1,
            type: 'FUND_STATE',
            payload: {
              fundState: { metrics: ['revenue'] },
              symbol: 'AAPL',
            },
          },
        }),
      )
    })

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(iframe).toHaveAttribute('tabindex', '-1')
    expect(iframe).toHaveClass('pointer-events-none')
    expect(
      screen.getByRole('status', {
        name: 'Saving chart and pausing editor',
      }),
    ).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: iframe?.contentWindow ?? null,
          data: {
            v: 1,
            type: 'FUND_STATE',
            payload: {
              fundState: { metrics: ['gross_profit'] },
              symbol: 'AAPL',
            },
          },
        }),
      )
      resolveSave(
        jsonResponse(
          { draft: makeDraftRecord({ draft: { ...draft, blocks: [
            { ...chartBlock, chartSpec: submittedSpec },
          ] } }) },
        ),
      )
    })

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(onSaved).toHaveBeenCalledOnce()
    expect(chartEditorMocks.parseFundState).toHaveBeenCalledOnce()
  })

  it('keeps the iframe paused until a deferred conflict preserves the submitted snapshot', async () => {
    const submittedSpec = {
      mode: 'fundamentals',
      stocks: ['AAPL'],
      metrics: ['revenue'],
    } satisfies NewsletterDraftBlock['chartSpec']
    chartEditorMocks.parseFundState.mockReturnValue(submittedSpec)
    let resolveSave!: (response: Response) => void
    const saveResponse = new Promise<Response>((resolve) => {
      resolveSave = resolve
    })
    vi.stubGlobal('fetch', vi.fn(() => saveResponse))
    const onConflict = vi.fn()
    const onClose = vi.fn()
    const latest = makeDraftRecord({
      subjectLine: 'Remote subject',
      updatedAt: '2026-08-07T12:45:00.000Z',
    })
    const { container } = renderDrawer({ onClose, onConflict })
    const iframe = container.querySelector('iframe')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: iframe?.contentWindow ?? null,
          data: { v: 1, type: 'READY' },
        }),
      )
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save chart' }))
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: iframe?.contentWindow ?? null,
          data: {
            v: 1,
            type: 'FUND_STATE',
            payload: {
              fundState: { metrics: ['revenue'] },
              symbol: 'AAPL',
            },
          },
        }),
      )
    })

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(iframe).toHaveClass('pointer-events-none')
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          source: iframe?.contentWindow ?? null,
          data: {
            v: 1,
            type: 'FUND_STATE',
            payload: {
              fundState: { metrics: ['gross_profit'] },
              symbol: 'AAPL',
            },
          },
        }),
      )
      resolveSave(
        jsonResponse(
          {
            code: 'draft_conflict',
            error: 'Draft changed while the chart rendered.',
            latest,
          },
          409,
        ),
      )
    })

    await waitFor(() => expect(onConflict).toHaveBeenCalledOnce())
    expect(onConflict).toHaveBeenCalledWith(
      latest,
      expect.objectContaining({
        blocks: [expect.objectContaining({ chartSpec: submittedSpec })],
      }),
      'Draft changed while the chart rendered.',
    )
    expect(onClose).toHaveBeenCalledOnce()
    expect(chartEditorMocks.parseFundState).toHaveBeenCalledOnce()
  })
})

describe('NewsletterChartLibraryPicker immutable thumbnail recovery', () => {
  it('moves focus into the modal, traps tab navigation, and restores focus', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ charts: [] })),
    )
    const outside = document.createElement('button')
    outside.textContent = 'Underlying editor control'
    document.body.append(outside)
    outside.focus()

    const view = render(
      <NewsletterChartLibraryPicker
        draftId="draft-1"
        draft={draft}
        block={chartBlock}
        expectedUpdatedAt="2026-08-07T12:00:00.000Z"
        onClose={vi.fn()}
        getEditSequence={() => 0}
        onInserted={vi.fn()}
        onConflict={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Chart library' })
    const close = screen.getByRole('button', { name: 'Close' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(close).toHaveFocus()

    outside.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(close).toHaveFocus()

    view.unmount()
    expect(outside).toHaveFocus()
    outside.remove()
  })

  it('replaces hidden old-chart captions while preserving a custom heading', async () => {
    const priorBlock: NewsletterDraftBlock = {
      ...chartBlock,
      heading: 'Editor focus: revenue inflection',
      chartAlt: 'Old saved chart',
      caption: 'Saved chart: Old saved chart.',
      chartProvenance: {
        version: 1,
        source: 'chart_library',
        libraryItemId: 'old-chart',
        capturedAt: '2026-08-06T12:00:00.000Z',
        rendererContract: 'newsletter-chart-v1',
        imageUrl: chartBlock.chartImageUrl,
        imageSha256: null,
        interactiveUrl: chartBlock.chartExportUrl,
        scene: chartBlock.chartSpec,
        sceneSha256: 'old-scene-hash',
      },
    }
    const priorDraft: NewsletterDraftDocument = {
      ...draft,
      blocks: [priorBlock],
    }
    const insertedRecord = makeDraftRecord({
      draft: priorDraft,
      updatedAt: '2026-08-07T12:05:00.000Z',
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ charts: [libraryItem] }))
      .mockResolvedValueOnce(jsonResponse({ draft: insertedRecord }))
    vi.stubGlobal('fetch', fetchMock)
    const onInserted = vi.fn()

    render(
      <NewsletterChartLibraryPicker
        draftId="draft-1"
        draft={priorDraft}
        block={priorBlock}
        expectedUpdatedAt="2026-08-07T12:00:00.000Z"
        onClose={vi.fn()}
        getEditSequence={() => 4}
        onInserted={onInserted}
        onConflict={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Use chart' }))
    await waitFor(() => expect(onInserted).toHaveBeenCalledOnce())

    const patchCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'PATCH',
    )
    const payload = JSON.parse(String(patchCall?.[1]?.body))
    expect(payload.draft.blocks[0]).toMatchObject({
      heading: 'Editor focus: revenue inflection',
      chartAlt: 'Apple exact chart',
      caption: 'Saved chart: Apple exact chart.',
      chartProvenance: { libraryItemId: 'chart-1' },
    })
    expect(JSON.stringify(payload.draft.blocks[0])).not.toContain(
      'Saved chart: Old saved chart.',
    )
  })

  it('announces an insertion failure without closing the picker', async () => {
    const onClose = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ charts: [libraryItem] }))
        .mockResolvedValueOnce(
          jsonResponse({ error: 'Could not insert saved chart' }, 500),
        ),
    )

    render(
      <NewsletterChartLibraryPicker
        draftId="draft-1"
        draft={draft}
        block={chartBlock}
        expectedUpdatedAt="2026-08-07T12:00:00.000Z"
        onClose={onClose}
        getEditSequence={() => 0}
        onInserted={vi.fn()}
        onConflict={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Use chart' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not insert saved chart',
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', { name: 'Chart library' }),
    ).toBeInTheDocument()
  })

  it('keeps the exact chart openable while a thumbnail is slow or broken, and supports retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ charts: [libraryItem] }),
      ),
    )

    render(
      <NewsletterChartLibraryPicker
        draftId="draft-1"
        draft={draft}
        block={chartBlock}
        expectedUpdatedAt="2026-08-07T12:00:00.000Z"
        onClose={vi.fn()}
        getEditSequence={() => 0}
        onInserted={vi.fn()}
        onConflict={vi.fn()}
      />,
    )

    const image = await screen.findByRole('img', {
      name: 'Apple exact chart',
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading preview for Apple exact chart',
    )
    expect(
      screen.getByRole('link', { name: 'Open Apple exact chart' }),
    ).toHaveAttribute('href', 'https://charts.example/exact/apple')

    fireEvent.error(image)
    expect(screen.getByRole('alert')).toHaveTextContent('Preview unavailable')
    expect(screen.getByRole('button', { name: 'Use chart' })).toBeEnabled()
    expect(
      screen.getByRole('link', { name: 'Open Apple exact chart' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry preview' }))
    const retriedImage = screen.getByRole('img', {
      name: 'Apple exact chart',
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading preview for Apple exact chart',
    )

    fireEvent.load(retriedImage)
    expect(
      screen.queryByText(/Loading preview for Apple exact chart/i),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Preview unavailable')).not.toBeInTheDocument()
  })

  it('keeps the picker closed over the editor while an insertion is pending', async () => {
    let resolveInsert!: (response: Response) => void
    const pendingInsert = new Promise<Response>((resolve) => {
      resolveInsert = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ charts: [libraryItem] }))
        .mockReturnValueOnce(pendingInsert),
    )
    const onClose = vi.fn()
    const onInserted = vi.fn()
    const insertedRecord = {
      id: 'draft-1',
      ownerId: 'user-1',
      ticker: 'AAPL',
      status: 'draft',
      sourceType: 'manual',
      sourceReviewKey: null,
      beehiivUrl: null,
      publishedAt: null,
      archivedAt: null,
      attachedChartCount: 1,
      subjectLine: draft.subjectLine,
      previewHtml: '<html></html>',
      draft,
      history: [],
      createdAt: '2026-08-07T11:00:00.000Z',
      updatedAt: '2026-08-07T12:05:00.000Z',
    } satisfies NewsletterDraftRecord

    render(
      <NewsletterChartLibraryPicker
        draftId="draft-1"
        draft={draft}
        block={chartBlock}
        expectedUpdatedAt="2026-08-07T12:00:00.000Z"
        onClose={onClose}
        getEditSequence={() => 7}
        onInserted={onInserted}
        onConflict={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Use chart' }))
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toBeDisabled()
    fireEvent.click(close)
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => {
      resolveInsert(jsonResponse({ draft: insertedRecord }))
      await pendingInsert
    })
    expect(onInserted).toHaveBeenCalledWith(insertedRecord, 7)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
