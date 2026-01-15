/**
 * Unit tests for TTM (Trailing Twelve Months) Calculator
 *
 * Tests the TTM calculation logic for different metric types:
 * - Sum: Flow metrics (revenue, net_income, etc.)
 * - Point-in-time: Balance sheet items (assets, equity)
 * - Average: Cycle metrics (days inventory, etc.)
 * - Not applicable: Growth rates, price-based ratios
 */

import { describe, it, expect } from 'vitest'
import {
  calculateTTM,
  calculateDerivedTTM,
  calculateMultipleTTM,
  validateTTM,
  formatTTMResult,
  QuarterlyDataPoint,
  TTMResult,
} from '../ttm-calculator'
import {
  getTTMConfig,
  supportsTTM,
  getTTMSupportedMetrics,
  getMetricsByTTMType,
} from '../ttm-config'

describe('TTM Config', () => {
  describe('getTTMConfig', () => {
    it('should return config for core sum metrics', () => {
      const config = getTTMConfig('revenue')
      expect(config).not.toBeNull()
      expect(config?.calcType).toBe('sum')
    })

    it('should return config for extended sum metrics', () => {
      const config = getTTMConfig('freeCashFlow')
      expect(config).not.toBeNull()
      expect(config?.calcType).toBe('sum')
    })

    it('should return config for point-in-time metrics', () => {
      const config = getTTMConfig('total_assets')
      expect(config).not.toBeNull()
      expect(config?.calcType).toBe('point_in_time')
    })

    it('should return config for not_applicable metrics', () => {
      const config = getTTMConfig('revenueGrowth')
      expect(config).not.toBeNull()
      expect(config?.calcType).toBe('not_applicable')
    })

    it('should return null for unknown metrics', () => {
      const config = getTTMConfig('unknownMetric123')
      expect(config).toBeNull()
    })
  })

  describe('supportsTTM', () => {
    it('should return true for sum metrics', () => {
      expect(supportsTTM('revenue')).toBe(true)
      expect(supportsTTM('net_income')).toBe(true)
      expect(supportsTTM('freeCashFlow')).toBe(true)
    })

    it('should return true for point-in-time metrics', () => {
      expect(supportsTTM('total_assets')).toBe(true)
      expect(supportsTTM('shareholders_equity')).toBe(true)
    })

    it('should return false for growth metrics', () => {
      expect(supportsTTM('revenueGrowth')).toBe(false)
      expect(supportsTTM('netIncomeGrowth')).toBe(false)
    })

    it('should return false for price-based ratios', () => {
      expect(supportsTTM('peRatio')).toBe(false)
      expect(supportsTTM('dividendYield')).toBe(false)
    })

    it('should return false for unknown metrics', () => {
      expect(supportsTTM('unknownMetric')).toBe(false)
    })
  })

  describe('getTTMSupportedMetrics', () => {
    it('should return array of supported metrics', () => {
      const metrics = getTTMSupportedMetrics()
      expect(Array.isArray(metrics)).toBe(true)
      expect(metrics.length).toBeGreaterThan(10)
      expect(metrics).toContain('revenue')
      expect(metrics).toContain('total_assets')
    })

    it('should not include growth metrics', () => {
      const metrics = getTTMSupportedMetrics()
      expect(metrics).not.toContain('revenueGrowth')
      expect(metrics).not.toContain('netIncomeGrowth')
    })
  })

  describe('getMetricsByTTMType', () => {
    it('should return sum metrics', () => {
      const sumMetrics = getMetricsByTTMType('sum')
      expect(sumMetrics).toContain('revenue')
      expect(sumMetrics).toContain('net_income')
      expect(sumMetrics).toContain('freeCashFlow')
    })

    it('should return point_in_time metrics', () => {
      const pitMetrics = getMetricsByTTMType('point_in_time')
      expect(pitMetrics).toContain('total_assets')
      expect(pitMetrics).toContain('shareholders_equity')
    })

    it('should return not_applicable metrics', () => {
      const naMetrics = getMetricsByTTMType('not_applicable')
      expect(naMetrics).toContain('revenueGrowth')
      expect(naMetrics).toContain('peRatio')
    })
  })
})

describe('TTM Calculator', () => {
  // Sample quarterly data for testing
  const sampleQuarterlyData: QuarterlyDataPoint[] = [
    { year: 2024, fiscal_quarter: 4, fiscal_label: '2024-Q4', metric_value: 100 },
    { year: 2024, fiscal_quarter: 3, fiscal_label: '2024-Q3', metric_value: 95 },
    { year: 2024, fiscal_quarter: 2, fiscal_label: '2024-Q2', metric_value: 90 },
    { year: 2024, fiscal_quarter: 1, fiscal_label: '2024-Q1', metric_value: 85 },
    { year: 2023, fiscal_quarter: 4, fiscal_label: '2023-Q4', metric_value: 80 },
  ]

  describe('calculateTTM - Sum metrics', () => {
    it('should sum last 4 quarters for revenue', () => {
      const result = calculateTTM('revenue', sampleQuarterlyData)
      expect(result.ttm_value).toBe(370) // 100 + 95 + 90 + 85
      expect(result.calculation_type).toBe('sum')
      expect(result.quarters_used).toBe(4)
      expect(result.latest_quarter).toBe('2024-Q4')
    })

    it('should handle less than 4 quarters', () => {
      const partialData = sampleQuarterlyData.slice(0, 2) // Only 2 quarters
      const result = calculateTTM('revenue', partialData)
      expect(result.ttm_value).toBe(195) // 100 + 95
      expect(result.quarters_used).toBe(2)
      expect(result.error).toContain('Only 2 quarters available')
    })

    it('should handle empty data', () => {
      const result = calculateTTM('revenue', [])
      expect(result.ttm_value).toBeNull()
      expect(result.error).toContain('No valid quarterly data')
    })
  })

  describe('calculateTTM - Point-in-time metrics', () => {
    it('should use most recent quarter for total_assets', () => {
      const result = calculateTTM('total_assets', sampleQuarterlyData)
      expect(result.ttm_value).toBe(100) // Most recent quarter
      expect(result.calculation_type).toBe('point_in_time')
      expect(result.quarters_used).toBe(4)
    })
  })

  describe('calculateTTM - Average metrics', () => {
    it('should calculate average for cycle metrics', () => {
      const result = calculateTTM('daysOfInventoryOnHand', sampleQuarterlyData)
      expect(result.ttm_value).toBe(92.5) // (100 + 95 + 90 + 85) / 4
      expect(result.calculation_type).toBe('average')
    })
  })

  describe('calculateTTM - Not applicable metrics', () => {
    it('should return error for growth metrics', () => {
      const result = calculateTTM('revenueGrowth', sampleQuarterlyData)
      expect(result.ttm_value).toBeNull()
      expect(result.calculation_type).toBe('not_applicable')
      expect(result.error).toContain('not applicable')
    })

    it('should return error for unknown metrics', () => {
      const result = calculateTTM('unknownMetric', sampleQuarterlyData)
      expect(result.ttm_value).toBeNull()
      expect(result.error).toContain('Unknown metric')
    })
  })

  describe('calculateTTM - Edge cases', () => {
    it('should handle null values in data', () => {
      const dataWithNulls: QuarterlyDataPoint[] = [
        { year: 2024, fiscal_quarter: 4, fiscal_label: '2024-Q4', metric_value: 100 },
        { year: 2024, fiscal_quarter: 3, fiscal_label: '2024-Q3', metric_value: null },
        { year: 2024, fiscal_quarter: 2, fiscal_label: '2024-Q2', metric_value: 90 },
        { year: 2024, fiscal_quarter: 1, fiscal_label: '2024-Q1', metric_value: 85 },
      ]
      const result = calculateTTM('revenue', dataWithNulls)
      // Should only use non-null values
      expect(result.ttm_value).toBe(275) // 100 + 90 + 85
      expect(result.quarters_used).toBe(3)
    })

    it('should sort data correctly regardless of input order', () => {
      const unsortedData: QuarterlyDataPoint[] = [
        { year: 2024, fiscal_quarter: 1, fiscal_label: '2024-Q1', metric_value: 85 },
        { year: 2024, fiscal_quarter: 4, fiscal_label: '2024-Q4', metric_value: 100 },
        { year: 2024, fiscal_quarter: 2, fiscal_label: '2024-Q2', metric_value: 90 },
        { year: 2024, fiscal_quarter: 3, fiscal_label: '2024-Q3', metric_value: 95 },
      ]
      const result = calculateTTM('revenue', unsortedData)
      expect(result.ttm_value).toBe(370)
      expect(result.latest_quarter).toBe('2024-Q4')
    })
  })
})

describe('calculateDerivedTTM', () => {
  it('should calculate derived ratio correctly', () => {
    const componentTTMs = {
      net_income: 100,
      shareholders_equity: 500,
    }
    const result = calculateDerivedTTM('returnOnEquity', componentTTMs, '2024-Q4')
    expect(result.ttm_value).toBe(20) // (100 / 500) * 100 = 20%
    expect(result.calculation_type).toBe('derived')
  })

  it('should handle missing numerator', () => {
    const componentTTMs = {
      shareholders_equity: 500,
    }
    const result = calculateDerivedTTM('returnOnEquity', componentTTMs, '2024-Q4')
    expect(result.ttm_value).toBeNull()
    expect(result.error).toContain('Missing numerator')
  })

  it('should handle missing denominator', () => {
    const componentTTMs = {
      net_income: 100,
    }
    const result = calculateDerivedTTM('returnOnEquity', componentTTMs, '2024-Q4')
    expect(result.ttm_value).toBeNull()
    expect(result.error).toContain('Missing denominator')
  })

  it('should handle division by zero', () => {
    const componentTTMs = {
      net_income: 100,
      shareholders_equity: 0,
    }
    const result = calculateDerivedTTM('returnOnEquity', componentTTMs, '2024-Q4')
    expect(result.ttm_value).toBeNull()
    expect(result.error).toContain('Division by zero')
  })
})

describe('validateTTM', () => {
  it('should validate matching values within tolerance', () => {
    const result = validateTTM(100, 101, 0.02) // Within 2%
    expect(result.isValid).toBe(true)
  })

  it('should fail values outside tolerance', () => {
    const result = validateTTM(100, 110, 0.02) // ~9% difference (100/110 - 1)
    expect(result.isValid).toBe(false)
    expect(result.difference).toBeCloseTo(0.0909, 3) // (110-100)/110 = 0.0909
  })

  it('should handle null values', () => {
    expect(validateTTM(null, 100).isValid).toBe(false)
    expect(validateTTM(100, null).isValid).toBe(false)
    expect(validateTTM(null, null).isValid).toBe(true)
  })

  it('should handle zero expected value', () => {
    const result = validateTTM(0.01, 0) // 0.01 vs 0 - larger difference
    expect(result.isValid).toBe(false) // Non-zero vs zero should fail
  })
})

describe('formatTTMResult', () => {
  it('should format billion values correctly', () => {
    const result: TTMResult = {
      metric_name: 'revenue',
      ttm_value: 383_000_000_000,
      calculation_type: 'sum',
      quarters_used: 4,
      latest_quarter: '2024-Q4',
    }
    const formatted = formatTTMResult(result)
    expect(formatted).toContain('$383.00B')
    expect(formatted).toContain('sum')
    expect(formatted).toContain('4Q')
  })

  it('should format million values correctly', () => {
    const result: TTMResult = {
      metric_name: 'test',
      ttm_value: 5_500_000,
      calculation_type: 'sum',
      quarters_used: 4,
      latest_quarter: '2024-Q4',
    }
    const formatted = formatTTMResult(result)
    expect(formatted).toContain('$5.50M')
  })

  it('should handle errors', () => {
    const result: TTMResult = {
      metric_name: 'test',
      ttm_value: null,
      calculation_type: 'not_applicable',
      quarters_used: 0,
      latest_quarter: '',
      error: 'Test error',
    }
    const formatted = formatTTMResult(result)
    expect(formatted).toContain('Error')
    expect(formatted).toContain('Test error')
  })
})

describe('calculateMultipleTTM', () => {
  const multiMetricData: Record<string, QuarterlyDataPoint[]> = {
    revenue: [
      { year: 2024, fiscal_quarter: 4, fiscal_label: '2024-Q4', metric_value: 100 },
      { year: 2024, fiscal_quarter: 3, fiscal_label: '2024-Q3', metric_value: 95 },
      { year: 2024, fiscal_quarter: 2, fiscal_label: '2024-Q2', metric_value: 90 },
      { year: 2024, fiscal_quarter: 1, fiscal_label: '2024-Q1', metric_value: 85 },
    ],
    net_income: [
      { year: 2024, fiscal_quarter: 4, fiscal_label: '2024-Q4', metric_value: 20 },
      { year: 2024, fiscal_quarter: 3, fiscal_label: '2024-Q3', metric_value: 19 },
      { year: 2024, fiscal_quarter: 2, fiscal_label: '2024-Q2', metric_value: 18 },
      { year: 2024, fiscal_quarter: 1, fiscal_label: '2024-Q1', metric_value: 17 },
    ],
  }

  it('should calculate TTM for multiple metrics', () => {
    const results = calculateMultipleTTM(multiMetricData)

    expect(results.revenue).toBeDefined()
    expect(results.revenue.ttm_value).toBe(370)

    expect(results.net_income).toBeDefined()
    expect(results.net_income.ttm_value).toBe(74)
  })
})
