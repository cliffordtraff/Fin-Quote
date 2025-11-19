import { Stock } from '@watchlist/types';
export declare function transformWebSocketData(wsData: any): Partial<Stock>;
export declare function transformQuoteData(fmpQuote: any): Stock;
export declare function enrichWithCompanyProfile(stock: Stock, profile: any): Stock;
export declare function enrichWithDividendData(stock: Stock, dividends: any[]): Stock;
export declare function mergeRealtimeWithFundamentals(realtimeData: Partial<Stock>, fundamentalData: Stock): Stock;
