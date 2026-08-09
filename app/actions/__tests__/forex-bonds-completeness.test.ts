import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FOREX_BOND_PANEL } from '@/lib/forex-bonds-panel'

const mocks = vi.hoisted(() => ({
  getQuotes: vi.fn(),
}))

vi.mock('@/lib/providers/fmp', () => ({
  FMPProvider: class {
    getQuotes(...args: unknown[]) {
      return mocks.getQuotes(...args)
    }
  },
}))

import { getForexBondsData } from '@/app/actions/forex-bonds'

function providerPanel(price = 100) {
  return FOREX_BOND_PANEL.map(({ symbol }, index) => ({
    symbol,
    name: `Provider ${symbol}`,
    price: price + index,
    change: 1,
    changesPercentage: 1,
  }))
}

describe('forex/bonds action completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the exact six-row panel in canonical display order', async () => {
    mocks.getQuotes.mockResolvedValue(providerPanel().reverse())

    const result = await getForexBondsData()

    expect(result).toMatchObject({
      forexBonds: FOREX_BOND_PANEL.map(({ symbol, name }) => ({ symbol, name })),
    })
    expect(mocks.getQuotes).toHaveBeenCalledWith(
      FOREX_BOND_PANEL.map(({ symbol }) => symbol),
      {},
    )
  })

  it.each([
    ['empty', []],
    ['partial', providerPanel().slice(0, 1)],
    ['duplicate', [...providerPanel().slice(0, 5), providerPanel()[0]]],
  ])('returns an explicit error for a %s provider panel', async (_label, rows) => {
    mocks.getQuotes.mockResolvedValue(rows)

    await expect(getForexBondsData()).resolves.toEqual({
      error: 'Incomplete forex/bonds data',
    })
  })
})
