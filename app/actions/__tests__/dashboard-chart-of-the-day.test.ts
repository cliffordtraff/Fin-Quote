import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/auth/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/admin')>()
  return { ...actual, requireAdminUser: mocks.requireAdminUser }
})

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import { updateDashboardChartOfTheDay } from '@/app/actions/dashboard-chart-of-the-day'
import { AdminAccessError } from '@/lib/auth/admin'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dashboard chart-of-the-day administration', () => {
  it('does not create a service-role client for an unauthorized caller', async () => {
    mocks.requireAdminUser.mockRejectedValue(new AdminAccessError())

    const result = await updateDashboardChartOfTheDay({
      ticker: 'AAPL',
      templateId: 'revenue-profit',
      periodType: 'annual',
    })

    expect(result).toMatchObject({ success: false })
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
  })
})
