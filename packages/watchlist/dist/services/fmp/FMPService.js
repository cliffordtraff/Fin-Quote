var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { EventEmitter } from 'events';
import { FMPWebSocketManager } from './websocket/FMPWebSocketManager';
import { FMPRestClient } from './rest/FMPRestClient';
import { transformWebSocketData, transformQuoteData, enrichWithCompanyProfile, enrichWithDividendData, mergeRealtimeWithFundamentals } from '../transformers/stockTransformer';
export class FMPService extends EventEmitter {
    constructor(config) {
        super();
        this.wsManager = null;
        this.stockDataCache = new Map();
        this.pollingIntervals = new Map();
        this.config = config;
        this.restClient = new FMPRestClient(config.apiKey);
        if (config.enableWebSocket !== false) {
            this.wsManager = new FMPWebSocketManager(config.apiKey, config.wsUrl || 'wss://websockets.financialmodelingprep.com');
            this.setupWebSocketListeners();
        }
    }
    setupWebSocketListeners() {
        if (!this.wsManager)
            return;
        this.wsManager.on('connected', () => {
            console.log('FMP WebSocket connected');
            this.emit('connected');
        });
        this.wsManager.on('authenticated', () => {
            console.log('FMP WebSocket authenticated');
            this.emit('authenticated');
        });
        this.wsManager.on('stockUpdate', (data) => {
            const symbol = data.symbol.toUpperCase();
            const realtimeData = transformWebSocketData(data);
            // Merge with cached fundamental data if available
            const cachedStock = this.stockDataCache.get(symbol);
            if (cachedStock) {
                const mergedStock = mergeRealtimeWithFundamentals(realtimeData, cachedStock);
                this.stockDataCache.set(symbol, mergedStock);
                this.emit('stockUpdate', mergedStock);
            }
            else {
                // Emit partial update and fetch full data in background
                this.emit('stockUpdate', Object.assign({ symbol }, realtimeData));
                this.fetchFullStockData(symbol);
            }
        });
        this.wsManager.on('error', (error) => {
            console.error('FMP WebSocket error:', error);
            this.emit('error', error);
        });
        this.wsManager.on('disconnected', () => {
            console.log('FMP WebSocket disconnected');
            this.emit('disconnected');
        });
    }
    connect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.wsManager) {
                this.wsManager.connect();
            }
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            // Stop all polling
            this.pollingIntervals.forEach(interval => clearInterval(interval));
            this.pollingIntervals.clear();
            // Disconnect WebSocket
            if (this.wsManager) {
                this.wsManager.disconnect();
            }
        });
    }
    // Subscribe to real-time updates for symbols
    subscribeToSymbols(symbols) {
        return __awaiter(this, void 0, void 0, function* () {
            const stockSymbols = [];
            const indexSymbols = [];
            // Separate stocks/crypto (WebSocket) from indexes (polling)
            symbols.forEach(symbol => {
                if (this.isIndex(symbol)) {
                    indexSymbols.push(symbol);
                }
                else {
                    stockSymbols.push(symbol);
                }
            });
            // Subscribe to WebSocket for stocks/crypto
            if (this.wsManager && stockSymbols.length > 0) {
                this.wsManager.subscribe(stockSymbols);
            }
            // Start polling for indexes
            if (indexSymbols.length > 0) {
                this.startPollingForSymbols(indexSymbols);
            }
            // Fetch initial full data for all symbols
            yield this.fetchBatchStockData(symbols);
        });
    }
    // Unsubscribe from symbols
    unsubscribeFromSymbols(symbols) {
        return __awaiter(this, void 0, void 0, function* () {
            const stockSymbols = [];
            const indexSymbols = [];
            symbols.forEach(symbol => {
                if (this.isIndex(symbol)) {
                    indexSymbols.push(symbol);
                }
                else {
                    stockSymbols.push(symbol);
                }
            });
            // Unsubscribe from WebSocket
            if (this.wsManager && stockSymbols.length > 0) {
                this.wsManager.unsubscribe(stockSymbols);
            }
            // Stop polling for indexes
            indexSymbols.forEach(symbol => {
                const interval = this.pollingIntervals.get(symbol);
                if (interval) {
                    clearInterval(interval);
                    this.pollingIntervals.delete(symbol);
                }
            });
        });
    }
    // Fetch full stock data including fundamentals
    fetchFullStockData(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get quote data
                const quote = yield this.restClient.getQuote(symbol);
                let stock = transformQuoteData(quote);
                // Get company profile for more details
                try {
                    const profile = yield this.restClient.getCompanyProfile(symbol);
                    stock = enrichWithCompanyProfile(stock, profile);
                }
                catch (error) {
                    console.log(`Could not fetch profile for ${symbol}`);
                }
                // Get dividend data
                try {
                    const dividends = yield this.restClient.getDividendCalendar(symbol);
                    stock = enrichWithDividendData(stock, dividends);
                }
                catch (error) {
                    console.log(`Could not fetch dividends for ${symbol}`);
                }
                this.stockDataCache.set(symbol, stock);
                return stock;
            }
            catch (error) {
                console.error(`Error fetching full data for ${symbol}:`, error);
                return null;
            }
        });
    }
    // Fetch batch stock data
    fetchBatchStockData(symbols) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = new Map();
            try {
                // Fetch quotes in batch
                const quotes = yield this.restClient.getBatchQuotes(symbols);
                // Transform and cache each quote
                for (const quote of quotes) {
                    const stock = transformQuoteData(quote);
                    this.stockDataCache.set(stock.symbol, stock);
                    result.set(stock.symbol, stock);
                    this.emit('stockUpdate', stock);
                }
                // Fetch additional data in background
                symbols.forEach(symbol => {
                    this.fetchFullStockData(symbol).then(stock => {
                        if (stock) {
                            this.emit('stockUpdate', stock);
                        }
                    });
                });
            }
            catch (error) {
                console.error('Error fetching batch stock data:', error);
            }
            return result;
        });
    }
    // Start polling for index symbols
    startPollingForSymbols(symbols) {
        symbols.forEach(symbol => {
            // Don't start if already polling
            if (this.pollingIntervals.has(symbol))
                return;
            // Poll immediately
            this.pollSymbol(symbol);
            // Set up interval (10 seconds for indexes)
            const interval = setInterval(() => {
                this.pollSymbol(symbol);
            }, 10000);
            this.pollingIntervals.set(symbol, interval);
        });
    }
    pollSymbol(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const quote = yield this.restClient.getQuote(symbol);
                const stock = transformQuoteData(quote);
                this.stockDataCache.set(symbol, stock);
                this.emit('stockUpdate', stock);
            }
            catch (error) {
                console.error(`Error polling ${symbol}:`, error);
            }
        });
    }
    // Check if symbol is an index (needs polling instead of WebSocket)
    isIndex(symbol) {
        const indexSymbols = ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'VOO', 'GLD', 'SLV', 'USO'];
        return indexSymbols.includes(symbol.toUpperCase());
    }
    // Get cached stock data
    getStock(symbol) {
        return this.stockDataCache.get(symbol);
    }
    // Get all cached stocks
    getAllStocks() {
        return new Map(this.stockDataCache);
    }
    // Fetch news for a symbol
    getStockNews(symbol_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, limit = 10) {
            try {
                const fmpNews = yield this.restClient.getStockNews(symbol, limit);
                return fmpNews.map(news => {
                    const urlHash = news.url ?
                        require('crypto').createHash('md5').update(news.url).digest('hex') :
                        Math.random().toString(36);
                    return {
                        id: urlHash,
                        headline: news.title,
                        description: news.text,
                        canonicalUrl: news.url,
                        sourceDomain: news.site,
                        source: 'Yahoo', // FMP aggregates from various sources
                        isPaywalled: false,
                        publishedAt: new Date(news.publishedDate),
                        normalizedTitle: news.title.toLowerCase(),
                        normalizedDescription: news.text.toLowerCase()
                    };
                });
            }
            catch (error) {
                console.error(`Error fetching news for ${symbol}:`, error);
                return [];
            }
        });
    }
    // Search symbols
    searchSymbols(query) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.restClient.searchSymbols(query);
        });
    }
    // Get extended hours quote for a symbol
    getExtendedHoursQuote(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.restClient.getExtendedHoursQuote(symbol);
        });
    }
    // Get batch extended hours quotes
    getBatchExtendedHoursQuotes(symbols) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.restClient.getBatchExtendedHoursQuotes(symbols);
        });
    }
    // Get connection status
    isConnected() {
        var _a;
        return ((_a = this.wsManager) === null || _a === void 0 ? void 0 : _a.getConnectionStatus()) || false;
    }
}
