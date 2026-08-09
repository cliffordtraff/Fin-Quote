import type { ImgHTMLAttributes } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NewsletterChartLibraryHome from '@/app/newsletter/charts/NewsletterChartLibraryHome'
import NewsletterChartLibraryPicker from '@/components/newsletter/NewsletterChartLibraryPicker'
import type { NewsletterChartLibrarySummary } from '@/lib/newsletter/chart-library'
import type {
  NewsletterDraftBlock,
  NewsletterDraftDocument,
  NewsletterDraftRecord,
} from '@/lib/newsletter/types'

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
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt ?? ''} {...props} />
  },
}))

function summary(index: number, title = `Chart ${index}`): NewsletterChartLibrarySummary {
  return {
    id: `chart-${index}`,
    title,
    symbol: index % 2 === 0 ? 'MSFT' : 'AAPL',
    range: '6m',
    interval: 'D',
    chartType: 'candles',
    chartImageUrl: `https://assets.example/chart-${index}.png`,
    thumbnailUrl: `https://assets.example/thumb-${index}.png`,
    chartExportUrl: `https://charts.example/chart-${index}`,
    createdAt: '2026-08-08T12:00:00.000Z',
    updatedAt: `2026-08-08T12:00:${String(index).padStart(2, '0')}.000Z`,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

const block: NewsletterDraftBlock = {
  id: 'block-1',
  layoutId: 'chart-commentary',
  templateId: 'price',
  selectionReason: 'Test',
  heading: 'Market chart',
  body: '<p>Commentary</p>',
  chartImageUrl: '',
  chartAlt: 'Market chart',
  chartExportUrl: '',
  chartSpec: {
    mode: 'price',
    symbol: 'AAPL',
    range: '6m',
    interval: 'D',
    chartType: 'candles',
  },
  chartNeedsRegeneration: false,
}

const draft: NewsletterDraftDocument = {
  ticker: 'AAPL',
  format: 'single_stock',
  featuredTickers: ['AAPL'],
  generatedAt: '2026-08-08T12:00:00.000Z',
  subjectLine: 'Market update',
  introText: 'Intro',
  autoPickedStock: false,
  blocks: [block],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('newsletter chart library bounded paging', () => {
  it('keeps home filters and retry available without showing an empty state after an initial failure', async () => {
    let attempt = 0
    const fetchMock = vi.fn(() => {
      attempt += 1
      if (attempt === 1) {
        return Promise.resolve(Response.json(
          { error: 'Chart catalog is temporarily unavailable' },
          { status: 503 },
        ))
      }
      return Promise.resolve(jsonResponse({
        charts: [summary(1, 'Recovered chart')],
        nextCursor: null,
        total: 1,
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterChartLibraryHome chartBuilderUrl="https://charts.example" />)

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('Chart catalog is temporarily unavailable')
    expect(screen.getByPlaceholderText('Search by title or symbol')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Exact symbol (AAPL)')).toBeInTheDocument()
    expect(screen.queryByText('No saved charts yet')).not.toBeInTheDocument()
    expect(screen.queryByText('No saved charts match this filter.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading charts' }))

    expect(await screen.findByText('Recovered chart')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('contains delete confirmation focus and restores the invoking control', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          charts: [summary(1, 'Disposable chart')],
          nextCursor: null,
          total: 1,
        }),
      ),
    )

    render(<NewsletterChartLibraryHome chartBuilderUrl="https://charts.example" />)

    const trigger = await screen.findByRole('button', { name: 'Delete' })
    const pageContent = screen
      .getByRole('heading', { name: 'Chart library' })
      .closest('section')
      ?.parentElement
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', {
      name: 'Remove this saved chart?',
    })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const confirm = screen.getByRole('button', { name: 'Delete chart' })
    await waitFor(() => expect(cancel).toHaveFocus())
    expect(pageContent).toHaveAttribute('inert')
    expect(pageContent).toHaveAttribute('aria-hidden', 'true')

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(confirm).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(cancel).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('keeps delete failures announced inside the active dialog', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return jsonResponse(
            { error: 'Saved chart deletion is temporarily unavailable' },
            503,
          )
        }
        return jsonResponse({
          charts: [summary(1, 'Retryable chart')],
          nextCursor: null,
          total: 1,
        })
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterChartLibraryHome chartBuilderUrl="https://charts.example" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', {
      name: 'Remove this saved chart?',
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete chart' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Saved chart deletion is temporarily unavailable',
    )
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('focuses the stable library heading after a successful delete removes its trigger', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'DELETE') return jsonResponse({ deleted: true })
        return jsonResponse({
          charts: [summary(1, 'Removed chart')],
          nextCursor: null,
          total: 1,
        })
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterChartLibraryHome chartBuilderUrl="https://charts.example" />)

    const heading = screen.getByRole('heading', { name: 'Chart library' })
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete chart' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Remove this saved chart?' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Removed chart')).not.toBeInTheDocument()
    expect(heading).toHaveFocus()
  })

  it('cancels a stale continuation when search resets the home query', async () => {
    let resolveStale!: (response: Response) => void
    const staleContinuation = new Promise<Response>((resolve) => {
      resolveStale = resolve
    })
    let continuationSignal: AbortSignal | null | undefined
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('cursor=next-page')) {
        continuationSignal = init?.signal
        return staleContinuation
      }
      if (url.includes('q=Tesla')) {
        return Promise.resolve(jsonResponse({
          charts: [summary(99, 'Tesla momentum')],
          nextCursor: null,
          total: 1,
        }))
      }
      return Promise.resolve(jsonResponse({
        charts: [summary(1, 'Apple setup')],
        nextCursor: 'next-page',
        total: 30,
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterChartLibraryHome chartBuilderUrl="https://charts.example" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Load more charts' }))
    await waitFor(() => expect(continuationSignal).toBeDefined())
    fireEvent.change(screen.getByPlaceholderText('Search by title or symbol'), {
      target: { value: 'Tesla' },
    })

    expect(await screen.findByText('Tesla momentum')).toBeInTheDocument()
    expect(continuationSignal?.aborted).toBe(true)

    await act(async () => {
      resolveStale(jsonResponse({
        charts: [summary(88, 'Stale continuation chart')],
        nextCursor: null,
        total: null,
      }))
      await staleContinuation
    })

    expect(screen.queryByText('Apple setup')).not.toBeInTheDocument()
    expect(screen.queryByText('Stale continuation chart')).not.toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('renders only one picker page, then merges continuation rows by id', async () => {
    const firstPage = Array.from({ length: 12 }, (_, index) => summary(index + 1))
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('cursor=picker-next')) {
        return Promise.resolve(jsonResponse({
          charts: [firstPage[11], summary(13)],
          nextCursor: null,
          total: null,
        }))
      }
      return Promise.resolve(jsonResponse({
        charts: firstPage,
        nextCursor: 'picker-next',
        total: 40,
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <NewsletterChartLibraryPicker
        draftId="draft-1"
        draft={draft}
        block={block}
        expectedUpdatedAt="2026-08-08T12:00:00.000Z"
        onClose={vi.fn()}
        getEditSequence={() => 0}
        onInserted={vi.fn()}
        onConflict={vi.fn()}
      />,
    )

    expect(await screen.findAllByRole('button', { name: 'Use chart' })).toHaveLength(12)
    expect(screen.getAllByRole('img')).toHaveLength(12)
    expect(screen.queryByText('Chart 13')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Load more charts' }))

    expect(await screen.findByText('Chart 13')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Use chart' })).toHaveLength(13)
    expect(screen.getAllByRole('img')).toHaveLength(13)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps search available and can recover after a picker query returns no rows', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('q=missing')) {
        return Promise.resolve(jsonResponse({
          charts: [],
          nextCursor: null,
          total: 0,
        }))
      }
      return Promise.resolve(jsonResponse({
        charts: [summary(1, 'Apple chart')],
        nextCursor: null,
        total: 1,
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <NewsletterChartLibraryPicker
        draftId="draft-1"
        draft={draft}
        block={block}
        expectedUpdatedAt="2026-08-08T12:00:00.000Z"
        onClose={vi.fn()}
        getEditSequence={() => 0}
        onInserted={vi.fn()}
        onConflict={vi.fn()}
      />,
    )

    expect(await screen.findByText('Apple chart')).toBeInTheDocument()
    const search = screen.getByPlaceholderText('Search by title or symbol')
    fireEvent.change(search, { target: { value: 'missing' } })

    expect(await screen.findByText('No saved charts match this search.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search by title or symbol')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(await screen.findByText('Apple chart')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('keeps picker controls and retry available without showing an empty state when the initial load fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: 'Chart library is temporarily unavailable' }, 503),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          charts: [summary(1, 'Recovered chart')],
          nextCursor: null,
          total: 1,
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <NewsletterChartLibraryPicker
        draftId="draft-1"
        draft={draft}
        block={block}
        expectedUpdatedAt="2026-08-08T12:00:00.000Z"
        onClose={vi.fn()}
        getEditSequence={() => 0}
        onInserted={vi.fn()}
        onConflict={vi.fn()}
      />,
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Couldn’t load saved charts')
    expect(alert).toHaveTextContent('Chart library is temporarily unavailable')
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
    expect(
      screen.getByPlaceholderText('Search by title or symbol'),
    ).toBeInTheDocument()
    expect(screen.queryByText('No saved charts yet')).not.toBeInTheDocument()
    expect(
      screen.queryByText('No saved charts match this search.'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading charts' }))

    expect(await screen.findByText('Recovered chart')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fetches one full chart spec only after a summary is selected', async () => {
    const chartSummary = summary(1, 'Apple selected chart')
    const fullChart = {
      ...chartSummary,
      ownerId: 'owner-1',
      sessionId: 'session-1',
      chartSpec: {
        mode: 'price' as const,
        symbol: 'AAPL',
        range: '6m' as const,
        interval: 'D' as const,
        chartType: 'candles' as const,
      },
      capturedAt: '2026-08-08T12:00:00.000Z',
      rendererContract: 'newsletter-chart-v1',
      sceneHash: 'scene-hash',
      imageSha256: 'image-hash',
    }
    const savedRecord = {
      id: 'draft-1',
      ownerId: 'owner-1',
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
      createdAt: '2026-08-08T11:00:00.000Z',
      updatedAt: '2026-08-08T12:01:00.000Z',
    } satisfies NewsletterDraftRecord
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/summaries')) {
        return Promise.resolve(jsonResponse({
          charts: [chartSummary],
          nextCursor: null,
          total: 1,
        }))
      }
      if (url.endsWith('/api/newsletter/charts/chart-1')) {
        return Promise.resolve(jsonResponse({ chart: fullChart }))
      }
      if (init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ draft: savedRecord }))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const onInserted = vi.fn()

    render(
      <NewsletterChartLibraryPicker
        draftId="draft-1"
        draft={draft}
        block={block}
        expectedUpdatedAt="2026-08-08T12:00:00.000Z"
        onClose={vi.fn()}
        getEditSequence={() => 3}
        onInserted={onInserted}
        onConflict={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Use chart' }))
    await waitFor(() => expect(onInserted).toHaveBeenCalledWith(savedRecord, 3))

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/newsletter/charts/summaries?limit=12',
      '/api/newsletter/charts/chart-1',
      '/api/newsletter/drafts/draft-1',
    ])
    const patchBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))
    expect(patchBody.draft.blocks[0]).toMatchObject({
      chartImageUrl: fullChart.chartImageUrl,
      chartSpec: fullChart.chartSpec,
      chartProvenance: { libraryItemId: fullChart.id },
    })
  })

  it('returns the latest record and attempted chart document through a structured conflict callback', async () => {
    const chartSummary = summary(1, 'Conflicting chart selection')
    const fullChart = {
      ...chartSummary,
      ownerId: 'owner-1',
      sessionId: 'session-1',
      chartSpec: {
        mode: 'price' as const,
        symbol: 'AAPL',
        range: '1y' as const,
        interval: 'D' as const,
        chartType: 'line' as const,
      },
      capturedAt: '2026-08-08T12:05:00.000Z',
      rendererContract: 'newsletter-chart-v1',
      sceneHash: 'conflict-scene-hash',
      imageSha256: 'conflict-image-hash',
    }
    const latest = {
      id: 'draft-1',
      ownerId: 'owner-1',
      ticker: 'AAPL',
      status: 'draft',
      sourceType: 'manual',
      sourceReviewKey: null,
      beehiivUrl: null,
      publishedAt: null,
      archivedAt: null,
      attachedChartCount: 0,
      subjectLine: 'Newer server subject',
      previewHtml: '<html></html>',
      draft: { ...draft, subjectLine: 'Newer server subject' },
      history: [],
      createdAt: '2026-08-08T11:00:00.000Z',
      updatedAt: '2026-08-08T12:06:00.000Z',
    } satisfies NewsletterDraftRecord
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/summaries')) {
        return Promise.resolve(
          jsonResponse({ charts: [chartSummary], nextCursor: null, total: 1 }),
        )
      }
      if (url.endsWith('/api/newsletter/charts/chart-1')) {
        return Promise.resolve(jsonResponse({ chart: fullChart }))
      }
      if (init?.method === 'PATCH') {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'draft_conflict',
              error: 'Draft changed while the chart was selected.',
              latest,
            },
            409,
          ),
        )
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    const onClose = vi.fn()
    const onInserted = vi.fn()
    const onConflict = vi.fn()

    render(
      <NewsletterChartLibraryPicker
        draftId="draft-1"
        draft={draft}
        block={block}
        expectedUpdatedAt="2026-08-08T12:00:00.000Z"
        onClose={onClose}
        getEditSequence={() => 4}
        onInserted={onInserted}
        onConflict={onConflict}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Use chart' }))

    await waitFor(() => expect(onConflict).toHaveBeenCalledOnce())
    const patchBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))
    expect(onConflict).toHaveBeenCalledWith(
      latest,
      patchBody.draft,
      'Draft changed while the chart was selected.',
    )
    expect(patchBody.draft.blocks[0]).toMatchObject({
      chartImageUrl: fullChart.chartImageUrl,
      chartSpec: fullChart.chartSpec,
      chartProvenance: { libraryItemId: fullChart.id },
    })
    expect(onInserted).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
