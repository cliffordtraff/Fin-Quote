import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NewsletterEditorialShortlist from '@/components/newsletter/NewsletterEditorialShortlist'
import type {
  NewsletterDailyRun,
  NewsletterDailyRunItem,
} from '@/lib/newsletter/daily-types'
import {
  buildNewsletterEditorialShortlistEntries,
  buildNewsletterEditorialShortlistPresentation,
  type NewsletterEditorialShortlistIntentInput,
  type NewsletterEditorialShortlistRevision,
} from '@/lib/newsletter/editorial-shortlist'

function item(rank: number): NewsletterDailyRunItem {
  return {
    id: `item-${rank}`,
    runId: 'run-1',
    rank,
    ticker: `T${rank}`,
    status: 'ready',
    qualityBand: 'strong',
    relevanceScore: 100 - rank,
    confidenceScore: 90 - rank,
    candidateType: 'stock',
    stateLabel: 'cash',
    movePercent: rank,
    reasonType: 'earnings',
    headline: `Story ${rank}`,
    summaryText: `Summary ${rank}`,
    keyFact: null,
    sourceRefs: [{ kind: 'news', label: `Source ${rank}` }],
    candidateMetadata: {},
    draftId: `draft-${rank}`,
    draftStatus: 'ready',
    draftUpdatedAt: '2026-08-08T12:00:00.000Z',
    chartId: `chart-${rank}`,
    chartImageUrl: null,
    subjectLine: `Subject ${rank}`,
    beehiivDelivery: null,
    errorMessage: null,
    retryCount: 0,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T12:00:00.000Z',
  }
}

function run(overrides: Partial<NewsletterDailyRun> = {}): NewsletterDailyRun {
  return {
    id: 'run-1',
    marketDate: '2026-08-08',
    edition: 'morning',
    status: 'completed',
    targetCount: 40,
    sourceWiimRunId: 'wiim-1',
    sourceGeneratedAt: '2026-08-08T09:00:00.000Z',
    selectedCount: 6,
    generatedCount: 6,
    readyCount: 6,
    attentionCount: 0,
    failedCount: 0,
    errorMessage: null,
    metadata: {},
    startedAt: '2026-08-08T09:00:00.000Z',
    completedAt: '2026-08-08T10:00:00.000Z',
    createdAt: '2026-08-08T09:00:00.000Z',
    updatedAt: '2026-08-08T12:00:00.000Z',
    items: [1, 2, 3, 4, 5, 6].map(item),
    ...overrides,
  }
}

function response(payload: unknown, status = 200): Response {
  return Response.json(payload, { status })
}

function revision(
  dailyRun: NewsletterDailyRun,
  selectedItemIds = ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'],
  revisionNumber = 1,
  intents: NewsletterEditorialShortlistIntentInput[] = [],
): NewsletterEditorialShortlistRevision {
  const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
  return {
    id: `revision-${revisionNumber}`,
    runId: dailyRun.id,
    revision: revisionNumber,
    algorithmVersion: presentation.baseline.algorithmVersion,
    baselineFingerprint: presentation.baseline.fingerprint,
    actorId: 'owner-1',
    baselineItemIds: presentation.baseline.itemIds,
    selectedItemIds,
    entries: buildNewsletterEditorialShortlistEntries({
      run: dailyRun,
      presentation,
      selectedItemIds,
      intents,
    }),
    createdAt: '2026-08-08T12:05:00.000Z',
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('NewsletterEditorialShortlist', () => {
  it('keeps public reports read-only and never calls the operator endpoint', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<NewsletterEditorialShortlist run={run()} readOnly />)

    expect(screen.getByRole('heading', { name: 'Recommended first' }))
      .toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Review' })[0]).toHaveAttribute(
      'href',
      '/auth?redirect=%2Fnewsletter%2Fmorning-review',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders the exact run snapshot that supplied the save presentation', async () => {
    const parentRun = run()
    const routeRun = run({
      updatedAt: '2026-08-08T12:10:00.000Z',
      items: parentRun.items.map((entry, index) => index === 0
        ? {
            ...entry,
            subjectLine: 'Fresh route-owned subject',
            updatedAt: '2026-08-08T12:10:00.000Z',
          }
        : entry),
    })
    const presentation = buildNewsletterEditorialShortlistPresentation(routeRun)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({
      run: routeRun,
      presentation,
      shortlist: null,
      currentRevision: 0,
    }))))

    render(<NewsletterEditorialShortlist run={parentRun} readOnly={false} />)

    expect(await screen.findByText('Fresh route-owned subject')).toBeInTheDocument()
    expect(screen.queryByText('Subject 1')).not.toBeInTheDocument()
  })

  it('resets dirty choices to the pinned evidence snapshot', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({
      run: dailyRun,
      presentation,
      shortlist: null,
      currentRevision: 0,
    }))))

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move T1 down' }))
    expect(screen.getByText('Unsaved')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(screen.getByText('Not saved')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Reason for moved T1' }))
      .not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports keyed dirty state as edits are made and resolved', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    const onDirtyStateChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({
      run: dailyRun,
      presentation,
      shortlist: null,
      currentRevision: 0,
    }))))

    render(
      <NewsletterEditorialShortlist
        run={dailyRun}
        readOnly={false}
        onDirtyStateChange={onDirtyStateChange}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Move T1 down' }))

    expect(onDirtyStateChange).toHaveBeenLastCalledWith({
      runIdentity: '2026-08-08:morning:run-1',
      dirty: true,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(onDirtyStateChange).toHaveBeenLastCalledWith({
      runIdentity: '2026-08-08:morning:run-1',
      dirty: false,
    })
  })

  it('guards links and page unload while shortlist decisions are unsaved', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({
      run: dailyRun,
      presentation,
      shortlist: null,
      currentRevision: 0,
    }))))
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move T1 down' }))
    expect(screen.getByText('Unsaved')).toBeInTheDocument()

    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)

    expect(
      fireEvent.click(screen.getAllByRole('link', { name: 'Review' })[0]),
    ).toBe(false)
    expect(confirm).toHaveBeenCalledWith(
      'Leave this report and discard your unsaved editorial shortlist decisions?',
    )
  })

  it('accepts the presented algorithm suggestion as the first durable revision', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    const saved = revision(dailyRun)
    const requests: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({ url, init })
      if (!init?.method) {
        return Promise.resolve(response({
          run: dailyRun,
          presentation,
          shortlist: null,
          currentRevision: 0,
          currentRevisionId: null,
        }))
      }
      return Promise.resolve(response({
        run: dailyRun,
        presentation,
        shortlist: saved,
        currentRevision: 1,
        currentRevisionId: saved.id,
        changed: true,
        receiptRevisionId: saved.id,
        isCurrent: true,
      }))
    }))

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept suggestion' }))

    await screen.findByText('Editorial shortlist saved as durable decision evidence.')
    const body = JSON.parse(String(requests[1].init?.body)) as {
      expectedRevision: number
      selectedItemIds: string[]
      intents: unknown[]
      idempotencyKey: string
    }
    expect(body).toMatchObject({
      expectedRevision: 0,
      selectedItemIds: presentation.baseline.itemIds,
      intents: [],
    })
    expect(body.idempotencyKey).toBeTruthy()
    expect(screen.getByText('Saved r1')).toBeInTheDocument()
  })

  it('records only the item intentionally moved, not every displaced row', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    const submissions: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        return Promise.resolve(response({
          run: dailyRun,
          presentation,
          shortlist: null,
          currentRevision: 0,
        }))
      }
      submissions.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      const saved = revision(
        dailyRun,
        ['item-2', 'item-1', 'item-3', 'item-4', 'item-5'],
        1,
        [{
          itemId: 'item-1',
          kind: 'moved',
          reasonCode: 'stronger_catalyst',
        }],
      )
      return Promise.resolve(response({
        run: dailyRun,
        presentation,
        shortlist: saved,
        currentRevision: 1,
        changed: true,
        receiptRevisionId: saved.id,
        isCurrent: true,
      }))
    }))

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move T1 down' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Reason for moved T1' }), {
      target: { value: 'stronger_catalyst' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save decision' }))

    await waitFor(() => expect(submissions).toHaveLength(1))
    expect(submissions[0].intents).toEqual([{
      itemId: 'item-1',
      kind: 'moved',
      reasonCode: 'stronger_catalyst',
      note: null,
    }])
  })

  it('cleans a restored move while preserving an unrelated removal decision', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    const submissions: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        return Promise.resolve(response({
          run: dailyRun,
          presentation,
          shortlist: null,
          currentRevision: 0,
        }))
      }
      submissions.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      const saved = revision(
        dailyRun,
        ['item-2', 'item-3', 'item-4', 'item-5'],
        1,
        [{
          itemId: 'item-1',
          kind: 'removed',
          reasonCode: 'duplicate_coverage',
        }],
      )
      return Promise.resolve(response({
        run: dailyRun,
        presentation,
        shortlist: saved,
        currentRevision: 1,
        changed: true,
        receiptRevisionId: saved.id,
        isCurrent: true,
      }))
    }))

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove T1' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Reason for removing T1' }), {
      target: { value: 'duplicate_coverage' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Move T2 down' }))
    expect(screen.getByRole('combobox', { name: 'Reason for moved T2' }))
      .toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Move T2 up' }))

    expect(screen.queryByRole('combobox', { name: 'Reason for moved T2' }))
      .not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Reason for removing T1' }))
      .toHaveValue('duplicate_coverage')

    fireEvent.click(screen.getByRole('button', { name: 'Save decision' }))
    await waitFor(() => expect(submissions).toHaveLength(1))
    expect(submissions[0].intents).toEqual([{
      itemId: 'item-1',
      kind: 'removed',
      reasonCode: 'duplicate_coverage',
      note: null,
    }])
  })

  it('cleans a displaced move when the row ahead of it is removed', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({
      run: dailyRun,
      presentation,
      shortlist: null,
      currentRevision: 0,
    }))))

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move T2 up' }))
    expect(screen.getByRole('combobox', { name: 'Reason for moved T2' }))
      .toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove T1' }))

    expect(screen.queryByRole('combobox', { name: 'Reason for moved T2' }))
      .not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Reason for removing T1' }))
      .toBeInTheDocument()
  })

  it('loads a current saveable suggestion when saved baseline evidence drifts', async () => {
    const savedRun = run()
    const saved = revision(savedRun)
    const liveRun = run({
      updatedAt: '2026-08-08T12:15:00.000Z',
      items: savedRun.items.map((entry, index) => index === 0
        ? {
            ...entry,
            headline: 'Materially updated leading story',
            updatedAt: '2026-08-08T12:15:00.000Z',
          }
        : entry),
    })
    const presentation = buildNewsletterEditorialShortlistPresentation(liveRun)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({
      run: liveRun,
      presentation,
      shortlist: saved,
      currentRevision: saved.revision,
    }))))

    render(<NewsletterEditorialShortlist run={liveRun} readOnly={false} />)

    await screen.findByText(/saved shortlist no longer matches the live report/i)
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save decision' })).toBeEnabled()
  })

  it('loads a saveable suggestion when a previously added item disappears', async () => {
    const savedRun = run()
    const saved = revision(
      savedRun,
      ['item-1', 'item-2', 'item-3', 'item-4', 'item-6'],
      1,
      [
        {
          itemId: 'item-5',
          kind: 'removed',
          reasonCode: 'duplicate_coverage',
        },
        {
          itemId: 'item-6',
          kind: 'added',
          reasonCode: 'stronger_catalyst',
        },
      ],
    )
    const liveRun = run({
      updatedAt: '2026-08-08T12:15:00.000Z',
      items: savedRun.items.filter((entry) => entry.id !== 'item-6'),
    })
    const presentation = buildNewsletterEditorialShortlistPresentation(liveRun)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({
      run: liveRun,
      presentation,
      shortlist: saved,
      currentRevision: saved.revision,
    }))))

    render(<NewsletterEditorialShortlist run={liveRun} readOnly={false} />)

    await screen.findByText(/saved shortlist no longer matches the live report/i)
    expect(screen.queryByText('T6')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save decision' })).toBeEnabled()
  })

  it('requires fresh review when selected non-baseline evidence changes', async () => {
    const savedRun = run()
    const saved = revision(
      savedRun,
      ['item-1', 'item-2', 'item-3', 'item-4', 'item-6'],
      1,
      [
        {
          itemId: 'item-5',
          kind: 'removed',
          reasonCode: 'duplicate_coverage',
        },
        {
          itemId: 'item-6',
          kind: 'added',
          reasonCode: 'stronger_catalyst',
        },
      ],
    )
    const liveRun = run({
      updatedAt: '2026-08-08T12:20:00.000Z',
      items: savedRun.items.map((entry) => entry.id === 'item-6'
        ? {
            ...entry,
            headline: 'The supporting evidence changed after selection',
            updatedAt: '2026-08-08T12:20:00.000Z',
          }
        : entry),
    })
    const presentation = buildNewsletterEditorialShortlistPresentation(liveRun)
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response({
      run: liveRun,
      presentation,
      shortlist: saved,
      currentRevision: saved.revision,
    }))))

    render(<NewsletterEditorialShortlist run={liveRun} readOnly={false} />)

    await screen.findByText(/saved shortlist no longer matches the live report/i)
    expect(screen.getByRole('button', { name: 'Save decision' })).toBeEnabled()
    expect(screen.queryByRole('combobox', { name: 'Reason for added T6' }))
      .not.toBeInTheDocument()
  })

  it('recovers from a partial conflict response by fetching the latest state', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    const saved = revision(dailyRun, presentation.baseline.itemIds, 2)
    let reads = 0
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        reads += 1
        return Promise.resolve(response(reads === 1
          ? { run: dailyRun, presentation, shortlist: null, currentRevision: 0 }
          : {
              run: dailyRun,
              presentation,
              shortlist: saved,
              currentRevision: saved.revision,
              currentRevisionId: saved.id,
            }))
      }
      return Promise.resolve(response({
        code: 'shortlist_conflict',
        presentation: null,
        shortlist: null,
        currentRevision: 1,
      }, 409))
    }))

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move T1 down' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Reason for moved T1' }), {
      target: { value: 'stronger_catalyst' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save decision' }))

    await screen.findByText(/another update won the shortlist revision/i)
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }))

    await screen.findByText('Saved r2')
    expect(reads).toBe(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/another update won the shortlist revision/i))
      .not.toBeInTheDocument()
  })

  it('loads the winning human decision from a complete conflict snapshot', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    const latest = revision(
      dailyRun,
      ['item-2', 'item-1', 'item-3', 'item-4', 'item-5'],
      2,
      [{
        itemId: 'item-2',
        kind: 'moved',
        reasonCode: 'audience_fit',
      }],
    )
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        return Promise.resolve(response({
          run: dailyRun,
          presentation,
          shortlist: null,
          currentRevision: 0,
        }))
      }
      return Promise.resolve(response({
        run: dailyRun,
        code: 'shortlist_conflict',
        conflictSnapshotComplete: true,
        presentation,
        latest,
        currentRevision: latest.revision,
        currentRevisionId: latest.id,
      }, 409))
    }))

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Remove T5' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Reason for removing T5' }), {
      target: { value: 'weak_evidence' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save decision' }))

    await screen.findByText(/another update won the shortlist revision/i)
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }))

    expect(await screen.findByText('Saved r2')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Reason for moved T2' }))
      .toHaveValue('audience_fit')
    expect(screen.queryByRole('combobox', { name: 'Reason for removing T5' }))
      .not.toBeInTheDocument()
  })

  it('resumes bounded head polling after a full conflict is reloaded', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    const first = revision(dailyRun, presentation.baseline.itemIds, 1)
    const second = revision(dailyRun, presentation.baseline.itemIds, 2)
    const third = revision(dailyRun, presentation.baseline.itemIds, 3)
    let reads = 0
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        reads += 1
        const current = reads === 1 ? first : third
        return Promise.resolve(response({
          run: dailyRun,
          presentation,
          shortlist: current,
          currentRevision: current.revision,
          currentRevisionId: current.id,
        }))
      }
      return Promise.resolve(response({
        code: 'shortlist_conflict',
        conflictSnapshotComplete: true,
        run: dailyRun,
        presentation,
        shortlist: second,
        latest: second,
        currentRevision: second.revision,
        currentRevisionId: second.id,
      }, 409))
    }))

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    await screen.findByText('Saved r1')
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Remove T5' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Reason for removing T5' }), {
      target: { value: 'weak_evidence' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save decision' }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText(/another update won the shortlist revision/i))
      .toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }))
    expect(screen.getByText('Saved r2')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Saved r3')).toBeInTheDocument()
    expect(reads).toBe(2)
  })

  it('cannot add a candidate that disappears from the live report', async () => {
    const firstRun = run()
    const firstPresentation = buildNewsletterEditorialShortlistPresentation(firstRun)
    const secondRun = run({
      updatedAt: '2026-08-08T12:30:00.000Z',
      items: firstRun.items.filter((entry) => entry.id !== 'item-6'),
    })
    const secondPresentation = buildNewsletterEditorialShortlistPresentation(secondRun)
    let reads = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      reads += 1
      return Promise.resolve(response({
        run: reads === 1 ? firstRun : secondRun,
        presentation: reads === 1 ? firstPresentation : secondPresentation,
        shortlist: null,
        currentRevision: 0,
      }))
    }))

    const view = render(
      <NewsletterEditorialShortlist run={firstRun} readOnly={false} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Remove T5' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Add issue to shortlist' }), {
      target: { value: 'item-6' },
    })
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()

    view.rerender(
      <NewsletterEditorialShortlist run={secondRun} readOnly={false} />,
    )

    await screen.findByText(/report changed while you were editing/i)
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('4/5 issues')).toBeInTheDocument()
  })

  it('preserves dirty choices when a polled report changes until reload is explicit', async () => {
    const firstRun = run()
    const firstPresentation = buildNewsletterEditorialShortlistPresentation(firstRun)
    const secondRun = run({
      updatedAt: '2026-08-08T12:10:00.000Z',
      items: firstRun.items.map((entry, index) =>
        index === 0
          ? { ...entry, headline: 'Changed leading story', updatedAt: '2026-08-08T12:10:00.000Z' }
          : entry),
    })
    const secondPresentation = buildNewsletterEditorialShortlistPresentation(secondRun)
    let reads = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      reads += 1
      return Promise.resolve(response({
        run: reads === 1 ? firstRun : secondRun,
        presentation: reads === 1 ? firstPresentation : secondPresentation,
        shortlist: null,
        currentRevision: 0,
      }))
    }))

    const view = render(
      <NewsletterEditorialShortlist run={firstRun} readOnly={false} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Move T1 down' }))
    expect(screen.getByText('Unsaved')).toBeInTheDocument()

    view.rerender(
      <NewsletterEditorialShortlist run={secondRun} readOnly={false} />,
    )
    await screen.findByText(/report changed while you were editing/i)
    expect(screen.getByRole('button', { name: 'Reload latest' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save decision' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Reason for moved T1' }))
      .toBeInTheDocument()
  })

  it('refreshes a clean shortlist head on window focus', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    const first = revision(dailyRun, presentation.baseline.itemIds, 1)
    const second = revision(dailyRun, presentation.baseline.itemIds, 2)
    let reads = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      reads += 1
      const current = reads === 1 ? first : second
      return Promise.resolve(response({
        run: dailyRun,
        presentation,
        shortlist: current,
        currentRevision: current.revision,
        currentRevisionId: current.id,
      }))
    }))

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    await screen.findByText('Saved r1')

    window.dispatchEvent(new Event('focus'))

    await screen.findByText('Saved r2')
    expect(reads).toBe(2)
  })

  it('preserves and locks dirty choices when focus discovers a newer head', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    const first = revision(dailyRun, presentation.baseline.itemIds, 1)
    const second = revision(dailyRun, presentation.baseline.itemIds, 2)
    let reads = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      reads += 1
      const current = reads === 1 ? first : second
      return Promise.resolve(response({
        run: dailyRun,
        presentation,
        shortlist: current,
        currentRevision: current.revision,
        currentRevisionId: current.id,
      }))
    }))

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Move T1 down' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Reason for moved T1' }), {
      target: { value: 'audience_fit' },
    })

    window.dispatchEvent(new Event('focus'))

    await screen.findByText(/report changed while you were editing/i)
    expect(screen.getByRole('combobox', { name: 'Reason for moved T1' }))
      .toHaveValue('audience_fit')
    expect(screen.getByRole('combobox', { name: 'Reason for moved T1' }))
      .toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save decision' })).toBeDisabled()
  })

  it('reuses the same idempotency key after an uncertain network failure', async () => {
    const dailyRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(dailyRun)
    const keys: string[] = []
    let puts = 0
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) {
        return Promise.resolve(response({
          run: dailyRun,
          presentation,
          shortlist: null,
          currentRevision: 0,
        }))
      }
      puts += 1
      keys.push((JSON.parse(String(init.body)) as { idempotencyKey: string }).idempotencyKey)
      if (puts === 1) return Promise.reject(new Error('Connection reset after submit'))
      const saved = revision(dailyRun)
      return Promise.resolve(response({
        run: dailyRun,
        presentation,
        shortlist: saved,
        currentRevision: 1,
        changed: false,
        receiptRevisionId: saved.id,
        isCurrent: true,
      }))
    }))

    render(<NewsletterEditorialShortlist run={dailyRun} readOnly={false} />)
    const accept = await screen.findByRole('button', { name: 'Accept suggestion' })
    fireEvent.click(accept)
    await screen.findByText('Connection reset after submit')
    fireEvent.click(screen.getByRole('button', { name: 'Accept suggestion' }))

    await screen.findByText('This editorial decision was already recorded.')
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
  })
})
