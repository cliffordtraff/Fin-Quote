import { describe, expect, it } from 'vitest'

import { EDITORIAL_TEMPLATES, getEditorialTemplate } from '@/lib/newsletter/editorial-templates'
import {
  pickFundamentalsYearRange,
  pickRankedTemplates,
  rankTemplates,
} from '@/lib/newsletter/template-scoring'
import type {
  FundamentalsEditorialChartTemplate,
  NewsletterContext,
  NewsletterFinancialPoint,
} from '@/lib/newsletter/types'

function annualPoint(
  year: number,
  overrides: Partial<NewsletterFinancialPoint> = {},
): NewsletterFinancialPoint {
  return {
    year,
    periodLabel: String(year),
    revenue: 100,
    netIncome: 10,
    grossMargin: 40,
    operatingMargin: 20,
    freeCashFlow: 15,
    eps: 1,
    ...overrides,
  }
}

function buildContext(
  financials: NewsletterFinancialPoint[],
  overrides: Partial<NewsletterContext> = {},
): NewsletterContext {
  return {
    ticker: 'TEST',
    financials,
    quarterlyFinancials: [],
    highlights: {
      revenueGrowthYoY: null,
      netIncomeGrowthYoY: null,
      grossMarginLatest: null,
      operatingMarginLatest: null,
      fcfLatest: null,
    },
    quarterlyHighlights: {
      revenueGrowthYoY: null,
      netIncomeGrowthYoY: null,
      grossMarginLatest: null,
      operatingMarginLatest: null,
      fcfLatest: null,
      latestPeriodLabel: null,
    },
    ...overrides,
  }
}

describe('rankTemplates', () => {
  it('ranks a sharply-rising metric above a flat one', () => {
    // Free cash flow doubles every year; revenue is dead flat.
    const financials = [2019, 2020, 2021, 2022, 2023, 2024].map((year, i) =>
      annualPoint(year, {
        revenue: 100,
        freeCashFlow: 5 * Math.pow(2, i),
      }),
    )

    const ranked = rankTemplates(EDITORIAL_TEMPLATES, buildContext(financials))
    const fcfRank = ranked.findIndex((r) => r.templateId === 'free_cash_flow_trend')
    const flatRank = ranked.findIndex((r) => r.templateId === 'revenue_growth_vs_price')

    expect(fcfRank).toBeGreaterThanOrEqual(0)
    expect(flatRank).toBeGreaterThanOrEqual(0)
    expect(fcfRank).toBeLessThan(flatRank)
  })

  it('scores price templates by the magnitude of the matching return', () => {
    const ctx = buildContext([annualPoint(2024)], {
      priceContext: {
        latestClose: 100,
        latestDate: '2024-12-31',
        return1m: 0.02,
        return3m: 0.05,
        return6m: 0.4,
        return1y: 0.1,
        high52Week: 110,
        low52Week: 70,
        distanceTo52WeekHigh: -0.09,
        distanceTo52WeekLow: 0.43,
        sma50: 95,
        sma200: 90,
        above50DaySma: true,
        above200DaySma: true,
      },
    })
    const ranked = rankTemplates(EDITORIAL_TEMPLATES, ctx)
    const sixMonth = ranked.find((r) => r.templateId === 'price_trend_6m')
    const oneMonth = ranked.find((r) => r.templateId === 'price_reaction_1m')
    expect(sixMonth?.score ?? 0).toBeGreaterThan(oneMonth?.score ?? 0)
  })
})

describe('pickRankedTemplates', () => {
  it('returns at most topK plus the minimum-keep allowances', () => {
    const financials = Array.from({ length: 8 }, (_, i) =>
      annualPoint(2017 + i, { revenue: 100 + i * 5 }),
    )
    const ctx = buildContext(financials)
    const { templates } = pickRankedTemplates(EDITORIAL_TEMPLATES, ctx, 4)
    expect(templates.length).toBeLessThanOrEqual(6)
    expect(templates.length).toBeGreaterThanOrEqual(4)
    // Both surfaces represented.
    expect(templates.some((t) => t.mode === 'price')).toBe(true)
    expect(templates.some((t) => t.mode !== 'price')).toBe(true)
  })
})

describe('pickFundamentalsYearRange', () => {
  const template = getEditorialTemplate('free_cash_flow_trend') as FundamentalsEditorialChartTemplate

  it('narrows the window to where the move is most visible', () => {
    // Flat for 8 years, then doubles in the last 3.
    const financials: NewsletterFinancialPoint[] = []
    for (let year = 2015; year <= 2024; year++) {
      const t = year - 2015
      const fcf = t < 7 ? 10 : 10 * Math.pow(2, t - 6)
      financials.push(annualPoint(year, { freeCashFlow: fcf }))
    }
    const range = pickFundamentalsYearRange(template, buildContext(financials), 'annual')
    expect(range).not.toBeNull()
    // Should prefer a window of 5 or fewer to highlight the late surge.
    expect(range!.maxYear).toBe(2024)
    expect(range!.maxYear - range!.minYear + 1).toBeLessThanOrEqual(5)
  })

  it('returns null when data is too sparse', () => {
    const financials = [annualPoint(2024, { freeCashFlow: 10 })]
    const range = pickFundamentalsYearRange(template, buildContext(financials), 'annual')
    expect(range).toBeNull()
  })

  it('respects the template hint as the upper bound for window width', () => {
    const financials: NewsletterFinancialPoint[] = []
    for (let year = 2000; year <= 2024; year++) {
      financials.push(annualPoint(year, { freeCashFlow: (year - 2000) * 2 }))
    }
    const range = pickFundamentalsYearRange(template, buildContext(financials), 'annual')
    expect(range).not.toBeNull()
    expect(range!.maxYear - range!.minYear + 1).toBeLessThanOrEqual(10)
  })
})
