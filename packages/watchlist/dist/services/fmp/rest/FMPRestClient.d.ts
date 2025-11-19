interface FMPQuote {
    symbol: string;
    name: string;
    price: number;
    changesPercentage: number;
    change: number;
    dayLow: number;
    dayHigh: number;
    yearHigh: number;
    yearLow: number;
    marketCap: number;
    priceAvg50: number;
    priceAvg200: number;
    exchange: string;
    volume: number;
    avgVolume: number;
    open: number;
    previousClose: number;
    eps: number;
    pe: number;
    sharesOutstanding: number;
    timestamp: number;
}
interface FMPCompanyProfile {
    symbol: string;
    price: number;
    beta: number;
    volAvg: number;
    mktCap: number;
    lastDiv: number;
    range: string;
    changes: number;
    companyName: string;
    currency: string;
    cik: string;
    isin: string;
    cusip: string;
    exchange: string;
    exchangeShortName: string;
    industry: string;
    website: string;
    description: string;
    ceo: string;
    sector: string;
    country: string;
    fullTimeEmployees: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    dcfDiff: number;
    dcf: number;
    image: string;
    ipoDate: string;
    defaultImage: boolean;
    isEtf: boolean;
    isActivelyTrading: boolean;
    isAdr: boolean;
    isFund: boolean;
}
interface FMPNews {
    symbol: string;
    publishedDate: string;
    title: string;
    image: string;
    site: string;
    text: string;
    url: string;
}
interface FMPDividend {
    date: string;
    label: string;
    adjDividend: number;
    symbol: string;
    dividend: number;
    recordDate: string;
    paymentDate: string;
    declarationDate: string;
}
interface FMPExtendedHoursQuote {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    timestamp: number;
}
export declare class FMPRestClient {
    private apiKey;
    private baseUrl;
    private cache;
    constructor(apiKey: string);
    private getCacheKey;
    private fetchWithCache;
    getQuote(symbol: string): Promise<FMPQuote>;
    getBatchQuotes(symbols: string[]): Promise<FMPQuote[]>;
    getCompanyProfile(symbol: string): Promise<FMPCompanyProfile>;
    getStockNews(symbol: string, limit?: number): Promise<FMPNews[]>;
    getMarketNews(limit?: number): Promise<FMPNews[]>;
    getDividendCalendar(symbol: string): Promise<FMPDividend[]>;
    searchSymbols(query: string, limit?: number): Promise<any[]>;
    getHistoricalPrices(symbol: string, from?: string, to?: string): Promise<any[]>;
    getExtendedHoursQuote(symbol: string): Promise<FMPExtendedHoursQuote | null>;
    getBatchExtendedHoursQuotes(symbols: string[]): Promise<Map<string, FMPExtendedHoursQuote>>;
    clearCache(endpoint?: string): void;
}
export {};
