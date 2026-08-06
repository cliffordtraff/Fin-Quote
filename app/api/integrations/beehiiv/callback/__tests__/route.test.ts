import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteBeehiivIntegration: vi.fn(),
  finishBeehiivOAuth: vi.fn(),
  listBeehiivPublications: vi.fn(),
  requireCurrentUser: vi.fn(),
  saveBeehiivIntegrationConnection: vi.fn(),
  saveBeehiivPublication: vi.fn(),
}))

vi.mock('@/lib/auth/current-user', () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}))

vi.mock('@/lib/beehiiv/client', () => ({
  listBeehiivPublications: mocks.listBeehiivPublications,
}))

vi.mock('@/lib/beehiiv/oauth', () => ({
  BEEHIIV_OAUTH_COOKIE: 'beehiiv-oauth',
  finishBeehiivOAuth: mocks.finishBeehiivOAuth,
}))

vi.mock('@/lib/beehiiv/store', () => ({
  deleteBeehiivIntegration: mocks.deleteBeehiivIntegration,
  saveBeehiivIntegrationConnection:
    mocks.saveBeehiivIntegrationConnection,
  saveBeehiivPublication: mocks.saveBeehiivPublication,
}))

import { GET } from '../route'

function request(): NextRequest {
  return new NextRequest(
    'https://www.theintraday.com/api/integrations/beehiiv/callback?state=state-1&code=code-1',
    { headers: { Cookie: 'beehiiv-oauth=encrypted-state' } },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('BEEHIIV_PUBLICATION_ID', 'pub_expected')
  mocks.requireCurrentUser.mockResolvedValue({ id: 'owner-1' })
  mocks.finishBeehiivOAuth.mockResolvedValue({
    credentials: { tokens: { access_token: 'redacted' } },
    returnTo: '/newsletter/morning-review',
  })
  mocks.listBeehiivPublications.mockResolvedValue([
    {
      id: 'pub_expected',
      name: 'The Intraday',
      description: null,
      url: 'https://theintraday.beehiiv.com',
    },
  ])
  mocks.saveBeehiivIntegrationConnection.mockResolvedValue(undefined)
  mocks.saveBeehiivPublication.mockResolvedValue(undefined)
  mocks.deleteBeehiivIntegration.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Beehiiv OAuth callback', () => {
  it('reports connected only after the configured publication is verified', async () => {
    const response = await GET(request())

    expect(response.headers.get('location')).toContain('beehiiv=connected')
    expect(mocks.saveBeehiivIntegrationConnection).toHaveBeenCalledTimes(1)
    expect(mocks.saveBeehiivPublication).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({ id: 'pub_expected' }),
    )
    expect(mocks.deleteBeehiivIntegration).not.toHaveBeenCalled()
  })

  it('removes a partial connection when publication verification fails', async () => {
    mocks.listBeehiivPublications.mockResolvedValueOnce([
      {
        id: 'pub_other',
        name: 'Other publication',
        description: null,
        url: null,
      },
    ])

    const response = await GET(request())

    expect(response.headers.get('location')).toContain('beehiiv=error')
    expect(mocks.saveBeehiivPublication).not.toHaveBeenCalled()
    expect(mocks.deleteBeehiivIntegration).toHaveBeenCalledWith('owner-1')
  })

  it('fails closed when Beehiiv cannot list publications', async () => {
    mocks.listBeehiivPublications.mockRejectedValueOnce(
      new Error('Beehiiv unavailable'),
    )

    const response = await GET(request())

    expect(response.headers.get('location')).toContain('beehiiv=error')
    expect(mocks.deleteBeehiivIntegration).toHaveBeenCalledWith('owner-1')
  })
})
