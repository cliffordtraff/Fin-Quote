import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  exists: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    rpc: mocks.rpc,
    storage: {
      from: () => ({
        upload: mocks.upload,
        getPublicUrl: mocks.getPublicUrl,
        exists: mocks.exists,
      }),
    },
  }),
}))

import {
  buildDashboardChartRenderIdentity,
  DashboardChartRenderPendingError,
  DashboardChartRenderUnavailableError,
  ensureDashboardChartRenderAsset,
} from '@/lib/dashboard/chart-render-assets'
import type { DashboardChartOfTheDaySetting } from '@/lib/dashboard/chart-of-the-day-settings'

const readyPath = `immutable/${'a'.repeat(2)}/${'a'.repeat(64)}.png`

const setting: DashboardChartOfTheDaySetting = {
  selection: {
    ticker: 'AAPL',
    templateId: 'revenue_vs_net_income',
    periodType: 'annual',
  },
  chartSpec: {
    stocks: ['AAPL'],
    metrics: ['revenue', 'net_income'],
    periodType: 'annual',
  },
  source: 'template',
  updatedAt: '2026-08-08T10:00:00.000Z',
  updatedBy: 'admin-1',
}

function pngBytes(): Uint8Array {
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0)
  bytes.writeUInt32BE(1200, 16)
  bytes.writeUInt32BE(675, 20)
  return bytes
}

function acquiredRow() {
  return {
    disposition: 'acquired',
    lease_token: '10000000-0000-4000-8000-000000000001',
    storage_path: null,
    retry_after_seconds: 90,
    attempt_count: 1,
  }
}

describe('durable dashboard chart render assets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.upload.mockResolvedValue({ data: {}, error: null })
    mocks.exists.mockResolvedValue({ data: true, error: null })
    mocks.getPublicUrl.mockImplementation((path: string) => ({
      data: {
        publicUrl: `https://example.supabase.co/storage/v1/object/public/newsletter-charts/${path}`,
      },
    }))
  })

  it('builds a canonical identity from setting version, spec, and theme', () => {
    const reordered = {
      ...setting,
      chartSpec: {
        periodType: 'annual' as const,
        metrics: ['revenue', 'net_income'],
        stocks: ['AAPL'],
      },
    }

    const first = buildDashboardChartRenderIdentity('light', setting)
    const second = buildDashboardChartRenderIdentity('light', reordered)
    const dark = buildDashboardChartRenderIdentity('dark', setting)
    const changed = buildDashboardChartRenderIdentity('light', {
      ...setting,
      chartSpec: { ...setting.chartSpec, stocks: ['MSFT'] },
    })

    expect(first).toEqual(second)
    expect(first.renderKey).toMatch(/^[0-9a-f]{64}$/)
    expect(first.specHash).toMatch(/^[0-9a-f]{64}$/)
    expect(dark.renderKey).not.toBe(first.renderKey)
    expect(changed.renderKey).not.toBe(first.renderKey)
  })

  it('reuses a completed immutable asset without calling the renderer', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          disposition: 'ready',
          lease_token: null,
          storage_path: readyPath,
          retry_after_seconds: 0,
          attempt_count: 1,
        },
      ],
      error: null,
    })
    const render = vi.fn()

    const result = await ensureDashboardChartRenderAsset({
      identity: buildDashboardChartRenderIdentity('light', setting),
      render,
    })

    expect(result.source).toBe('ready')
    expect(result.storagePath).toBe(readyPath)
    expect(result.publicUrl).toContain(readyPath)
    expect(render).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.exists).toHaveBeenCalledWith(readyPath)
  })

  it('uploads once and publishes the content-addressed path for the lease owner', async () => {
    mocks.rpc.mockImplementation(
      (name: string, args: Record<string, unknown>) => {
        if (name === 'acquire_dashboard_chart_render_asset') {
          return Promise.resolve({ data: [acquiredRow()], error: null })
        }
        if (name === 'complete_dashboard_chart_render_asset') {
          return Promise.resolve({
            data: [
              {
                disposition: 'completed',
                storage_path: args.p_storage_path,
              },
            ],
            error: null,
          })
        }
        return Promise.resolve({ data: true, error: null })
      },
    )
    const render = vi.fn().mockResolvedValue({
      bytes: pngBytes(),
      contentType: 'image/png',
    })

    const result = await ensureDashboardChartRenderAsset({
      identity: buildDashboardChartRenderIdentity('light', setting),
      render,
    })

    expect(result.source).toBe('rendered')
    expect(result.storagePath).toMatch(
      /^immutable\/[0-9a-f]{2}\/[0-9a-f]{64}\.png$/,
    )
    expect(render).toHaveBeenCalledOnce()
    expect(mocks.upload).toHaveBeenCalledOnce()
    expect(mocks.upload).toHaveBeenCalledWith(
      result.storagePath,
      expect.any(Buffer),
      expect.objectContaining({
        cacheControl: '31536000',
        contentType: 'image/png',
        upsert: false,
      }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith(
      'complete_dashboard_chart_render_asset',
      expect.objectContaining({
        p_lease_token: acquiredRow().lease_token,
        p_storage_path: result.storagePath,
      }),
    )
  })

  it('does not render when another serverless isolate holds the lease', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          disposition: 'wait',
          lease_token: null,
          storage_path: null,
          retry_after_seconds: 44,
          attempt_count: 1,
        },
      ],
      error: null,
    })
    const render = vi.fn()

    await expect(
      ensureDashboardChartRenderAsset({
        identity: buildDashboardChartRenderIdentity('light', setting),
        render,
      }),
    ).rejects.toMatchObject({
      retryAfterSeconds: 44,
    } satisfies Partial<DashboardChartRenderPendingError>)
    expect(render).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('records a cooldown when rendering fails', async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'acquire_dashboard_chart_render_asset') {
        return Promise.resolve({ data: [acquiredRow()], error: null })
      }
      if (name === 'fail_dashboard_chart_render_asset') {
        return Promise.resolve({ data: true, error: null })
      }
      throw new Error(`Unexpected RPC ${name}`)
    })
    const render = vi.fn().mockRejectedValue(new Error('renderer secret'))

    await expect(
      ensureDashboardChartRenderAsset({
        identity: buildDashboardChartRenderIdentity('light', setting),
        render,
      }),
    ).rejects.toThrow('renderer secret')
    expect(mocks.rpc).toHaveBeenCalledWith(
      'fail_dashboard_chart_render_asset',
      expect.objectContaining({ p_retry_after_seconds: 60 }),
    )
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('honors a rolling attempt-window cap without rendering again', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        {
          disposition: 'failed',
          lease_token: null,
          storage_path: null,
          retry_after_seconds: 7200,
          attempt_count: 3,
        },
      ],
      error: null,
    })
    const render = vi.fn()

    await expect(
      ensureDashboardChartRenderAsset({
        identity: buildDashboardChartRenderIdentity('light', setting),
        render,
      }),
    ).rejects.toMatchObject({
      retryAfterSeconds: 7200,
    } satisfies Partial<DashboardChartRenderUnavailableError>)
    expect(render).not.toHaveBeenCalled()
  })

  it('repairs a ready row whose immutable storage object was deleted', async () => {
    mocks.exists.mockResolvedValueOnce({ data: false, error: { status: 404 } })
    let acquireCount = 0
    mocks.rpc.mockImplementation(
      (name: string, args: Record<string, unknown>) => {
        if (name === 'acquire_dashboard_chart_render_asset') {
          acquireCount += 1
          return Promise.resolve({
            data:
              acquireCount === 1
                ? [
                    {
                      disposition: 'ready',
                      lease_token: null,
                      storage_path: readyPath,
                      retry_after_seconds: 0,
                      attempt_count: 1,
                    },
                  ]
                : [acquiredRow()],
            error: null,
          })
        }
        if (name === 'invalidate_dashboard_chart_render_asset') {
          return Promise.resolve({ data: true, error: null })
        }
        if (name === 'complete_dashboard_chart_render_asset') {
          return Promise.resolve({
            data: [
              {
                disposition: 'completed',
                storage_path: args.p_storage_path,
              },
            ],
            error: null,
          })
        }
        return Promise.resolve({ data: true, error: null })
      },
    )
    const render = vi.fn().mockResolvedValue({
      bytes: pngBytes(),
      contentType: 'image/png',
    })

    const result = await ensureDashboardChartRenderAsset({
      identity: buildDashboardChartRenderIdentity('light', setting),
      render,
    })

    expect(result.source).toBe('rendered')
    expect(acquireCount).toBe(2)
    expect(render).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledWith(
      'invalidate_dashboard_chart_render_asset',
      expect.objectContaining({ p_storage_path: readyPath }),
    )
  })

  it('does not claim and abandon another lease after losing completion', async () => {
    let acquireCount = 0
    mocks.rpc.mockImplementation(
      (name: string) => {
        if (name === 'acquire_dashboard_chart_render_asset') {
          acquireCount += 1
          return Promise.resolve({ data: [acquiredRow()], error: null })
        }
        if (name === 'complete_dashboard_chart_render_asset') {
          return Promise.resolve({
            data: [{ disposition: 'lost', storage_path: null }],
            error: null,
          })
        }
        return Promise.resolve({ data: true, error: null })
      },
    )

    await expect(
      ensureDashboardChartRenderAsset({
        identity: buildDashboardChartRenderIdentity('light', setting),
        render: async () => ({ bytes: pngBytes(), contentType: 'image/png' }),
      }),
    ).rejects.toMatchObject({ retryAfterSeconds: 5 })

    expect(acquireCount).toBe(1)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'fail_dashboard_chart_render_asset',
      expect.any(Object),
    )
  })
})
