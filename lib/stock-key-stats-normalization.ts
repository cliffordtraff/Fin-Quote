/**
 * Select the first usable numeric value without treating zero as missing.
 * Provider payloads occasionally contain nulls, strings, NaN, or infinities;
 * none of those should become plausible-looking market data.
 */
export function firstFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

/** Convert a decimal ratio to percentage points while preserving zero. */
export function asPercentage(...values: unknown[]): number | null {
  const value = firstFiniteNumber(...values);
  return value === null ? null : firstFiniteNumber(value * 100);
}
