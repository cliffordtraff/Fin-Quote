import { describe, expect, it } from 'vitest'
import {
  buildNewsletterEditorialShortlistEntries,
  buildNewsletterEditorialShortlistPresentation,
  NewsletterEditorialShortlistValidationError,
} from '../editorial-shortlist'
import type {
  NewsletterDailyRun,
  NewsletterDailyRunItem,
} from '../daily-types'

function item(
  rank: number,
  overrides: Partial<NewsletterDailyRunItem> = {},
): NewsletterDailyRunItem {
  return {
    id: `item-${rank}`,
    runId: 'run-1',
    rank,
    ticker: `T${rank}`,
    status: 'ready',
    qualityBand: 'strong',
    relevanceScore: 100 - rank,
    confidenceScore: 90 - rank,
    candidateType: 'stock',
    stateLabel: 'cash',
    movePercent: rank,
    reasonType: 'earnings',
    headline: `Story ${rank}`,
    summaryText: `Summary ${rank}`,
    keyFact: null,
    sourceRefs: [
      { kind: 'news', label: `News ${rank}` },
      { kind: 'filing', label: `Filing ${rank}` },
      { kind: 'news', label: `Duplicate kind ${rank}` },
    ],
    candidateMetadata: {},
    draftId: `draft-${rank}`,
    draftStatus: 'ready',
    chartId: `chart-${rank}`,
    chartImageUrl: `https://assets.example/${rank}.png`,
    subjectLine: `Subject ${rank}`,
    beehiivDelivery: null,
    errorMessage: null,
    retryCount: 0,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    ...overrides,
  }
}

function run(items = [1, 2, 3, 4, 5, 6].map((rank) => item(rank))): NewsletterDailyRun {
  return {
    id: 'run-1',
    marketDate: '2026-08-08',
    edition: 'morning',
    status: 'completed',
    targetCount: 40,
    sourceWiimRunId: 'wiim-1',
    sourceGeneratedAt: '2026-08-08T09:00:00.000Z',
    selectedCount: items.length,
    generatedCount: items.length,
    readyCount: items.length,
    attentionCount: 0,
    failedCount: 0,
    errorMessage: null,
    metadata: {},
    startedAt: '2026-08-08T09:00:00.000Z',
    completedAt: '2026-08-08T10:00:00.000Z',
    createdAt: '2026-08-08T09:00:00.000Z',
    updatedAt: '2026-08-08T10:00:00.000Z',
    items,
  }
}

describe('newsletter editorial shortlist revisions', () => {
  it('records an accepted algorithm suggestion as retained immutable evidence', () => {
    const dailyRun = run()
    const entries = buildNewsletterEditorialShortlistEntries({
      run: dailyRun,
      presentation: buildNewsletterEditorialShortlistPresentation(dailyRun),
      selectedItemIds: ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'],
    })

    expect(entries).toHaveLength(5)
    expect(entries.map((entry) => entry.decision)).toEqual([
      'retained',
      'retained',
      'retained',
      'retained',
      'retained',
    ])
    expect(entries[0]).toMatchObject({
      itemId: 'item-1',
      baselinePosition: 1,
      selectedPosition: 1,
      reasonCode: null,
      evidence: {
        itemId: 'item-1',
        runId: 'run-1',
        ticker: 'T1',
        rank: 1,
        sourceKinds: ['filing', 'news'],
      },
    })
  })

  it('does not mislabel natural position shifts after a removal as promotions', () => {
    const dailyRun = run()
    const entries = buildNewsletterEditorialShortlistEntries({
      run: dailyRun,
      presentation: buildNewsletterEditorialShortlistPresentation(dailyRun),
      selectedItemIds: ['item-2', 'item-3', 'item-4', 'item-5'],
      intents: [{
        itemId: 'item-1',
        kind: 'removed',
        reasonCode: 'weak_evidence',
        note: '  Evidence was too thin  ',
      }],
    })

    expect(entries[0]).toMatchObject({
      itemId: 'item-1',
      decision: 'removed',
      selectedPosition: null,
      reasonCode: 'weak_evidence',
      note: 'Evidence was too thin',
    })
    expect(entries.slice(1).map((entry) => ({
      itemId: entry.itemId,
      decision: entry.decision,
      selectedPosition: entry.selectedPosition,
    }))).toEqual([
      { itemId: 'item-2', decision: 'retained', selectedPosition: 1 },
      { itemId: 'item-3', decision: 'retained', selectedPosition: 2 },
      { itemId: 'item-4', decision: 'retained', selectedPosition: 3 },
      { itemId: 'item-5', decision: 'retained', selectedPosition: 4 },
    ])

    expect(() => buildNewsletterEditorialShortlistEntries({
      run: dailyRun,
      presentation: buildNewsletterEditorialShortlistPresentation(dailyRun),
      selectedItemIds: ['item-2', 'item-3', 'item-4', 'item-5'],
      intents: [
        {
          itemId: 'item-1',
          kind: 'removed',
          reasonCode: 'weak_evidence',
        },
        {
          itemId: 'item-2',
          kind: 'moved',
          reasonCode: 'audience_fit',
        },
      ],
    })).toThrow(/did not change position/)
  })

  it('classifies true relative reordering and a human-added issue', () => {
    const dailyRun = run()
    const entries = buildNewsletterEditorialShortlistEntries({
      run: dailyRun,
      presentation: buildNewsletterEditorialShortlistPresentation(dailyRun),
      selectedItemIds: ['item-2', 'item-1', 'item-3', 'item-4', 'item-6'],
      intents: [
        { itemId: 'item-2', kind: 'moved', reasonCode: 'stronger_catalyst' },
        { itemId: 'item-5', kind: 'removed', reasonCode: 'duplicate_coverage' },
        { itemId: 'item-6', kind: 'added', reasonCode: 'fresh_earnings' },
      ],
    })

    expect(entries.map((entry) => [entry.itemId, entry.decision])).toEqual([
      ['item-1', 'retained'],
      ['item-2', 'promoted'],
      ['item-3', 'retained'],
      ['item-4', 'retained'],
      ['item-5', 'removed'],
      ['item-6', 'added'],
    ])
  })

  it('records one explicit move without fabricating reasons for displaced rows', () => {
    const dailyRun = run()
    const entries = buildNewsletterEditorialShortlistEntries({
      run: dailyRun,
      presentation: buildNewsletterEditorialShortlistPresentation(dailyRun),
      selectedItemIds: ['item-2', 'item-3', 'item-4', 'item-5', 'item-1'],
      intents: [{
        itemId: 'item-1',
        kind: 'moved',
        reasonCode: 'audience_fit',
      }],
    })

    expect(entries.map((entry) => [entry.itemId, entry.decision])).toEqual([
      ['item-1', 'demoted'],
      ['item-2', 'retained'],
      ['item-3', 'retained'],
      ['item-4', 'retained'],
      ['item-5', 'retained'],
    ])
  })

  it('requires explicit intent and structured reasons for every true override', () => {
    const dailyRun = run()
    expect(() => buildNewsletterEditorialShortlistEntries({
      run: dailyRun,
      presentation: buildNewsletterEditorialShortlistPresentation(dailyRun),
      selectedItemIds: ['item-2', 'item-1', 'item-3', 'item-4', 'item-5'],
    })).toThrowError(
      new NewsletterEditorialShortlistValidationError(
        'Every direct reorder must identify the item the editor intentionally moved',
      ),
    )

    expect(() => buildNewsletterEditorialShortlistEntries({
      run: dailyRun,
      presentation: buildNewsletterEditorialShortlistPresentation(dailyRun),
      selectedItemIds: ['item-1', 'item-2', 'item-3', 'item-4'],
      intents: [{
        itemId: 'item-5',
        kind: 'removed',
        reasonCode: 'other',
      }],
    })).toThrow(/Add a note/)
  })

  it('rejects duplicates, oversized selections, and non-actionable issues', () => {
    const dailyRun = run()
    expect(() => buildNewsletterEditorialShortlistEntries({
      run: dailyRun,
      presentation: buildNewsletterEditorialShortlistPresentation(dailyRun),
      selectedItemIds: ['item-1', 'item-1'],
    })).toThrow(/must be unique/)

    expect(() => buildNewsletterEditorialShortlistEntries({
      run: dailyRun,
      presentation: buildNewsletterEditorialShortlistPresentation(dailyRun),
      selectedItemIds: [
        'item-1',
        'item-2',
        'item-3',
        'item-4',
        'item-5',
        'item-6',
      ],
    })).toThrow(/at most 5/)

    const failedRun = run([item(1, { status: 'failed', draftId: null })])
    expect(() => buildNewsletterEditorialShortlistEntries({
      run: failedRun,
      presentation: buildNewsletterEditorialShortlistPresentation(failedRun),
      selectedItemIds: ['item-1'],
      intents: [{
        itemId: 'item-1',
        kind: 'added',
        reasonCode: 'audience_fit',
      }],
    })).toThrow(/not an actionable issue/)
  })

  it('conflicts instead of silently reinterpreting a baseline that changed after presentation', () => {
    const presentedRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(presentedRun)
    const refreshedRun = run([
      item(1, { qualityBand: 'review' }),
      item(2),
      item(3),
      item(4),
      item(5),
      item(6),
    ])

    expect(() => buildNewsletterEditorialShortlistEntries({
      run: refreshedRun,
      presentation,
      selectedItemIds: presentation.baseline.itemIds,
    })).toThrow(/suggestion changed after it was presented/)
  })

  it('conflicts when a human-added item changed after it was presented', () => {
    const presentedRun = run()
    const presentation = buildNewsletterEditorialShortlistPresentation(presentedRun)
    const refreshedRun = run([
      item(1),
      item(2),
      item(3),
      item(4),
      item(5),
      item(6, { headline: 'Changed after presentation' }),
    ])

    expect(() => buildNewsletterEditorialShortlistEntries({
      run: refreshedRun,
      presentation,
      selectedItemIds: ['item-1', 'item-2', 'item-3', 'item-4', 'item-6'],
      intents: [
        { itemId: 'item-5', kind: 'removed', reasonCode: 'weak_evidence' },
        { itemId: 'item-6', kind: 'added', reasonCode: 'fresh_earnings' },
      ],
    })).toThrow(/Shortlist evidence changed after it was presented/)
  })
})
