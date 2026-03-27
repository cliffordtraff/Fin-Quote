import { describe, expect, it } from 'vitest'

import { resolveEditorialChart } from '@/lib/newsletter/resolve-chart'

describe('resolveEditorialChart', () => {
  it('supports quarterly fundamentals templates with shorter quarterly windows', () => {
    const currentYear = new Date().getFullYear()
    const resolved = resolveEditorialChart('revenue_vs_net_income', {
      ticker: 'AAPL',
      periodType: 'quarterly',
    })

    expect('stocks' in resolved.spec).toBe(true)
    if (!('stocks' in resolved.spec)) {
      throw new Error('Expected fundamentals newsletter chart spec')
    }

    expect(resolved.spec.stocks).toEqual(['AAPL'])
    expect(resolved.spec.periodType).toBe('quarterly')
    expect(resolved.spec.minYear).toBe(currentYear - 2)
    expect(resolved.spec.maxYear).toBe(currentYear)
    expect(resolved.spec.subtitle).toContain('Quarterly')
  })

  it('uses provided stock arrays for fundamentals specs', () => {
    const resolved = resolveEditorialChart('gross_vs_operating_margin', {
      stocks: ['NVDA', 'AMD'],
      periodType: 'annual',
    })

    if (!('stocks' in resolved.spec)) {
      throw new Error('Expected fundamentals newsletter chart spec')
    }

    expect(resolved.spec.stocks).toEqual(['NVDA', 'AMD'])
    expect(resolved.spec.periodType).toBe('annual')
  })
})
