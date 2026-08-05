import { describe, expect, it } from 'vitest';
import {
  asPercentage,
  firstFiniteNumber,
} from '@/lib/stock-key-stats-normalization';

describe('stock key-stat number normalization', () => {
  it('preserves a legitimate zero, including when later fallbacks are non-zero', () => {
    expect(firstFiniteNumber(0, 42)).toBe(0);
  });

  it('selects the first finite number and rejects non-numeric or non-finite values', () => {
    expect(firstFiniteNumber(null, undefined, '12.5', Number.NaN, Infinity, -7)).toBe(-7);
  });

  it('returns null when no usable number is available', () => {
    expect(firstFiniteNumber(null, undefined, '', Number.NaN, -Infinity)).toBeNull();
  });

  it('converts decimal ratios to percentage points without losing zero', () => {
    expect(asPercentage(0)).toBe(0);
    expect(asPercentage(null, 0.125)).toBe(12.5);
  });

  it('returns null for an unavailable percentage', () => {
    expect(asPercentage(undefined, Number.NaN, '0.25')).toBeNull();
  });

  it('does not let percentage scaling produce an infinite result', () => {
    expect(asPercentage(Number.MAX_VALUE)).toBeNull();
  });
});
