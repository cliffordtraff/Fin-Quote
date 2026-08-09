import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import {
  __testOnly,
  hasFinishedNewsletterMorningReport,
} from '../morning-report-readiness'
import { hasFinishedNewsletterMorningReport as legacyReadinessExport } from '../daily-automation'

beforeEach(() => {
  vi.clearAllMocks()
  const query = {
    select: mocks.select,
    eq: mocks.eq,
    maybeSingle: mocks.maybeSingle,
  }
  mocks.createServiceRoleClient.mockReturnValue({ from: mocks.from })
  mocks.from.mockReturnValue(query)
  mocks.select.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
})

describe('newsletter morning report readiness', () => {
  it('preserves the daily automation compatibility export', () => {
    expect(legacyReadinessExport).toBe(hasFinishedNewsletterMorningReport)
  })

  it.each([
    ['completed', 1],
    ['partial', 40],
  ])('accepts a generated %s report', async (status, generatedCount) => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        status,
        newsletter_generated_count: generatedCount,
      },
      error: null,
    })

    await expect(
      hasFinishedNewsletterMorningReport('2026-08-08'),
    ).resolves.toBe(true)

    expect(mocks.from).toHaveBeenCalledWith(
      'newsletter_daily_automation_runs',
    )
    expect(mocks.select).toHaveBeenCalledWith(__testOnly.readinessSelect)
    expect(__testOnly.readinessSelect).toBe(
      'status,newsletter_generated_count',
    )
    expect(mocks.eq).toHaveBeenCalledWith('market_date', '2026-08-08')
  })

  it.each([
    ['queued', 1],
    ['running', 40],
    ['failed', 40],
    ['completed', 0],
    ['partial', 0],
  ])(
    'rejects a %s report with %i generated newsletters',
    async (status, generatedCount) => {
      mocks.maybeSingle.mockResolvedValue({
        data: {
          status,
          newsletter_generated_count: generatedCount,
        },
        error: null,
      })

      await expect(
        hasFinishedNewsletterMorningReport('2026-08-08'),
      ).resolves.toBe(false)
    },
  )

  it('returns false when no automation run exists', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(
      hasFinishedNewsletterMorningReport('2026-08-08'),
    ).resolves.toBe(false)
  })

  it('preserves the existing persistence error contract', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'connection unavailable' },
    })

    await expect(
      hasFinishedNewsletterMorningReport('2026-08-08'),
    ).rejects.toThrow(
      'Failed to load newsletter automation: connection unavailable',
    )
  })
})
