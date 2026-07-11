import { describe, expect, it } from 'vitest'

import { rankWiimCandidates, summarizeWiimRun } from '@/lib/wiim/rank'
import type { WiimCandidateInput } from '@/lib/wiim/types'

function candidate(overrides: Partial<WiimCandidateInput>): WiimCandidateInput {
  return {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 200,
    change: 1,
    changesPercentage: 1,
    news: [],
    whyMoving: null,
    ...overrides,
  }
}

describe('rankWiimCandidates', () => {
  it('does not rank non-S&P 500 candidates even when they reach the ranker', () => {
    const ranked = rankWiimCandidates([
      candidate({
        symbol: 'ZZZZ',
        name: 'Not a constituent',
        changesPercentage: 20,
        news: [{ title: 'Tiny company surges', text: '', url: '', publishedDate: '', site: '' }],
      }),
      candidate({
        symbol: 'MSFT',
        name: 'Microsoft',
        changesPercentage: 3,
        news: [{ title: 'Microsoft gains on AI demand', text: '', url: '', publishedDate: '', site: '' }],
      }),
    ])

    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.ticker).toBe('MSFT')
  })

  it('normalizes S&P 500 aliases before ranking', () => {
    const ranked = rankWiimCandidates([
      candidate({
        symbol: 'BRK-B',
        name: 'Berkshire Hathaway',
        changesPercentage: 4,
      }),
    ])

    expect(ranked[0]?.ticker).toBe('BRK.B')
  })
})

describe('summarizeWiimRun', () => {
  it('chooses a differentiated contrarian candidate instead of duplicating the top pick', () => {
    const topFive = rankWiimCandidates([
      candidate({
        symbol: 'NVDA',
        name: 'NVIDIA',
        changesPercentage: 8,
        news: [
          { title: 'NVIDIA extends rally', text: '', url: '', publishedDate: '', site: '' },
          { title: 'Analysts lift AI estimates', text: '', url: '', publishedDate: '', site: '' },
        ],
      }),
      candidate({
        symbol: 'UNH',
        name: 'UnitedHealth',
        changesPercentage: -4,
        news: [{ title: 'UnitedHealth falls despite valuation reset', text: '', url: '', publishedDate: '', site: '' }],
        whyMoving: {
          symbol: 'UNH',
          status: 'found',
          displayText: 'Shares fall as investors weigh guidance reset',
          headline: 'UnitedHealth falls on guidance concerns',
          summary: null,
          bulletPoints: [],
          sentiment: 'negative',
          source: 'finviz',
          sourceTimestamp: null,
          isCatalyst: true,
          sourceUrl: 'https://finviz.com/quote.ashx?t=UNH',
          fetchedAt: new Date().toISOString(),
          errorMessage: null,
        },
      }),
    ])

    const summary = summarizeWiimRun({
      runType: 'morning',
      generatedAt: '2026-06-01T12:00:00.000Z',
      candidateCount: topFive.length,
      topFive,
    })

    expect(summary.topCandidate).toBe('NVDA')
    expect(summary.bestContrarianCandidate).toBe('UNH')
  })
})
