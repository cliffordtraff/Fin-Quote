import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_NEWSLETTER_DAILY_TARGET } from '@/lib/newsletter/daily-target'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    default: { ...actual, readFile: mocks.readFile },
    readFile: mocks.readFile,
  }
})

import {
  __testOnly,
  getLatestNewsletterDailyRun,
  getNewsletterDailyAutomationRun,
  getNewsletterDailySettings,
} from '@/lib/newsletter/daily-runs-read'

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

function createQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    abortSignal: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  }
  for (const method of [
    'select',
    'eq',
    'is',
    'in',
    'order',
    'limit',
    'abortSignal',
  ] as const) {
    query[method].mockReturnValue(query)
  }
  return query
}

function createServiceClient(
  queries: Record<string, ReturnType<typeof createQuery> | Array<ReturnType<typeof createQuery>>>,
) {
  const seen = new Map<string, number>()
  return {
    from: vi.fn((table: string) => {
      const configured = queries[table]
      if (!configured) throw new Error(`Unexpected table: ${table}`)
      if (!Array.isArray(configured)) return configured
      const index = seen.get(table) ?? 0
      const query = configured[index]
      if (!query) throw new Error(`Unexpected ${table} query #${index + 1}`)
      seen.set(table, index + 1)
      return query
    }),
  }
}

const runRow = {
  id: 'run-1',
  market_date: '2026-08-08',
  status: 'completed',
  target_count: 40,
  source_wiim_run_id: 'wiim-1',
  source_generated_at: '2026-08-08T10:00:00.000Z',
  selected_count: 1,
  generated_count: 1,
  ready_count: 1,
  attention_count: 0,
  failed_count: 0,
  error_message: null,
  metadata_json: { sourceCandidateCount: 40 },
  started_at: '2026-08-08T09:00:00.000Z',
  completed_at: '2026-08-08T10:00:00.000Z',
  created_at: '2026-08-08T09:00:00.000Z',
  updated_at: '2026-08-08T10:00:00.000Z',
}

const itemRow = {
  id: 'item-1',
  run_id: 'run-1',
  rank: 1,
  ticker: 'AAPL',
  status: 'generated',
  quality_band: 'strong',
  relevance_score: 95,
  confidence_score: 90,
  candidate_type: 'stock',
  state_label: 'cash',
  move_percent: 3.5,
  reason_type: 'earnings',
  headline: 'Apple reports earnings',
  summary_text: 'Summary',
  key_fact: 'Fact',
  source_refs_json: [],
  candidate_json: {},
  draft_id: 'draft-1',
  draft_status: 'editing',
  chart_id: 'chart-1',
  chart_image_url: '/newsletter-charts/chart-1',
  subject_line: 'Stale subject',
  error_message: null,
  retry_count: 0,
  started_at: null,
  completed_at: null,
  created_at: '2026-08-08T09:00:00.000Z',
  updated_at: '2026-08-08T10:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-sentinel')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('daily-runs lightweight read graph', () => {
  it('hydrates a bounded owner run with draft and Beehiiv lifecycle state', async () => {
    const runQuery = createQuery({ data: runRow, error: null })
    const itemQuery = createQuery({ data: [itemRow], error: null })
    const draftQuery = createQuery({
      data: [{
        id: 'draft-1',
        status: 'ready',
        subject_line: 'Current subject',
        updated_at: '2026-08-08T11:00:00.000Z',
      }],
      error: null,
    })
    const deliveryQuery = createQuery({
      data: [{
        id: 'delivery-1',
        draft_id: 'draft-1',
        beehiiv_post_id: 'post-1',
        preview_url: 'https://preview.example/post-1',
        editor_url: 'https://app.beehiiv.com/posts/post-1',
        web_url: 'https://newsletter.example/post-1',
        lifecycle_status: 'published',
        beehiiv_status: 'confirmed',
        scheduled_at: null,
        published_at: '2026-08-08T11:30:00.000Z',
        synced_at: '2026-08-08T11:31:00.000Z',
        last_reconciled_at: '2026-08-08T11:32:00.000Z',
        last_reconcile_error: null,
        source_draft_updated_at: '2026-08-08T11:00:00.000Z',
      }],
      error: null,
    })
    mocks.createClient
      .mockReturnValueOnce(createServiceClient({
        newsletter_daily_runs: runQuery,
      }))
      .mockReturnValueOnce(createServiceClient({
        newsletter_daily_run_items: itemQuery,
      }))
      .mockReturnValueOnce(createServiceClient({
        newsletter_drafts: draftQuery,
        newsletter_beehiiv_deliveries: deliveryQuery,
      }))
    const signal = new AbortController().signal

    const run = await getLatestNewsletterDailyRun(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      '2026-08-08',
      signal,
    )

    expect(run?.items[0]).toMatchObject({
      status: 'published',
      draftStatus: 'ready',
      subjectLine: 'Current subject',
      beehiivDelivery: {
        id: 'delivery-1',
        lifecycleStatus: 'published',
        needsSync: false,
      },
    })
    expect(runQuery.select).toHaveBeenCalledWith(__testOnly.runSelect)
    expect(itemQuery.select).toHaveBeenCalledWith(__testOnly.itemSelect)
    expect(draftQuery.select).toHaveBeenCalledWith(__testOnly.draftStateSelect)
    expect(deliveryQuery.select).toHaveBeenCalledWith(
      __testOnly.deliveryStateSelect,
    )
    for (const select of [
      __testOnly.runSelect,
      __testOnly.itemSelect,
      __testOnly.draftStateSelect,
      __testOnly.deliveryStateSelect,
    ]) {
      expect(select).not.toContain('*')
    }
    expect(runQuery.limit).toHaveBeenCalledWith(1)
    expect(itemQuery.limit).toHaveBeenCalledWith(MAX_NEWSLETTER_DAILY_TARGET)
    expect(draftQuery.limit).toHaveBeenCalledWith(MAX_NEWSLETTER_DAILY_TARGET)
    expect(deliveryQuery.limit).toHaveBeenCalledWith(
      MAX_NEWSLETTER_DAILY_TARGET,
    )
    for (const query of [runQuery, itemQuery, draftQuery, deliveryQuery]) {
      expect(query.abortSignal).toHaveBeenCalledWith(signal)
    }
  })

  it('uses scalar settings and automation queries with the caller signal', async () => {
    const settingsQuery = createQuery({
      data: {
        enabled: false,
        target_count: 30,
        timezone: 'America/New_York',
        generation_hour: 7,
      },
      error: null,
    })
    const automationQuery = createQuery({
      data: {
        id: 'automation-1',
        market_date: '2026-08-08',
        status: 'running',
        stage: 'summaries',
        candidate_symbols: ['AAPL'],
        candidate_count: 1,
        finviz_completed_count: 1,
        finviz_found_count: 1,
        finviz_error_count: 0,
        summary_completed_count: 1,
        summary_generated_count: 1,
        summary_no_result_count: 0,
        summary_error_count: 0,
        wiim_run_id: 'wiim-1',
        newsletter_scope_count: 1,
        newsletter_completed_scope_count: 0,
        newsletter_selected_count: 1,
        newsletter_generated_count: 0,
        newsletter_ready_count: 0,
        newsletter_attention_count: 0,
        newsletter_failed_count: 0,
        invocation_count: 1,
        last_error: null,
        notification_applied_at: null,
        notification_attempt_count: 0,
        notification_last_error: null,
        metadata_json: {},
        started_at: '2026-08-08T09:00:00.000Z',
        completed_at: null,
        last_heartbeat_at: '2026-08-08T09:01:00.000Z',
        created_at: '2026-08-08T09:00:00.000Z',
        updated_at: '2026-08-08T09:01:00.000Z',
      },
      error: null,
    })
    mocks.createClient
      .mockReturnValueOnce(createServiceClient({
        newsletter_daily_settings: settingsQuery,
      }))
      .mockReturnValueOnce(createServiceClient({
        newsletter_daily_automation_runs: automationQuery,
      }))
    const signal = new AbortController().signal

    const settings = await getNewsletterDailySettings(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      signal,
    )
    const automation = await getNewsletterDailyAutomationRun(
      '2026-08-08',
      signal,
    )

    expect(settings).toMatchObject({ targetCount: 30, generationHour: 7 })
    expect(automation).toMatchObject({ id: 'automation-1', stage: 'summaries' })
    expect(settingsQuery.select).toHaveBeenCalledWith(__testOnly.settingsSelect)
    expect(automationQuery.select).toHaveBeenCalledWith(
      __testOnly.automationSelect,
    )
    expect(__testOnly.settingsSelect).not.toContain('*')
    expect(__testOnly.automationSelect).not.toContain('*')
    expect(settingsQuery.abortSignal).toHaveBeenCalledWith(signal)
    expect(automationQuery.abortSignal).toHaveBeenCalledWith(signal)
  })

  it('preserves anonymous local draft status without importing draft commands', async () => {
    const runQuery = createQuery({ data: runRow, error: null })
    const itemQuery = createQuery({ data: [itemRow], error: null })
    mocks.createClient
      .mockReturnValueOnce(createServiceClient({
        newsletter_daily_runs: runQuery,
      }))
      .mockReturnValueOnce(createServiceClient({
        newsletter_daily_run_items: itemQuery,
      }))
    mocks.readFile.mockResolvedValue(JSON.stringify({
      id: 'draft-1',
      session_id: 'local-session',
      status: 'ready',
      subject_line: 'Local current subject',
      updated_at: '2026-08-08T12:00:00.000Z',
    }))
    const signal = new AbortController().signal

    const run = await getLatestNewsletterDailyRun(
      { ownerId: null, sessionId: 'local-session' },
      undefined,
      signal,
    )

    expect(run?.items[0]).toMatchObject({
      status: 'ready',
      draftStatus: 'ready',
      subjectLine: 'Local current subject',
      beehiivDelivery: null,
    })
    expect(mocks.createClient).toHaveBeenCalledTimes(2)
    expect(mocks.readFile).toHaveBeenCalledWith(
      expect.stringMatching(
        /\.newsletter-drafts\/local-session\/draft-1\.json$/,
      ),
      { encoding: 'utf8', signal },
    )
  })

  it('stops before creating a database client when already canceled', async () => {
    const controller = new AbortController()
    const reason = new Error('read canceled sentinel')
    controller.abort(reason)

    await expect(getNewsletterDailySettings(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      controller.signal,
    )).rejects.toBe(reason)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('does not hydrate child graphs when no latest run exists', async () => {
    const runQuery = createQuery({ data: null, error: null })
    mocks.createClient.mockReturnValue(createServiceClient({
      newsletter_daily_runs: runQuery,
    }))

    await expect(getLatestNewsletterDailyRun(
      { ownerId: 'owner-1', sessionId: 'session-1' },
    )).resolves.toBeNull()
    expect(mocks.createClient).toHaveBeenCalledTimes(1)
  })
})
