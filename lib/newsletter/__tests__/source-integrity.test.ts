import { describe, expect, it } from 'vitest'
import { isNewsletterSourceEntityMatch } from '../source-integrity'
import constituents from '@/data/sp500-constituents.json'

describe('newsletter source entity integrity', () => {
  it('rejects the MTCH / Triple Match 3D false-positive regression', () => {
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'MTCH',
        companyName: 'Match Group, Inc.',
        text: 'Huya launches Triple Match 3D mobile game worldwide',
      }),
    ).toBe(false)
  })

  it('accepts a full company name, ticker, or curated company alias', () => {
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'MTCH',
        companyName: 'Match Group, Inc.',
        text: 'Match Group reports second-quarter earnings',
      }),
    ).toBe(true)
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'MTCH',
        companyName: 'Match Group, Inc.',
        text: 'MTCH cuts its full-year outlook',
      }),
    ).toBe(true)
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'MSFT',
        companyName: 'Microsoft Corporation',
        text: 'Microsoft expands Copilot availability',
      }),
    ).toBe(true)
  })

  it('rejects ordinary words that collide with short tickers or generic names', () => {
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'A',
        companyName: 'Agilent Technologies, Inc.',
        text: 'A strong quarter for Microsoft',
      }),
    ).toBe(false)
    for (const [ticker, companyName, text] of [
      ['ALL', 'The Allstate Corporation', 'ALL investors are watching rates'],
      ['ARE', 'Alexandria Real Estate Equities, Inc.', 'ARE markets overbought?'],
      ['CAT', 'Caterpillar Inc.', 'CAT videos remain popular online'],
      ['COST', 'Costco Wholesale Corporation', 'COST pressures are easing'],
      ['WELL', 'Welltower Inc.', 'WELL, inflation is slowing'],
    ]) {
      expect(
        isNewsletterSourceEntityMatch({ ticker, companyName, text }),
      ).toBe(false)
    }
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'IT',
        companyName: 'Gartner, Inc.',
        text: 'Microsoft says it will invest in cloud capacity',
      }),
    ).toBe(false)
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'AAL',
        companyName: 'American Airlines Group, Inc.',
        text: 'American consumers are spending more this summer',
      }),
    ).toBe(false)
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'A',
        companyName: 'Agilent Technologies, Inc.',
        text: 'Microsoft describes this as (a) durable strategy',
      }),
    ).toBe(false)
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'IT',
        companyName: 'Gartner, Inc.',
        text: 'Microsoft says (it) will keep investing',
      }),
    ).toBe(false)
  })

  it('accepts decorated short tickers and strong multi-word company aliases', () => {
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'A',
        companyName: 'Agilent Technologies, Inc.',
        text: 'Agilent raises its full-year outlook',
      }),
    ).toBe(true)
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'IT',
        companyName: 'Gartner, Inc.',
        text: 'Gartner (IT) reports quarterly results',
      }),
    ).toBe(true)
    expect(
      isNewsletterSourceEntityMatch({
        ticker: 'AAL',
        companyName: 'American Airlines Group, Inc.',
        text: 'American Airlines raises its capacity outlook',
      }),
    ).toBe(true)
  })

  it('does not match one active S&P company name to another ticker', () => {
    const active = constituents.filter((company) => company.is_active !== false)
    for (const expected of active) {
      for (const actual of active) {
        if (expected.symbol === actual.symbol) continue
        expect(
          isNewsletterSourceEntityMatch({
            ticker: expected.symbol,
            companyName: expected.name,
            text: actual.name,
          }),
          `${expected.symbol} must not match ${actual.symbol}: ${actual.name}`,
        ).toBe(false)
      }
    }
  }, 20_000)
})
