import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => {
  const state: {
    result: { data: unknown; error: { message: string } | null }
    pending: boolean
  } = {
    result: { data: [], error: null },
    pending: false,
  }
  const query: Record<string, any> = {}
  for (const method of [
    'select',
    'eq',
    'not',
    'or',
    'order',
    'limit',
    'abortSignal',
  ]) {
    query[method] = vi.fn(() => query)
  }
  query.then = (
    resolve: (value: typeof state.result) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => {
    if (state.pending) {
      return new Promise<typeof state.result>(() => undefined).then(
        resolve,
        reject,
      )
    }
    return Promise.resolve(state.result).then(resolve, reject)
  }
  const from = vi.fn(() => query)
  const createClient = vi.fn(() => ({ from }))
  return { createClient, from, query, state }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMock.createClient,
}))

import {
  getStockCatalystHistory,
  mapStockCatalystHistoryRows,
  STOCK_CATALYST_HISTORY_ITEM_LIMIT,
  STOCK_CATALYST_HISTORY_QUERY_LIMIT,
  STOCK_CATALYST_HISTORY_TIMEOUT_MS,
} from '@/lib/stock-catalyst-history'
import { WIIM_SUMMARY_CONFIG_VERSION } from '@/lib/wiim-summary-config'

describe('stock catalyst history import boundary', () => {
  it('reads WIIM configuration without importing the generation graph', () => {
    const readerSource = readFileSync(
      resolve(process.cwd(), 'lib/stock-catalyst-history.ts'),
      'utf8',
    )
    const configSource = readFileSync(
      resolve(process.cwd(), 'lib/wiim-summary-config.ts'),
      'utf8',
    )
    const generatorSource = readFileSync(
      resolve(process.cwd(), 'lib/generated-stock-why-moving.ts'),
      'utf8',
    )

    expect(readerSource).toMatch(/^import 'server-only'/)
    expect(readerSource).toContain("from '@/lib/wiim-summary-config'")
    expect(readerSource).not.toContain("from '@/lib/generated-stock-why-moving'")
    expect(generatorSource).toContain("from '@/lib/wiim-summary-config'")
    expect(generatorSource).not.toContain(
      'export const WIIM_SUMMARY_CONFIG_VERSION',
    )
    expect(configSource).not.toMatch(/^import\s/m)
  })
})

function row(
  summaryDate: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    symbol: 'AAPL',
    summary_date: summaryDate,
    summary_text: `Apple catalyst on ${summaryDate}.`,
    generated_at: `${summaryDate}T13:00:00.000Z`,
    no_summary_reason: null,
    config_version: WIIM_SUMMARY_CONFIG_VERSION,
    winning_event: {
      title: 'Apple reports quarterly results',
      publisher: 'Reuters',
      publishedDate: `${summaryDate}T12:00:00.000Z`,
      url: 'https://www.reuters.com/technology/apple-results',
    },
    metadata: {
      key_fact: 'Revenue exceeded consensus.',
      reason_type: 'earnings',
      quote: { changesPercentage: 4.25 },
    },
    ...overrides,
  }
}

describe('stock catalyst history row boundary', () => {
  it('keeps the latest valid row per date and caps the public history', () => {
    const rows = Array.from(
      { length: STOCK_CATALYST_HISTORY_ITEM_LIMIT + 4 },
      (_, index) => row(`2026-07-${String(31 - index).padStart(2, '0')}`),
    )
    rows.unshift(row('2026-07-31', {
      summary_text: 'An older same-day generation.',
      generated_at: '2026-07-31T12:00:00.000Z',
    }))

    const mapped = mapStockCatalystHistoryRows(rows, 'AAPL')

    expect(mapped).toHaveLength(STOCK_CATALYST_HISTORY_ITEM_LIMIT)
    expect(mapped?.[0]).toMatchObject({
      summaryDate: '2026-07-31',
      summaryText: 'Apple catalyst on 2026-07-31.',
      reasonType: 'earnings',
      movePercent: 4.25,
      keyFact: 'Revenue exceeded consensus.',
      source: {
        publisher: 'Reuters',
        url: 'https://www.reuters.com/technology/apple-results',
      },
    })
    expect(mapped?.filter((item) => item.summaryDate === '2026-07-31'))
      .toHaveLength(1)
  })

  it('normalizes the expected symbol at the exported runtime boundary', () => {
    expect(mapStockCatalystHistoryRows([row('2026-08-08')], 'aapl'))
      .toEqual([
        expect.objectContaining({
          summaryDate: '2026-08-08',
        }),
      ])
    expect(mapStockCatalystHistoryRows([], '../AAPL')).toBeNull()
  })

  it('drops malformed identities and unsafe or oversized optional evidence', () => {
    const longText = 'x'.repeat(700)
    const mapped = mapStockCatalystHistoryRows([
      row('2026-08-08', {
        winning_event: {
          title: 'Unsafe source',
          url: 'javascript:alert(1)',
        },
        metadata: {
          key_fact: longText,
          reason_type: 'invented_reason',
          quote: { changesPercentage: Number.POSITIVE_INFINITY },
        },
      }),
      row('2026-08-07', { symbol: 'MSFT' }),
      row('2026-08-06', { summary_text: longText }),
      row('2026-08-05', { config_version: 'retired-config' }),
      row('2026-08-04', { no_summary_reason: 'validation_rejected' }),
      row('not-a-date'),
    ], 'AAPL')

    expect(mapped).toEqual([
      expect.objectContaining({
        summaryDate: '2026-08-08',
        keyFact: null,
        reasonType: null,
        movePercent: null,
        source: null,
      }),
    ])
  })

  it('rejects non-array payloads at the runtime boundary', () => {
    expect(mapStockCatalystHistoryRows({ rows: [] }, 'AAPL')).toBeNull()
  })
})

describe('getStockCatalystHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    supabaseMock.state.result = { data: [], error: null }
    supabaseMock.state.pending = false
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('uses the exact bounded, current-config, newest-first query', async () => {
    supabaseMock.state.result = {
      data: [row('2026-08-08')],
      error: null,
    }

    await expect(getStockCatalystHistory('aapl')).resolves.toMatchObject({
      status: 'ready',
      items: [{ summaryDate: '2026-08-08' }],
    })

    expect(supabaseMock.from).toHaveBeenCalledWith('stock_summaries')
    expect(supabaseMock.query.eq).toHaveBeenNthCalledWith(1, 'symbol', 'AAPL')
    expect(supabaseMock.query.eq).toHaveBeenNthCalledWith(
      2,
      'config_version',
      WIIM_SUMMARY_CONFIG_VERSION,
    )
    expect(supabaseMock.query.not).toHaveBeenCalledWith(
      'summary_text',
      'is',
      null,
    )
    expect(supabaseMock.query.or).toHaveBeenCalledWith(
      'no_summary_reason.is.null,no_summary_reason.neq.validation_rejected',
    )
    expect(supabaseMock.query.order).toHaveBeenNthCalledWith(
      1,
      'summary_date',
      { ascending: false },
    )
    expect(supabaseMock.query.order).toHaveBeenNthCalledWith(
      2,
      'generated_at',
      { ascending: false },
    )
    expect(supabaseMock.query.limit).toHaveBeenCalledWith(
      STOCK_CATALYST_HISTORY_QUERY_LIMIT,
    )
    expect(supabaseMock.query.abortSignal).toHaveBeenCalledWith(
      expect.any(AbortSignal),
    )
  })

  it('distinguishes authoritative empty data, query failure, and malformed rows', async () => {
    await expect(getStockCatalystHistory('AAPL')).resolves.toEqual({
      status: 'empty',
      items: [],
    })

    supabaseMock.state.result = {
      data: null,
      error: { message: 'database unavailable' },
    }
    await expect(getStockCatalystHistory('AAPL')).resolves.toEqual({
      status: 'unavailable',
      reason: 'query',
      items: [],
    })

    supabaseMock.state.result = {
      data: [row('2026-08-08', { symbol: 'MSFT' })],
      error: null,
    }
    await expect(getStockCatalystHistory('AAPL')).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid_data',
      items: [],
    })
  })

  it('returns a typed configuration failure before constructing a client', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')

    await expect(getStockCatalystHistory('AAPL')).resolves.toEqual({
      status: 'unavailable',
      reason: 'configuration',
      items: [],
    })
    expect(supabaseMock.createClient).not.toHaveBeenCalled()
  })

  it('keeps malformed client configuration inside the typed result contract', async () => {
    supabaseMock.createClient.mockImplementationOnce(() => {
      throw new TypeError('Invalid Supabase URL')
    })

    await expect(getStockCatalystHistory('AAPL')).resolves.toEqual({
      status: 'unavailable',
      reason: 'configuration',
      items: [],
    })
  })

  it('enforces a logical deadline even when a query promise never settles', async () => {
    vi.useFakeTimers()
    supabaseMock.state.pending = true
    const result = getStockCatalystHistory('AAPL')

    await vi.advanceTimersByTimeAsync(STOCK_CATALYST_HISTORY_TIMEOUT_MS)

    await expect(result).resolves.toEqual({
      status: 'unavailable',
      reason: 'timeout',
      items: [],
    })
  })

  it('propagates caller cancellation while passing the combined signal physically', async () => {
    supabaseMock.state.pending = true
    const controller = new AbortController()
    const reason = new Error('request closed')
    const result = getStockCatalystHistory('AAPL', {
      signal: controller.signal,
    })

    controller.abort(reason)

    await expect(result).rejects.toBe(reason)
    expect(supabaseMock.query.abortSignal).toHaveBeenCalledWith(
      expect.any(AbortSignal),
    )
  })
})
