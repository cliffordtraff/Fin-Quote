import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getBoundedStockPageEssentials,
  resetStockPageEssentialAdmissionForTests,
} from '@/lib/stock-page-essential-admission'

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  resetStockPageEssentialAdmissionForTests()
  process.env.DATA_PROVIDER = 'fmp'
  process.env.FMP_API_KEY = 'test-key'
})

afterEach(() => {
  resetStockPageEssentialAdmissionForTests()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.DATA_PROVIDER
  delete process.env.FMP_API_KEY
})

describe('stock-page outage provider identity', () => {
  it('cannot admit BRK.A when the cached quote response belongs to BF.B', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/v3/quote/BRK-A')) {
        return jsonResponse([{
          symbol: 'BF-B',
          name: 'Brown-Forman Corporation',
          price: 45,
          change: 1,
          changesPercentage: 2,
        }])
      }
      if (url.includes('/v3/profile/BRK-A')) {
        return jsonResponse([{
          symbol: 'BRK-A',
          companyName: 'Berkshire Hathaway Inc.',
        }])
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getBoundedStockPageEssentials('BRK.A')).resolves.toEqual({
      overview: null,
      profile: expect.objectContaining({
        symbol: 'BRK.A',
        companyName: 'Berkshire Hathaway Inc.',
      }),
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
