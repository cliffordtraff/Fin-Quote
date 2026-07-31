import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MassiveProvider } from '@/lib/providers/massive'

function response(json: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(json),
  } as unknown as Response
}

describe('MassiveProvider index quotes', () => {
  beforeEach(() => {
    process.env.MASSIVE_API_KEY = 'test-key'
    process.env.FMP_API_KEY = 'fallback-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.MASSIVE_API_KEY
    delete process.env.FMP_API_KEY
  })

  it('retries missing batch index quotes through individual snapshots', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ results: [] }))
      .mockResolvedValueOnce(
        response({
          results: [{
            ticker: 'I:SPX',
            value: 7413.18,
            session: { change: 1.2, change_percent: 0.02 },
          }],
        }),
      )
      .mockResolvedValueOnce(
        response({
          results: [{
            ticker: 'I:DJI',
            value: 52210.08,
            session: { change: 265.3, change_percent: 0.51 },
          }],
        }),
      )

    vi.stubGlobal('fetch', fetchMock)

    const quotes = await new MassiveProvider().getQuotes(['^GSPC', '^DJI'])

    expect(quotes.map(quote => quote.symbol)).toEqual(['^GSPC', '^DJI'])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[1][0])).toContain('ticker.any_of=I:SPX')
    expect(String(fetchMock.mock.calls[2][0])).toContain('ticker.any_of=I:DJI')
  })

  it('falls back to FMP when index snapshots are unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(
        response([{
          symbol: '^GSPC',
          name: 'S&P 500',
          price: 7413.18,
          change: 1.2,
          changesPercentage: 0.02,
        }]),
      )

    vi.stubGlobal('fetch', fetchMock)

    const quotes = await new MassiveProvider().getQuotes(['^GSPC'])

    expect(quotes).toHaveLength(1)
    expect(quotes[0]).toMatchObject({ symbol: '^GSPC', price: 7413.18 })
    expect(String(fetchMock.mock.calls[2][0])).toContain('/v3/quote/%5EGSPC')
  })
})
