import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NewsletterMorningReview from '@/components/newsletter/NewsletterMorningReview'
import type {
  NewsletterDailyRun,
  NewsletterDailyRunItem,
  NewsletterDailySettings,
} from '@/lib/newsletter/daily-types'
import { projectPublicNewsletterMorningReport } from '@/lib/newsletter/public-morning-report'

vi.mock('@/components/newsletter/NewsletterEditorialShortlist', () => ({
  default: ({
    readOnly,
    run,
    onDirtyStateChange,
  }: {
    readOnly: boolean
    run: { id: string; marketDate: string; edition: string }
    onDirtyStateChange?: (state: {
      runIdentity: string
      dirty: boolean
    }) => void
  }) =>
    readOnly ? (
      <a href="/auth?redirect=%2Fnewsletter%2Fmorning-review">Review</a>
    ) : (
      <div>
        <button
          type="button"
          onClick={() => onDirtyStateChange?.({
            runIdentity: `${run.marketDate}:${run.edition}:${run.id}`,
            dirty: true,
          })}
        >
          Make shortlist dirty
        </button>
        <button
          type="button"
          onClick={() => onDirtyStateChange?.({
            runIdentity: `${run.marketDate}:${run.edition}:${run.id}`,
            dirty: false,
          })}
        >
          Resolve shortlist changes
        </button>
      </div>
    ),
}))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

const settings: NewsletterDailySettings = {
  enabled: true,
  targetCount: 40,
  timezone: 'America/New_York',
  generationHour: 8,
}

function item(subjectLine: string): NewsletterDailyRunItem {
  return {
    id: 'item-1',
    runId: 'run-1',
    rank: 1,
    ticker: 'AAPL',
    status: 'generated',
    qualityBand: 'strong',
    relevanceScore: 92,
    confidenceScore: 89,
    candidateType: 'stock',
    stateLabel: 'cash',
    movePercent: 3.2,
    reasonType: 'earnings',
    headline: subjectLine,
    summaryText: 'Current editorial summary.',
    keyFact: null,
    sourceRefs: [],
    candidateMetadata: {},
    draftId: 'draft-1',
    draftStatus: 'draft',
    chartId: null,
    chartImageUrl: null,
    subjectLine,
    beehiivDelivery: null,
    errorMessage: null,
    retryCount: 0,
    startedAt: null,
    completedAt: '2026-08-08T12:00:00.000Z',
    createdAt: '2026-08-08T11:00:00.000Z',
    updatedAt: '2026-08-08T12:00:00.000Z',
  }
}

function run(subjectLine: string): NewsletterDailyRun {
  return {
    id: 'run-1',
    marketDate: '2026-08-08',
    edition: 'morning',
    status: 'completed',
    targetCount: 40,
    sourceWiimRunId: 'wiim-1',
    sourceGeneratedAt: '2026-08-08T11:00:00.000Z',
    selectedCount: 1,
    generatedCount: 1,
    readyCount: 0,
    attentionCount: 0,
    failedCount: 0,
    errorMessage: null,
    metadata: {},
    startedAt: '2026-08-08T11:00:00.000Z',
    completedAt: '2026-08-08T12:00:00.000Z',
    createdAt: '2026-08-08T11:00:00.000Z',
    updatedAt: '2026-08-08T12:00:00.000Z',
    items: [item(subjectLine)],
  }
}

function publicPayload(nextRun: NewsletterDailyRun | null) {
  return {
    run: nextRun ? projectPublicNewsletterMorningReport(nextRun) : null,
    settings,
    automation: null,
    reportReadOnly: true,
    automationReadOnly: true,
  }
}

function ownerPayload(
  nextRun: NewsletterDailyRun | null,
  nextSettings: NewsletterDailySettings = settings,
) {
  return {
    run: nextRun,
    settings: nextSettings,
    automation: null,
    reportReadOnly: false,
    automationReadOnly: false,
  }
}

function response(payload: unknown): Response {
  return Response.json(payload)
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function controlVisibility(initiallyHidden = false) {
  let hidden = initiallyHidden
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  return {
    setHidden(next: boolean) {
      hidden = next
      document.dispatchEvent(new Event('visibilitychange'))
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('NewsletterMorningReview polling reliability', () => {
  it('starts the next timeout only after the current refresh settles', async () => {
    vi.useFakeTimers()
    controlVisibility()
    const first = deferred<Response>()
    const second = deferred<Response>()
    const runRequests: Array<{ signal: AbortSignal }> = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/newsletter/daily-runs')
      runRequests.push({ signal: init?.signal as AbortSignal })
      return runRequests.length === 1 ? first.promise : second.promise
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterMorningReview />)
    await flushAsyncWork()
    expect(runRequests).toHaveLength(1)
    expect(runRequests[0].signal).toBeInstanceOf(AbortSignal)

    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000)
    })
    expect(runRequests).toHaveLength(1)

    first.resolve(response(publicPayload(run('First completed refresh'))))
    await flushAsyncWork()
    expect(
      screen.getByRole('heading', { name: 'First completed refresh' }),
    ).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    expect(runRequests).toHaveLength(2)

    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000)
    })
    expect(runRequests).toHaveLength(2)

    second.resolve(response(publicPayload(run('Second completed refresh'))))
    await flushAsyncWork()
    expect(
      screen.getByRole('heading', { name: 'Second completed refresh' }),
    ).toBeInTheDocument()
  })

  it('does not poll while hidden and refreshes immediately when visible', async () => {
    vi.useFakeTimers()
    const visibility = controlVisibility()
    let requestCount = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      requestCount += 1
      return Promise.resolve(response(publicPayload(run(`Issue ${requestCount}`))))
    }))

    render(<NewsletterMorningReview />)
    await flushAsyncWork()
    expect(requestCount).toBe(1)

    act(() => visibility.setHidden(true))
    await act(async () => {
      vi.advanceTimersByTime(5 * 60_000)
    })
    expect(requestCount).toBe(1)

    act(() => visibility.setHidden(false))
    await flushAsyncWork()
    expect(requestCount).toBe(2)
    expect(screen.getByRole('heading', { name: 'Issue 2' }))
      .toBeInTheDocument()
  })

  it('aborts a hidden refresh and suppresses its stale response after resume', async () => {
    vi.useFakeTimers()
    const visibility = controlVisibility()
    const stale = deferred<Response>()
    const fresh = deferred<Response>()
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/newsletter/daily-runs')
      signals.push(init?.signal as AbortSignal)
      return signals.length === 1 ? stale.promise : fresh.promise
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterMorningReview />)
    await flushAsyncWork()
    expect(signals).toHaveLength(1)

    act(() => visibility.setHidden(true))
    expect(signals[0].aborted).toBe(true)
    act(() => visibility.setHidden(false))
    await flushAsyncWork()
    expect(signals).toHaveLength(2)

    fresh.resolve(response(publicPayload(run('Fresh visible report'))))
    await flushAsyncWork()
    expect(screen.getByRole('heading', { name: 'Fresh visible report' }))
      .toBeInTheDocument()

    stale.resolve(response(publicPayload(run('Stale hidden report'))))
    await flushAsyncWork()
    expect(screen.queryByRole('heading', { name: 'Stale hidden report' }))
      .not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fresh visible report' }))
      .toBeInTheDocument()
  })

  it('aborts an independent notification request on unmount', async () => {
    controlVisibility()
    const notifications = deferred<Response>()
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal)
      if (String(input).includes('/notifications')) return notifications.promise
      return Promise.resolve(response(ownerPayload(run('Owner report'))))
    })
    vi.stubGlobal('fetch', fetchMock)

    const view = render(<NewsletterMorningReview />)
    await flushAsyncWork()
    expect(signals).toHaveLength(2)
    expect(signals[0]).not.toBe(signals[1])
    expect(signals[0].aborted).toBe(false)
    expect(signals[1].aborted).toBe(false)

    view.unmount()
    expect(signals[0].aborted).toBe(false)
    expect(signals[1].aborted).toBe(true)
    notifications.resolve(response({ notifications: [] }))
    await flushAsyncWork()
  })

  it('renders the queue before a hung notification request times out independently', async () => {
    vi.useFakeTimers()
    controlVisibility()
    const notifications = deferred<Response>()
    const notificationSignals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/notifications')) {
        notificationSignals.push(init?.signal as AbortSignal)
        return notifications.promise
      }
      return Promise.resolve(response(ownerPayload(run('Queue loads first'))))
    }))

    render(<NewsletterMorningReview />)
    await flushAsyncWork()

    expect(screen.getByRole('heading', { name: 'Queue loads first' }))
      .toBeInTheDocument()
    expect(screen.queryByText('Loading newsletter production queue'))
      .not.toBeInTheDocument()
    expect(notificationSignals).toHaveLength(1)
    expect(notificationSignals[0].aborted).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(8_000)
      await Promise.resolve()
    })
    await flushAsyncWork()

    expect(notificationSignals[0].aborted).toBe(true)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Notification updates are unavailable: Newsletter notifications took too long to load. The production queue is still current.',
    )
    expect(screen.getByRole('heading', { name: 'Queue loads first' }))
      .toBeInTheDocument()

    notifications.resolve(response({ notifications: [] }))
    await flushAsyncWork()
  })

  it('routes failed and attention items through retry and never announces a false ready state', async () => {
    controlVisibility()
    const failedItem: NewsletterDailyRunItem = {
      ...item('Failed issue'),
      id: 'failed-item',
      status: 'failed',
      errorMessage: 'Chart capture failed.',
    }
    const attentionItem: NewsletterDailyRunItem = {
      ...item('Attention issue'),
      id: 'attention-item',
      ticker: 'MSFT',
      status: 'needs_attention',
      errorMessage: 'Source evidence needs review.',
    }
    const attentionRun: NewsletterDailyRun = {
      ...run('Ignored subject'),
      status: 'partial',
      selectedCount: 2,
      generatedCount: 1,
      attentionCount: 1,
      failedCount: 1,
      items: [failedItem, attentionItem],
    }
    const processBodies: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/notifications')) {
        return Promise.resolve(response({ notifications: [] }))
      }
      if (url.includes('/process')) {
        processBodies.push(JSON.parse(String(init?.body)))
        return Promise.resolve(response({
          run: attentionRun,
          attempted: 0,
          generated: 0,
          failed: 0,
        }))
      }
      return Promise.resolve(response(ownerPayload(attentionRun)))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterMorningReview />)
    await flushAsyncWork()

    expect(screen.queryByRole('button', { name: 'Resume generation' }))
      .not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry attention' }))
    await flushAsyncWork()

    expect(processBodies).toEqual([
      expect.objectContaining({ retryFailed: true }),
    ])
    expect(fetchMock.mock.calls.some(
      ([input]) => String(input) === '/api/newsletter/daily-runs/action',
    )).toBe(false)
    expect(screen.getByText(
      'Generation completed with 2 issues needing attention. Retry or review before marking the queue ready.',
    )).toBeInTheDocument()
    expect(screen.queryByText(
      "Today's newsletter queue is generated and ready for review.",
    )).not.toBeInTheDocument()
  })

  it('never requests owner notifications for a public report', async () => {
    controlVisibility()
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      urls.push(String(input))
      return Promise.resolve(response(publicPayload(run('Public report'))))
    }))

    render(<NewsletterMorningReview />)
    await flushAsyncWork()

    expect(screen.getByRole('heading', { name: 'Public report' }))
      .toBeInTheDocument()
    expect(urls).toEqual(['/api/newsletter/daily-runs'])
  })

  it('keeps polling without a run so a newly generated report appears', async () => {
    vi.useFakeTimers()
    controlVisibility()
    let requestCount = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      requestCount += 1
      return Promise.resolve(response(
        publicPayload(requestCount === 1 ? null : run('Newly discovered report')),
      ))
    }))

    render(<NewsletterMorningReview />)
    await flushAsyncWork()
    expect(screen.getByText("Today's queue has not been generated"))
      .toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    await flushAsyncWork()

    expect(requestCount).toBe(2)
    expect(screen.getByRole('heading', { name: 'Newly discovered report' }))
      .toBeInTheDocument()
  })

  it('clears a transient refresh error after the next successful poll', async () => {
    vi.useFakeTimers()
    controlVisibility()
    let requestCount = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      requestCount += 1
      if (requestCount === 1) {
        return Promise.resolve(new Response(
          JSON.stringify({ error: 'Temporary read failure' }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          },
        ))
      }
      return Promise.resolve(response(publicPayload(run('Recovered report'))))
    }))

    render(<NewsletterMorningReview />)
    await flushAsyncWork()
    expect(screen.getByRole('alert')).toHaveTextContent('Temporary read failure')

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    await flushAsyncWork()

    expect(screen.queryByText('Temporary read failure')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recovered report' }))
      .toBeInTheDocument()
  })

  it('lets a settings mutation supersede an older passive response', async () => {
    vi.useFakeTimers()
    controlVisibility()
    const stalePoll = deferred<Response>()
    let dailyRunReads = 0
    const staleSignals: AbortSignal[] = []
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/notifications')) {
        return Promise.resolve(response({ notifications: [] }))
      }
      if (url === '/api/newsletter/daily-settings') {
        return Promise.resolve(response({
          settings: { ...settings, generationHour: 9 },
        }))
      }
      dailyRunReads += 1
      if (dailyRunReads === 1) {
        return Promise.resolve(response(ownerPayload(run('Current report'))))
      }
      staleSignals.push(init?.signal as AbortSignal)
      return stalePoll.promise
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterMorningReview />)
    await flushAsyncWork()
    const readyBy = screen.getByRole('combobox', {
      name: 'Newsletter ready-by hour',
    })
    expect(readyBy).toHaveValue('8')

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    expect(dailyRunReads).toBe(2)

    fireEvent.change(readyBy, { target: { value: '9' } })
    await flushAsyncWork()
    expect(readyBy).toHaveValue('9')
    expect(staleSignals).toHaveLength(1)
    expect(staleSignals[0].aborted).toBe(true)

    stalePoll.resolve(response(ownerPayload(
      run('Stale report'),
      { ...settings, generationHour: 8 },
    )))
    await flushAsyncWork()
    expect(readyBy).toHaveValue('9')
    expect(screen.queryByRole('heading', { name: 'Stale report' }))
      .not.toBeInTheDocument()
  })

  it('preserves selected issues across a same-run refresh', async () => {
    vi.useFakeTimers()
    controlVisibility()
    let dailyRunReads = 0
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/notifications')) {
        return Promise.resolve(response({ notifications: [] }))
      }
      dailyRunReads += 1
      return Promise.resolve(response(ownerPayload(
        run(dailyRunReads === 1 ? 'Original issue' : 'Updated issue'),
      )))
    }))

    render(<NewsletterMorningReview />)
    await flushAsyncWork()
    const issueCheckbox = screen.getByRole('checkbox', { name: 'Select AAPL' })
    fireEvent.click(issueCheckbox)
    expect(issueCheckbox).toBeChecked()

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    await flushAsyncWork()

    expect(screen.getByRole('heading', { name: 'Updated issue' }))
      .toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select AAPL' }))
      .toBeChecked()
    expect(screen.getByRole('button', { name: 'Mark ready (1)' }))
      .toBeEnabled()
  })

  it('defers a passively discovered run while shortlist decisions are dirty', async () => {
    vi.useFakeTimers()
    controlVisibility()
    const currentRun = run('Current report')
    const nextRun: NewsletterDailyRun = {
      ...run('Next report'),
      id: 'run-2',
      marketDate: '2026-08-09',
      items: [{ ...item('Next report'), id: 'item-2', runId: 'run-2' }],
    }
    let dailyRunReads = 0
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes('/notifications')) {
        return Promise.resolve(response({ notifications: [] }))
      }
      dailyRunReads += 1
      return Promise.resolve(response(ownerPayload(
        dailyRunReads === 1 ? currentRun : nextRun,
      )))
    }))

    render(<NewsletterMorningReview />)
    await flushAsyncWork()
    fireEvent.click(screen.getByRole('button', { name: 'Make shortlist dirty' }))

    await act(async () => {
      vi.advanceTimersByTime(60_000)
      await Promise.resolve()
    })
    await flushAsyncWork()

    expect(screen.getByRole('heading', { name: 'Current report' }))
      .toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Next report' }))
      .not.toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'A newer Morning Report is available. Save or reset the editorial shortlist before loading it.',
    )

    fireEvent.click(screen.getByRole('button', {
      name: 'Resolve shortlist changes',
    }))
    await flushAsyncWork()

    expect(screen.getByRole('heading', { name: 'Next report' }))
      .toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'The newer Morning Report was loaded after the editorial shortlist was saved or reset.',
    )
  })

  it('prompts before an interactive reload replaces a dirty run identity', async () => {
    controlVisibility()
    const currentRun = run('Current interactive report')
    const nextRun: NewsletterDailyRun = {
      ...run('Replacement interactive report'),
      id: 'run-2',
      marketDate: '2026-08-09',
      items: [{
        ...item('Replacement interactive report'),
        id: 'item-2',
        runId: 'run-2',
      }],
    }
    let dailyRunReads = 0
    const confirm = vi.fn(() => false)
    const replace = vi.fn()
    vi.stubGlobal('confirm', confirm)
    vi.spyOn(window, 'open').mockReturnValue({
      opener: null,
      close: vi.fn(),
      location: { replace },
    } as unknown as Window)
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/notifications')) {
        return Promise.resolve(response({ notifications: [] }))
      }
      if (url.includes('/beehiiv-delivery')) {
        return Promise.resolve(response({
          delivery: {
            id: 'delivery-1',
            postId: 'post-1',
            editorUrl: 'https://app.beehiiv.com/posts/post-1',
          },
          mode: 'created',
        }))
      }
      dailyRunReads += 1
      return Promise.resolve(response(ownerPayload(
        dailyRunReads === 1 ? currentRun : nextRun,
      )))
    }))

    render(<NewsletterMorningReview />)
    await flushAsyncWork()
    fireEvent.click(screen.getByRole('button', { name: 'Make shortlist dirty' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create in Beehiiv' }))
    await flushAsyncWork()

    expect(confirm).toHaveBeenCalledWith(
      'Replace this Morning Report and discard your unsaved editorial shortlist decisions?',
    )
    expect(screen.getByRole('heading', { name: 'Current interactive report' }))
      .toBeInTheDocument()
    expect(screen.queryByRole('heading', {
      name: 'Replacement interactive report',
    })).not.toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith(
      'https://app.beehiiv.com/posts/post-1',
    )
  })
})
