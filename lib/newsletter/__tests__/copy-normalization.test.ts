import { describe, expect, it } from 'vitest'
import { ensureStockMentionInCopy } from '@/lib/newsletter/copy-normalization'

describe('ensureStockMentionInCopy', () => {
  it('prefixes the heading when neither heading nor body names the stock', () => {
    const normalized = ensureStockMentionInCopy(
      {
        headline: 'Big Breakout After Earnings Sparks Massive Rally',
        body: 'Shares jump **22.73%** as the stock closes at **$81.93**.',
        caption: 'One-month price action.',
      },
      {
        ticker: 'INTC',
        name: 'Intel Corporation',
      },
    )

    expect(normalized.headline).toBe('Intel: Big Breakout After Earnings Sparks Massive Rally')
    expect(normalized.body).toBe('Shares jump **22.73%** as the stock closes at **$81.93**.')
  })

  it('leaves the copy alone when the body already names the ticker', () => {
    const normalized = ensureStockMentionInCopy(
      {
        headline: 'Momentum Stays Intact After Earnings',
        body: 'AMD shares climb **14.80%** after the report while revenue trends stay in focus.',
        caption: 'One-month price action.',
      },
      {
        ticker: 'AMD',
        name: 'Advanced Micro Devices',
      },
    )

    expect(normalized.headline).toBe('Momentum Stays Intact After Earnings')
    expect(normalized.body).toContain('AMD shares')
  })

  it('falls back to the ticker when the company name is too long for a clean heading prefix', () => {
    const normalized = ensureStockMentionInCopy(
      {
        headline: 'Catalyst Sparks Breakout After Month of Momentum',
        body: 'Shares add **9.40%** as volume expands and the chart clears resistance.',
        caption: 'One-month price action.',
      },
      {
        ticker: 'AMD',
        name: 'Advanced Micro Devices',
      },
    )

    expect(normalized.headline).toBe('AMD: Catalyst Sparks Breakout After Month of Momentum')
  })
})
