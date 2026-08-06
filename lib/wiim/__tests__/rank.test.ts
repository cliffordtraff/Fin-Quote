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
  it('does not use an unrelated similarly named product as the company headline', () => {
    const ranked = rankWiimCandidates([
      candidate({
        symbol: 'MTCH',
        name: 'Match Group, Inc.',
        changesPercentage: -4.2,
        news: [
          {
            title: 'Huya launches Triple Match 3D mobile game worldwide',
            text: 'The title is a new puzzle game from Huya.',
            url: 'https://example.com/huya',
            publishedDate: '2026-08-06',
            site: 'Example',
          },
          {
            title: 'Match Group reports second-quarter earnings',
            text: 'Match Group discussed Tinder trends and its outlook.',
            url: 'https://example.com/mtch',
            publishedDate: '2026-08-06',
            site: 'Example',
          },
        ],
      }),
    ])

    expect(ranked[0]?.headline).toBe(
      'Match Group reports second-quarter earnings',
    )
    expect(ranked[0]?.sourceRefs.map((source) => source.url)).not.toContain(
      'https://example.com/huya',
    )
    expect(ranked[0]?.signals.newsCount).toBe(1)
    expect(
      (ranked[0]?.metadata.topNews as Array<{ url: string }>).map(
        (article) => article.url,
      ),
    ).toEqual(['https://example.com/mtch'])
  })

  it('does not read the word up from the end of Match Group', () => {
    const ranked = rankWiimCandidates([
      candidate({
        symbol: 'MTCH',
        name: 'Match Group, Inc.',
        changesPercentage: -4.33,
        whyMoving: {
          symbol: 'MTCH',
          status: 'found',
          displayText: 'Match Group lifts its outlook after quarterly results',
          headline: 'Match Group lifts outlook after quarterly results',
          summary: null,
          bulletPoints: [],
          sentiment: 'positive',
          source: 'finviz',
          sourceTimestamp: '2026-08-06T14:00:00Z',
          isCatalyst: true,
          sourceUrl: 'https://finviz.com/quote.ashx?t=MTCH',
          fetchedAt: new Date().toISOString(),
          errorMessage: null,
        },
      }),
    ])

    expect(ranked[0]?.headline).toBe(
      'Match Group lifts outlook after quarterly results',
    )
  })

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
          { title: 'Analysts lift NVIDIA AI estimates', text: '', url: '', publishedDate: '', site: '' },
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
