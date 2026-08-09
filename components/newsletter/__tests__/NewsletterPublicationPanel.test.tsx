import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  NewsletterDraftDocument,
  NewsletterDraftRecord,
} from '@/lib/newsletter/types'
import NewsletterPublicationPanel from '../NewsletterPublicationPanel'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

function makeRecord(
  status: NewsletterDraftRecord['status'] = 'draft',
): NewsletterDraftRecord {
  const draft: NewsletterDraftDocument = {
    ticker: 'AAPL',
    format: 'single_stock',
    featuredTickers: ['AAPL'],
    generatedAt: '2026-08-07T11:00:00.000Z',
    subjectLine: 'Original subject',
    introText: 'The opening paragraph.',
    header: {
      title: 'The Intraday',
      dateText: 'August 7, 2026',
      badgeText: 'Market Note',
    },
    statsCard: { items: [] },
    autoPickedStock: false,
    blocks: [],
  }

  return {
    id: 'draft-1',
    ownerId: 'user-1',
    ticker: 'AAPL',
    status,
    sourceType: 'manual',
    sourceReviewKey: null,
    beehiivUrl:
      status === 'published' ? 'https://theintraday.example/p/apple' : null,
    publishedAt:
      status === 'published' ? '2026-08-07T12:30:00.000Z' : null,
    archivedAt: null,
    attachedChartCount: 0,
    subjectLine: draft.subjectLine,
    previewHtml: '<html><body>Preview</body></html>',
    draft,
    history: [],
    createdAt: '2026-08-07T11:00:00.000Z',
    updatedAt:
      status === 'published'
        ? '2026-08-07T12:30:00.000Z'
        : '2026-08-07T12:00:00.000Z',
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

describe('NewsletterPublicationPanel', () => {
  it('reports unsaved URL edits and preserves them across a record refresh', async () => {
    const initial = makeRecord()
    const onDirtyChange = vi.fn()
    const onRecordChange = vi.fn()
    const { rerender } = render(
      <NewsletterPublicationPanel
        record={initial}
        getEditSequence={() => 0}
        onDirtyChange={onDirtyChange}
        onRecordChange={onRecordChange}
      />,
    )

    const input = screen.getByLabelText('Beehiiv publication URL')
    fireEvent.change(input, {
      target: { value: 'https://theintraday.example/p/local-unsaved' },
    })
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true))

    const refreshed = {
      ...initial,
      beehiivUrl: 'https://theintraday.example/p/remote-version',
      updatedAt: '2026-08-07T12:05:00.000Z',
    }
    rerender(
      <NewsletterPublicationPanel
        record={refreshed}
        getEditSequence={() => 0}
        onDirtyChange={onDirtyChange}
        onRecordChange={onRecordChange}
      />,
    )

    expect(screen.getByLabelText('Beehiiv publication URL')).toHaveValue(
      'https://theintraday.example/p/local-unsaved',
    )
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    fireEvent.change(screen.getByLabelText('Beehiiv publication URL'), {
      target: { value: refreshed.beehiivUrl },
    })
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false))
  })

  it('returns the edit sequence captured when a slow publication request began', async () => {
    const initial = makeRecord()
    const published = makeRecord('published')
    let editSequence = 4
    let resolvePublication!: (response: Response) => void
    const slowPublication = new Promise<Response>((resolve) => {
      resolvePublication = resolve
    })
    vi.mocked(fetch).mockReturnValueOnce(slowPublication)
    const onRecordChange = vi.fn()

    render(
      <NewsletterPublicationPanel
        record={initial}
        getEditSequence={() => editSequence}
        onRecordChange={onRecordChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Beehiiv publication URL'), {
      target: { value: 'https://theintraday.example/p/apple' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record publication' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    editSequence = 5

    await act(async () => {
      resolvePublication(jsonResponse({ draft: published }))
      await slowPublication
    })

    expect(onRecordChange).toHaveBeenCalledWith(published, 4)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Publication recorded and issue marked published.',
    )
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('announces publication failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: 'Could not record publication' }, 500),
    )

    render(
      <NewsletterPublicationPanel
        record={makeRecord()}
        getEditSequence={() => 0}
        onRecordChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Beehiiv publication URL'), {
      target: { value: 'https://theintraday.example/p/apple' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record publication' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not record publication',
    )
  })
})
