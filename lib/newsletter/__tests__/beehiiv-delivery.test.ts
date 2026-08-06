import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class BeehiivReconnectRequiredError extends Error {}
  class BeehiivToolRejectedError extends Error {}
  return {
    BeehiivReconnectRequiredError,
    BeehiivToolRejectedError,
    appendNewsletterDraftEvent: vi.fn(),
    beginBeehiivSyncRemoteCall: vi.fn(),
    buildNewsletterDraftBeehiivExport: vi.fn(),
    claimBeehiivSyncOperation: vi.fn(),
    completeBeehiivSyncOperation: vi.fn(),
    createBeehiivPostDraft: vi.fn(),
    getBeehiivDelivery: vi.fn(),
    getBeehiivIntegration: vi.fn(),
    getBeehiivPostState: vi.fn(),
    getBeehiivSyncOperation: vi.fn(),
    listBeehiivPublications: vi.fn(),
    lookup: vi.fn(),
    recordBeehiivSyncFailure: vi.fn(),
    recordBeehiivSyncRemoteResult: vi.fn(),
    saveBeehiivDelivery: vi.fn(),
    saveBeehiivPublication: vi.fn(),
    updateBeehiivPostDraft: vi.fn(),
  }
})

vi.mock('node:dns/promises', () => ({
  default: { lookup: mocks.lookup },
  lookup: mocks.lookup,
}))

vi.mock('@/lib/beehiiv/client', () => ({
  BeehiivReconnectRequiredError: mocks.BeehiivReconnectRequiredError,
  BeehiivToolRejectedError: mocks.BeehiivToolRejectedError,
  createBeehiivPostDraft: mocks.createBeehiivPostDraft,
  getBeehiivPostState: mocks.getBeehiivPostState,
  listBeehiivPublications: mocks.listBeehiivPublications,
  updateBeehiivPostDraft: mocks.updateBeehiivPostDraft,
}))

vi.mock('@/lib/beehiiv/store', () => ({
  beginBeehiivSyncRemoteCall: mocks.beginBeehiivSyncRemoteCall,
  claimBeehiivSyncOperation: mocks.claimBeehiivSyncOperation,
  completeBeehiivSyncOperation: mocks.completeBeehiivSyncOperation,
  getBeehiivDelivery: mocks.getBeehiivDelivery,
  getBeehiivIntegration: mocks.getBeehiivIntegration,
  getBeehiivSyncOperation: mocks.getBeehiivSyncOperation,
  recordBeehiivSyncFailure: mocks.recordBeehiivSyncFailure,
  recordBeehiivSyncRemoteResult: mocks.recordBeehiivSyncRemoteResult,
  saveBeehiivDelivery: mocks.saveBeehiivDelivery,
  saveBeehiivPublication: mocks.saveBeehiivPublication,
}))

vi.mock('@/lib/newsletter/beehiiv-export', () => ({
  buildNewsletterDraftBeehiivExport:
    mocks.buildNewsletterDraftBeehiivExport,
}))

vi.mock('@/lib/newsletter/drafts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/newsletter/drafts')>()
  return {
    ...actual,
    appendNewsletterDraftEvent: mocks.appendNewsletterDraftEvent,
  }
})
import {
  buildBeehiivPreviewText,
  BeehiivDeliveryConflictError,
  createBeehiivRecoveryMarker,
  createBeehiivDeliveryContentHash,
  deliverNewsletterDraftToBeehiiv,
  preflightBeehiivImageAssets,
  wrapNewsletterHtmlForBeehiivMcp,
} from '@/lib/newsletter/beehiiv-delivery'

const OWNER_ID = '00000000-0000-4000-8000-000000000001'
const DRAFT_ID = '00000000-0000-4000-8000-000000000002'
const PUBLICATION = {
  id: 'pub_00000000-0000-0000-0000-000000000003',
  name: 'The Intraday',
  description: null,
  url: 'https://example.beehiiv.com',
}

function exportFixture() {
  return {
    html: '<table><tr><td>Ready</td></tr></table>',
    resolvedImageUrls: ['https://assets.example/chart.png'],
    record: { id: DRAFT_ID, status: 'ready' },
    draft: {
      ticker: 'AAPL',
      subjectLine: 'Apple setup',
      introText: '<p>What matters today.</p>',
      blocks: [
        {
          id: 'block-1',
          heading: 'The chart',
          body: '<p>Price is moving.</p>',
          chartImageUrl: 'https://assets.example/chart.png',
          chartNeedsRegeneration: false,
        },
      ],
    },
  }
}

function deliveryFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delivery-1',
    draftId: DRAFT_ID,
    ownerId: OWNER_ID,
    publicationId: PUBLICATION.id,
    postId: 'post_00000000-0000-0000-0000-000000000004',
    title: 'Apple setup',
    previewUrl: 'https://app.beehiiv.com/preview',
    editorUrl: 'https://app.beehiiv.com/posts/post-1',
    webUrl: null,
    contentHash: 'old-content',
    lifecycleStatus: 'draft',
    lifecycleAppliedStatus: 'draft',
    lifecycleAppliedAt: null,
    beehiivStatus: 'draft',
    scheduledAt: null,
    publishedAt: null,
    stats: {},
    syncedAt: '2026-08-06T12:00:00.000Z',
    lastReconciledAt: null,
    lastReconcileError: null,
    createdAt: '2026-08-06T12:00:00.000Z',
    updatedAt: '2026-08-06T12:00:00.000Z',
    ...overrides,
  }
}

function operationFixture(input: Record<string, any>, overrides = {}) {
  return {
    draftId: DRAFT_ID,
    ownerId: OWNER_ID,
    publicationId: PUBLICATION.id,
    operationKind: input.operationKind ?? 'create',
    operationKey: input.operationKey ?? 'operation-key',
    contentHash: input.contentHash ?? 'content-hash',
    title: input.title ?? 'Apple setup',
    syncState: 'claimed',
    remotePostId: null,
    remotePreviewUrl: null,
    remoteEditorUrl: null,
    leaseToken: input.leaseToken ?? null,
    leaseExpiresAt: '2026-08-06T12:02:00.000Z',
    attemptCount: 1,
    lastError: null,
    startedAt: '2026-08-06T12:00:00.000Z',
    completedAt: null,
    createdAt: '2026-08-06T12:00:00.000Z',
    updatedAt: '2026-08-06T12:00:00.000Z',
    ...overrides,
  }
}

function deliver() {
  return deliverNewsletterDraftToBeehiiv({
    scope: { ownerId: OWNER_ID, sessionId: 'session-1' },
    draftId: DRAFT_ID,
    host: 'www.theintraday.com',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://assets.example')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      async () =>
        new Response('x', {
          status: 206,
          headers: { 'Content-Type': 'image/png' },
        }),
    ),
  )
  mocks.buildNewsletterDraftBeehiivExport.mockResolvedValue(exportFixture())
  mocks.lookup.mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
  ])
  mocks.getBeehiivIntegration.mockResolvedValue({
    ownerId: OWNER_ID,
    publication: PUBLICATION,
  })
  mocks.getBeehiivDelivery.mockResolvedValue(null)
  mocks.getBeehiivSyncOperation.mockResolvedValue(null)
  mocks.recordBeehiivSyncFailure.mockResolvedValue(undefined)
  mocks.getBeehiivPostState.mockResolvedValue({ status: 'draft' })
  mocks.claimBeehiivSyncOperation.mockImplementation(async (input) =>
    operationFixture(input),
  )
  mocks.recordBeehiivSyncRemoteResult.mockImplementation(async (input) =>
    operationFixture(input, {
      syncState: 'remote_recorded',
      remotePostId: input.postId,
      remotePreviewUrl: input.previewUrl,
      remoteEditorUrl: input.editorUrl,
    }),
  )
  mocks.createBeehiivPostDraft.mockResolvedValue({
    postId: 'post_00000000-0000-0000-0000-000000000004',
    previewUrl: 'https://app.beehiiv.com/preview',
    editorUrl: 'https://app.beehiiv.com/posts/post-1',
  })
  mocks.saveBeehiivDelivery.mockImplementation(async (input) =>
    deliveryFixture({
      publicationId: input.publicationId,
      postId: input.postId,
      contentHash: input.contentHash,
    }),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Beehiiv MCP newsletter delivery', () => {
  it('wraps custom newsletter markup in Beehiiv HTML Snippet syntax', () => {
    const html = '<table><tr><td>Markets & rates</td></tr></table>'

    expect(wrapNewsletterHtmlForBeehiivMcp(html)).toBe(
      '<pre data-type="htmlSnippet"><code class="language-html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;Markets &amp; rates&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</code></pre>',
    )
  })

  it('builds a short plain-text inbox preview from rich intro copy', () => {
    expect(
      buildBeehiivPreviewText(
        '<p><strong>Premarket:</strong> Stocks rise&nbsp;before the open.</p>',
      ),
    ).toBe('Premarket: Stocks rise before the open.')
  })

  it('changes the idempotency hash when editable content changes', () => {
    const base = {
      title: 'Morning setup',
      subjectLine: 'Morning setup',
      previewText: 'What matters today',
      htmlContent: '<p>First version</p>',
    }
    const first = createBeehiivDeliveryContentHash(base)
    const same = createBeehiivDeliveryContentHash({ ...base })
    const changed = createBeehiivDeliveryContentHash({
      ...base,
      htmlContent: '<p>Updated version</p>',
    })

    expect(first).toBe(same)
    expect(changed).not.toBe(first)
  })

  it('builds a stable recovery marker without exposing the full hash', () => {
    expect(createBeehiivRecoveryMarker(DRAFT_ID, 'a'.repeat(64))).toBe(
      `finquote-delivery:${DRAFT_ID}:${'a'.repeat(24)}`,
    )
  })

  it('creates once and persists the remote result before the delivery row', async () => {
    const result = await deliver()

    expect(result.mode).toBe('created')
    expect(mocks.createBeehiivPostDraft).toHaveBeenCalledTimes(1)
    expect(mocks.recordBeehiivSyncRemoteResult).toHaveBeenCalledTimes(1)
    expect(mocks.saveBeehiivDelivery).toHaveBeenCalledTimes(1)
    expect(
      mocks.recordBeehiivSyncRemoteResult.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.saveBeehiivDelivery.mock.invocationCallOrder[0])
    expect(mocks.completeBeehiivSyncOperation).toHaveBeenCalledTimes(1)
  })

  it('lets only one concurrent first-create cross the remote boundary', async () => {
    let activeLease: string | null = null
    mocks.claimBeehiivSyncOperation.mockImplementation(async (input) => {
      if (!activeLease) activeLease = input.leaseToken
      return operationFixture(input, { leaseToken: activeLease })
    })
    let finishCreate!: (value: {
      postId: string
      previewUrl: string | null
      editorUrl: string
    }) => void
    mocks.createBeehiivPostDraft.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCreate = resolve
        }),
    )

    const first = deliver()
    await vi.waitFor(() => {
      expect(mocks.createBeehiivPostDraft).toHaveBeenCalledTimes(1)
    })
    await expect(deliver()).rejects.toMatchObject({ code: 'busy' })

    finishCreate({
      postId: 'post_00000000-0000-0000-0000-000000000004',
      previewUrl: null,
      editorUrl: 'https://app.beehiiv.com/posts/post-1',
    })
    await first
    expect(mocks.createBeehiivPostDraft).toHaveBeenCalledTimes(1)
  })

  it('resumes a recorded remote create without creating another post', async () => {
    mocks.claimBeehiivSyncOperation.mockImplementation(async (input) =>
      operationFixture(input, {
        syncState: 'remote_recorded',
        remotePostId: 'post_recovered',
        remotePreviewUrl: null,
        remoteEditorUrl: 'https://app.beehiiv.com/posts/post_recovered',
      }),
    )

    const result = await deliver()

    expect(result.mode).toBe('created')
    expect(result.delivery.postId).toBe('post_recovered')
    expect(mocks.createBeehiivPostDraft).not.toHaveBeenCalled()
  })

  it('fails safe when a previous create is ambiguous', async () => {
    mocks.claimBeehiivSyncOperation.mockImplementation(async (input) =>
      operationFixture(input, {
        syncState: 'ambiguous',
        leaseToken: null,
        lastError: 'Interrupted after remote call',
      }),
    )

    await expect(deliver()).rejects.toMatchObject({
      code: 'ambiguous_create',
    })
    expect(mocks.createBeehiivPostDraft).not.toHaveBeenCalled()
  })

  it('keeps definitive reconnect and validation failures retryable', async () => {
    mocks.createBeehiivPostDraft.mockRejectedValueOnce(
      new mocks.BeehiivReconnectRequiredError(),
    )
    await expect(deliver()).rejects.toBeInstanceOf(
      mocks.BeehiivReconnectRequiredError,
    )
    expect(mocks.recordBeehiivSyncFailure).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'failed' }),
    )

    mocks.createBeehiivPostDraft.mockRejectedValueOnce(
      new mocks.BeehiivToolRejectedError('Invalid newsletter content'),
    )
    await expect(deliver()).rejects.toThrow('Invalid newsletter content')
    expect(mocks.recordBeehiivSyncFailure).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'failed' }),
    )
  })

  it('marks only an unknown first-create outcome ambiguous', async () => {
    mocks.createBeehiivPostDraft.mockRejectedValueOnce(
      new Error('Transport closed before a response arrived'),
    )

    await expect(deliver()).rejects.toThrow('Transport closed')
    expect(mocks.recordBeehiivSyncFailure).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'ambiguous' }),
    )
  })

  it('never resumes a remote result recorded for different content', async () => {
    mocks.claimBeehiivSyncOperation.mockImplementation(async (input) =>
      operationFixture(input, {
        syncState: 'remote_recorded',
        operationKey: 'finquote-delivery:other:hash',
        contentHash: 'different-content',
        remotePostId: 'post_stale',
        remoteEditorUrl: 'https://app.beehiiv.com/posts/post_stale',
        leaseToken: null,
      }),
    )

    await expect(deliver()).rejects.toMatchObject({
      code: 'recovery_conflict',
    })
    expect(mocks.createBeehiivPostDraft).not.toHaveBeenCalled()
    expect(mocks.saveBeehiivDelivery).not.toHaveBeenCalled()
  })

  it('does not hide an unmatched recovery record on the unchanged path', async () => {
    const fixture = exportFixture()
    const title = fixture.draft.subjectLine
    const subjectLine = fixture.draft.subjectLine
    const previewText = buildBeehiivPreviewText(fixture.draft.introText)
    const fingerprint = createBeehiivDeliveryContentHash({
      title,
      subjectLine,
      previewText,
      htmlContent: wrapNewsletterHtmlForBeehiivMcp(fixture.html),
    })
    const operationKey = createBeehiivRecoveryMarker(DRAFT_ID, fingerprint)
    const currentContentHash = createBeehiivDeliveryContentHash({
      title,
      subjectLine,
      previewText,
      htmlContent: wrapNewsletterHtmlForBeehiivMcp(
        `<!-- ${operationKey} -->${fixture.html}`,
      ),
    })
    mocks.getBeehiivDelivery.mockResolvedValue(
      deliveryFixture({ contentHash: currentContentHash }),
    )
    mocks.getBeehiivSyncOperation.mockResolvedValue(
      operationFixture(
        { operationKind: 'create' },
        {
          syncState: 'remote_recorded',
          operationKey: 'finquote-delivery:stale:marker',
          contentHash: 'stale-content',
          remotePostId: 'post_stale',
          remoteEditorUrl: 'https://app.beehiiv.com/posts/post_stale',
          leaseToken: null,
        },
      ),
    )

    await expect(deliver()).rejects.toMatchObject({
      code: 'recovery_conflict',
    })
  })

  it('blocks moving an existing delivery to a different publication', async () => {
    mocks.getBeehiivDelivery.mockResolvedValue(
      deliveryFixture({ publicationId: 'pub_other' }),
    )

    await expect(deliver()).rejects.toMatchObject({
      code: 'publication_mismatch',
    })
    expect(mocks.updateBeehiivPostDraft).not.toHaveBeenCalled()
  })

  it('blocks local and live non-draft posts from being updated', async () => {
    mocks.getBeehiivDelivery.mockResolvedValue(
      deliveryFixture({ lifecycleStatus: 'scheduled' }),
    )
    await expect(deliver()).rejects.toMatchObject({ code: 'post_not_draft' })
    expect(mocks.getBeehiivPostState).not.toHaveBeenCalled()

    mocks.getBeehiivDelivery.mockResolvedValue(deliveryFixture())
    mocks.getBeehiivPostState.mockResolvedValue({ status: 'published' })
    await expect(deliver()).rejects.toMatchObject({ code: 'post_not_draft' })
    expect(mocks.updateBeehiivPostDraft).not.toHaveBeenCalled()
  })

  it('blocks a non-draft post even when the exported content is unchanged', async () => {
    const created = await deliver()
    mocks.getBeehiivDelivery.mockResolvedValue(
      deliveryFixture({
        contentHash: created.delivery.contentHash,
        lifecycleStatus: 'scheduled',
      }),
    )

    await expect(deliver()).rejects.toMatchObject({ code: 'post_not_draft' })
    expect(mocks.getBeehiivPostState).not.toHaveBeenCalled()

    mocks.getBeehiivDelivery.mockResolvedValue(
      deliveryFixture({ contentHash: created.delivery.contentHash }),
    )
    mocks.getBeehiivPostState.mockResolvedValue({ status: 'published' })
    await expect(deliver()).rejects.toMatchObject({ code: 'post_not_draft' })
    expect(mocks.updateBeehiivPostDraft).not.toHaveBeenCalled()
  })

  it('requires reachable public HTTPS image assets', async () => {
    await expect(
      preflightBeehiivImageAssets(['http://assets.example/chart.png']),
    ).rejects.toBeInstanceOf(BeehiivDeliveryConflictError)
    expect(fetch).not.toHaveBeenCalled()

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('not an image', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    )
    await expect(
      preflightBeehiivImageAssets(['https://assets.example/chart.png']),
    ).rejects.toMatchObject({ code: 'asset_preflight_failed' })
  })

  it('rejects private DNS answers and private redirect targets before fetching them', async () => {
    const fetchImpl = vi.fn()
    const resolvePrivate = vi.fn().mockResolvedValue(['10.0.0.8'])
    await expect(
      preflightBeehiivImageAssets(
        ['https://assets.example/chart.png'],
        { fetchImpl: fetchImpl as typeof fetch, resolveHostname: resolvePrivate },
      ),
    ).rejects.toMatchObject({ code: 'asset_preflight_failed' })
    expect(fetchImpl).not.toHaveBeenCalled()

    const redirectFetch = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: 'https://127.0.0.1/internal.png' },
      }),
    )
    await expect(
      preflightBeehiivImageAssets(
        ['https://assets.example/chart.png'],
        {
          fetchImpl: redirectFetch as typeof fetch,
          resolveHostname: vi.fn().mockResolvedValue(['93.184.216.34']),
        },
      ),
    ).rejects.toMatchObject({ code: 'asset_preflight_failed' })
    expect(redirectFetch).toHaveBeenCalledTimes(1)
  })

  it('rejects unapproved hosts before DNS resolution or fetch', async () => {
    const fetchImpl = vi.fn()
    const resolveHostname = vi.fn().mockResolvedValue(['93.184.216.34'])

    await expect(
      preflightBeehiivImageAssets(
        ['https://attacker-controlled.example/chart.png'],
        {
          fetchImpl: fetchImpl as typeof fetch,
          resolveHostname,
        },
      ),
    ).rejects.toMatchObject({ code: 'asset_preflight_failed' })
    expect(resolveHostname).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts an explicitly approved test asset host after public DNS validation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('x', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    const resolveHostname = vi.fn().mockResolvedValue(['93.184.216.34'])

    await expect(
      preflightBeehiivImageAssets(
        ['https://approved.test/chart.png'],
        {
          fetchImpl: fetchImpl as typeof fetch,
          resolveHostname,
          allowedHostnames: ['approved.test'],
        },
      ),
    ).resolves.toBeUndefined()
    expect(resolveHostname).toHaveBeenCalledWith('approved.test')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects reserved IPv6 answers and oversized image assets', async () => {
    const fetchImpl = vi.fn()
    await expect(
      preflightBeehiivImageAssets(
        ['https://assets.example/chart.png'],
        {
          fetchImpl: fetchImpl as typeof fetch,
          resolveHostname: vi.fn().mockResolvedValue(['2001:db8::1']),
        },
      ),
    ).rejects.toMatchObject({ code: 'asset_preflight_failed' })
    expect(fetchImpl).not.toHaveBeenCalled()

    const oversizedFetch = vi.fn().mockResolvedValue(
      new Response('x', {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(11 * 1024 * 1024),
        },
      }),
    )
    await expect(
      preflightBeehiivImageAssets(
        ['https://assets.example/chart.png'],
        {
          fetchImpl: oversizedFetch as typeof fetch,
          resolveHostname: vi.fn().mockResolvedValue(['93.184.216.34']),
        },
      ),
    ).rejects.toMatchObject({ code: 'asset_preflight_failed' })
  })
})
