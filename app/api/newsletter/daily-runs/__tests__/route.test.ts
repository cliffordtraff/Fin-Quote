import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { NewsletterDailyAutomationRun } from '@/lib/newsletter/daily-automation'
import type { NewsletterDailyRun } from '@/lib/newsletter/daily-types'

const mocks = vi.hoisted(() => ({
  attachCookie: vi.fn((response: Response) => response),
  ensureRun: vi.fn(),
  getConfiguredScope: vi.fn(),
  getLatestRun: vi.fn(),
  getSettings: vi.fn(),
  getAutomationClock: vi.fn(),
  getAutomationRun: vi.fn(),
  resolveScope: vi.fn(),
  saveSettings: vi.fn(),
}))

vi.mock('@/lib/newsletter/daily-runs', () => ({
  NewsletterDailySourceError: class NewsletterDailySourceError extends Error {},
  ensureNewsletterDailyRun: mocks.ensureRun,
  getNewsletterDailySettings: mocks.getSettings,
  saveNewsletterDailySettings: mocks.saveSettings,
}))

vi.mock('@/lib/newsletter/daily-runs-read', () => ({
  getConfiguredNewsletterAutomationScope: mocks.getConfiguredScope,
  getLatestNewsletterDailyRun: mocks.getLatestRun,
  getNewsletterDailyAutomationRun: mocks.getAutomationRun,
  getNewsletterDailySettings: mocks.getSettings,
}))

vi.mock('@/lib/newsletter/automation-clock', () => ({
  getNewsletterAutomationClock: mocks.getAutomationClock,
}))

vi.mock('@/lib/newsletter/draft-session', () => ({
  attachNewsletterDraftSessionCookie: mocks.attachCookie,
  resolveNewsletterDraftScope: mocks.resolveScope,
}))

import { NewsletterDailySourceError } from '@/lib/newsletter/daily-runs'
import {
  GET,
  POST as legacyPost,
} from '@/app/api/newsletter/daily-runs/route'
import { POST as actionPost } from '@/app/api/newsletter/daily-runs/action/route'

function runFixture(): NewsletterDailyRun {
  return {
    id: 'route-run-id-sentinel',
    marketDate: '2026-08-08',
    edition: 'morning',
    status: 'completed',
    targetCount: 40,
    sourceWiimRunId: 'route-wiim-id-sentinel',
    sourceGeneratedAt: '2026-08-08T11:00:00.000Z',
    selectedCount: 1,
    generatedCount: 1,
    readyCount: 1,
    attentionCount: 0,
    failedCount: 0,
    errorMessage: 'route-run-error-sentinel',
    metadata: {
      sourceCandidateCount: 40,
      currentSummaryCount: 39,
      strongCount: 12,
      secret: 'route-run-metadata-sentinel',
    },
    startedAt: '2026-08-08T09:00:00.000Z',
    completedAt: '2026-08-08T11:30:00.000Z',
    createdAt: '2026-08-08T09:00:00.000Z',
    updatedAt: '2026-08-08T11:30:00.000Z',
    items: [{
      id: 'route-item-id-sentinel',
      runId: 'route-run-id-sentinel',
      rank: 1,
      ticker: 'AAPL',
      status: 'published',
      qualityBand: 'strong',
      relevanceScore: 95,
      confidenceScore: 90,
      candidateType: 'stock',
      stateLabel: 'cash',
      movePercent: 3.5,
      reasonType: 'earnings',
      headline: 'Apple reports current earnings',
      summaryText: 'Public editorial summary',
      keyFact: 'route-key-fact-sentinel',
      sourceRefs: [{
        kind: 'news',
        label: 'Public source',
        url: 'https://news.example/apple',
      }],
      candidateMetadata: { secret: 'route-candidate-metadata-sentinel' },
      draftId: 'route-draft-id-sentinel',
      draftStatus: 'published',
      chartId: 'route-chart-id-sentinel',
      chartImageUrl: 'https://assets.example/apple.png',
      subjectLine: 'Apple earnings changed the tape',
      beehiivDelivery: {
        id: 'route-delivery-id-sentinel',
        postId: 'route-post-id-sentinel',
        editorUrl: 'https://app.beehiiv.com/route-editor-url-sentinel',
        previewUrl: 'https://preview.example/route-preview-url-sentinel',
        webUrl: 'https://newsletter.example/apple',
        lifecycleStatus: 'published',
        beehiivStatus: 'published',
        scheduledAt: '2026-08-08T11:00:00.000Z',
        publishedAt: '2026-08-08T11:30:00.000Z',
        syncedAt: '2026-08-08T11:31:00.000Z',
        lastReconciledAt: '2026-08-08T11:32:00.000Z',
        lastReconcileError: 'route-reconcile-error-sentinel',
        needsSync: false,
      },
      errorMessage: 'route-item-error-sentinel',
      retryCount: 2,
      startedAt: '2026-08-08T10:00:00.000Z',
      completedAt: '2026-08-08T11:00:00.000Z',
      createdAt: '2026-08-08T09:30:00.000Z',
      updatedAt: '2026-08-08T11:32:00.000Z',
    }],
  }
}

function automationFixture(): NewsletterDailyAutomationRun {
  return {
    id: 'route-automation-id-sentinel',
    marketDate: '2026-08-08',
    status: 'completed',
    stage: 'completed',
    candidateSymbols: ['route-automation-symbol-sentinel'],
    candidateCount: 40,
    finvizCompletedCount: 40,
    finvizFoundCount: 39,
    finvizErrorCount: 1,
    summaryCompletedCount: 40,
    summaryGeneratedCount: 39,
    summaryNoResultCount: 1,
    summaryErrorCount: 0,
    wiimRunId: 'route-automation-wiim-sentinel',
    newsletterScopeCount: 1,
    newsletterCompletedScopeCount: 1,
    newsletterSelectedCount: 40,
    newsletterGeneratedCount: 40,
    newsletterReadyCount: 40,
    newsletterAttentionCount: 0,
    newsletterFailedCount: 0,
    invocationCount: 8,
    lastError: 'route-automation-error-sentinel',
    notificationAppliedAt: '2026-08-08T11:30:00.000Z',
    notificationAttemptCount: 1,
    notificationLastError: 'route-notification-error-sentinel',
    metadata: { secret: 'route-automation-metadata-sentinel' },
    startedAt: '2026-08-08T09:00:00.000Z',
    completedAt: '2026-08-08T11:30:00.000Z',
    lastHeartbeatAt: '2026-08-08T11:30:00.000Z',
    createdAt: '2026-08-08T09:00:00.000Z',
    updatedAt: '2026-08-08T11:30:00.000Z',
  }
}

const settings = {
  enabled: true,
  targetCount: 40,
  timezone: 'America/New_York',
  generationHour: 8,
}

const PRIVATE_SENTINELS = [
  'route-run-id-sentinel',
  'route-wiim-id-sentinel',
  'route-run-error-sentinel',
  'route-run-metadata-sentinel',
  'route-item-id-sentinel',
  'route-key-fact-sentinel',
  'route-candidate-metadata-sentinel',
  'route-draft-id-sentinel',
  'route-chart-id-sentinel',
  'route-delivery-id-sentinel',
  'route-post-id-sentinel',
  'route-editor-url-sentinel',
  'route-preview-url-sentinel',
  'route-reconcile-error-sentinel',
  'route-item-error-sentinel',
  'route-automation-id-sentinel',
  'route-automation-symbol-sentinel',
  'route-automation-wiim-sentinel',
  'route-automation-error-sentinel',
  'route-notification-error-sentinel',
  'route-automation-metadata-sentinel',
] as const

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAutomationClock.mockReturnValue({ marketDate: '2026-08-08' })
  mocks.getAutomationRun.mockResolvedValue(automationFixture())
  mocks.getLatestRun.mockResolvedValue(null)
  mocks.getConfiguredScope.mockReturnValue({
    ownerId: 'configured-owner-sentinel',
    sessionId: 'configured-session-sentinel',
  })
  mocks.resolveScope.mockResolvedValue({
    scope: { ownerId: null, sessionId: 'anonymous-session-sentinel' },
    createdSessionId: 'anonymous-session-sentinel',
  })
  mocks.getSettings.mockResolvedValue(settings)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/newsletter/daily-runs public report boundary', () => {
  it('projects configured-scope fallback data before returning it read-only', async () => {
    mocks.getLatestRun
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(runFixture())

    const response = await GET(new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs?marketDate=2026-08-08',
    ))
    const payload = await response.json()
    const serialized = JSON.stringify(payload)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0',
    )
    expect(payload.reportReadOnly).toBe(true)
    expect(payload.automationReadOnly).toBe(true)
    expect(payload.run).toMatchObject({
      key: 'morning:2026-08-08',
      marketDate: '2026-08-08',
      items: [{
        key: '2026-08-08:1:AAPL',
        ticker: 'AAPL',
        delivery: {
          lifecycleStatus: 'published',
          webUrl: 'https://newsletter.example/apple',
        },
      }],
    })
    expect(payload.automation).toEqual({
      marketDate: '2026-08-08',
      status: 'completed',
      stage: 'completed',
      candidateCount: 40,
      finvizCompletedCount: 40,
      summaryGeneratedCount: 39,
      newsletterSelectedCount: 40,
      newsletterReadyCount: 40,
      startedAt: '2026-08-08T09:00:00.000Z',
      message: null,
    })
    for (const sentinel of [
      ...PRIVATE_SENTINELS,
      'configured-owner-sentinel',
      'configured-session-sentinel',
    ]) {
      expect(serialized).not.toContain(sentinel)
    }
  })

  it('keeps the authenticated same-owner operator response intact', async () => {
    const run = runFixture()
    const automation = automationFixture()
    mocks.resolveScope.mockResolvedValue({
      scope: {
        ownerId: 'configured-owner-sentinel',
        sessionId: 'different-authenticated-session',
      },
      createdSessionId: null,
    })
    mocks.getLatestRun.mockResolvedValue(run)
    mocks.getAutomationRun.mockResolvedValue(automation)

    const response = await GET(new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs',
    ))
    const payload = await response.json()

    expect(payload.reportReadOnly).toBe(false)
    expect(payload.automationReadOnly).toBe(false)
    expect(payload.run).toEqual(run)
    expect(payload.automation).toEqual(automation)
    expect(payload.run.items[0].beehiivDelivery.editorUrl).toContain(
      'route-editor-url-sentinel',
    )
  })

  it('does not treat a production anonymous configured-session cookie as ownership', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.getConfiguredScope.mockReturnValue({
      ownerId: null,
      sessionId: 'configured-session-sentinel',
    })
    mocks.resolveScope.mockResolvedValue({
      scope: {
        ownerId: null,
        sessionId: 'configured-session-sentinel',
      },
      createdSessionId: null,
    })
    mocks.getLatestRun.mockResolvedValue(runFixture())

    const response = await GET(new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs',
      {
        headers: {
          Cookie: 'newsletter_draft_session=configured-session-sentinel',
        },
      },
    ))
    const payload = await response.json()
    const serialized = JSON.stringify(payload)

    expect(payload.reportReadOnly).toBe(true)
    expect(payload.automationReadOnly).toBe(true)
    expect(payload.run.key).toBe('morning:2026-08-08')
    expect(mocks.getLatestRun).toHaveBeenCalledTimes(1)
    for (const sentinel of PRIVATE_SENTINELS) {
      expect(serialized).not.toContain(sentinel)
    }
  })

  it('keeps an anonymous developer session editable for local workflows', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const run = runFixture()
    mocks.getLatestRun.mockResolvedValue(run)

    const response = await GET(new NextRequest(
      'http://localhost:3000/api/newsletter/daily-runs',
    ))
    const payload = await response.json()

    expect(payload.reportReadOnly).toBe(false)
    expect(payload.automationReadOnly).toBe(true)
    expect(payload.run).toEqual(run)
    expect(payload.automation).toEqual({
      marketDate: '2026-08-08',
      status: 'completed',
      stage: 'completed',
      candidateCount: 40,
      finvizCompletedCount: 40,
      summaryGeneratedCount: 39,
      newsletterSelectedCount: 40,
      newsletterReadyCount: 40,
      startedAt: '2026-08-08T09:00:00.000Z',
      message: null,
    })
    expect(payload.run.items[0].draftId).toBe('route-draft-id-sentinel')
  })

  it('keeps every production anonymous response on the public contract', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.getConfiguredScope.mockReturnValue(null)
    mocks.getLatestRun.mockResolvedValue(null)

    const response = await GET(new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs',
    ))
    const payload = await response.json()
    const serialized = JSON.stringify(payload)

    expect(payload).toMatchObject({
      run: null,
      reportReadOnly: true,
      automationReadOnly: true,
      automation: {
        marketDate: '2026-08-08',
        status: 'completed',
        stage: 'completed',
      },
    })
    for (const sentinel of PRIVATE_SENTINELS) {
      expect(serialized).not.toContain(sentinel)
    }
  })

  it('projects a configured fallback for an unrelated signed-in user', async () => {
    mocks.resolveScope.mockResolvedValue({
      scope: {
        ownerId: 'unrelated-viewer-owner',
        sessionId: 'viewer-session',
      },
      createdSessionId: null,
    })
    mocks.getLatestRun
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(runFixture())

    const response = await GET(new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs',
    ))
    const payload = await response.json()
    const serialized = JSON.stringify(payload)

    expect(payload.reportReadOnly).toBe(true)
    expect(payload.automationReadOnly).toBe(true)
    expect(payload.run.key).toBe('morning:2026-08-08')
    expect(mocks.getLatestRun).toHaveBeenNthCalledWith(
      2,
      {
        ownerId: 'configured-owner-sentinel',
        sessionId: 'configured-session-sentinel',
      },
      '2026-08-08',
      expect.any(AbortSignal),
    )
    for (const sentinel of PRIVATE_SENTINELS) {
      expect(serialized).not.toContain(sentinel)
    }
  })

  it('keeps an unrelated signed-in owner run full while projecting global automation', async () => {
    mocks.resolveScope.mockResolvedValue({
      scope: {
        ownerId: 'unrelated-viewer-owner',
        sessionId: 'viewer-session',
      },
      createdSessionId: null,
    })
    mocks.getLatestRun.mockResolvedValue(runFixture())

    const response = await GET(new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs',
    ))
    const payload = await response.json()
    const serialized = JSON.stringify(payload)

    expect(payload.reportReadOnly).toBe(false)
    expect(payload.automationReadOnly).toBe(true)
    expect(payload.run.id).toBe('route-run-id-sentinel')
    expect(serialized).toContain('route-run-metadata-sentinel')
    expect(serialized).not.toContain('route-automation-id-sentinel')
    expect(serialized).not.toContain('route-automation-metadata-sentinel')
  })

  it('fails closed for automation authority when no scope is configured', async () => {
    mocks.getConfiguredScope.mockReturnValue(null)
    mocks.resolveScope.mockResolvedValue({
      scope: { ownerId: 'signed-in-owner', sessionId: 'owner-session' },
      createdSessionId: null,
    })
    mocks.getLatestRun.mockResolvedValue(runFixture())

    const response = await GET(new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs',
    ))
    const payload = await response.json()

    expect(payload.reportReadOnly).toBe(false)
    expect(payload.automationReadOnly).toBe(true)
    expect(payload.run.id).toBe('route-run-id-sentinel')
    expect(payload.automation.id).toBeUndefined()
    expect(payload.automation.candidateSymbols).toBeUndefined()
  })

  it('forwards one request signal through every initial GET loader', async () => {
    const scope = {
      ownerId: 'configured-owner-sentinel',
      sessionId: 'operator-session',
    }
    mocks.resolveScope.mockResolvedValue({ scope, createdSessionId: null })
    mocks.getLatestRun.mockResolvedValue(runFixture())
    const request = new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs?marketDate=2026-08-08',
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(mocks.getLatestRun).toHaveBeenCalledWith(
      scope,
      '2026-08-08',
      request.signal,
    )
    expect(mocks.getSettings).toHaveBeenCalledWith(scope, request.signal)
    expect(mocks.getAutomationRun).toHaveBeenCalledWith(
      '2026-08-08',
      request.signal,
    )
  })

  it('does not translate a canceled GET into a public 500 response', async () => {
    const controller = new AbortController()
    const reason = new Error('poll canceled sentinel')
    const request = new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs',
      { signal: controller.signal },
    )
    mocks.getLatestRun.mockImplementation((_scope, _date, signal) => {
      controller.abort(reason)
      return Promise.reject(signal?.reason ?? reason)
    })

    await expect(GET(request)).rejects.toBe(reason)
  })

  it('logs anonymous read failures without returning backend details', async () => {
    const backendMessage =
      'relation newsletter_daily_runs denied at db.internal sentinel'
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.getLatestRun.mockRejectedValue(new Error(backendMessage))

    try {
      const response = await GET(new NextRequest(
        'https://theintraday.com/api/newsletter/daily-runs',
      ))
      const payload = await response.json()

      expect(response.status).toBe(500)
      expect(response.headers.get('cache-control')).toBe(
        'private, no-store, max-age=0',
      )
      expect(payload).toEqual({
        error: 'Unable to load the daily newsletter report.',
      })
      expect(JSON.stringify(payload)).not.toContain(backendMessage)
      expect(consoleError).toHaveBeenCalledWith(
        '[newsletter/daily-runs] GET failed',
        expect.objectContaining({ message: backendMessage }),
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it('keeps legacy POST as a same-origin method-preserving redirect', async () => {
    const response = await legacyPost(new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs?source=legacy',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'newsletter_draft_session=legacy-session',
        },
        body: JSON.stringify({ targetCount: 40 }),
      },
    ))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://theintraday.com/api/newsletter/daily-runs/action?source=legacy',
    )
    expect(mocks.resolveScope).not.toHaveBeenCalled()
    expect(mocks.ensureRun).not.toHaveBeenCalled()
  })

  it('preserves authenticated action source-conflict details', async () => {
    const conflictMessage = 'Only 39 current candidates are available'
    mocks.resolveScope.mockResolvedValue({
      scope: {
        ownerId: 'configured-owner-sentinel',
        sessionId: 'configured-session-sentinel',
      },
      createdSessionId: null,
    })
    mocks.ensureRun.mockRejectedValue(
      new NewsletterDailySourceError(conflictMessage),
    )

    const response = await actionPost(new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs/action',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCount: 40 }),
      },
    ))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: conflictMessage })
  })

  it('forwards the action signal through settings, generation, and final read', async () => {
    const scope = {
      ownerId: 'configured-owner-sentinel',
      sessionId: 'operator-session',
    }
    mocks.resolveScope.mockResolvedValue({ scope, createdSessionId: null })
    mocks.saveSettings.mockResolvedValue(settings)
    mocks.ensureRun.mockResolvedValue(runFixture())
    const request = new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs/action',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketDate: '2026-08-08',
          targetCount: 40,
        }),
      },
    )

    const response = await actionPost(request)

    expect(response.status).toBe(201)
    expect(mocks.saveSettings).toHaveBeenCalledWith(
      scope,
      { targetCount: 40, enabled: true },
      request.signal,
    )
    expect(mocks.ensureRun).toHaveBeenCalledWith(scope, {
      marketDate: '2026-08-08',
      targetCount: 40,
      signal: request.signal,
    })
    expect(mocks.getSettings).toHaveBeenLastCalledWith(scope, request.signal)
  })

  it('retains the production authentication gate on the action route', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    mocks.resolveScope.mockResolvedValue({
      scope: { ownerId: null, sessionId: 'anonymous-session' },
      createdSessionId: null,
    })

    const response = await actionPost(new NextRequest(
      'https://theintraday.com/api/newsletter/daily-runs/action',
      { method: 'POST', body: '{}' },
    ))

    expect(response.status).toBe(401)
    expect(mocks.ensureRun).not.toHaveBeenCalled()
  })
})
