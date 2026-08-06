import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import { recordPick } from '@/lib/newsletter/fetch-context'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.from.mockReturnValue({ insert: mocks.insert })
  mocks.createServiceRoleClient.mockReturnValue({ from: mocks.from })
})

describe('newsletter pick persistence', () => {
  const pick = {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    changesPercentage: 2.4,
    editorialHook: 'Apple moved after earnings.',
    subjectLine: 'Why Apple moved today',
    topHeadlines: [],
    pickSource: 'earnings' as const,
  }

  it('writes editorial history with the service client', async () => {
    mocks.insert.mockResolvedValue({ error: null })

    await recordPick(pick)

    expect(mocks.createServiceRoleClient).toHaveBeenCalledOnce()
    expect(mocks.from).toHaveBeenCalledWith('newsletter_picks')
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL', pick_source: 'earnings' }),
    )
  })

  it('reports returned database errors instead of silently losing history', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = { message: 'insert denied' }
    mocks.insert.mockResolvedValue({ error })

    await recordPick(pick)

    expect(warning).toHaveBeenCalledWith('Failed to record pick:', error)
  })
})
