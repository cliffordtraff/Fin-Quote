import { describe, expect, it } from 'vitest'

import { buildFinancialPoints } from '@/lib/newsletter/fetch-context'

describe('buildFinancialPoints', () => {
  it('preserves missing free cash flow values as null instead of coercing them to zero', () => {
    const points = buildFinancialPoints(
      [
        {
          year: 2024,
          revenue: 100,
          gross_profit: 30,
          net_income: 10,
          operating_income: 20,
          eps: 1.5,
        },
        {
          year: 2025,
          revenue: 110,
          gross_profit: 33,
          net_income: 11,
          operating_income: 22,
          eps: 1.7,
        },
      ],
      new Map([['2024-FY', 7]]),
      'annual',
    )

    expect(points[0]?.freeCashFlow).toBe(7)
    expect(points[1]?.freeCashFlow).toBeNull()
  })
})
