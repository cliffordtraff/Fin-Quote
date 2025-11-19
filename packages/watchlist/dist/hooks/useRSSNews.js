var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useState, useEffect, useCallback, useRef } from 'react';
import { debounce } from 'lodash';
// Cache RSS news data with 15-minute TTL
const CACHE_KEY_PREFIX = 'rss_news_';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
function getCachedRSSNews(symbol) {
    try {
        const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${symbol}`);
        if (!cached)
            return null;
        const data = JSON.parse(cached);
        const age = Date.now() - data.timestamp;
        if (age > CACHE_TTL) {
            localStorage.removeItem(`${CACHE_KEY_PREFIX}${symbol}`);
            return null;
        }
        return data.meta;
    }
    catch (_a) {
        return null;
    }
}
function setCachedRSSNews(symbol, meta) {
    try {
        localStorage.setItem(`${CACHE_KEY_PREFIX}${symbol}`, JSON.stringify({
            meta,
            timestamp: Date.now()
        }));
    }
    catch (error) {
        console.warn('Failed to cache RSS news:', error);
    }
}
export function useRSSNews({ visibleSymbols, enabled = true }) {
    const [rssNewsData, setRSSNewsData] = useState({});
    const [loading, setLoading] = useState(false);
    const fetchInProgress = useRef(false);
    const lastFetchedSymbols = useRef([]);
    // Load cached data on mount
    useEffect(() => {
        const cachedData = {};
        // Load all cached RSS news from localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key === null || key === void 0 ? void 0 : key.startsWith(CACHE_KEY_PREFIX)) {
                const symbol = key.replace(CACHE_KEY_PREFIX, '');
                const cached = getCachedRSSNews(symbol);
                if (cached) {
                    cachedData[symbol] = cached;
                }
            }
        }
        if (Object.keys(cachedData).length > 0) {
            setRSSNewsData(cachedData);
        }
    }, []);
    // Debounced fetch function for RSS news
    const fetchRSSNews = useCallback(debounce((symbols) => __awaiter(this, void 0, void 0, function* () {
        if (!enabled || fetchInProgress.current || symbols.length === 0)
            return;
        // Check if we're fetching the same symbols
        const symbolsStr = symbols.sort().join(',');
        const lastSymbolsStr = lastFetchedSymbols.current.sort().join(',');
        if (symbolsStr === lastSymbolsStr) {
            return;
        }
        fetchInProgress.current = true;
        lastFetchedSymbols.current = symbols;
        setLoading(true);
        try {
            // Batch symbols into groups to avoid overwhelming the API
            const BATCH_SIZE = 25;
            const batches = [];
            for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
                batches.push(symbols.slice(i, i + BATCH_SIZE));
            }
            // Process batches sequentially to avoid rate limiting
            for (const batch of batches) {
                const response = yield fetch('/api/news/match', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        symbols: batch,
                        feedType: 'markets'
                    })
                });
                if (!response.ok) {
                    if (response.status === 404) {
                        console.warn('[watchlist] RSS news API unavailable (404)');
                        continue;
                    }
                    console.warn('Failed to fetch RSS news for batch:', response.status);
                    continue; // Continue with next batch
                }
                const data = yield response.json();
                const newsMap = data.news || {};
                // Transform the data into our format
                const rssData = {};
                batch.forEach(symbol => {
                    const articles = newsMap[symbol] || [];
                    const meta = {
                        symbol,
                        articles,
                        count: articles.length,
                        latestArticle: articles[0]
                    };
                    rssData[symbol] = meta;
                    setCachedRSSNews(symbol, meta);
                });
                setRSSNewsData(prev => (Object.assign(Object.assign({}, prev), rssData)));
            }
        }
        catch (error) {
            console.warn('[watchlist] Error fetching RSS news, keeping cached data', error);
        }
        finally {
            fetchInProgress.current = false;
            setLoading(false);
        }
    }), 1000), // 1 second debounce to batch more symbols
    [enabled]);
    // Fetch RSS news when visible symbols change
    useEffect(() => {
        if (!enabled || visibleSymbols.length === 0)
            return;
        // Filter symbols that need fetching
        const symbolsToFetch = visibleSymbols.filter(symbol => {
            const cached = getCachedRSSNews(symbol);
            return !cached; // Only fetch if not in cache
        });
        if (symbolsToFetch.length > 0) {
            fetchRSSNews(symbolsToFetch);
        }
        else {
            const hasNewsCount = Object.values(rssNewsData).filter((meta) => meta.count > 0).length;
        }
    }, [visibleSymbols, enabled, fetchRSSNews]);
    // Function to fetch articles for a specific symbol
    const fetchArticlesForSymbol = useCallback((symbol) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const response = yield fetch('/api/news/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbols: [symbol],
                    feedType: 'markets'
                })
            });
            if (!response.ok) {
                console.warn('Failed to fetch RSS articles:', response.status);
                return [];
            }
            const data = yield response.json();
            const articles = ((_a = data.news) === null || _a === void 0 ? void 0 : _a[symbol]) || [];
            // Update cache
            const meta = {
                symbol,
                articles,
                count: articles.length,
                latestArticle: articles[0]
            };
            setCachedRSSNews(symbol, meta);
            setRSSNewsData(prev => (Object.assign(Object.assign({}, prev), { [symbol]: meta })));
            return articles;
        }
        catch (error) {
            console.error('Error fetching RSS articles:', error);
            return [];
        }
    }), []);
    // Prefetch function (for hover)
    const prefetchArticles = useCallback((symbol) => {
        const cached = getCachedRSSNews(symbol);
        if (!cached) {
            // Prefetch in background
            fetchArticlesForSymbol(symbol).catch(console.error);
        }
    }, [fetchArticlesForSymbol]);
    return {
        rssNewsData,
        loading,
        fetchArticlesForSymbol,
        prefetchArticles,
        refetch: () => fetchRSSNews(visibleSymbols)
    };
}
