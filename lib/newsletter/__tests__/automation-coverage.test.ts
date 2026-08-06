import { describe, expect, it } from 'vitest'
import {
  classifySummaryCoverage,
  createFinvizAttemptCheckpointer,
  getDailyAutomationFinalStatus,
  getFinvizCoverageState,
  getMidMorningAutomationFinalStatus,
} from '../automation-coverage'

describe('newsletter automation coverage semantics', () => {
  it('retries Finviz error rows while found and not_found are terminal', () => {
    const coverage = new Map([
      ['AAPL', { status: 'found' }],
      ['MSFT', { status: 'not_found' }],
      ['NVDA', { status: 'error' }],
    ])
    const state = getFinvizCoverageState(
      ['AAPL', 'MSFT', 'NVDA'],
      coverage,
      { AAPL: 1, MSFT: 1, NVDA: 1 },
      2,
    )

    expect(state.terminalSymbols).toEqual(new Set(['AAPL', 'MSFT']))
    expect(state.retryableSymbols).toEqual(['NVDA'])
    expect(state.exhaustedSymbols).toEqual([])
    expect(state.completedCount).toBe(2)
    expect(state.done).toBe(false)
  })

  it('counts an exhausted Finviz error once and then permits progression', () => {
    const state = getFinvizCoverageState(
      ['NVDA'],
      new Map([['NVDA', { status: 'error' }]]),
      { NVDA: 2 },
      2,
    )

    expect(state.retryableSymbols).toEqual([])
    expect(state.exhaustedSymbols).toEqual(['NVDA'])
    expect(state.errorSymbols).toEqual(['NVDA'])
    expect(state.completedCount).toBe(1)
    expect(state.done).toBe(true)
  })

  it('durably checkpoints every dispatched Finviz attempt in order', async () => {
    const attempts: Record<string, number> = {}
    const snapshots: Array<Record<string, number>> = []
    const persist = async (snapshot: Record<string, number>) => {
      snapshots.push(snapshot)
    }
    const checkpoint = createFinvizAttemptCheckpointer(attempts, persist)
    const controller = new AbortController()

    controller.abort(new Error('stage budget elapsed'))
    await Promise.all([checkpoint('AAPL'), checkpoint('MSFT')])

    expect(attempts).toEqual({ AAPL: 1, MSFT: 1 })
    expect(snapshots).toEqual([{ AAPL: 1 }, { AAPL: 1, MSFT: 1 }])
  })

  it('never counts blank or validation-rejected summaries as generated', () => {
    const coverage = classifySummaryCoverage([
      { symbol: 'AAPL', summary_text: 'A real summary', no_summary_reason: null },
      { symbol: 'MSFT', summary_text: '   ', no_summary_reason: null },
      {
        symbol: 'NVDA',
        summary_text: null,
        no_summary_reason: 'validation_rejected',
      },
      {
        symbol: 'META',
        summary_text: null,
        no_summary_reason: 'no_qualifying_event',
      },
    ])

    expect(coverage.generatedSymbols).toEqual(new Set(['AAPL']))
    expect(coverage.validationRejectedSymbols).toEqual(new Set(['NVDA']))
    expect(coverage.noResultSymbols).toEqual(new Set(['MSFT', 'META']))
    expect(coverage.completedSymbols).toEqual(
      new Set(['AAPL', 'MSFT', 'META']),
    )
  })
})

describe('newsletter automation final quality gates', () => {
  it('marks a clean daily report complete and upstream errors partial', () => {
    const clean = {
      selectedCount: 5,
      readyCount: 5,
      attentionCount: 0,
      failedCount: 0,
      finvizErrorCount: 0,
      summaryErrorCount: 0,
    }

    expect(getDailyAutomationFinalStatus(clean)).toBe('completed')
    expect(
      getDailyAutomationFinalStatus({ ...clean, finvizErrorCount: 1 }),
    ).toBe('partial')
    expect(
      getDailyAutomationFinalStatus({ ...clean, summaryErrorCount: 1 }),
    ).toBe('partial')
  })

  it('fails a daily report with no usable ready issue', () => {
    expect(
      getDailyAutomationFinalStatus({
        selectedCount: 5,
        readyCount: 0,
        attentionCount: 5,
        failedCount: 0,
        finvizErrorCount: 0,
        summaryErrorCount: 5,
      }),
    ).toBe('failed')
  })

  it('cannot report a false 5/5 mid-morning success', () => {
    expect(
      getMidMorningAutomationFinalStatus({
        targetCount: 5,
        generatedCount: 0,
        finvizErrorCount: 0,
        summaryErrorCount: 5,
      }),
    ).toBe('failed')
    expect(
      getMidMorningAutomationFinalStatus({
        targetCount: 5,
        generatedCount: 4,
        finvizErrorCount: 0,
        summaryErrorCount: 0,
      }),
    ).toBe('partial')
  })

  it('marks mid-morning complete only with all summaries and no upstream errors', () => {
    const clean = {
      targetCount: 5,
      generatedCount: 5,
      finvizErrorCount: 0,
      summaryErrorCount: 0,
    }

    expect(getMidMorningAutomationFinalStatus(clean)).toBe('completed')
    expect(
      getMidMorningAutomationFinalStatus({ ...clean, finvizErrorCount: 1 }),
    ).toBe('partial')
  })
})
