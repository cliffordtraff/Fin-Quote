import { writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  captureChart: vi.fn(),
  createClient: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  insertCalls: 0,
  selectCalls: 0,
  storedRow: null as Record<string, unknown> | null,
  loseFirstInsertResponse: true,
}))

vi.mock('@/lib/newsletter/capture', () => ({
  captureChart: mocks.captureChart,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { saveNewsletterChartLibraryItem } from '@/lib/newsletter/chart-library'
import { NewsletterChartLibraryRequestConflictError } from '@/lib/newsletter/chart-library-errors'
import { buildNewsletterChartPostPersistenceIdentity } from '@/lib/newsletter/chart-post-admission'

const OWNER_ID = '10000000-0000-4000-8000-000000000001'
const FINGERPRINT = 'a'.repeat(64)

function validPng(): Buffer {
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.writeUInt32BE(1200, 16)
  bytes.writeUInt32BE(675, 20)
  return bytes
}

function createSelectQuery() {
  const filters = new Map<string, unknown>()
  const query = {
    eq(column: string, value: unknown) {
      filters.set(column, value)
      return query
    },
    abortSignal() {
      return query
    },
    async maybeSingle() {
      mocks.selectCalls += 1
      const row = mocks.storedRow
      if (
        row &&
        row.owner_id === filters.get('owner_id') &&
        row.post_request_key_hash === filters.get('post_request_key_hash')
      ) return { data: row, error: null }
      return { data: null, error: null }
    },
  }
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
  mocks.insertCalls = 0
  mocks.selectCalls = 0
  mocks.storedRow = null
  mocks.loseFirstInsertResponse = true
  mocks.captureChart.mockImplementation(
    async (_spec: unknown, options: { outputPath: string }) => {
      writeFileSync(options.outputPath, validPng())
      return options.outputPath
    },
  )
  mocks.upload.mockResolvedValue({ error: null })
  mocks.getPublicUrl.mockReturnValue({
    data: { publicUrl: 'https://assets.example/immutable/chart.png' },
  })
  mocks.createClient.mockReturnValue({
    storage: {
      from: () => ({
        upload: mocks.upload,
        getPublicUrl: mocks.getPublicUrl,
      }),
    },
    from: () => ({
      select: () => createSelectQuery(),
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          async single() {
            mocks.insertCalls += 1
            if (!mocks.storedRow) {
              mocks.storedRow = {
                ...payload,
                created_at: '2026-08-09T12:00:00.000000+00:00',
                updated_at: '2026-08-09T12:00:00.000000+00:00',
              }
              if (mocks.loseFirstInsertResponse) {
                mocks.loseFirstInsertResponse = false
                throw new Error('database response lost after commit')
              }
            }
            return {
              data: null,
              error: { code: '23505', message: 'duplicate key' },
            }
          },
        }),
      }),
    }),
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('durable newsletter chart-row persistence', () => {
  it('recovers a committed insert with a lost response without rendering or inserting twice', async () => {
    const identity = buildNewsletterChartPostPersistenceIdentity({
      ownerId: OWNER_ID,
      idempotencyKey: 'durable-chart-key',
    })
    const options = {
      chartBaseUrl: 'https://charts.example',
      publicChartBaseUrl: 'https://charts.example',
      durableRequest: { ...identity, fingerprint: FINGERPRINT },
    }
    const input = {
      title: 'Apple chart',
      chartExportSpec: { symbol: 'AAPL', range: '1y', interval: 'D' },
    }

    await expect(saveNewsletterChartLibraryItem(
      { ownerId: OWNER_ID, sessionId: 'stable-session' },
      input,
      options,
    )).rejects.toThrow('database response lost after commit')
    expect(mocks.storedRow?.id).toBe(identity.chartId)

    await expect(saveNewsletterChartLibraryItem(
      { ownerId: OWNER_ID, sessionId: 'stable-session' },
      input,
      options,
    )).resolves.toMatchObject({
      id: identity.chartId,
      ownerId: OWNER_ID,
      symbol: 'AAPL',
    })

    expect(mocks.insertCalls).toBe(1)
    expect(mocks.captureChart).toHaveBeenCalledOnce()
    expect(mocks.upload).toHaveBeenCalledOnce()
    expect(mocks.selectCalls).toBe(2)
  })

  it('rejects conflicting reuse of the durable key before another render', async () => {
    const identity = buildNewsletterChartPostPersistenceIdentity({
      ownerId: OWNER_ID,
      idempotencyKey: 'durable-chart-key',
    })
    mocks.storedRow = {
      id: identity.chartId,
      owner_id: OWNER_ID,
      session_id: 'stable-session',
      title: 'Apple chart',
      symbol: 'AAPL',
      chart_spec: {
        mode: 'price', symbol: 'AAPL', range: '1y', interval: 'D',
        chartType: 'candles',
      },
      image_path: 'immutable/chart.png',
      image_url: 'https://assets.example/immutable/chart.png',
      thumbnail_path: 'immutable/chart.png',
      thumbnail_url: 'https://assets.example/immutable/chart.png',
      chart_export_url: 'https://charts.example/chart',
      captured_at: '2026-08-09T12:00:00.000000+00:00',
      renderer_contract: 'test-v1',
      scene_hash: 'b'.repeat(64),
      image_sha256: 'c'.repeat(64),
      post_request_key_hash: identity.requestKeyHash,
      post_request_fingerprint: FINGERPRINT,
      created_at: '2026-08-09T12:00:00.000000+00:00',
      updated_at: '2026-08-09T12:00:00.000000+00:00',
    }

    await expect(saveNewsletterChartLibraryItem(
      { ownerId: OWNER_ID, sessionId: 'stable-session' },
      { title: 'Microsoft', chartExportSpec: { symbol: 'MSFT' } },
      {
        durableRequest: {
          ...identity,
          fingerprint: 'f'.repeat(64),
        },
      },
    )).rejects.toBeInstanceOf(NewsletterChartLibraryRequestConflictError)
    expect(mocks.captureChart).not.toHaveBeenCalled()
    expect(mocks.insertCalls).toBe(0)
  })
})
