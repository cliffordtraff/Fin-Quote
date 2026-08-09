import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  NewsletterDraftArchivePage,
  NewsletterDraftSummary,
} from '@/lib/newsletter/types'

const navigation = vi.hoisted(() => ({
  pathname: '/newsletter/editor',
  query: '',
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}))

import NewsletterDraftsHome from '../NewsletterDraftsHome'

function makeDraft(
  id: string,
  overrides: Partial<NewsletterDraftSummary> = {},
): NewsletterDraftSummary {
  const day = String((Number.parseInt(id.replace(/\D/g, ''), 10) || 1) % 28 + 1).padStart(
    2,
    '0',
  )

  return {
    id,
    ticker: 'AAPL',
    format: 'single_stock',
    featuredTickers: [],
    status: 'draft',
    sourceType: 'manual',
    sourceReviewKey: null,
    beehiivUrl: null,
    publishedAt: null,
    archivedAt: null,
    attachedChartCount: 1,
    subjectLine: `Issue ${id}`,
    generatedAt: `2026-07-${day}T12:00:00.000Z`,
    blockCount: 3,
    createdAt: `2026-07-${day}T12:00:00.000Z`,
    updatedAt: `2026-08-${day}T13:00:00.000Z`,
    ...overrides,
  }
}

function makePage(
  drafts: NewsletterDraftSummary[],
  overrides: Partial<NewsletterDraftArchivePage> = {},
): NewsletterDraftArchivePage {
  return {
    drafts,
    pageSize: 25,
    total: drafts.length,
    nextCursor: null,
    hasMore: false,
    facets: {
      statuses: {
        draft: drafts.filter((draft) => draft.status === 'draft').length,
        review: drafts.filter((draft) => draft.status === 'review').length,
        ready: drafts.filter((draft) => draft.status === 'ready').length,
        published: drafts.filter((draft) => draft.status === 'published').length,
      },
      active: drafts.filter((draft) => !draft.archivedAt).length,
      archived: drafts.filter((draft) => Boolean(draft.archivedAt)).length,
    },
    ...overrides,
  }
}

function requestUrl(input: RequestInfo | URL): URL {
  const value = typeof input === 'string' ? input : input.toString()
  return new URL(value, 'http://localhost')
}

describe('NewsletterDraftsHome', () => {
  beforeEach(() => {
    navigation.query = ''
    navigation.replace.mockReset()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('debounces URL-backed search and aborts a stale result request', async () => {
    const draft = makeDraft('draft-1')
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input)
        if (init?.signal) signals.push(init.signal)
        return Response.json(makePage(url.searchParams.get('q') ? [] : [draft]))
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterDraftsHome />)
    expect(await screen.findByText('Issue draft-1')).toBeInTheDocument()

    vi.useFakeTimers()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'inflation' },
    })

    await act(async () => {
      vi.advanceTimersByTime(349)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const filteredUrl = requestUrl(fetchMock.mock.calls[1][0])
    expect(filteredUrl.searchParams.get('q')).toBe('inflation')
    expect(filteredUrl.searchParams.get('archive')).toBe('active')
    expect(filteredUrl.searchParams.get('limit')).toBe('25')
    expect(navigation.replace).toHaveBeenLastCalledWith(
      '/newsletter/editor?q=inflation',
      { scroll: false },
    )
    expect(signals[0].aborted).toBe(true)
  })

  it('mounts only fetched cursor pages and announces when results are exhausted', async () => {
    const firstPage = Array.from({ length: 25 }, (_, index) =>
      makeDraft(`draft-${index + 1}`),
    )
    const finalDraft = makeDraft('draft-26', { subjectLine: 'Last loaded issue' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input)
      if (url.searchParams.get('cursor') === 'page-2') {
        return Response.json(
          makePage([finalDraft], {
            total: 26,
            nextCursor: null,
            hasMore: false,
          }),
        )
      }
      return Response.json(
        makePage(firstPage, {
          total: 26,
          nextCursor: 'page-2',
          hasMore: true,
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<NewsletterDraftsHome />)
    const issueList = await screen.findByRole('list', { name: 'Newsletter issues' })
    expect(within(issueList).getAllByRole('listitem')).toHaveLength(25)
    expect(screen.queryByText('Last loaded issue')).not.toBeInTheDocument()
    expect(container.querySelectorAll('time').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Load more issues' }))

    expect(await screen.findByText('Last loaded issue')).toBeInTheDocument()
    expect(within(issueList).getAllByRole('listitem')).toHaveLength(26)
    expect(screen.getByText('All 26 matching issues are loaded.')).toBeInTheDocument()
    const secondUrl = requestUrl(fetchMock.mock.calls[1][0])
    expect(secondUrl.searchParams.get('cursor')).toBe('page-2')
    expect(secondUrl.searchParams.get('limit')).toBe('25')
  })

  it('applies status, ticker, issue-date, and archive filters and can reset them', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl(input)
      return Response.json(makePage([]))
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<NewsletterDraftsHome />)
    expect(await screen.findByText('No active issues yet')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'published' },
    })
    fireEvent.change(screen.getByLabelText('Archive visibility'), {
      target: { value: 'archived' },
    })
    fireEvent.change(screen.getByLabelText('Primary or featured ticker'), {
      target: { value: 'msft' },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Apply ticker filter' }))
    fireEvent.change(screen.getByLabelText('Issue date from (UTC)'), {
      target: { value: '2026-07-01' },
    })
    fireEvent.change(screen.getByLabelText('Issue date to (UTC)'), {
      target: { value: '2026-07-31' },
    })

    await waitFor(() => {
      const url = requestUrl(fetchMock.mock.calls.at(-1)?.[0] ?? '')
      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        status: 'published',
        ticker: 'MSFT',
        from: '2026-07-01',
        to: '2026-07-31',
        archive: 'archived',
        limit: '25',
      })
    })
    expect(await screen.findByText('No issues match these filters')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    await waitFor(() => {
      const url = requestUrl(fetchMock.mock.calls.at(-1)?.[0] ?? '')
      expect(url.searchParams.get('archive')).toBe('active')
      expect(url.searchParams.has('status')).toBe(false)
      expect(url.searchParams.has('ticker')).toBe(false)
      expect(url.searchParams.has('from')).toBe(false)
      expect(url.searchParams.has('to')).toBe(false)
    })
  })

  it('renders issue dates in the same UTC calendar used by date filters', async () => {
    const nearMidnight = makeDraft('draft-utc-boundary', {
      subjectLine: 'UTC boundary issue',
      generatedAt: '2026-08-07T03:30:00.000Z',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(makePage([nearMidnight]))),
    )

    render(<NewsletterDraftsHome />)

    expect(await screen.findByText('UTC boundary issue')).toBeInTheDocument()
    expect(screen.getByText('Aug 7, 2026 UTC')).toBeInTheDocument()
    expect(screen.getByLabelText('Issue date from (UTC)')).toBeInTheDocument()
    expect(screen.getByLabelText('Issue date to (UTC)')).toBeInTheDocument()
  })

  it('archives the exact selected issues through a recoverable confirmation', async () => {
    const issues = [
      makeDraft('draft-1', { subjectLine: 'Apple earnings setup' }),
      makeDraft('draft-2', { subjectLine: 'Rates preview' }),
    ]
    let getCount = 0
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Response.json({
            results: issues.map((issue) => ({
              id: issue.id,
              archivedAt: '2026-08-07T12:00:00.000Z',
              updatedAt: '2026-08-07T12:00:00.000Z',
              changed: true,
            })),
          })
        }
        getCount += 1
        return Response.json(makePage(getCount === 1 ? issues : []))
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterDraftsHome />)
    expect(await screen.findByText('Apple earnings setup')).toBeInTheDocument()
    expect(screen.queryByText(/Delete/i)).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select all 2 loaded issues' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Archive selected (2)' }),
    )

    const dialog = screen.getByRole('dialog', { name: 'Archive 2 selected issues?' })
    expect(within(dialog).getByText('Apple earnings setup')).toBeInTheDocument()
    expect(within(dialog).getByText('Rates preview')).toBeInTheDocument()
    expect(within(dialog).getByText(/nothing will be permanently removed/i)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive issues' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/newsletter/drafts/bulk',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')
    const body = JSON.parse(String(postCall?.[1]?.body)) as {
      action: string
      items: Array<{ id: string; expectedUpdatedAt: string }>
      idempotencyKey: string
    }
    expect(body.action).toBe('archive')
    expect(body.items).toEqual(
      issues.map((issue) => ({ id: issue.id, expectedUpdatedAt: issue.updatedAt })),
    )
    expect(body.idempotencyKey).toMatch(/^newsletter-archive-/)
    expect(
      await screen.findByText(
        'Archived 2 newsletter issues. You can restore them from Archived.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(getCount).toBe(2))
  })

  it('contains bulk confirmation focus and restores the invoking control', async () => {
    const issue = makeDraft('draft-1', { subjectLine: 'Focus-safe issue' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(makePage([issue]))),
    )

    render(<NewsletterDraftsHome />)
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select Focus-safe issue' }),
    )
    const trigger = screen.getByRole('button', { name: 'Archive selected (1)' })
    const pageContent = screen
      .getByRole('heading', { name: 'Newsletter History' })
      .closest('section')
      ?.parentElement
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', {
      name: 'Archive 1 selected issue?',
    })
    const liveRegion = screen.getByRole('status')
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
    const confirm = within(dialog).getByRole('button', {
      name: 'Archive issues',
    })
    await waitFor(() => expect(cancel).toHaveFocus())
    expect(pageContent).toHaveAttribute('inert')
    expect(pageContent).toHaveAttribute('aria-hidden', 'true')
    expect(liveRegion.closest('[inert]')).toBeNull()

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(confirm).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(cancel).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('caps loaded-result bulk selection at the transactional server limit', async () => {
    const issues = Array.from({ length: 105 }, (_, index) =>
      makeDraft(`draft-${index + 1}`),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          makePage(issues, {
            total: issues.length,
            pageSize: issues.length,
          }),
        ),
      ),
    )

    render(<NewsletterDraftsHome />)
    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: 'Select first 100 of 105 loaded issues',
      }),
    )

    expect(
      screen.getByRole('button', { name: 'Archive selected (100)' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(
        'Selected the first 100 loaded issues. Run this bulk action, then select the next group.',
      ),
    ).toHaveLength(2)
    expect(screen.queryByText('105 selected')).not.toBeInTheDocument()
  })

  it('restores an archived issue without exposing a destructive action', async () => {
    navigation.query = 'archive=archived'
    const issue = makeDraft('draft-7', {
      subjectLine: 'Recover this issue',
      archivedAt: '2026-08-06T12:00:00.000Z',
    })
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Response.json({
            results: [
              {
                id: issue.id,
                archivedAt: null,
                updatedAt: '2026-08-07T12:00:00.000Z',
                changed: true,
              },
            ],
          })
        }
        return Response.json(makePage([issue]))
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterDraftsHome />)
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select Recover this issue' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Restore selected (1)' }))

    const dialog = screen.getByRole('dialog', { name: 'Restore 1 selected issue?' })
    expect(within(dialog).getByText('Recover this issue')).toBeInTheDocument()
    expect(within(dialog).getByText(/return to the active newsletter history/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore issues' }))

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')
      expect(postCall).toBeDefined()
      const body = JSON.parse(String(postCall?.[1]?.body)) as {
        action: string
        items: Array<{ id: string; expectedUpdatedAt: string }>
      }
      expect(body).toMatchObject({
        action: 'restore',
        items: [{ id: issue.id, expectedUpdatedAt: issue.updatedAt }],
      })
    })
  })

  it('keeps a failed archive selection retryable with the same idempotency key', async () => {
    const issue = makeDraft('draft-1', { subjectLine: 'Retry-safe issue' })
    let postCount = 0
    const postBodies: Array<{ idempotencyKey: string }> = []
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          postCount += 1
          postBodies.push(JSON.parse(String(init.body)) as { idempotencyKey: string })
          if (postCount === 1) {
            return Response.json({ error: 'Temporary archive failure' }, { status: 503 })
          }
          return Response.json({
            results: [
              {
                id: issue.id,
                archivedAt: '2026-08-07T12:00:00.000Z',
                updatedAt: '2026-08-07T12:00:00.000Z',
                changed: true,
              },
            ],
          })
        }
        return Response.json(makePage([issue]))
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterDraftsHome />)
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select Retry-safe issue' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Archive selected (1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive issues' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Temporary archive failure Your selection is unchanged; it is safe to try again.',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'The selected issues could not be archived.',
    )
    expect(screen.getByRole('status').closest('[inert]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Archive issues' }))

    await waitFor(() => expect(postBodies).toHaveLength(2))
    expect(postBodies[1].idempotencyKey).toBe(postBodies[0].idempotencyKey)
  })

  it('focuses the stable history heading after bulk success removes its trigger', async () => {
    const issue = makeDraft('draft-1', {
      subjectLine: 'Focus after archive',
    })
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Response.json({
            results: [
              {
                id: issue.id,
                archivedAt: '2026-08-07T12:00:00.000Z',
                updatedAt: '2026-08-07T12:00:00.000Z',
                changed: true,
              },
            ],
          })
        }
        return Response.json(makePage([issue]))
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterDraftsHome />)
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select Focus after archive' }),
    )
    const heading = screen.getByRole('heading', { name: 'Newsletter History' })
    fireEvent.click(screen.getByRole('button', { name: 'Archive selected (1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive issues' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Archive 1 selected issue?' }),
      ).not.toBeInTheDocument()
    })
    expect(heading).toHaveFocus()
  })

  it('requires fresh results instead of retrying a stale selection conflict', async () => {
    const issue = makeDraft('draft-9', { subjectLine: 'Changed elsewhere' })
    let getCount = 0
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Response.json(
            {
              code: 'draft_conflict',
              error: 'One or more selected issues changed.',
            },
            { status: 409 },
          )
        }
        getCount += 1
        return Response.json(makePage([issue]))
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterDraftsHome />)
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select Changed elsewhere' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Archive selected (1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive issues' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Refresh the results and review your selection before trying again.',
    )
    expect(screen.queryByRole('button', { name: 'Archive issues' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh results' }))
    await waitFor(() => expect(getCount).toBe(2))
  })

  it('shows archived empty and request error states with recovery actions', async () => {
    navigation.query = 'archive=archived'
    let requestCount = 0
    const fetchMock = vi.fn(async () => {
      requestCount += 1
      if (requestCount === 1) {
        return Response.json({ error: 'Archive service unavailable' }, { status: 503 })
      }
      return Response.json(makePage([]))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterDraftsHome />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Archive service unavailable',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Archive is empty')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View active issues' })).toBeInTheDocument()
  })
})
