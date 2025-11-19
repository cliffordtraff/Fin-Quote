/**
 * Normalizes symbols for consistent comparison across different data sources
 * - Converts to uppercase
 * - Handles exchange suffixes
 * - Normalizes crypto symbols (BTC-USD → BTCUSD)
 */
export const normalizeSymbol = (symbol) => {
    return symbol
        .toUpperCase()
        .replace(/-USD$/i, 'USD') // Crypto normalization
        .replace(/\s/g, '') // Remove spaces
        .trim();
};
export const normalizeSymbolMap = (map) => {
    const normalized = new Map();
    map.forEach((value, key) => {
        normalized.set(normalizeSymbol(key), value);
    });
    return normalized;
};
