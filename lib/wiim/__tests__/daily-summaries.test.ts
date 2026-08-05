import { describe, expect, it } from 'vitest'
import { mergeWiimSummaryRunSymbols } from '../daily-summaries'

describe('daily WIIM summary run metadata', () => {
  it('preserves the full symbol universe across progressively smaller batches', () => {
    const original = ['AAPL', 'MSFT', 'NVDA', 'AMZN']
    const retryBatch = ['nvda', ' amzn ']

    expect(mergeWiimSummaryRunSymbols(original, retryBatch)).toEqual(original)
  })

  it('adds newly discovered symbols without duplicates', () => {
    expect(
      mergeWiimSummaryRunSymbols(['AAPL', 'MSFT'], ['MSFT', 'GOOG']),
    ).toEqual(['AAPL', 'MSFT', 'GOOG'])
  })
})
