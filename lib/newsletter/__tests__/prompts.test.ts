import { describe, expect, it } from 'vitest'

import {
  buildCopyGenerationMessages,
  parseTemplateSelections,
} from '@/lib/newsletter/prompts'

describe('parseTemplateSelections', () => {
  it('keeps supported quarterly period selections for fundamentals templates', () => {
    const selections = parseTemplateSelections(
      JSON.stringify({
        selections: [
          {
            templateId: 'net_income_vs_free_cash_flow',
            periodType: 'quarterly',
            reason: 'Recent earnings quality is the clearest angle.',
          },
        ],
      }),
      3,
    )

    expect(selections).toEqual([
      {
        templateId: 'net_income_vs_free_cash_flow',
        periodType: 'quarterly',
        reason: 'Recent earnings quality is the clearest angle.',
      },
    ])
  })

  it('falls back to the template default period when the response omits or mangles it', () => {
    const selections = parseTemplateSelections(
      JSON.stringify({
        selections: [
          {
            templateId: 'gross_vs_operating_margin',
            periodType: 'monthly',
            reason: 'Margin structure is still the story.',
          },
        ],
      }),
      3,
    )

    expect(selections).toEqual([
      {
        templateId: 'gross_vs_operating_margin',
        periodType: 'annual',
        reason: 'Margin structure is still the story.',
      },
    ])
  })

  it('does not force a period onto price templates', () => {
    const selections = parseTemplateSelections(
      JSON.stringify({
        selections: [
          {
            templateId: 'price_reaction_1m',
            periodType: 'quarterly',
            reason: 'The recent tape action is the clearest visual story.',
          },
        ],
      }),
      3,
    )

    expect(selections).toEqual([
      {
        templateId: 'price_reaction_1m',
        reason: 'The recent tape action is the clearest visual story.',
      },
    ])
  })
})

describe('buildCopyGenerationMessages', () => {
  it('tells the model not to treat null metrics as zero', () => {
    const messages = buildCopyGenerationMessages(
      {
        ticker: 'TSLA',
        financials: [
          {
            year: 2024,
            periodLabel: 'FY2024',
            revenue: 100,
            netIncome: 10,
            grossMargin: 30,
            operatingMargin: 20,
            freeCashFlow: 7,
            eps: 1.5,
          },
          {
            year: 2025,
            periodLabel: 'FY2025',
            revenue: 110,
            netIncome: 11,
            grossMargin: 31,
            operatingMargin: 19,
            freeCashFlow: null,
            eps: 1.6,
          },
        ],
        quarterlyFinancials: [],
        highlights: {
          revenueGrowthYoY: 10,
          netIncomeGrowthYoY: 10,
          grossMarginLatest: 31,
          operatingMarginLatest: 19,
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
      },
      'net_income_vs_free_cash_flow',
      'Net Income vs Free Cash Flow',
      'Cash conversion is the story.',
      {
        stocks: ['TSLA'],
        metrics: ['net_income', 'free_cash_flow'],
        title: 'TSLA Net Income vs Free Cash Flow',
        chartType: 'bar',
        periodType: 'annual',
      },
    )

    expect(messages[0]?.content).toContain(
      'If a value is null or missing, treat it as unavailable. Never rewrite null as 0, $0, or 0%.',
    )
    expect(messages[1]?.content).toContain('"freeCashFlow": null')
  })
})
