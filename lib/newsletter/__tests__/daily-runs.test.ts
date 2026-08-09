import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  not: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import {
  __testOnly,
  getNewsletterDailySettings,
  listEnabledNewsletterDailyScopes,
} from '../daily-runs'
import { resolveExistingRunTarget } from '../daily-target'
import { normalizeNewsletterDraftDocument } from '../drafts'
import {
  buildNewsletterChartProvenance,
  hashNewsletterChartScene,
  materializeNewsletterChartScene,
  NEWSLETTER_CHART_RENDERER_CONTRACT,
} from '../chart-provenance'
import { resolveChartingPlatformNewsletterChart } from '../charting-platform-export'
import type { NewsletterDraftDocument } from '../types'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
  vi.stubEnv('NEWSLETTER_AUTOMATION_OWNER_ID', '')
  vi.stubEnv('NEWSLETTER_AUTOMATION_SESSION_ID', '')
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
  mocks.not.mockResolvedValue({ data: [], error: null })
  mocks.eq.mockReturnValue({
    maybeSingle: mocks.maybeSingle,
    not: mocks.not,
  })
  mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.from.mockReturnValue({ select: mocks.select })
  mocks.createClient.mockReturnValue({ from: mocks.from })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('daily newsletter run targets', () => {
  it('preserves an existing larger batch when the next-day default is lowered', () => {
    expect(resolveExistingRunTarget(30, 40)).toBe(40)
  })

  it('allows a batch to expand and still enforces the supported range', () => {
    expect(resolveExistingRunTarget(50, 40)).toBe(50)
    expect(resolveExistingRunTarget(10, 0)).toBe(30)
    expect(resolveExistingRunTarget(75, 0)).toBe(50)
  })

  it('enforces the retry ceiling in the item claimant itself', () => {
    const maxRetries = __testOnly.MAX_NEWSLETTER_DAILY_ITEM_RETRIES

    expect(__testOnly.canClaimDailyItem('queued', 0, false)).toBe(true)
    expect(__testOnly.canClaimDailyItem('failed', 1, false)).toBe(false)
    expect(__testOnly.canClaimDailyItem('failed', 1, true)).toBe(true)
    expect(
      __testOnly.canClaimDailyItem('needs_attention', maxRetries, true),
    ).toBe(false)
    expect(__testOnly.canClaimDailyItem('queued', maxRetries, true)).toBe(
      false,
    )
  })

  it('keeps the precise chart exception when readiness adds its checklist', () => {
    const message = __testOnly.mergeDailyItemAttentionMessage(
      'Automatic chart capture failed: Chromium executable was not found.',
      ['Capture a final chart for AAPL: The Market Read.'],
    )

    expect(message).toBe(
      'Automatic chart capture failed: Chromium executable was not found. Capture a final chart for AAPL: The Market Read.',
    )
    expect(
      __testOnly.mergeDailyItemAttentionMessage(message, [
        'Capture a final chart for AAPL: The Market Read.',
      ]),
    ).toBe(message)
  })

  it('fails closed on mismatched retry evidence and rebuilds quarantined drafts', () => {
    expect(
      __testOnly.isDailyItemSourceEntityValid({
        ticker: 'MTCH',
        headline: 'Huya launches Triple Match 3D mobile game worldwide',
        summaryText: 'Match Group reported second-quarter results.',
        candidateMetadata: { companyName: 'Match Group, Inc.' },
      }),
    ).toBe(false)
    expect(
      __testOnly.isDailyItemSourceEntityValid({
        ticker: 'MTCH',
        headline: 'Match Group reports second-quarter results',
        summaryText: 'Match reported revenue in line with expectations.',
        candidateMetadata: { companyName: 'Match Group, Inc.' },
      }),
    ).toBe(false)
    expect(
      __testOnly.isDailyItemSourceEntityValid({
        ticker: 'MTCH',
        headline: 'Match Group reports second-quarter results',
        summaryText: 'Match Group reported revenue in line with expectations.',
        candidateMetadata: { companyName: 'Match Group, Inc.' },
      }),
    ).toBe(true)
    expect(
      __testOnly.shouldRebuildDailyDraft({
        status: 'needs_attention',
        candidateMetadata: {
          newsletterSourceRefreshedAt: '2026-08-06T12:00:00.000Z',
        },
      }),
    ).toBe(true)
    expect(
      __testOnly.shouldRebuildDailyDraft({
        status: 'failed',
        candidateMetadata: {},
      }),
    ).toBe(false)
    expect(
      __testOnly.consumeNewsletterSourceRefreshMarker({
        companyName: 'Match Group, Inc.',
        newsletterSourceRefreshedAt: '2026-08-06T12:00:00.000Z',
      }),
    ).toEqual({ companyName: 'Match Group, Inc.' })
    expect(
      __testOnly.shouldRebuildDailyDraft({
        status: 'ready',
        candidateMetadata: {
          newsletterSourceRefreshedAt: '2026-08-06T12:00:00.000Z',
        },
      }),
    ).toBe(false)
  })

  it('returns interrupted claims to their prior state without burning a retry', () => {
    expect(
      __testOnly.dailyClaimRestorePayload(
        {
          status: 'needs_attention',
          retryCount: 2,
          completedAt: '2026-08-06T12:00:00.000Z',
          errorMessage: 'Manual editorial review is required.',
        } as never,
        'Automatic generation was interrupted and will retry.',
      ),
    ).toEqual({
      status: 'needs_attention',
      retry_count: 1,
      started_at: null,
      completed_at: '2026-08-06T12:00:00.000Z',
      error_message: 'Manual editorial review is required.',
    })

    expect(
      __testOnly.dailyClaimRestorePayload(
        {
          status: 'queued',
          retryCount: 0,
          completedAt: null,
          errorMessage: null,
        } as never,
        'Automatic generation was interrupted and will retry.',
      ),
    ).toMatchObject({
      status: 'queued',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      error_message: 'Automatic generation was interrupted and will retry.',
    })
  })

  it('gives successive claims distinct persistence fences and draft keys', () => {
    const claimA = {
      ticker: 'MTCH',
      startedAt: '2026-08-06T12:00:00.001Z',
    } as never
    const claimB = {
      ticker: 'MTCH',
      startedAt: '2026-08-06T12:15:00.002Z',
    } as never

    expect(__testOnly.getDailyClaimFence(claimA)).toEqual({
      status: 'generating',
      startedAt: '2026-08-06T12:00:00.001Z',
    })
    expect(__testOnly.getDailyClaimFence(claimA)).not.toEqual(
      __testOnly.getDailyClaimFence(claimB),
    )
    expect(__testOnly.dailyItemOperationKey('run-1', claimA)).not.toBe(
      __testOnly.dailyItemOperationKey('run-1', claimB),
    )
    expect(() =>
      __testOnly.getDailyClaimFence({ ticker: 'MTCH', startedAt: null } as never),
    ).toThrow('no active claim token')
  })

  it('waits for started sibling workers before surfacing a pool failure', async () => {
    let siblingSettled = false
    await expect(
      __testOnly.runPool([1, 2], 2, async (item) => {
        if (item === 1) throw new Error('worker failed')
        await new Promise((resolve) => setTimeout(resolve, 10))
        siblingSettled = true
      }),
    ).rejects.toThrow('worker failed')
    expect(siblingSettled).toBe(true)
  })

  it('reserves fourteen seconds after automated chart capture for durable writes', () => {
    expect(__testOnly.DAILY_CHART_CAPTURE_BUDGET_MS).toBe(28_000)
    expect(42_000 - __testOnly.DAILY_CHART_CAPTURE_BUDGET_MS).toBeGreaterThanOrEqual(
      12_000,
    )
  })

  it('uses immutable capture time instead of a recent chart rename for freshness', () => {
    const chartSpec = {
      mode: 'price' as const,
      symbol: 'AAPL',
      range: '1m' as const,
      interval: 'D' as const,
      chartType: 'candles' as const,
    }
    const currentCapture = {
      id: 'chart-current',
      ownerId: null,
      sessionId: 'automation-session',
      title: 'Apple price action',
      symbol: 'AAPL',
      chartSpec,
      chartImageUrl: 'https://assets.example/aapl.png',
      thumbnailUrl: 'https://assets.example/aapl.png',
      chartExportUrl: 'https://charts.theintraday.com/export/aapl',
      capturedAt: '2026-08-07T13:59:59.123456+00:00',
      rendererContract: NEWSLETTER_CHART_RENDERER_CONTRACT,
      sceneHash: hashNewsletterChartScene(chartSpec),
      imageSha256: null,
      createdAt: '2026-08-07T13:59:59.123456+00:00',
      updatedAt: '2026-07-01T14:00:00.000Z',
    }
    const renamedOldChart = {
      ...currentCapture,
      capturedAt: '2026-07-01T14:00:00.000Z',
      updatedAt: '2026-08-07T14:00:00.000Z',
    }

    expect(
      __testOnly.isChartCurrent(renamedOldChart as never, '2026-08-07'),
    ).toBe(false)
    expect(
      __testOnly.isChartCurrent(currentCapture as never, '2026-08-07'),
    ).toBe(true)
    expect(
      __testOnly.isChartCurrent(
        {
          ...currentCapture,
          capturedAt: 'legacy-or-missing',
        } as never,
        '2026-08-07',
      ),
    ).toBe(false)
    expect(
      __testOnly.isChartCurrent(
        {
          ...currentCapture,
          rendererContract: 'legacy-reconstructed-v0',
        } as never,
        '2026-08-07',
      ),
    ).toBe(false)
    expect(
      __testOnly.isChartCurrent(
        { ...currentCapture, sceneHash: '' } as never,
        '2026-08-07',
      ),
    ).toBe(false)
  })

  it('keeps trusted provenance when an automated chart repair is normalized for save', () => {
    const capturedAt = '2026-08-07T14:30:00.123456+00:00'
    const publicChartBaseUrl = 'https://charts.theintraday.com'
    const chartSpec = materializeNewsletterChartScene(
      {
        mode: 'price',
        symbol: 'AAPL',
        range: '1m',
        interval: 'D',
        chartType: 'candles',
      },
      capturedAt,
    )
    const chartImageUrl =
      `https://example.supabase.co/storage/v1/object/public/newsletter-charts/immutable/aa/${'a'.repeat(64)}.png`
    const chartExportUrl = resolveChartingPlatformNewsletterChart(chartSpec, {
      chartBaseUrl: publicChartBaseUrl,
      theme: 'light',
    }).interactiveUrl
    const chartProvenance = buildNewsletterChartProvenance({
      source: 'automation',
      capturedAt,
      imageUrl: chartImageUrl,
      interactiveUrl: chartExportUrl,
      scene: chartSpec,
    })
    const repaired: NewsletterDraftDocument = {
      ticker: 'AAPL',
      format: 'single_stock',
      featuredTickers: ['AAPL'],
      generatedAt: capturedAt,
      subjectLine: 'Apple market update',
      introText: 'Apple is in focus.',
      autoPickedStock: false,
      blocks: [
        {
          id: 'block-1',
          layoutId: 'chart_plus_commentary',
          templateId: 'daily_wiim_catalyst',
          selectionReason: 'Current Apple catalyst.',
          heading: 'Apple price action',
          body: '<p>Apple is in focus.</p>',
          chartImageUrl,
          chartAlt: 'Apple one-month price chart',
          chartExportUrl,
          chartSpec,
          chartProvenance,
          chartNeedsRegeneration: false,
        },
      ],
    }
    const existing: NewsletterDraftDocument = {
      ...repaired,
      blocks: [
        {
          ...repaired.blocks[0],
          chartImageUrl: 'https://assets.example/legacy.png',
          chartProvenance: undefined,
          chartNeedsRegeneration: true,
        },
      ],
    }

    const merged = __testOnly.mergeRepairedDailyDraft(existing, repaired)
    const normalized = normalizeNewsletterDraftDocument(
      merged,
      publicChartBaseUrl,
    )

    expect(merged.blocks[0].chartProvenance).toEqual(chartProvenance)
    expect(normalized.blocks[0]).toMatchObject({
      chartImageUrl,
      chartExportUrl,
      chartProvenance,
      chartNeedsRegeneration: false,
    })
  })
})

describe('daily newsletter automation scope bootstrap', () => {
  it('uses the same enabled defaults when a configured owner has no row', async () => {
    vi.stubEnv('NEWSLETTER_AUTOMATION_OWNER_ID', 'owner-1')
    vi.stubEnv('NEWSLETTER_AUTOMATION_SESSION_ID', 'automation-session')
    const scope = { ownerId: 'owner-1', sessionId: 'automation-session' }

    const directSettings = await getNewsletterDailySettings(scope)
    const scopes = await listEnabledNewsletterDailyScopes()

    expect(scopes).toEqual([{ scope, settings: directSettings }])
    expect(directSettings).toEqual({
      enabled: true,
      targetCount: 40,
      timezone: 'America/New_York',
      generationHour: 8,
    })
    expect(mocks.eq).toHaveBeenCalledWith('scope_key', 'owner:owner-1')
  })

  it('bootstraps a configured session-only scope when its row is absent', async () => {
    vi.stubEnv('NEWSLETTER_AUTOMATION_SESSION_ID', 'session-only')

    const scopes = await listEnabledNewsletterDailyScopes()

    expect(scopes).toEqual([
      {
        scope: { ownerId: null, sessionId: 'session-only' },
        settings: {
          enabled: true,
          targetCount: 40,
          timezone: 'America/New_York',
          generationHour: 8,
        },
      },
    ])
    expect(mocks.eq).toHaveBeenCalledWith(
      'scope_key',
      'session:session-only',
    )
  })

  it('respects an explicitly disabled configured settings row', async () => {
    vi.stubEnv('NEWSLETTER_AUTOMATION_OWNER_ID', 'owner-1')
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: 'settings-1',
        scope_key: 'owner:owner-1',
        owner_id: 'owner-1',
        session_id: 'newsletter-daily-automation',
        enabled: false,
        target_count: 40,
        timezone: 'America/New_York',
        generation_hour: 8,
        created_at: '2026-08-06T12:00:00.000Z',
        updated_at: '2026-08-06T12:00:00.000Z',
      },
      error: null,
    })

    await expect(listEnabledNewsletterDailyScopes()).resolves.toEqual([])
  })

  it('keeps persisted settings and session data when the row exists', async () => {
    vi.stubEnv('NEWSLETTER_AUTOMATION_OWNER_ID', 'owner-1')
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: 'settings-1',
        scope_key: 'owner:owner-1',
        owner_id: 'owner-1',
        session_id: 'persisted-session',
        enabled: true,
        target_count: 35,
        timezone: 'America/Chicago',
        generation_hour: 7,
        created_at: '2026-08-06T12:00:00.000Z',
        updated_at: '2026-08-06T12:00:00.000Z',
      },
      error: null,
    })

    await expect(listEnabledNewsletterDailyScopes()).resolves.toEqual([
      {
        scope: { ownerId: 'owner-1', sessionId: 'persisted-session' },
        settings: {
          enabled: true,
          targetCount: 35,
          timezone: 'America/Chicago',
          generationHour: 7,
        },
      },
    ])
  })

  it('retains enabled persisted owner scopes when no scope is configured', async () => {
    mocks.not.mockResolvedValue({
      data: [
        {
          id: 'settings-2',
          scope_key: 'owner:owner-2',
          owner_id: 'owner-2',
          session_id: 'persisted-session',
          enabled: true,
          target_count: 45,
          timezone: 'America/New_York',
          generation_hour: 9,
          created_at: '2026-08-06T12:00:00.000Z',
          updated_at: '2026-08-06T12:00:00.000Z',
        },
      ],
      error: null,
    })

    await expect(listEnabledNewsletterDailyScopes()).resolves.toEqual([
      {
        scope: { ownerId: 'owner-2', sessionId: 'persisted-session' },
        settings: {
          enabled: true,
          targetCount: 45,
          timezone: 'America/New_York',
          generationHour: 9,
        },
      },
    ])
    expect(mocks.not).toHaveBeenCalledWith('owner_id', 'is', null)
  })
})
