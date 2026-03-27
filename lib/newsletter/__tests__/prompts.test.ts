import { describe, expect, it } from 'vitest'

import {
  buildMarketRoundupMessages,
  buildMarketRoundupStockSelectionMessages,
  buildStockPickerMessages,
  buildCopyGenerationMessages,
  buildTemplateSelectionMessages,
  parseMarketRoundupStockSelections,
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

describe('prompt steering', () => {
  it('includes a user brief in the stock picker prompt when provided', () => {
    const messages = buildStockPickerMessages(
      {
        candidates: [
          {
            symbol: 'NVDA',
            name: 'NVIDIA Corporation',
            price: 900,
            change: 30,
            changesPercentage: 3.45,
          },
        ],
        newsBySymbol: {
          NVDA: [
            {
              title: 'NVIDIA extends AI server leadership',
              text: '',
              url: 'https://example.com',
              publishedDate: '2026-03-27',
              site: 'Example',
            },
          ],
        },
      },
      'Focus on AI infrastructure winners.',
    )

    expect(messages[0]?.content).toContain('If a user brief is provided, prioritize candidates that clearly match it')
    expect(messages[1]?.content).toContain('=== USER BRIEF ===')
    expect(messages[1]?.content).toContain('Focus on AI infrastructure winners.')
  })

  it('includes a user brief in template selection and roundup intro prompts', () => {
    const selectionMessages = buildTemplateSelectionMessages(
      {
        ticker: 'AMD',
        financials: [],
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
      },
      1,
      {
        mode: 'market_roundup',
        generationPrompt: 'Focus on semiconductor weakness after earnings.',
      },
    )

    const roundupMessages = buildMarketRoundupMessages(
      [
        {
          ticker: 'AMD',
          name: 'Advanced Micro Devices',
          changesPercentage: -7.5,
          editorialHook: 'AMD fell after a guidance reset.',
          topHeadlines: [],
        },
      ],
      'Focus on semiconductor weakness after earnings.',
    )

    expect(selectionMessages[1]?.content).toContain('=== User Brief ===')
    expect(selectionMessages[1]?.content).toContain('Focus on semiconductor weakness after earnings.')
    expect(roundupMessages[1]?.content).toContain('=== USER BRIEF ===')
    expect(roundupMessages[1]?.content).toContain('Focus on semiconductor weakness after earnings.')
  })

  it('parses roundup stock selections and filters invalid symbols', () => {
    const selections = parseMarketRoundupStockSelections(
      JSON.stringify({
        selections: [
          { symbol: 'AMD', reason: 'Fits the semiconductor theme.' },
          { symbol: 'MU', reason: 'Also fits the semiconductor theme.' },
          { symbol: 'INVALID', reason: 'Should be ignored.' },
        ],
      }),
      {
        candidates: [
          { symbol: 'AMD', name: 'AMD', price: 100, change: -5, changesPercentage: -4.7 },
          { symbol: 'MU', name: 'Micron', price: 90, change: -4, changesPercentage: -4.1 },
        ],
        newsBySymbol: {},
      },
      4,
    )

    expect(selections).toEqual(['AMD', 'MU'])
  })

  it('builds an AI roundup stock-selection prompt from the user brief', () => {
    const messages = buildMarketRoundupStockSelectionMessages(
      {
        candidates: [
          { symbol: 'AMD', name: 'AMD', price: 100, change: -5, changesPercentage: -4.7 },
          { symbol: 'MU', name: 'Micron', price: 90, change: -4, changesPercentage: -4.1 },
        ],
        newsBySymbol: {},
      },
      3,
      'Focus on semiconductors.',
    )

    expect(messages[0]?.content).toContain('Pick 3 stocks for a market roundup newsletter.')
    expect(messages[1]?.content).toContain('=== USER BRIEF ===')
    expect(messages[1]?.content).toContain('Focus on semiconductors.')
  })
})
