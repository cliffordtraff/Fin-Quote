/**
 * Normalizes symbols for consistent comparison across different data sources
 * - Converts to uppercase
 * - Handles exchange suffixes
 * - Normalizes crypto symbols (BTC-USD → BTCUSD)
 */
export const normalizeSymbol = (symbol: string): string => {
  return symbol
    .toUpperCase()
    .replace(/-USD$/i, 'USD')  // Crypto normalization
    .replace(/\s/g, '')         // Remove spaces
    .trim();
};

export const normalizeSymbolMap = <T>(
  map: Map<string, T>
): Map<string, T> => {
  const normalized = new Map<string, T>();
  map.forEach((value, key) => {
    normalized.set(normalizeSymbol(key), value);
  });
  return normalized;
};