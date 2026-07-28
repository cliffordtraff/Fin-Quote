import { afterEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import InsiderTradesTable from '@/components/InsiderTradesTable'
import type { InsiderTrade } from '@/app/actions/insider-trading'

const originalTimeZone = process.env.TZ

afterEach(() => {
  process.env.TZ = originalTimeZone
})

describe('InsiderTradesTable', () => {
  it('renders date-only transaction dates identically across server time zones', () => {
    const trades: InsiderTrade[] = [{
      symbol: 'FINS',
      filingDate: '2026-07-10',
      transactionDate: '2026-07-10',
      reportingName: 'MetLife Investment Management, LLC',
      typeOfOwner: '10% Owner',
      transactionType: 'P',
      securitiesTransacted: 40_000_000,
      price: 1,
      securitiesOwned: 40_000_000,
      securityName: '5.364% Series C Senior Unsecured Notes due July 8, 2030',
      link: '',
      acquistionOrDisposition: 'A',
      formType: '4',
      value: 40_000_000,
      insiderId: null,
    }]

    process.env.TZ = 'UTC'
    const utcMarkup = renderToStaticMarkup(<InsiderTradesTable trades={trades} />)

    process.env.TZ = 'America/New_York'
    const easternMarkup = renderToStaticMarkup(<InsiderTradesTable trades={trades} />)

    expect(easternMarkup).toBe(utcMarkup)
    expect(easternMarkup).toContain('Jul 10, 26')
    expect(easternMarkup).toContain('$40.0M')
  })
})
