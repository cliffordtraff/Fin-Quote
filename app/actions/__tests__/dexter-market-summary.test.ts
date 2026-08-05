import { describe, expect, it } from 'vitest'
import { getDexterMarketSummary } from '@/app/actions/dexter-market-summary'

describe('getDexterMarketSummary', () => {
  it('fails closed without trying to launch the ignored Dexter sidecar', async () => {
    await expect(getDexterMarketSummary()).resolves.toEqual({
      summary: '',
      toolsUsed: [],
      iterations: 0,
      error: 'Dexter is unavailable.',
    })
  })
})
