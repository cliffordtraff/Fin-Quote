var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
export class FMPRestClient {
    constructor(apiKey) {
        this.baseUrl = 'https://financialmodelingprep.com/api';
        this.cache = new Map();
        this.apiKey = apiKey;
    }
    getCacheKey(endpoint, params) {
        return `${endpoint}:${JSON.stringify(params || {})}`;
    }
    fetchWithCache(endpoint_1, params_1) {
        return __awaiter(this, arguments, void 0, function* (endpoint, params, cacheTTL = 60000 // Default 1 minute
        ) {
            const cacheKey = this.getCacheKey(endpoint, params);
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < cacheTTL) {
                return cached.data;
            }
            const url = new URL(`${this.baseUrl}${endpoint}`);
            url.searchParams.append('apikey', this.apiKey);
            if (params) {
                Object.entries(params).forEach(([key, value]) => {
                    url.searchParams.append(key, String(value));
                });
            }
            try {
                const response = yield fetch(url.toString());
                if (!response.ok) {
                    throw new Error(`FMP API error: ${response.status} ${response.statusText}`);
                }
                const data = yield response.json();
                // Cache the response
                this.cache.set(cacheKey, {
                    data,
                    timestamp: Date.now()
                });
                return data;
            }
            catch (error) {
                console.error(`Error fetching from FMP API: ${endpoint}`, error);
                throw error;
            }
        });
    }
    // Get real-time quote for stocks/ETFs/indexes
    getQuote(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this.fetchWithCache(`/v3/quote/${symbol}`, undefined, 5000 // 5 second cache for quotes
            );
            return data[0];
        });
    }
    // Get batch quotes for multiple symbols
    getBatchQuotes(symbols) {
        return __awaiter(this, void 0, void 0, function* () {
            const symbolString = symbols.join(',');
            return this.fetchWithCache(`/v3/quote/${symbolString}`, undefined, 5000 // 5 second cache
            );
        });
    }
    // Get company profile with fundamentals
    getCompanyProfile(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this.fetchWithCache(`/v3/profile/${symbol}`, undefined, 3600000 // 1 hour cache for company profiles
            );
            return data[0];
        });
    }
    // Get latest news for a symbol
    getStockNews(symbol_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, limit = 10) {
            return this.fetchWithCache(`/v3/stock_news`, { tickers: symbol, limit }, 300000 // 5 minute cache for news
            );
        });
    }
    // Get market news
    getMarketNews() {
        return __awaiter(this, arguments, void 0, function* (limit = 20) {
            return this.fetchWithCache(`/v4/general_news`, { limit }, 300000 // 5 minute cache
            );
        });
    }
    // Get dividend calendar for a symbol
    getDividendCalendar(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.fetchWithCache(`/v3/historical-price-full/stock_dividend/${symbol}`, undefined, 86400000 // 24 hour cache for dividends
            );
        });
    }
    // Search for symbols
    searchSymbols(query_1) {
        return __awaiter(this, arguments, void 0, function* (query, limit = 10) {
            return this.fetchWithCache(`/v3/search`, { query, limit }, 60000 // 1 minute cache for search
            );
        });
    }
    // Get historical prices
    getHistoricalPrices(symbol, from, to) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {};
            if (from)
                params.from = from;
            if (to)
                params.to = to;
            const data = yield this.fetchWithCache(`/v3/historical-price-full/${symbol}`, params, 3600000 // 1 hour cache
            );
            return data.historical || [];
        });
    }
    // Get extended hours quote (pre-market or after-hours)
    getExtendedHoursQuote(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const data = yield this.fetchWithCache(`/v4/extended-hours-quote/${symbol}`, undefined, 60000 // 1 minute cache for extended hours
                );
                return data && data.length > 0 ? data[0] : null;
            }
            catch (error) {
                console.error(`Error fetching extended hours quote for ${symbol}:`, error);
                return null;
            }
        });
    }
    // Get batch extended hours quotes
    getBatchExtendedHoursQuotes(symbols) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = new Map();
            // FMP's extended hours endpoint doesn't support batch, so we fetch individually
            // We'll do this in parallel to optimize performance
            const promises = symbols.map((symbol) => __awaiter(this, void 0, void 0, function* () {
                const quote = yield this.getExtendedHoursQuote(symbol);
                if (quote) {
                    result.set(symbol, quote);
                }
            }));
            yield Promise.all(promises);
            return result;
        });
    }
    // Clear cache for a specific endpoint or all
    clearCache(endpoint) {
        if (endpoint) {
            const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith(endpoint));
            keysToDelete.forEach(key => this.cache.delete(key));
        }
        else {
            this.cache.clear();
        }
    }
}
