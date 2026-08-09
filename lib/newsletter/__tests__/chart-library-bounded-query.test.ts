import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  abortSignal: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  then: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import {
  __testOnly,
  deleteNewsletterChartLibraryItem,
  listNewsletterChartLibrarySummaries,
  updateNewsletterChartLibraryItem,
} from '../chart-library'

function row(index: number) {
  return {
    id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title: `Chart ${index}`,
    symbol: 'AAPL',
    range: '6m',
    interval: 'D',
    chart_type: 'candles',
    image_url: `https://assets.example/chart-${index}.png`,
    thumbnail_url: `https://assets.example/thumb-${index}.png`,
    chart_export_url: `https://charts.example/chart-${index}`,
    created_at: '2026-08-08T12:00:00.000000+00:00',
    updated_at: `2026-08-08T12:00:00.${String(index).padStart(6, '0')}+00:00`,
  }
}

function itemRow() {
  return {
    ...row(1),
    owner_id: 'owner-1',
    session_id: 'session-1',
    chart_spec: {
      mode: 'price',
      symbol: 'AAPL',
      range: '6m',
      interval: 'D',
      chartType: 'candles',
    },
    image_path: 'immutable/aapl.png',
    captured_at: '2026-08-08T12:00:00.000000+00:00',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
  const query = {
    eq: mocks.eq,
    or: mocks.or,
    order: mocks.order,
    range: mocks.range,
    abortSignal: mocks.abortSignal,
    select: mocks.select,
    single: mocks.single,
    maybeSingle: mocks.maybeSingle,
    then: mocks.then,
  }
  mocks.createClient.mockReturnValue({ from: mocks.from })
  mocks.from.mockReturnValue({
    select: mocks.select,
    update: mocks.update,
    delete: mocks.remove,
  })
  mocks.select.mockReturnValue(query)
  mocks.update.mockReturnValue(query)
  mocks.remove.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
  mocks.or.mockReturnValue(query)
  mocks.order.mockReturnValue(query)
  mocks.range.mockReturnValue(query)
  mocks.abortSignal.mockReturnValue(query)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('newsletter chart library production summary query', () => {
  it('projects compact fields and fetches only page-size plus one', async () => {
    mocks.then.mockImplementation((onFulfilled, onRejected) =>
      Promise.resolve({
        data: [row(3), row(2), row(1)],
        error: null,
        count: 500,
      }).then(onFulfilled, onRejected),
    )
    const controller = new AbortController()

    const page = await listNewsletterChartLibrarySummaries(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      { limit: 2, query: 'Apple', symbol: 'aapl' },
      controller.signal,
    )

    expect(mocks.from).toHaveBeenCalledWith('newsletter_chart_library')
    expect(mocks.select).toHaveBeenCalledWith(
      __testOnly.summarySelect,
      { count: 'exact' },
    )
    expect(__testOnly.summarySelect.split(',')).not.toContain('chart_spec')
    expect(__testOnly.summarySelect).not.toContain('image_path')
    expect(mocks.eq).toHaveBeenNthCalledWith(1, 'owner_id', 'owner-1')
    expect(mocks.eq).toHaveBeenNthCalledWith(2, 'symbol', 'AAPL')
    expect(mocks.or).toHaveBeenCalledWith(
      'title.ilike.%Apple%,symbol.ilike.%Apple%',
    )
    expect(mocks.order).toHaveBeenNthCalledWith(
      1,
      'updated_at',
      { ascending: false },
    )
    expect(mocks.order).toHaveBeenNthCalledWith(
      2,
      'id',
      { ascending: false },
    )
    expect(mocks.range).toHaveBeenCalledWith(0, 2)
    expect(mocks.abortSignal).toHaveBeenCalledWith(controller.signal)
    expect(page.charts).toHaveLength(2)
    expect(page.total).toBe(500)
    expect(page.nextCursor).not.toBeNull()
  })

  it('uses the exact microsecond cursor and omits a misleading continuation count', async () => {
    const cursor = __testOnly.encodeLibraryCursor({
      id: row(2).id,
      updatedAt: '2026-08-08T12:00:00.123456+00:00',
    })
    mocks.then.mockImplementation((onFulfilled, onRejected) =>
      Promise.resolve({ data: [row(1)], error: null, count: 499 }).then(
        onFulfilled,
        onRejected,
      ),
    )

    const page = await listNewsletterChartLibrarySummaries(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      { limit: 2, cursor },
    )

    expect(mocks.select).toHaveBeenCalledWith(
      __testOnly.summarySelect,
      undefined,
    )
    expect(mocks.or).toHaveBeenCalledWith(
      `updated_at.lt.2026-08-08T12:00:00.123456+00:00,and(updated_at.eq.2026-08-08T12:00:00.123456+00:00,id.lt.${row(2).id})`,
    )
    expect(page.total).toBeNull()
    expect(page.nextCursor).toBeNull()
  })
})

describe('newsletter chart library production mutation cancellation', () => {
  it('attaches the caller signal to update and delete queries', async () => {
    const controller = new AbortController()
    mocks.single.mockResolvedValue({ data: itemRow(), error: null })
    mocks.maybeSingle.mockResolvedValue({
      data: { id: itemRow().id },
      error: null,
    })

    await updateNewsletterChartLibraryItem(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      itemRow().id,
      { title: 'Renamed chart' },
      controller.signal,
    )
    await deleteNewsletterChartLibraryItem(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      itemRow().id,
      controller.signal,
    )

    expect(mocks.update).toHaveBeenCalledWith({ title: 'Renamed chart' })
    expect(mocks.remove).toHaveBeenCalledTimes(1)
    expect(mocks.abortSignal).toHaveBeenNthCalledWith(1, controller.signal)
    expect(mocks.abortSignal).toHaveBeenNthCalledWith(2, controller.signal)
  })

  it('preserves the caller abort reason when Supabase settles after cancellation', async () => {
    const controller = new AbortController()
    const reason = new Error('chart dialog closed')
    mocks.single.mockImplementation(async () => {
      controller.abort(reason)
      return {
        data: null,
        error: { code: 'ABORTED', message: 'fetch aborted' },
      }
    })

    await expect(updateNewsletterChartLibraryItem(
      { ownerId: 'owner-1', sessionId: 'session-1' },
      itemRow().id,
      { title: 'Renamed chart' },
      controller.signal,
    )).rejects.toBe(reason)
  })
})
