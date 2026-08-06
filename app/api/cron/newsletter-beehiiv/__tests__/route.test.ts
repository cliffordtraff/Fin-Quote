import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  markFailed: vi.fn(),
  reconcile: vi.fn(),
  withHeartbeat: vi.fn(),
}))

vi.mock('@/lib/newsletter/beehiiv-lifecycle', () => ({
  reconcileBeehiivDeliveryQueue: mocks.reconcile,
}))

vi.mock('@/lib/newsletter/cron-observability', () => ({
  markNewsletterCronResponseFailed: mocks.markFailed,
  withNewsletterCronHeartbeat: mocks.withHeartbeat,
}))

import { GET } from '@/app/api/cron/newsletter-beehiiv/route'

function request(authorization = 'Bearer test-cron-secret') {
  return new NextRequest(
    'https://theintraday.com/api/cron/newsletter-beehiiv',
    { headers: { authorization } },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'test-cron-secret')
  mocks.withHeartbeat.mockImplementation(
    async (_job: string, operation: () => Promise<Response>) => operation(),
  )
  mocks.markFailed.mockImplementation((response: Response) => response)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('newsletter Beehiiv cron route', () => {
  it('records and runs an authorized reconciliation batch', async () => {
    mocks.reconcile.mockResolvedValue({
      attempted: 2,
      updated: 2,
      failed: [],
    })

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(mocks.withHeartbeat).toHaveBeenCalledWith(
      'beehiiv_reconciliation',
      expect.any(Function),
    )
    expect(mocks.reconcile).toHaveBeenCalledWith(4, 4)
    await expect(response.json()).resolves.toEqual({
      attempted: 2,
      updated: 2,
      failed: [],
    })
  })

  it('does not create heartbeats for rejected requests', async () => {
    const response = await GET(request('Bearer wrong-secret'))

    expect(response.status).toBe(401)
    expect(mocks.withHeartbeat).not.toHaveBeenCalled()
    expect(mocks.reconcile).not.toHaveBeenCalled()
  })
})
