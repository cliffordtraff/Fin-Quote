import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WhyMovedEditorialReviewRecord } from '@/lib/why-moved-types'
import WhyMovedReviewQueue, {
  type WhyMovedReviewQueueItem,
} from '@/components/WhyMovedReviewQueue'

const REVIEW_ID = '22222222-2222-4222-8222-222222222222'
const UPDATED_AT = '2026-08-08T14:00:00.000Z'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  refresh: vi.fn(),
}))
let showModalMock: ReturnType<typeof vi.fn>

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

function review(
  status: WhyMovedEditorialReviewRecord['status'] = 'pending',
): WhyMovedEditorialReviewRecord {
  return {
    id: REVIEW_ID,
    reviewKey: '2026-08-08:cash:gainer:GRMN',
    symbol: 'GRMN',
    marketDate: '2026-08-08',
    session: 'cash',
    direction: 'gainer',
    status,
    notes: 'Check the company release.',
    reviewerId: null,
    reviewedAt: null,
    candidateSnapshot: {
      reviewKey: '2026-08-08:cash:gainer:GRMN',
      symbol: 'GRMN',
      name: 'Garmin',
      price: 228.15,
      change: 31.4,
      changesPercentage: 15.96,
      direction: 'gainer',
      session: 'cash',
      marketDate: '2026-08-08',
    },
    catalystSnapshot: {
      symbol: 'GRMN',
      status: 'found',
      headline: 'Captured guidance increase',
      summary: 'The company raised its full-year outlook.',
      displayText: 'Captured guidance increase',
      bulletPoints: ['Guidance increased before the market opened.'],
      sentiment: 'positive',
      source: 'Company release',
      sourceTimestamp: null,
      isCatalyst: true,
      sourceUrl: 'https://example.test/captured',
      fetchedAt: '2026-08-08T13:50:00.000Z',
      errorMessage: null,
    },
    snapshotState: 'captured',
    discoveryRunId: 'automation-run-1',
    firstSeenAt: '2026-08-08T13:45:00.000Z',
    lastSeenAt: '2026-08-08T13:45:00.000Z',
    createdAt: '2026-08-08T13:45:00.000Z',
    updatedAt: UPDATED_AT,
  }
}

function commandResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function commandBody(callIndex = 0): unknown {
  const init = mocks.fetch.mock.calls[callIndex]?.[1] as RequestInit | undefined
  return init?.body ? JSON.parse(String(init.body)) : undefined
}

function queueItem(
  status: WhyMovedEditorialReviewRecord['status'] = 'pending',
): WhyMovedReviewQueueItem {
  const record = review(status)
  return {
    candidate: record.candidateSnapshot,
    catalyst: record.catalystSnapshot,
    review: record,
    current: true,
    newsletterDraft: null,
  }
}

function queueElement(overrides: {
  item?: WhyMovedReviewQueueItem
  hasMore?: boolean
  nextCursor?: string | null
  cursor?: string
} = {}) {
  const item = overrides.item ?? queueItem()
  return (
    <WhyMovedReviewQueue
      initialPage={{
        items: [item],
        pageSize: 25,
        total: 17,
        statusCounts: {
          pending: 9,
          needs_work: 4,
          approved: 3,
          dismissed: 1,
        },
        hasMore: overrides.hasMore ?? false,
        nextCursor: overrides.nextCursor ?? null,
      }}
      globalTotal={42}
      globalStatusCounts={{
        pending: 19,
        needs_work: 8,
        approved: 10,
        dismissed: 5,
      }}
      marketDate="2026-08-08"
      currentCandidateCount={10}
      filters={{
        status: 'inbox',
        session: 'cash',
        marketDate: '',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-08',
        pageSize: 25,
        cursor: overrides.cursor,
      }}
      renderedAt="2026-08-08T15:00:00.000Z"
    />
  )
}

function renderQueue(overrides: Parameters<typeof queueElement>[0] = {}) {
  return render(queueElement(overrides))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  showModalMock = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: showModalMock,
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open')
    }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WhyMovedReviewQueue', () => {
  it('renders global facets, immutable evidence, and freshness badges', () => {
    renderQueue()

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Captured guidance increase')).toBeInTheDocument()
    expect(screen.getByText('Queued 1h ago')).toBeInTheDocument()
    expect(screen.getByText('Catalyst captured 1h ago')).toBeInTheDocument()
    expect(screen.getByText('Loaded 1 of 17 matching records')).toBeInTheDocument()
    expect(screen.getByText('Discovery evidence is immutable')).toBeInTheDocument()
  })

  it('shows a current preview without replacing captured evidence', async () => {
    mocks.fetch.mockResolvedValue(commandResponse({
      success: true,
      whyMoving: {
        ...review().catalystSnapshot,
        headline: 'Current unrelated headline',
        displayText: 'Current unrelated headline',
        fetchedAt: '2026-08-08T15:00:00.000Z',
      },
    }))
    renderQueue()

    fireEvent.click(
      screen.getByRole('button', { name: 'Preview current catalyst' }),
    )

    expect(await screen.findByText('Current unrelated headline')).toBeInTheDocument()
    expect(screen.getByText('Captured guidance increase')).toBeInTheDocument()
    expect(screen.getByText('Current preview · not saved')).toBeInTheDocument()
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/admin/why-moved/preview',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    )
    expect(commandBody()).toEqual({ symbol: 'GRMN' })
  })

  it('sends the loaded CAS token on individual review saves', async () => {
    const saved = {
      ...review('needs_work'),
      updatedAt: '2026-08-08T15:01:00.000Z',
    }
    mocks.fetch.mockResolvedValue(
      commandResponse({ success: true, review: saved }),
    )
    renderQueue()

    fireEvent.change(screen.getByLabelText('Reviewer notes'), {
      target: { value: 'Use the primary filing.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Needs work' }))

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/admin/why-moved/reviews',
        expect.objectContaining({ method: 'PATCH', credentials: 'same-origin' }),
      )
      expect(commandBody()).toEqual({
        candidate: review().candidateSnapshot,
        status: 'needs_work',
        notes: 'Use the primary filing.',
        expectedUpdatedAt: UPDATED_AT,
      })
    })
    expect(await screen.findByText('GRMN review saved.')).toBeInTheDocument()
  })

  it('isolates approval behind the heavy approval command', async () => {
    const approved = {
      ...review('approved'),
      reviewedAt: '2026-08-08T15:01:00.000Z',
      updatedAt: '2026-08-08T15:01:00.000Z',
    }
    mocks.fetch.mockResolvedValue(
      commandResponse({ success: true, review: approved }),
    )
    renderQueue()

    fireEvent.click(screen.getByRole('button', { name: 'Approve + draft' }))

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/admin/why-moved/reviews/approve',
        expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
      )
    })
    expect(commandBody()).toMatchObject({
      status: 'approved',
      expectedUpdatedAt: UPDATED_AT,
    })
  })

  it('requires an accessible confirmation before a bounded bulk transition', async () => {
    mocks.fetch.mockResolvedValue(commandResponse({
        success: true,
        results: [
          {
            id: REVIEW_ID,
            status: 'needs_work',
            reviewedAt: '2026-08-08T15:02:00.000Z',
            updatedAt: '2026-08-08T15:02:00.000Z',
            changed: true,
          },
        ],
      }))
    renderQueue()

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select GRMN for a bulk action',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 changes' }))

    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(showModalMock).toHaveBeenCalledTimes(1)
    const confirmation = screen.getByRole('button', { name: 'Confirm update' })
    expect(confirmation).toHaveFocus()
    fireEvent.click(confirmation)

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1))
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/admin/why-moved/reviews/bulk',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    )
    expect(commandBody()).toEqual({
      targetStatus: 'needs_work',
      items: [{ id: REVIEW_ID, expectedUpdatedAt: UPDATED_AT }],
      idempotencyKey: expect.stringMatching(/^why_moved_[0-9a-f-]+$/),
      confirmed: true,
    })
    await waitFor(() =>
      expect(screen.getByLabelText('Bulk action')).toHaveFocus(),
    )
  })

  it('restores focus to the enabled bulk trigger after cancel closes the dialog', async () => {
    renderQueue()
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select GRMN for a bulk action',
      }),
    )
    const trigger = screen.getByRole('button', { name: 'Review 1 changes' })
    fireEvent.click(trigger)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps an ambiguous bulk retry inside the modal with the same receipt key', async () => {
    let resolveFirstBulk!: (response: Response) => void
    mocks.fetch
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFirstBulk = resolve
        }),
      )
      .mockResolvedValueOnce(commandResponse({
        success: true,
        results: [
          {
            id: REVIEW_ID,
            status: 'needs_work',
            reviewedAt: '2026-08-08T15:02:00.000Z',
            updatedAt: '2026-08-08T15:02:00.000Z',
            changed: true,
          },
        ],
      }))
    const rendered = renderQueue()

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Select GRMN for a bulk action',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm update' }))

    const firstKey = (commandBody(0) as { idempotencyKey: string }).idempotencyKey
    const firstSignal = (mocks.fetch.mock.calls[0][1] as RequestInit)
      .signal as AbortSignal
    rendered.rerender(queueElement({ item: queueItem() }))
    expect(firstSignal.aborted).toBe(false)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    await act(async () => {
      resolveFirstBulk(
        commandResponse(
          { success: false, error: 'Temporary transport error' },
          500,
        ),
      )
      await Promise.resolve()
    })

    const modalError = await screen.findByRole('alert')
    expect(modalError).toHaveTextContent('Temporary transport error')
    expect(modalError).toHaveFocus()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm update' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2))
    expect((commandBody(1) as { idempotencyKey: string }).idempotencyKey).toBe(
      firstKey,
    )
  })

  it('captures current-market evidence only after the operator requests it', async () => {
    mocks.fetch.mockResolvedValue(commandResponse({
      success: true,
      captured: 10,
      marketDate: '2026-08-08',
    }))
    renderQueue()

    expect(mocks.fetch).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Capture current market' }),
    )

    expect(
      await screen.findByText(
        'Captured 10 current catalyst snapshots for 2026-08-08.',
      ),
    ).toBeInTheDocument()
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/admin/why-moved/capture',
      expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
    )
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('refreshes and focuses the conflict message after a stale individual save', async () => {
    mocks.fetch.mockResolvedValue(commandResponse({
        success: false,
        conflict: true,
        error: 'The review changed before this update was saved',
      }, 409))
    renderQueue()

    fireEvent.click(screen.getByRole('button', { name: 'Needs work' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The review changed before this update was saved')
    expect(alert).toHaveFocus()
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('keeps a durable command alive across refreshed props and reconciles its receipt', async () => {
    let resolveSave!: (response: Response) => void
    mocks.fetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveSave = resolve
      }),
    )
    const rendered = renderQueue()

    fireEvent.click(screen.getByRole('button', { name: 'Needs work' }))
    const signal = (mocks.fetch.mock.calls[0][1] as RequestInit)
      .signal as AbortSignal
    rendered.rerender(queueElement({ item: queueItem() }))

    expect(signal.aborted).toBe(false)

    await act(async () => {
      resolveSave(
        commandResponse({
          success: true,
          review: {
            ...review('needs_work'),
            updatedAt: '2026-08-08T15:01:00.000Z',
          },
        }),
      )
      await Promise.resolve()
    })

    expect(await screen.findByText('GRMN review saved.')).toBeInTheDocument()
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('never installs a late mutation row over newer refreshed props', async () => {
    let resolveSave!: (response: Response) => void
    mocks.fetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveSave = resolve
      }),
    )
    const rendered = renderQueue()
    fireEvent.click(screen.getByRole('button', { name: 'Needs work' }))
    const signal = (mocks.fetch.mock.calls[0][1] as RequestInit)
      .signal as AbortSignal
    const newerItem = queueItem('dismissed')
    newerItem.review = {
      ...newerItem.review,
      notes: 'Newer server-side decision.',
      updatedAt: '2026-08-08T15:05:00.000Z',
    }
    rendered.rerender(queueElement({ item: newerItem }))

    expect(signal.aborted).toBe(false)
    await act(async () => {
      resolveSave(
        commandResponse({
          success: true,
          review: {
            ...review('needs_work'),
            updatedAt: '2026-08-08T15:01:00.000Z',
          },
        }),
      )
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'Dismissed' })).toHaveClass(
      'bg-sage-700',
    )
    expect(screen.getByLabelText('Reviewer notes')).toHaveValue(
      'Newer server-side decision.',
    )
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('preserves the dirty-note lock when an older success follows newer props', async () => {
    let resolveSave!: (response: Response) => void
    mocks.fetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveSave = resolve
      }),
    )
    const rendered = renderQueue()
    fireEvent.change(screen.getByLabelText('Reviewer notes'), {
      target: { value: 'My local investigation.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Needs work' }))
    expect(commandBody()).toMatchObject({
      notes: 'My local investigation.',
      expectedUpdatedAt: UPDATED_AT,
    })

    const newerItem = queueItem('dismissed')
    newerItem.review = {
      ...newerItem.review,
      notes: 'Newer server-side decision.',
      updatedAt: '2026-08-08T15:05:00.000Z',
    }
    rendered.rerender(queueElement({ item: newerItem }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'These notes changed after you began editing',
    )

    await act(async () => {
      resolveSave(
        commandResponse({
          success: true,
          review: {
            ...review('needs_work'),
            notes: 'My local investigation.',
            updatedAt: '2026-08-08T15:01:00.000Z',
          },
        }),
      )
      await Promise.resolve()
    })

    expect(screen.getByLabelText('Reviewer notes')).toHaveValue(
      'My local investigation.',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'saving is locked until you choose',
    )
    expect(screen.getByRole('button', { name: 'Needs work' })).toBeDisabled()
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('serializes durable commands synchronously before React can disable controls', async () => {
    let resolveSave!: (response: Response) => void
    mocks.fetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveSave = resolve
      }),
    )
    renderQueue()
    const saveButton = screen.getByRole('button', { name: 'Needs work' })
    const captureButton = screen.getByRole('button', {
      name: 'Capture current market',
    })

    act(() => {
      saveButton.click()
      captureButton.click()
    })

    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.fetch.mock.calls[0][0]).toBe(
      '/api/admin/why-moved/reviews',
    )
    await act(async () => {
      resolveSave(
        commandResponse({
          success: true,
          review: {
            ...review('needs_work'),
            updatedAt: '2026-08-08T15:01:00.000Z',
          },
        }),
      )
      await Promise.resolve()
    })
  })

  it('locks a dirty note on remote drift until the operator resolves the rebase', async () => {
    mocks.fetch.mockResolvedValue(
      commandResponse({
        success: true,
        review: {
          ...review('needs_work'),
          notes: 'My local investigation.',
          updatedAt: '2026-08-08T15:06:00.000Z',
        },
      }),
    )
    const rendered = renderQueue()
    fireEvent.change(screen.getByLabelText('Reviewer notes'), {
      target: { value: 'My local investigation.' },
    })
    const remoteItem = queueItem()
    remoteItem.review = {
      ...remoteItem.review,
      notes: 'Another editor found a filing.',
      updatedAt: '2026-08-08T15:05:00.000Z',
    }
    rendered.rerender(queueElement({ item: remoteItem }))

    expect(screen.getByLabelText('Reviewer notes')).toHaveValue(
      'My local investigation.',
    )
    const saveButton = screen.getByRole('button', { name: 'Needs work' })
    expect(saveButton).toBeDisabled()
    fireEvent.click(saveButton)
    expect(mocks.fetch).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', { name: 'Keep mine on latest' }),
    )
    expect(saveButton).toBeEnabled()
    fireEvent.click(saveButton)

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1))
    expect(commandBody()).toMatchObject({
      notes: 'My local investigation.',
      expectedUpdatedAt: '2026-08-08T15:05:00.000Z',
    })
  })

  it('preserves active filters in forward pagination and offers a first-page reset', () => {
    renderQueue({
      hasMore: true,
      nextCursor: 'next_cursor_1',
      cursor: 'current_cursor_1',
    })

    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/admin/why-moved?session=cash&dateFrom=2026-08-01&dateTo=2026-08-08&cursor=next_cursor_1',
    )
    expect(
      screen.getByRole('link', { name: 'Back to first page' }),
    ).toHaveAttribute(
      'href',
      '/admin/why-moved?session=cash&dateFrom=2026-08-01&dateTo=2026-08-08',
    )
  })
})
