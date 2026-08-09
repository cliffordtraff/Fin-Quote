import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  NewsletterDraftDocument,
  NewsletterDraftRecord,
  NewsletterDraftStatus,
} from '@/lib/newsletter/types'
import NewsletterDraftEditor from '../NewsletterDraftEditor'

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
}))

const publicationMocks = vi.hoisted(() => ({
  complete: null as null | ((record: NewsletterDraftRecord) => void),
  submittedEditSequence: null as number | null,
}))

const beehiivMocks = vi.hoisted(() => ({
  setBusy: null as null | ((busy: boolean) => void),
  fail: null as null | ((message: string) => void),
}))

const chartDrawerMocks = vi.hoisted(() => ({
  conflict: null as null | ((
    latest: NewsletterDraftRecord,
    attemptedDraft: NewsletterDraftDocument,
    message: string,
  ) => void),
  expectedUpdatedAt: null as string | null,
  openedEditSequence: null as number | null,
  acknowledgedEditSequence: null as number | null,
  saved: null as null | ((record: NewsletterDraftRecord) => number | false | void),
}))

const chartLibraryMocks = vi.hoisted(() => ({
  submittedEditSequence: null as number | null,
  complete: null as null | ((record: NewsletterDraftRecord) => void),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigationMocks.push }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/clipboard', () => ({
  copyTextToClipboard: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/components/newsletter/RichTextEditor', () => ({
  RichTextEditor: ({
    id,
    value,
    onChange,
    readOnly,
    ariaLabel,
  }: {
    id?: string
    value: string
    onChange: (value: string) => void
    readOnly?: boolean
    ariaLabel?: string
  }) => (
    <textarea
      id={id}
      aria-label={ariaLabel ?? 'Rich body'}
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

vi.mock('@/components/newsletter/NewsletterChartEditorDrawer', () => ({
  default: ({
    expectedUpdatedAt,
    openedEditSequence,
    onConflict,
    onSaved,
  }: {
    expectedUpdatedAt: string
    openedEditSequence: number
    onConflict: (
      latest: NewsletterDraftRecord,
      attemptedDraft: NewsletterDraftDocument,
      message: string,
    ) => void
    onSaved: (
      record: NewsletterDraftRecord,
      openedEditSequence: number,
    ) => number | false | void
  }) => {
    chartDrawerMocks.expectedUpdatedAt = expectedUpdatedAt
    chartDrawerMocks.openedEditSequence = openedEditSequence
    chartDrawerMocks.conflict = onConflict
    if (chartDrawerMocks.acknowledgedEditSequence === null) {
      chartDrawerMocks.acknowledgedEditSequence = openedEditSequence
    }
    chartDrawerMocks.saved = (record) => {
      const result = onSaved(
        record,
        chartDrawerMocks.acknowledgedEditSequence ?? openedEditSequence,
      )
      if (typeof result === 'number') {
        chartDrawerMocks.acknowledgedEditSequence = result
      }
      return result
    }
    return <div data-testid="chart-editor" />
  },
}))

vi.mock('@/components/newsletter/NewsletterChartLibraryPicker', () => ({
  default: ({
    getEditSequence,
    onClose,
    onInserted,
  }: {
    getEditSequence: () => number
    onClose: () => void
    onInserted: (
      record: NewsletterDraftRecord,
      submittedEditSequence: number,
    ) => void
  }) => {
    chartLibraryMocks.complete = (record) => {
      if (chartLibraryMocks.submittedEditSequence == null) {
        throw new Error('Chart insertion was not started')
      }
      onInserted(record, chartLibraryMocks.submittedEditSequence)
    }
    return (
      <div data-testid="chart-library">
        <button
          type="button"
          onClick={() => {
            chartLibraryMocks.submittedEditSequence = getEditSequence()
          }}
        >
          Begin chart insertion
        </button>
        <button type="button" onClick={onClose}>
          Close chart library
        </button>
      </div>
    )
  },
}))

vi.mock('@/components/newsletter/NewsletterBeehiivPanel', () => ({
  default: ({
    disabled,
    onBusyChange,
    onError,
  }: {
    disabled?: boolean
    onBusyChange?: (busy: boolean) => void
    onError?: (message: string) => void
  }) => {
    beehiivMocks.setBusy = onBusyChange ?? null
    beehiivMocks.fail = onError ?? null
    return (
      <div data-testid="beehiiv-panel" data-disabled={String(disabled)} />
    )
  },
}))

vi.mock('@/components/newsletter/NewsletterPublicationPanel', () => ({
  default: ({
    record,
    disabled,
    getEditSequence,
    onDirtyChange,
    onRecordChange,
  }: {
    record: NewsletterDraftRecord
    disabled?: boolean
    getEditSequence: () => number
    onDirtyChange?: (dirty: boolean) => void
    onRecordChange: (
      record: NewsletterDraftRecord,
      submittedEditSequence: number,
    ) => void
  }) => {
    publicationMocks.complete = (record) => {
      if (publicationMocks.submittedEditSequence == null) {
        throw new Error('Publication was not started')
      }
      onRecordChange(record, publicationMocks.submittedEditSequence)
    }

    return (
      <div
        data-testid="publication-panel"
        data-disabled={String(disabled)}
        data-record-status={record.status}
        data-record-url={record.beehiivUrl ?? ''}
      >
        <label>
          Publication URL
          <input
            defaultValue={record.beehiivUrl ?? ''}
            onChange={(event) => {
              onDirtyChange?.(
                event.target.value.trim() !== (record.beehiivUrl ?? ''),
              )
            }}
          />
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            publicationMocks.submittedEditSequence = getEditSequence()
          }}
        >
          Record publication
        </button>
      </div>
    )
  },
}))

vi.mock('@/components/newsletter/NewsletterWorkflowBar', () => ({
  default: ({ busy }: { busy: boolean }) => (
    <div data-testid="workflow-bar" data-busy={String(busy)} />
  ),
}))

vi.mock('@/app/newsletter/editor/NewsletterDraftCreate', () => ({
  default: ({ beforeCreate }: { beforeCreate?: () => boolean }) => (
    <button type="button" onClick={() => beforeCreate?.()}>
      Create another draft
    </button>
  ),
}))

const ORIGINAL_UPDATED_AT = '2026-08-07T12:00:00.000Z'

function makeDraft(subjectLine: string): NewsletterDraftDocument {
  return {
    ticker: 'AAPL',
    format: 'single_stock',
    featuredTickers: ['AAPL'],
    generatedAt: '2026-08-07T11:00:00.000Z',
    subjectLine,
    introText: 'The opening paragraph.',
    header: {
      title: 'The Intraday',
      dateText: 'August 7, 2026',
      badgeText: 'Market Note',
    },
    statsCard: {
      items: [{ label: 'Move', value: '+2.4%' }],
    },
    autoPickedStock: false,
    blocks: [
      {
        id: 'block-1',
        layoutId: 'chart-commentary',
        templateId: 'price-chart',
        selectionReason: 'Test chart',
        heading: 'Chart heading',
        body: '<p>Chart commentary</p>',
        chartImageUrl: 'https://assets.example/exact-chart.png',
        chartAlt: 'Apple share price',
        chartExportUrl: 'https://charts.example/export/apple',
        chartSpec: {} as NewsletterDraftDocument['blocks'][number]['chartSpec'],
        chartProvenance: {
          version: 1,
          source: 'chart_editor',
          capturedAt: '2026-08-07T11:30:00.000Z',
          rendererContract: 'newsletter-chart-v1',
          imageUrl: 'https://assets.example/exact-chart.png',
          imageSha256: 'abc123',
          interactiveUrl: 'https://charts.example/exact/apple',
          scene: {} as NewsletterDraftDocument['blocks'][number]['chartSpec'],
          sceneSha256: 'def456',
        },
        chartNeedsRegeneration: false,
      },
    ],
  }
}

function makeRecord({
  id = 'draft-1',
  subjectLine = 'Original subject',
  status = 'draft',
  updatedAt = ORIGINAL_UPDATED_AT,
}: {
  id?: string
  subjectLine?: string
  status?: NewsletterDraftStatus
  updatedAt?: string
} = {}): NewsletterDraftRecord {
  const draft = makeDraft(subjectLine)
  return {
    id,
    ownerId: 'user-1',
    ticker: 'AAPL',
    status,
    sourceType: 'manual',
    sourceReviewKey: null,
    beehiivUrl:
      status === 'published'
        ? 'https://theintraday.example/p/apple'
        : null,
    publishedAt:
      status === 'published' ? '2026-08-07T12:30:00.000Z' : null,
    archivedAt: null,
    attachedChartCount: 1,
    subjectLine,
    previewHtml: '<html><body>Preview</body></html>',
    draft,
    history: [],
    createdAt: '2026-08-07T11:00:00.000Z',
    updatedAt,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockInitialLoad(record = makeRecord()) {
  vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: record }))
  return record
}

async function renderLoadedEditor(record = makeRecord()) {
  mockInitialLoad(record)
  render(<NewsletterDraftEditor draftId={record.id} />)
  await screen.findByDisplayValue(record.draft.subjectLine)
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('scrollTo', vi.fn())
  navigationMocks.push.mockReset()
  publicationMocks.complete = null
  publicationMocks.submittedEditSequence = null
  beehiivMocks.setBusy = null
  beehiivMocks.fail = null
  chartDrawerMocks.conflict = null
  chartDrawerMocks.expectedUpdatedAt = null
  chartDrawerMocks.openedEditSequence = null
  chartDrawerMocks.acknowledgedEditSequence = null
  chartDrawerMocks.saved = null
  chartLibraryMocks.submittedEditSequence = null
  chartLibraryMocks.complete = null
})

describe('NewsletterDraftEditor concurrency and freshness', () => {
  it('announces an initial draft load failure as an alert', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: 'Draft load unavailable' }, 503),
    )

    render(<NewsletterDraftEditor draftId="draft-1" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Draft load unavailable',
    )
  })

  it('clears the prior record immediately while a new draft id loads', async () => {
    const first = makeRecord({
      id: 'draft-1',
      subjectLine: 'First draft subject',
    })
    mockInitialLoad(first)
    const view = render(<NewsletterDraftEditor draftId={first.id} />)
    await screen.findByRole('textbox', { name: 'Subject line' })
    expect(
      screen.getByRole('textbox', { name: 'Subject line' }),
    ).toHaveValue('First draft subject')

    let resolveSecond!: (response: Response) => void
    const secondLoad = new Promise<Response>((resolve) => {
      resolveSecond = resolve
    })
    vi.mocked(fetch).mockReturnValueOnce(secondLoad)

    view.rerender(<NewsletterDraftEditor draftId="draft-2" />)

    expect(
      screen.queryByDisplayValue('First draft subject'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Loading newsletter draft…')).toBeInTheDocument()

    const second = makeRecord({
      id: 'draft-2',
      subjectLine: 'Second draft subject',
    })
    await act(async () => {
      resolveSecond(jsonResponse({ draft: second }))
      await secondLoad
    })

    expect(
      await screen.findByRole('textbox', { name: 'Subject line' }),
    ).toHaveValue('Second draft subject')
    expect(
      screen.queryByDisplayValue('First draft subject'),
    ).not.toBeInTheDocument()
  })

  it('gives editable fields and copy actions specific accessible names', async () => {
    await renderLoadedEditor()

    expect(
      screen.getByRole('textbox', { name: 'Subject line' }),
    ).toHaveValue('Original subject')
    expect(
      screen.getByRole('button', { name: 'Copy Subject line' }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getAllByRole('button', { name: /Chart heading/i })[0],
    )

    expect(screen.getByRole('textbox', { name: 'Heading' })).toHaveValue(
      'Chart heading',
    )
    expect(
      screen.getByRole('button', { name: 'Copy Heading' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Commentary' }),
    ).toHaveValue('<p>Chart commentary</p>')
    expect(
      screen.getByRole('button', { name: 'Copy Commentary' }),
    ).toBeInTheDocument()
  })

  it('disables manual publication while a Beehiiv sync is in flight', async () => {
    await renderLoadedEditor()

    act(() => {
      beehiivMocks.setBusy?.(true)
    })

    expect(
      screen.getByRole('button', { name: 'Record publication' }),
    ).toBeDisabled()

    act(() => {
      beehiivMocks.setBusy?.(false)
    })
    expect(
      screen.getByRole('button', { name: 'Record publication' }),
    ).toBeEnabled()
  })

  it('announces general editor errors as alerts', async () => {
    await renderLoadedEditor()

    act(() => {
      beehiivMocks.fail?.('Beehiiv sync failed')
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Beehiiv sync failed')
  })

  it('keeps edits made while a slow save is in flight unsaved', async () => {
    const initial = makeRecord()
    await renderLoadedEditor(initial)

    const subject = screen.getByDisplayValue('Original subject')
    fireEvent.change(subject, { target: { value: 'First edit' } })

    let resolveSave!: (response: Response) => void
    const slowSave = new Promise<Response>((resolve) => {
      resolveSave = resolve
    })
    vi.mocked(fetch).mockReturnValueOnce(slowSave)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Saving')

    fireEvent.change(subject, { target: { value: 'Newer edit' } })

    const savedRecord = makeRecord({
      subjectLine: 'First edit',
      updatedAt: '2026-08-07T12:01:00.000Z',
    })
    await act(async () => {
      resolveSave(jsonResponse({ draft: savedRecord }))
      await slowSave
    })

    await waitFor(() => {
      expect(screen.getByDisplayValue('Newer edit')).toBeInTheDocument()
      expect(screen.getByTestId('editor-status')).toHaveTextContent('Unsaved')
    })
    expect(
      screen.getByText(/Newer edits made during the save are still unsaved/i),
    ).toBeInTheDocument()

    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(patchCall).toBeDefined()
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      expectedUpdatedAt: ORIGINAL_UPDATED_AT,
      draft: { subjectLine: 'First edit' },
    })
  })

  it('keeps newer edits forkable when a slow save returns a published record', async () => {
    await renderLoadedEditor()

    const subject = screen.getByDisplayValue('Original subject')
    fireEvent.change(subject, { target: { value: 'Submitted edit' } })

    let resolveSave!: (response: Response) => void
    const slowSave = new Promise<Response>((resolve) => {
      resolveSave = resolve
    })
    vi.mocked(fetch).mockReturnValueOnce(slowSave)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.change(subject, { target: { value: 'Newer unpublished edit' } })

    const published = makeRecord({
      subjectLine: 'Submitted edit',
      status: 'published',
      updatedAt: '2026-08-07T12:01:00.000Z',
    })
    await act(async () => {
      resolveSave(jsonResponse({ draft: published }))
      await slowSave
    })

    expect(screen.getByDisplayValue('Newer unpublished edit')).toBeInTheDocument()
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    expect(
      screen.getByText(/published while newer local edits were still in progress/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    ).toBeInTheDocument()
  })

  it('turns a slow regeneration with newer edits into a conflict before another save', async () => {
    await renderLoadedEditor()

    let resolveRegeneration!: (response: Response) => void
    const slowRegeneration = new Promise<Response>((resolve) => {
      resolveRegeneration = resolve
    })
    vi.mocked(fetch).mockReturnValueOnce(slowRegeneration)
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    fireEvent.change(screen.getByDisplayValue('Original subject'), {
      target: { value: 'Local edit during regeneration' },
    })

    const regenerated = makeRecord({
      subjectLine: 'Server regenerated subject',
      updatedAt: '2026-08-07T12:00:30.000Z',
    })
    await act(async () => {
      resolveRegeneration(jsonResponse({ draft: regenerated }))
      await slowRegeneration
    })

    expect(
      screen.getByDisplayValue('Local edit during regeneration'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    expect(
      screen.getByText(/regeneration completed while you were making newer local edits/i),
    ).toBeInTheDocument()

    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).toBeDisabled()
    fireEvent.click(saveButton)
    expect(
      vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH'),
    ).toHaveLength(0)

    const forked = makeRecord({
      id: 'regeneration-fork',
      subjectLine: 'Local edit during regeneration',
      updatedAt: '2026-08-07T12:01:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: forked }, 201))
    fireEvent.click(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    )

    await waitFor(() => {
      expect(navigationMocks.push).toHaveBeenCalledWith(
        '/newsletter/editor/regeneration-fork',
      )
    })
    const forkCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith('/draft-1/fork'))
    expect(JSON.parse(String(forkCall?.[1]?.body))).toMatchObject({
      draft: { subjectLine: 'Local edit during regeneration' },
    })
  })

  it('preserves edits made while publication is in flight as a recoverable conflict', async () => {
    await renderLoadedEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Record publication' }))
    fireEvent.change(screen.getByDisplayValue('Original subject'), {
      target: { value: 'Edit made during publication' },
    })

    const published = makeRecord({
      subjectLine: 'Original subject',
      status: 'published',
      updatedAt: '2026-08-07T12:01:00.000Z',
    })
    act(() => {
      publicationMocks.complete?.(published)
    })

    expect(
      screen.getByDisplayValue('Edit made during publication'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    expect(
      screen.getByText(/Publication completed while you were making newer local edits/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    ).toBeInTheDocument()
  })

  it('accepts a publication response after freshness already adopted the same version', async () => {
    await renderLoadedEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Record publication' }))

    const published = makeRecord({
      status: 'published',
      updatedAt: '2026-08-07T12:01:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: published }))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('editor-status')).toHaveTextContent('Published')
    })

    act(() => {
      publicationMocks.complete?.(published)
    })

    expect(screen.getByTestId('editor-status')).toHaveTextContent('Published')
    expect(
      screen.queryByRole('button', { name: 'Save local work as new draft' }),
    ).not.toBeInTheDocument()
  })

  it('keeps chart work recoverable when a slow publication finishes after the drawer opens', async () => {
    await renderLoadedEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Record publication' }))
    fireEvent.click(
      screen.getAllByRole('button', { name: /Chart heading/i })[0],
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit chart' }))
    expect(screen.getByTestId('chart-editor')).toBeInTheDocument()

    const published = makeRecord({
      status: 'published',
      updatedAt: '2026-08-07T12:05:00.000Z',
    })
    act(() => {
      publicationMocks.complete?.(published)
    })

    expect(screen.getByTestId('chart-editor')).toBeInTheDocument()
    expect(chartDrawerMocks.expectedUpdatedAt).toBe(ORIGINAL_UPDATED_AT)
    expect(
      screen.getByText(/Publication completed while the chart editor was open/i),
    ).toBeInTheDocument()

    const attemptedDraft = makeDraft('Original subject')
    attemptedDraft.blocks[0] = {
      ...attemptedDraft.blocks[0],
      chartSpec: {
        mode: 'fundamentals',
        stocks: ['AAPL'],
        metrics: ['operating_income'],
      },
    }
    act(() => {
      chartDrawerMocks.conflict?.(
        published,
        attemptedDraft,
        'Draft was published while the chart rendered.',
      )
    })

    expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    expect(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    ).toBeInTheDocument()

    const forked = makeRecord({
      id: 'publication-chart-fork',
      updatedAt: '2026-08-07T12:06:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: forked }, 201))
    fireEvent.click(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    )

    await waitFor(() => {
      expect(navigationMocks.push).toHaveBeenCalledWith(
        '/newsletter/editor/publication-chart-fork',
      )
    })
    const forkCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith('/draft-1/fork'))
    expect(JSON.parse(String(forkCall?.[1]?.body))).toMatchObject({
      draft: {
        blocks: [
          {
            chartSpec: {
              mode: 'fundamentals',
              stocks: ['AAPL'],
              metrics: ['operating_income'],
            },
          },
        ],
      },
    })
  })

  it('preserves newer edits when a chart-library insertion finishes late', async () => {
    await renderLoadedEditor()

    fireEvent.click(screen.getAllByRole('button', { name: /Chart heading/i })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Choose saved chart' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin chart insertion' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close chart library' }))

    fireEvent.change(screen.getByDisplayValue('Chart heading'), {
      target: { value: 'Newer chart heading after insertion started' },
    })

    const insertedRecord = makeRecord({
      subjectLine: 'Original subject',
      updatedAt: '2026-08-07T12:06:00.000Z',
    })
    const insertedSpec = {
      mode: 'fundamentals' as const,
      stocks: ['MSFT'],
      metrics: ['revenue'],
    }
    insertedRecord.draft.blocks[0] = {
      ...insertedRecord.draft.blocks[0],
      chartImageUrl: 'https://assets.example/inserted-msft-chart.png',
      chartAlt: 'Microsoft revenue chart',
      chartExportUrl: 'https://charts.example/export/microsoft-revenue',
      chartSpec: insertedSpec,
      chartProvenance: {
        version: 1,
        source: 'chart_library',
        libraryItemId: 'saved-msft-chart',
        capturedAt: '2026-08-07T12:05:00.000Z',
        rendererContract: 'the-intraday-newsletter-chart/v1',
        imageUrl: 'https://assets.example/inserted-msft-chart.png',
        imageSha256: 'a'.repeat(64),
        interactiveUrl: 'https://charts.example/export/microsoft-revenue',
        scene: insertedSpec,
        sceneSha256: 'b'.repeat(64),
      },
      chartNeedsRegeneration: false,
      caption: 'Saved chart: Microsoft revenue chart.',
    }
    act(() => {
      chartLibraryMocks.complete?.(insertedRecord)
    })

    expect(
      screen.getByDisplayValue('Newer chart heading after insertion started'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    expect(
      screen.getByText(/saved chart was inserted while newer local edits/i),
    ).toBeInTheDocument()

    const forked = makeRecord({
      id: 'chart-library-fork',
      updatedAt: '2026-08-07T12:07:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: forked }, 201))
    fireEvent.click(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    )

    await waitFor(() => {
      expect(navigationMocks.push).toHaveBeenCalledWith(
        '/newsletter/editor/chart-library-fork',
      )
    })
    const forkCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith('/draft-1/fork'))
    expect(JSON.parse(String(forkCall?.[1]?.body))).toMatchObject({
      draft: {
        blocks: [
          {
            heading: 'Newer chart heading after insertion started',
            chartImageUrl: 'https://assets.example/inserted-msft-chart.png',
            chartAlt: 'Microsoft revenue chart',
            chartExportUrl:
              'https://charts.example/export/microsoft-revenue',
            chartSpec: insertedSpec,
            chartProvenance: {
              source: 'chart_library',
              libraryItemId: 'saved-msft-chart',
            },
            caption: 'Saved chart: Microsoft revenue chart.',
          },
        ],
      },
    })
  })

  it('accepts a chart-library response after freshness already adopted the same version', async () => {
    await renderLoadedEditor()

    fireEvent.click(screen.getAllByRole('button', { name: /Chart heading/i })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Choose saved chart' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin chart insertion' }))

    const insertedRecord = makeRecord({
      updatedAt: '2026-08-07T12:06:00.000Z',
    })
    insertedRecord.draft.blocks[0] = {
      ...insertedRecord.draft.blocks[0],
      heading: 'Inserted server chart heading',
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ draft: insertedRecord }),
    )
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await screen.findByDisplayValue('Inserted server chart heading')

    act(() => {
      chartLibraryMocks.complete?.(insertedRecord)
    })

    expect(screen.getByTestId('editor-status')).toHaveTextContent('Saved')
    expect(
      screen.queryByRole('button', { name: 'Save local work as new draft' }),
    ).not.toBeInTheDocument()
  })

  it('preserves local edits when another tab publishes during newsletter regeneration', async () => {
    await renderLoadedEditor()

    let resolveRegeneration!: (response: Response) => void
    const slowRegeneration = new Promise<Response>((resolve) => {
      resolveRegeneration = resolve
    })
    vi.mocked(fetch).mockReturnValueOnce(slowRegeneration)
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    fireEvent.change(screen.getByDisplayValue('Original subject'), {
      target: { value: 'Local edit during regeneration' },
    })
    const published = makeRecord({
      status: 'published',
      updatedAt: '2026-08-07T12:06:00.000Z',
    })
    await act(async () => {
      resolveRegeneration(
        jsonResponse(
          {
            code: 'draft_conflict',
            error: 'Draft was published while regeneration was running.',
            latest: published,
          },
          409,
        ),
      )
      await slowRegeneration
    })

    expect(
      screen.getByDisplayValue('Local edit during regeneration'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    expect(
      screen.getByText('Draft was published while regeneration was running.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    ).toBeInTheDocument()
  })

  it('pins an open chart session through remote freshness and preserves its conflicted save', async () => {
    await renderLoadedEditor()
    fireEvent.click(
      screen.getAllByRole('button', { name: /Chart heading/i })[0],
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit chart' }))
    expect(chartDrawerMocks.conflict).not.toBeNull()
    expect(chartDrawerMocks.expectedUpdatedAt).toBe(ORIGINAL_UPDATED_AT)

    const latest = makeRecord({
      subjectLine: 'Remote subject',
      updatedAt: '2026-08-07T12:07:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: latest }))
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(
        screen.getByText(/newer server version is available while the chart editor is open/i),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('heading', {
        name: 'Original subject',
        level: 1,
        hidden: true,
      }),
    ).toBeInTheDocument()
    expect(chartDrawerMocks.expectedUpdatedAt).toBe(ORIGINAL_UPDATED_AT)

    const attemptedDraft = makeDraft('Original subject')
    attemptedDraft.blocks[0] = {
      ...attemptedDraft.blocks[0],
      chartSpec: {
        mode: 'fundamentals',
        stocks: ['AAPL'],
        metrics: ['revenue'],
      },
    }
    act(() => {
      chartDrawerMocks.conflict?.(
        latest,
        attemptedDraft,
        'Draft changed while the chart rendered.',
      )
    })

    expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    expect(
      screen.getByText('Draft changed while the chart rendered.'),
    ).toBeInTheDocument()

    const forked = makeRecord({
      id: 'chart-fork',
      updatedAt: '2026-08-07T12:08:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: forked }, 201))
    fireEvent.click(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    )

    await waitFor(() => {
      expect(navigationMocks.push).toHaveBeenCalledWith(
        '/newsletter/editor/chart-fork',
      )
    })
    const forkCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith('/draft-1/fork'))
    expect(JSON.parse(String(forkCall?.[1]?.body))).toMatchObject({
      draft: {
        blocks: [
          {
            chartSpec: {
              mode: 'fundamentals',
              stocks: ['AAPL'],
              metrics: ['revenue'],
            },
          },
        ],
      },
    })
  })

  it('preserves newer local text together with a late successful chart capture', async () => {
    await renderLoadedEditor()
    fireEvent.click(
      screen.getAllByRole('button', { name: /Chart heading/i })[0],
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit chart' }))

    expect(screen.getByTestId('newsletter-editor-surface')).toHaveAttribute(
      'inert',
    )
    expect(chartDrawerMocks.openedEditSequence).toBe(0)

    // jsdom does not enforce inert, so this directly exercises the defensive
    // edit-sequence boundary in addition to the browser focus isolation.
    const hiddenHeading = Array.from(
      screen
        .getByTestId('newsletter-editor-surface')
        .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          'input, textarea',
        ),
    ).find((control) => control.value === 'Chart heading')
    expect(hiddenHeading).toBeDefined()
    fireEvent.change(hiddenHeading!, {
      target: { value: 'Newer heading behind the chart modal' },
    })

    const savedChart = makeRecord({
      updatedAt: '2026-08-07T12:09:00.000Z',
    })
    savedChart.draft.blocks[0] = {
      ...savedChart.draft.blocks[0],
      chartImageUrl: 'https://assets.example/recaptured-chart.png',
      chartExportUrl: 'https://charts.example/export/recaptured',
      chartSpec: {
        mode: 'fundamentals',
        stocks: ['AAPL'],
        metrics: ['revenue'],
      },
      chartProvenance: {
        ...savedChart.draft.blocks[0].chartProvenance!,
        imageUrl: 'https://assets.example/recaptured-chart.png',
        interactiveUrl: 'https://charts.example/export/recaptured',
        scene: {
          mode: 'fundamentals',
          stocks: ['AAPL'],
          metrics: ['revenue'],
        },
        sceneSha256: 'recaptured-scene-hash',
      },
    }

    let accepted: number | false | void | undefined = undefined
    act(() => {
      accepted = chartDrawerMocks.saved?.(savedChart)
    })

    expect(accepted).toBe(false)
    expect(screen.queryByTestId('chart-editor')).not.toBeInTheDocument()
    expect(
      screen.getByDisplayValue('Newer heading behind the chart modal'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    expect(
      screen.getByText(/newly captured chart are preserved together/i),
    ).toBeInTheDocument()

    const forked = makeRecord({
      id: 'late-chart-fork',
      updatedAt: '2026-08-07T12:10:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: forked }, 201))
    fireEvent.click(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    )

    await waitFor(() => {
      expect(navigationMocks.push).toHaveBeenCalledWith(
        '/newsletter/editor/late-chart-fork',
      )
    })
    const forkCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith('/draft-1/fork'))
    expect(JSON.parse(String(forkCall?.[1]?.body))).toMatchObject({
      draft: {
        subjectLine: 'Original subject',
        blocks: [
          {
            heading: 'Newer heading behind the chart modal',
            chartImageUrl: 'https://assets.example/recaptured-chart.png',
            chartExportUrl: 'https://charts.example/export/recaptured',
            chartSpec: {
              mode: 'fundamentals',
              stocks: ['AAPL'],
              metrics: ['revenue'],
            },
            chartProvenance: {
              imageUrl: 'https://assets.example/recaptured-chart.png',
              sceneSha256: 'recaptured-scene-hash',
            },
          },
        ],
      },
    })
  })

  it('acknowledges successive successful chart saves in one open drawer', async () => {
    await renderLoadedEditor()
    fireEvent.click(
      screen.getAllByRole('button', { name: /Chart heading/i })[0],
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit chart' }))

    let firstResult: number | false | void | undefined = undefined
    act(() => {
      firstResult = chartDrawerMocks.saved?.(
        makeRecord({ updatedAt: '2026-08-07T12:11:00.000Z' }),
      )
    })
    expect(firstResult).toBe(1)
    expect(screen.getByTestId('chart-editor')).toBeInTheDocument()
    expect(screen.getByTestId('editor-status', { exact: true })).toHaveTextContent(
      'Saved',
    )

    let secondResult: number | false | void | undefined = undefined
    act(() => {
      secondResult = chartDrawerMocks.saved?.(
        makeRecord({ updatedAt: '2026-08-07T12:12:00.000Z' }),
      )
    })
    expect(secondResult).toBe(2)
    expect(screen.getByTestId('chart-editor')).toBeInTheDocument()
    expect(screen.getByTestId('editor-status', { exact: true })).toHaveTextContent(
      'Saved',
    )
    expect(
      screen.queryByRole('button', { name: 'Save local work as new draft' }),
    ).not.toBeInTheDocument()
  })

  it('ignores a freshness response that was superseded by a completed save', async () => {
    await renderLoadedEditor()
    const subject = screen.getByDisplayValue('Original subject')
    fireEvent.change(subject, { target: { value: 'Locally saved subject' } })

    let resolveFreshness!: (response: Response) => void
    const staleFreshness = new Promise<Response>((resolve) => {
      resolveFreshness = resolve
    })
    vi.mocked(fetch).mockReturnValueOnce(staleFreshness)
    window.dispatchEvent(new Event('focus'))

    const saved = makeRecord({
      subjectLine: 'Locally saved subject',
      updatedAt: '2026-08-07T12:02:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: saved }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.getByTestId('editor-status')).toHaveTextContent('Saved')
    })

    const staleRemote = makeRecord({
      subjectLine: 'Stale poll response',
      updatedAt: '2026-08-07T12:01:00.000Z',
    })
    await act(async () => {
      resolveFreshness(jsonResponse({ draft: staleRemote }))
      await staleFreshness
    })

    expect(screen.getByDisplayValue('Locally saved subject')).toBeInTheDocument()
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Saved')
    expect(screen.queryByText(/newer version of this issue exists/i)).not.toBeInTheDocument()
  })

  it('auto-refreshes a clean editor when focus finds a newer version', async () => {
    await renderLoadedEditor()
    const latest = makeRecord({
      subjectLine: 'Remote subject',
      updatedAt: '2026-08-07T12:02:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: latest }))

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(screen.getByDisplayValue('Remote subject')).toBeInTheDocument()
      expect(screen.getByTestId('editor-status')).toHaveTextContent('Saved')
    })
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent(/Draft refreshed with the latest saved version/i)
    expect(notice).toHaveAttribute('aria-live', 'polite')
    expect(notice).toHaveAttribute('aria-atomic', 'true')
    expect(screen.getByText(/Last saved/i)).toBeInTheDocument()
    expect(screen.getByText(/Last checked/i)).toBeInTheDocument()
  })

  it('announces freshness failures as alerts', async () => {
    await renderLoadedEditor()
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: 'Freshness service unavailable' }, 503),
    )

    window.dispatchEvent(new Event('focus'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Freshness check failed: Freshness service unavailable',
    )
  })

  it('preserves a publication URL edited during a freshness request when another tab publishes', async () => {
    await renderLoadedEditor()

    let resolveFreshness!: (response: Response) => void
    const slowFreshness = new Promise<Response>((resolve) => {
      resolveFreshness = resolve
    })
    vi.mocked(fetch).mockReturnValueOnce(slowFreshness)
    window.dispatchEvent(new Event('focus'))

    const publicationUrl = screen.getByRole('textbox', {
      name: 'Publication URL',
    })
    fireEvent.change(publicationUrl, {
      target: { value: 'https://local.example/p/unsaved-issue' },
    })
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Unsaved')

    const published = makeRecord({
      status: 'published',
      updatedAt: '2026-08-07T12:02:00.000Z',
    })
    await act(async () => {
      resolveFreshness(jsonResponse({ draft: published }))
      await slowFreshness
    })

    expect(publicationUrl).toHaveValue(
      'https://local.example/p/unsaved-issue',
    )
    expect(screen.getByTestId('publication-panel')).toHaveAttribute(
      'data-record-status',
      'draft',
    )
    expect(screen.getByTestId('publication-panel')).toHaveAttribute(
      'data-record-url',
      '',
    )
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    expect(
      screen.getByText(/published elsewhere while you had local edits/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    ).toBeInTheDocument()
  })

  it('preserves dirty local work and requires confirmation before loading a remote update', async () => {
    await renderLoadedEditor()
    const subject = screen.getByDisplayValue('Original subject')
    fireEvent.change(subject, { target: { value: 'Local subject' } })

    const latest = makeRecord({
      subjectLine: 'Remote subject',
      updatedAt: '2026-08-07T12:03:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: latest }))
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => {
      expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    })
    expect(screen.getByDisplayValue('Local subject')).toBeInTheDocument()
    expect(
      screen.getByText(/A newer version of this issue exists/i),
    ).toBeInTheDocument()

    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }))
    expect(screen.getByDisplayValue('Local subject')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(screen.getByDisplayValue('Remote subject')).toBeInTheDocument()
    expect(screen.getByTestId('editor-status')).toHaveTextContent('Saved')
  })

  it('handles a structured save conflict and forks the preserved local document', async () => {
    await renderLoadedEditor()
    const subject = screen.getByDisplayValue('Original subject')
    fireEvent.change(subject, { target: { value: 'Local fork subject' } })

    const latest = makeRecord({
      subjectLine: 'Someone else saved this',
      updatedAt: '2026-08-07T12:04:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          code: 'draft_conflict',
          error: 'Draft changed on the server',
          latest,
        },
        409,
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    })
    expect(screen.getByDisplayValue('Local fork subject')).toBeInTheDocument()

    const forked = makeRecord({
      id: 'draft-fork',
      subjectLine: 'Local fork subject',
      updatedAt: '2026-08-07T12:05:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: forked }, 201))
    fireEvent.click(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    )

    await waitFor(() => {
      expect(navigationMocks.push).toHaveBeenCalledWith(
        '/newsletter/editor/draft-fork',
      )
    })
    const forkCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith('/draft-1/fork'))
    expect(forkCall?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(forkCall?.[1]?.body))).toMatchObject({
      draft: { subjectLine: 'Local fork subject' },
    })
  })

  it('does not navigate away from edits made while a conflict fork is in flight', async () => {
    await renderLoadedEditor()
    const subject = screen.getByDisplayValue('Original subject')
    fireEvent.change(subject, { target: { value: 'First fork snapshot' } })

    const latest = makeRecord({
      subjectLine: 'Remote subject',
      updatedAt: '2026-08-07T12:09:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          code: 'draft_conflict',
          error: 'Draft changed on the server',
          latest,
        },
        409,
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(screen.getByTestId('editor-status')).toHaveTextContent('Conflict')
    })

    let resolveFork!: (response: Response) => void
    const slowFork = new Promise<Response>((resolve) => {
      resolveFork = resolve
    })
    vi.mocked(fetch).mockReturnValueOnce(slowFork)
    fireEvent.click(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    )
    fireEvent.change(subject, { target: { value: 'Newer fork edit' } })

    const firstFork = makeRecord({
      id: 'first-fork',
      subjectLine: 'First fork snapshot',
      updatedAt: '2026-08-07T12:10:00.000Z',
    })
    await act(async () => {
      resolveFork(jsonResponse({ draft: firstFork }, 201))
      await slowFork
    })

    expect(screen.getByDisplayValue('Newer fork edit')).toBeInTheDocument()
    expect(navigationMocks.push).not.toHaveBeenCalled()
    expect(
      screen.getByText(/newer edits are still unsaved/i),
    ).toBeInTheDocument()

    const secondFork = makeRecord({
      id: 'second-fork',
      subjectLine: 'Newer fork edit',
      updatedAt: '2026-08-07T12:11:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: secondFork }, 201))
    fireEvent.click(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    )

    await waitFor(() => {
      expect(navigationMocks.push).toHaveBeenCalledWith(
        '/newsletter/editor/second-fork',
      )
    })
    const forkCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).endsWith('/draft-1/fork'))
    expect(JSON.parse(String(forkCalls[0]?.[1]?.body))).toMatchObject({
      draft: { subjectLine: 'First fork snapshot' },
    })
    expect(JSON.parse(String(forkCalls[1]?.[1]?.body))).toMatchObject({
      draft: { subjectLine: 'Newer fork edit' },
    })
  })

  it('reuses a stable idempotency key when the same fork is retried', async () => {
    await renderLoadedEditor()
    fireEvent.change(screen.getByRole('textbox', { name: 'Subject line' }), {
      target: { value: 'Stable fork snapshot' },
    })

    const latest = makeRecord({
      subjectLine: 'Remote subject',
      updatedAt: '2026-08-07T12:12:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          code: 'draft_conflict',
          error: 'Draft changed on the server',
          latest,
        },
        409,
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('button', {
      name: 'Save local work as new draft',
    })

    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: 'Temporary fork failure' }, 503),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    )
    await screen.findByText('Temporary fork failure')

    const forked = makeRecord({
      id: 'stable-fork',
      subjectLine: 'Stable fork snapshot',
      updatedAt: '2026-08-07T12:13:00.000Z',
    })
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ draft: forked }, 201))
    fireEvent.click(
      screen.getByRole('button', { name: 'Save local work as new draft' }),
    )

    await waitFor(() => {
      expect(navigationMocks.push).toHaveBeenCalledWith(
        '/newsletter/editor/stable-fork',
      )
    })
    const forkCalls = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).endsWith('/draft-1/fork'))
    expect(forkCalls).toHaveLength(2)
    const firstBody = JSON.parse(String(forkCalls[0]?.[1]?.body)) as {
      idempotencyKey: string
    }
    const secondBody = JSON.parse(String(forkCalls[1]?.[1]?.body)) as {
      idempotencyKey: string
    }
    expect(firstBody.idempotencyKey).toMatch(/^fork-[a-f0-9]{64}$/)
    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey)
  })

  it('guards unload and back navigation for an unsaved publication URL', async () => {
    await renderLoadedEditor()
    const pushState = vi.spyOn(window.history, 'pushState')

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Publication URL' }),
      {
        target: { value: 'https://theintraday.example/p/new-publication' },
      },
    )

    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({
        __newsletterDraftUnsavedGuard: expect.any(String),
      }),
      '',
      window.location.href,
    )
    expect(screen.getByTestId('workflow-bar')).toHaveAttribute(
      'data-busy',
      'true',
    )

    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const backClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    })
    screen.getByRole('link', { name: 'Back' }).dispatchEvent(backClick)
    expect(backClick.defaultPrevented).toBe(true)
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('discard your unsaved newsletter changes'),
    )

    const callsBeforeHistory = confirm.mock.calls.length
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(confirm.mock.calls.length).toBe(callsBeforeHistory + 1)
  })

  it('guards unload, global SPA links, and history navigation while dirty', async () => {
    await renderLoadedEditor()
    const pushState = vi.spyOn(window.history, 'pushState')
    fireEvent.change(screen.getByDisplayValue('Original subject'), {
      target: { value: 'Unsaved subject' },
    })
    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({ __newsletterDraftUnsavedGuard: expect.any(String) }),
      '',
      window.location.href,
    )

    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const back = screen.getByRole('link', { name: 'Back' })
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    back.dispatchEvent(click)

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('discard your unsaved newsletter changes'),
    )
    expect(click.defaultPrevented).toBe(true)

    const globalLink = document.createElement('a')
    globalLink.href = '/dashboard'
    globalLink.textContent = 'Global dashboard'
    document.body.append(globalLink)
    const globalClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    })
    globalLink.dispatchEvent(globalClick)
    expect(globalClick.defaultPrevented).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '+ New' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create another draft' }))
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('discard your unsaved newsletter changes'),
    )

    const callsBeforeHistory = confirm.mock.calls.length
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(confirm.mock.calls.length).toBe(callsBeforeHistory + 1)
    globalLink.remove()
  })

  it('contains fullscreen preview focus and restores the invoking control', async () => {
    await renderLoadedEditor()

    const trigger = screen.getByRole('button', {
      name: 'Open fullscreen preview',
    })
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', {
      name: 'Email Style Preview',
    })
    const close = within(dialog).getByRole('button', { name: 'Close' })
    const frame = within(dialog).getByTitle('Expanded newsletter preview')
    await waitFor(() => expect(close).toHaveFocus())
    expect(screen.getByTestId('newsletter-editor-surface')).toHaveAttribute(
      'aria-hidden',
      'true',
    )

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(frame).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(close).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes fullscreen preview before an iframe chart click opens the chart editor', async () => {
    await renderLoadedEditor()

    fireEvent.click(
      screen.getByRole('button', { name: 'Open fullscreen preview' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Email Style Preview',
    })
    const frame = within(dialog).getByTitle(
      'Expanded newsletter preview',
    ) as HTMLIFrameElement
    const frameDocument = frame.contentDocument
    expect(frameDocument).not.toBeNull()
    frameDocument!.body.innerHTML =
      '<div data-newsletter-preview-block-id="block-1"><img alt="Chart" /></div>'
    fireEvent.load(frame)

    fireEvent.click(frameDocument!.querySelector('img')!)

    expect(
      screen.queryByRole('dialog', { name: 'Email Style Preview' }),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('chart-editor')).toBeInTheDocument()
    expect(screen.getByTestId('newsletter-editor-surface')).toHaveAttribute(
      'inert',
    )
  })
})

describe('NewsletterDraftEditor published state', () => {
  it('keeps published content read-only while exposing its exact chart asset', async () => {
    const published = makeRecord({ status: 'published' })
    await renderLoadedEditor(published)

    expect(screen.getByTestId('editor-status')).toHaveTextContent('Published')
    expect(screen.getByDisplayValue('Original subject')).toHaveAttribute(
      'readonly',
    )
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Regenerate' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Edit chart' }),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('workflow-bar')).toHaveAttribute(
      'data-busy',
      'true',
    )
    expect(screen.getByTestId('beehiiv-panel')).toHaveAttribute(
      'data-disabled',
      'true',
    )
    expect(screen.getByTestId('publication-panel')).toHaveAttribute(
      'data-disabled',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: /Chart heading/i }))
    const exactChart = screen.getAllByRole('link', {
      name: 'View exact chart',
    })[0]
    expect(exactChart).toHaveAttribute(
      'href',
      'https://assets.example/exact-chart.png',
    )
    expect(screen.getByDisplayValue('Chart heading')).toHaveAttribute(
      'readonly',
    )
    expect(screen.getByRole('textbox', { name: 'Commentary' })).toHaveAttribute(
      'readonly',
    )
  })
})
