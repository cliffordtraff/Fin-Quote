/**
 * Normalizes symbols for consistent comparison across different data sources
 * - Converts to uppercase
 * - Handles exchange suffixes
 * - Normalizes crypto symbols (BTC-USD → BTCUSD)
 */
export declare const normalizeSymbol: (symbol: string) => string;
export declare const normalizeSymbolMap: <T>(map: Map<string, T>) => Map<string, T>;
