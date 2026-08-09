import { describe, expect, it } from 'vitest'
import {
  buildCatalystCalendarModel,
  earningsTimestamp,
  getCatalystWeek,
  newYorkDateKey,
  parseNewYorkTimestamp,
} from '@/lib/catalyst-calendar'

const readyFeeds = {
  economic: { status: 'ready', totalCount: 1, truncated: false },
  earnings: { status: 'ready', totalCount: 1, truncated: false },
} as const
const emptyFeeds = {
  economic: { status: 'empty', totalCount: 0, truncated: false },
  earnings: { status: 'empty', totalCount: 0, truncated: false },
} as const

describe('catalyst calendar date contracts', () => {
  it('uses the current New York week on weekdays and the upcoming week on weekends', () => {
    expect(getCatalystWeek('2026-08-05T16:00:00Z')).toMatchObject({
      fromDate: '2026-08-03',
      businessToDate: '2026-08-07',
      toDate: '2026-08-09',
    })
    expect(getCatalystWeek('2026-08-09T16:00:00Z')).toMatchObject({
      fromDate: '2026-08-10',
      businessToDate: '2026-08-14',
      toDate: '2026-08-16',
    })
  })

  it('converts New York wall times with the correct winter and summer offsets', () => {
    expect(new Date(parseNewYorkTimestamp('2026-01-15 08:30:00')).toISOString())
      .toBe('2026-01-15T13:30:00.000Z')
    expect(new Date(parseNewYorkTimestamp('2026-07-15 08:30:00')).toISOString())
      .toBe('2026-07-15T12:30:00.000Z')
    expect(new Date(earningsTimestamp('2026-01-15', 'amc')).toISOString())
      .toBe('2026-01-15T21:00:00.000Z')
    expect(newYorkDateKey(parseNewYorkTimestamp('2026-07-15T12:30:00Z')))
      .toBe('2026-07-15')
  })
})

describe('buildCatalystCalendarModel', () => {
  it('orders mixed catalysts chronologically with stable earnings sessions', () => {
    const model = buildCatalystCalendarModel({
      referenceTime: '2026-08-03T11:00:00Z',
      feeds: readyFeeds,
      economicEvents: [{
        date: '2026-08-03 08:30:00',
        country: 'US',
        event: 'Jobs report',
        currency: 'USD',
        previous: 1,
        estimate: 2,
        actual: null,
        impact: 'High',
        unit: '%',
      }],
      earnings: [
        { symbol: 'AMC', name: 'After', date: '2026-08-03', time: 'amc', eps: null, epsEstimated: null, revenue: null, revenueEstimated: null },
        { symbol: 'DMH', name: 'During', date: '2026-08-03', time: 'dmh', eps: null, epsEstimated: null, revenue: null, revenueEstimated: null },
        { symbol: 'BMO', name: 'Before', date: '2026-08-03', time: 'bmo', eps: null, epsEstimated: null, revenue: null, revenueEstimated: null },
      ],
    })

    expect(model.items.map((item) => item.title)).toEqual([
      'BMO · Before',
      'Jobs report',
      'DMH · During',
      'AMC · After',
    ])
  })

  it('selects the first day with a genuinely upcoming item', () => {
    const model = buildCatalystCalendarModel({
      referenceTime: '2026-08-03T18:00:00Z',
      feeds: readyFeeds,
      economicEvents: [{
        date: '2026-08-03 08:30:00',
        country: 'US',
        event: 'Already released',
        currency: 'USD',
        previous: null,
        estimate: null,
        actual: 1,
        impact: 'High',
        unit: '',
      }],
      earnings: [{
        symbol: 'AAPL',
        name: 'Apple',
        date: '2026-08-04',
        time: 'bmo',
        eps: null,
        epsEstimated: null,
        revenue: null,
        revenueEstimated: null,
      }],
    })

    expect(model.initialDay).toBe('2026-08-04')
  })

  it('deduplicates provider repeats and produces IDs independent of input order', () => {
    const event = {
      date: '2026-08-04 08:30:00',
      country: 'US',
      event: 'Trade balance',
      currency: 'USD',
      previous: null,
      estimate: null,
      actual: null,
      impact: 'Medium',
      unit: 'B',
    }
    const earning = {
      symbol: 'AAPL',
      name: 'Apple',
      date: '2026-08-05',
      time: 'amc' as const,
      eps: null,
      epsEstimated: null,
      revenue: null,
      revenueEstimated: null,
    }

    const first = buildCatalystCalendarModel({
      referenceTime: '2026-08-03T12:00:00Z',
      feeds: emptyFeeds,
      economicEvents: [event, event],
      earnings: [earning, earning],
    })
    const second = buildCatalystCalendarModel({
      referenceTime: '2026-08-03T12:00:00Z',
      feeds: emptyFeeds,
      economicEvents: [event],
      earnings: [earning],
    })

    expect(first.items).toHaveLength(2)
    expect(first.items.map((item) => item.id)).toEqual(second.items.map((item) => item.id))
  })

  it('drops out-of-week rows and retains independent feed status', () => {
    const model = buildCatalystCalendarModel({
      referenceTime: '2026-08-03T12:00:00Z',
      feeds: {
        economic: { status: 'unavailable', totalCount: 0, truncated: false },
        earnings: { status: 'empty', totalCount: 0, truncated: false },
      },
      economicEvents: [],
      earnings: [{
        symbol: 'AAPL',
        name: 'Apple',
        date: '2026-08-17',
        time: null,
        eps: null,
        epsEstimated: null,
        revenue: null,
        revenueEstimated: null,
      }],
    })

    expect(model.items).toEqual([])
    expect(model.feeds).toEqual({
      economic: { status: 'unavailable', totalCount: 0, truncated: false },
      earnings: { status: 'empty', totalCount: 0, truncated: false },
    })
  })
})
