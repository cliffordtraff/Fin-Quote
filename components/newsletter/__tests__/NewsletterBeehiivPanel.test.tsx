import { act, createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BeehiivDeliveryRecord } from '@/lib/beehiiv/types'
import type { NewsletterDraftRecord } from '@/lib/newsletter/types'
import NewsletterBeehiivPanel, {
  type NewsletterBeehiivPanelHandle,
} from '../NewsletterBeehiivPanel'

const INITIAL_UPDATED_AT = '2026-08-07T11:59:00.000Z'

const record = {
  id: 'draft-1',
  updatedAt: INITIAL_UPDATED_AT,
} as NewsletterDraftRecord

const integration = {
  connected: true,
  publication: {
    id: 'publication-1',
    name: 'The Intraday',
    description: null,
    url: 'https://theintraday.beehiiv.com',
  },
  connectedAt: '2026-08-06T12:00:00.000Z',
  lastVerifiedAt: '2026-08-07T12:00:00.000Z',
}

function deliveryFixture(
  overrides: Partial<BeehiivDeliveryRecord> = {},
): BeehiivDeliveryRecord {
  return {
    id: 'delivery-1',
    draftId: 'draft-1',
    ownerId: 'owner-1',
    publicationId: 'publication-1',
    postId: 'post-1',
    title: 'Opening bell setup',
    previewUrl: 'https://app.beehiiv.com/preview/post-1',
    editorUrl: 'https://app.beehiiv.com/posts/post-1',
    webUrl: null,
    contentHash: 'content-hash',
    sourceDraftUpdatedAt: '2026-08-07T11:59:00.000Z',
    lifecycleStatus: 'draft',
    lifecycleAppliedStatus: 'draft',
    lifecycleAppliedAt: '2026-08-07T12:00:00.000Z',
    beehiivStatus: 'draft',
    scheduledAt: null,
    publishedAt: null,
    stats: {},
    statsLastFetchedAt: null,
    statsLastError: null,
    syncedAt: '2026-08-07T12:00:00.000Z',
    lastReconciledAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    lastReconcileError: null,
    createdAt: '2026-08-07T12:00:00.000Z',
    updatedAt: '2026-08-07T12:00:00.000Z',
    ...overrides,
  }
}

function stubBeehiivFetch(
  delivery: BeehiivDeliveryRecord | null,
  postResult?: { delivery: BeehiivDeliveryRecord; mode: 'created' | 'updated' | 'unchanged' },
  needsSync = false,
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'POST') {
        return Response.json(postResult ?? { delivery, mode: 'unchanged' })
      }
      if (url === '/api/integrations/beehiiv') {
        return Response.json(integration)
      }
      if (url === '/api/newsletter/drafts/draft-1/beehiiv-delivery') {
        return Response.json({ delivery, needsSync })
      }
      return Response.json({ error: 'Unexpected request' }, { status: 500 })
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderPanel(
  ref = createRef<NewsletterBeehiivPanelHandle>(),
  callbacks = {
    onNotice: vi.fn(),
    onError: vi.fn(),
    onBusyChange: vi.fn(),
    onCopyFallback: vi.fn(async () => undefined),
  },
) {
  render(
    <NewsletterBeehiivPanel
      ref={ref}
      record={record}
      onNotice={callbacks.onNotice}
      onError={callbacks.onError}
      onBusyChange={callbacks.onBusyChange}
      onCopyFallback={callbacks.onCopyFallback}
    />,
  )
  return { ref, callbacks }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('NewsletterBeehiivPanel', () => {
  it('distinguishes an unsynced issue and refreshes on focus or manual request', async () => {
    const fetchMock = stubBeehiivFetch(null)
    renderPanel()

    expect(await screen.findByText('Not synced')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6))
  })

  it('shows when the saved Fin Quote version is newer than the Beehiiv receipt', async () => {
    stubBeehiivFetch(deliveryFixture(), undefined, true)
    renderPanel()

    expect(await screen.findByText('Needs sync')).toBeInTheDocument()
    expect(
      screen.getByText(/newer saved version than the content currently in Beehiiv/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Sync and open' }),
    ).toBeEnabled()
  })

  it('marks a newly saved same-draft version stale and ignores the older status response', async () => {
    let deliveryRequestCount = 0
    let resolveStaleDelivery!: (response: Response) => void
    let resolveCurrentDelivery!: (response: Response) => void
    const staleDelivery = new Promise<Response>((resolve) => {
      resolveStaleDelivery = resolve
    })
    const currentDeliveryResponse = new Promise<Response>((resolve) => {
      resolveCurrentDelivery = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === '/api/integrations/beehiiv') {
          return Response.json(integration)
        }
        if (url === '/api/newsletter/drafts/draft-1/beehiiv-delivery') {
          deliveryRequestCount += 1
          if (deliveryRequestCount === 1) {
            return Response.json({
              delivery: deliveryFixture(),
              needsSync: false,
            })
          }
          return deliveryRequestCount === 2
            ? staleDelivery
            : currentDeliveryResponse
        }
        return Response.json({ error: 'Unexpected request' }, { status: 500 })
      }),
    )
    const callbacks = {
      onNotice: vi.fn(),
      onError: vi.fn(),
      onBusyChange: vi.fn(),
      onCopyFallback: vi.fn(async () => undefined),
    }
    const ref = createRef<NewsletterBeehiivPanelHandle>()
    const view = render(
      <NewsletterBeehiivPanel
        ref={ref}
        record={record}
        {...callbacks}
      />,
    )

    expect(await screen.findByText('Draft')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(deliveryRequestCount).toBe(2))
    view.rerender(
      <NewsletterBeehiivPanel
        ref={ref}
        record={{
          ...record,
          updatedAt: '2026-08-07T12:01:00.000Z',
        }}
        {...callbacks}
      />,
    )
    await waitFor(() => expect(deliveryRequestCount).toBe(3))
    expect(screen.getByText('Needs sync')).toBeInTheDocument()

    const currentDelivery = deliveryFixture({
      postId: 'post-current',
      editorUrl: 'https://app.beehiiv.com/posts/post-current',
      sourceDraftUpdatedAt: INITIAL_UPDATED_AT,
    })
    await act(async () => {
      resolveCurrentDelivery(
        Response.json({ delivery: currentDelivery, needsSync: true }),
      )
    })
    expect(await screen.findByText('Needs sync')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      currentDelivery.editorUrl,
    )

    await act(async () => {
      resolveStaleDelivery(
        Response.json({
          delivery: deliveryFixture({
            postId: 'post-stale',
            editorUrl: 'https://app.beehiiv.com/posts/post-stale',
          }),
          needsSync: false,
        }),
      )
    })
    await waitFor(() => {
      expect(screen.getByText('Needs sync')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
        'href',
        currentDelivery.editorUrl,
      )
    })
  })

  it.each([
    {
      lifecycleStatus: 'draft' as const,
      label: 'Draft',
      detail: /Editable Beehiiv draft synced/,
      locked: false,
    },
    {
      lifecycleStatus: 'scheduled' as const,
      label: 'Scheduled',
      detail: /Scheduled for Aug 8, 2026/,
      locked: true,
      scheduledAt: '2026-08-08T13:30:00.000Z',
    },
    {
      lifecycleStatus: 'published' as const,
      label: 'Published',
      detail: /Published Aug 7, 2026/,
      locked: true,
      publishedAt: '2026-08-07T13:30:00.000Z',
      webUrl: 'https://theintraday.beehiiv.com/p/opening-bell-setup',
    },
    {
      lifecycleStatus: 'archived' as const,
      label: 'Archived',
      detail: /Archived in Beehiiv/,
      locked: true,
    },
    {
      lifecycleStatus: 'unknown' as const,
      label: 'Unknown status',
      detail: /unrecognized status: “provider-mystery”/,
      locked: false,
      beehiivStatus: 'provider-mystery',
    },
  ])(
    'renders the $lifecycleStatus lifecycle with its safe sync state',
    async ({
      lifecycleStatus,
      label,
      detail,
      locked,
      scheduledAt,
      publishedAt,
      webUrl,
      beehiivStatus,
    }) => {
      stubBeehiivFetch(
        deliveryFixture({
          lifecycleStatus,
          scheduledAt: scheduledAt ?? null,
          publishedAt: publishedAt ?? null,
          webUrl: webUrl ?? null,
          beehiivStatus: beehiivStatus ?? lifecycleStatus,
        }),
      )
      renderPanel()

      expect(await screen.findByText(label)).toBeInTheDocument()
      expect(screen.getByText(detail)).toBeInTheDocument()
      expect(screen.getByText(/Last reconciled/)).toHaveTextContent(
        '(5 min ago)',
      )

      const syncButton = screen.getByRole('button', {
        name: locked ? 'Sync locked' : 'Sync and open',
      })
      if (locked) {
        expect(syncButton).toBeDisabled()
      } else {
        expect(syncButton).toBeEnabled()
      }

      if (webUrl) {
        expect(
          screen.getByRole('link', { name: 'View published issue' }),
        ).toHaveAttribute('href', webUrl)
      }
    },
  )

  it.each([
    {
      lifecycleStatus: 'scheduled' as const,
      label: 'Scheduled version mismatch',
      detail: /record changed after this Beehiiv version was scheduled/,
    },
    {
      lifecycleStatus: 'published' as const,
      label: 'Published version mismatch',
      detail: /record changed after this Beehiiv version was published/,
    },
  ])(
    'surfaces a locked $lifecycleStatus source-version mismatch',
    async ({ lifecycleStatus, label, detail }) => {
      stubBeehiivFetch(
        deliveryFixture({ lifecycleStatus }),
        undefined,
        true,
      )
      renderPanel()

      expect(await screen.findByText(label)).toBeInTheDocument()
      expect(screen.getByText(detail)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sync locked' })).toBeDisabled()
    },
  )

  it('surfaces reconciliation errors without hiding the known lifecycle', async () => {
    stubBeehiivFetch(
      deliveryFixture({
        lifecycleStatus: 'unknown',
        beehiivStatus: null,
        lastReconcileError: 'Beehiiv lifecycle request timed out.',
      }),
    )
    renderPanel()

    expect(await screen.findByText('Unknown status')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Reconciliation error: Beehiiv lifecycle request timed out.',
    )
  })

  it('shows a load failure instead of mislabeling it as not synced', async () => {
    const onError = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/integrations/beehiiv') {
          return Response.json(integration)
        }
        return Response.json(
          { error: 'Beehiiv delivery lookup failed.' },
          { status: 500 },
        )
      }),
    )
    renderPanel(undefined, {
      onNotice: vi.fn(),
      onError,
      onBusyChange: vi.fn(),
      onCopyFallback: vi.fn(async () => undefined),
    })

    expect(await screen.findByText('Status unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Not synced')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Beehiiv delivery lookup failed.',
    )
    expect(onError).toHaveBeenCalledWith('Beehiiv delivery lookup failed.')
  })

  it('keeps the imperative delivery handle while blocking terminal lifecycle mutations', async () => {
    const published = deliveryFixture({
      lifecycleStatus: 'published',
      beehiivStatus: 'published',
      publishedAt: '2026-08-07T13:30:00.000Z',
      webUrl: 'https://theintraday.beehiiv.com/p/opening-bell-setup',
    })
    const fetchMock = stubBeehiivFetch(published)
    const openSpy = vi.spyOn(window, 'open')
    const { ref } = renderPanel()

    expect(await screen.findByText('Published')).toBeInTheDocument()
    await act(async () => {
      await ref.current?.deliver()
    })

    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(false)
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('still syncs draft content through the imperative handle and callbacks', async () => {
    const initial = deliveryFixture()
    const updated = deliveryFixture({
      syncedAt: '2026-08-07T14:00:00.000Z',
      contentHash: 'updated-content-hash',
    })
    const fetchMock = stubBeehiivFetch(initial, {
      delivery: updated,
      mode: 'updated',
    })
    const popup = {
      opener: window,
      close: vi.fn(),
      location: { replace: vi.fn() },
    }
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    const { ref, callbacks } = renderPanel()

    expect(await screen.findByText('Draft')).toBeInTheDocument()
    await act(async () => {
      await ref.current?.deliver()
    })

    expect(
      fetchMock.mock.calls.some(([, init]) => init?.method === 'POST'),
    ).toBe(true)
    expect(callbacks.onBusyChange).toHaveBeenNthCalledWith(1, true)
    expect(callbacks.onBusyChange).toHaveBeenLastCalledWith(false)
    expect(callbacks.onNotice).toHaveBeenCalledWith(
      'Beehiiv draft synced with the latest saved issue.',
    )
    expect(popup.location.replace).toHaveBeenCalledWith(updated.editorUrl)
  })
})
