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
import { newsStorage } from '@watchlist/lib/indexeddb/news-storage';
// Cache meta data in localStorage with 1-hour TTL
const CACHE_KEY_PREFIX = 'news_meta_';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const buildNewsUrl = (symbol, limit = 10) => {
    const normalized = symbol.trim().toUpperCase();
    const params = new URLSearchParams({
        symbol: normalized,
        limit: limit.toString()
    });
    return `/api/news?${params.toString()}`;
};
function getCachedMeta(symbol) {
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
function setCachedMeta(symbol, meta) {
    try {
        localStorage.setItem(`${CACHE_KEY_PREFIX}${symbol}`, JSON.stringify({
            meta,
            timestamp: Date.now()
        }));
    }
    catch (error) {
        console.warn('Failed to cache news meta:', error);
    }
}
export function useNewsData({ visibleSymbols, enabled = true }) {
    const [newsData, setNewsData] = useState({});
    const [loading, setLoading] = useState(false);
    const fetchInProgress = useRef(false);
    const recentlyFetched = useRef(new Set());
    const updateMetaFromArticles = useCallback((symbol, articles) => {
        if (!articles || articles.length === 0)
            return;
        const latest = articles[0];
        const latestPublishedAt = typeof latest.publishedAt === 'string'
            ? latest.publishedAt
            : latest.publishedAt instanceof Date
                ? latest.publishedAt.toISOString()
                : undefined;
        const latestTitle = latest.headline || latest.title || latest.summary || '';
        const meta = {
            hasNews: true,
            count: articles.length,
            latestPublishedAt,
            latestTitle
        };
        setNewsData(prev => (Object.assign(Object.assign({}, prev), { [symbol]: meta })));
        setCachedMeta(symbol, meta);
    }, []);
    // Load ALL cached data on mount for instant rendering
    useEffect(() => {
        const loadAllCachedData = () => {
            const cachedData = {};
            // Load all cached news meta from localStorage
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key === null || key === void 0 ? void 0 : key.startsWith(CACHE_KEY_PREFIX)) {
                    const symbol = key.replace(CACHE_KEY_PREFIX, '');
                    const cached = getCachedMeta(symbol);
                    if (cached) {
                        cachedData[symbol] = cached;
                    }
                }
            }
            if (Object.keys(cachedData).length > 0) {
                setNewsData(cachedData);
            }
        };
        // Load all cached data immediately
        loadAllCachedData();
    }, []); // Only on mount
    // Load cached data for newly visible symbols
    useEffect(() => {
        const cachedData = {};
        let hasCached = false;
        visibleSymbols.forEach(symbol => {
            // Only load if we don't already have it
            if (!newsData[symbol]) {
                const cached = getCachedMeta(symbol);
                if (cached) {
                    cachedData[symbol] = cached;
                    hasCached = true;
                }
            }
        });
        if (hasCached) {
            setNewsData(prev => (Object.assign(Object.assign({}, prev), cachedData)));
        }
    }, [visibleSymbols]);
    // Debounced fetch function with improved batching
    const fetchNewsMeta = useCallback(debounce((symbols) => __awaiter(this, void 0, void 0, function* () {
        if (!enabled || fetchInProgress.current || symbols.length === 0)
            return;
        // Filter out symbols we've recently fetched or have fresh cache
        const symbolsToFetch = symbols.filter(s => {
            // Skip if recently fetched
            if (recentlyFetched.current.has(s))
                return false;
            // Skip if we have fresh cache
            const cached = getCachedMeta(s);
            if (cached)
                return false;
            return true;
        });
        if (symbolsToFetch.length === 0)
            return;
        fetchInProgress.current = true;
        setLoading(true);
        try {
            // Improved batching for large watchlists
            const BATCH_SIZE = 50; // Increased from 40
            const MAX_CONCURRENT_BATCHES = 2; // Limit concurrent batch requests
            const batches = [];
            for (let i = 0; i < symbolsToFetch.length; i += BATCH_SIZE) {
                batches.push(symbolsToFetch.slice(i, i + BATCH_SIZE));
            }
            // Process batches with concurrency limit for better performance
            const results = [];
            for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
                const currentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
                const batchPromises = currentBatches.map((batch) => __awaiter(this, void 0, void 0, function* () {
                    const response = yield fetch(`/api/news/meta?symbols=${batch.join(',')}`);
                    if (!response.ok) {
                        if (response.status === 404) {
                            console.warn('[watchlist] News meta API unavailable (404)');
                            return {};
                        }
                        console.warn('Failed to fetch news meta:', response.status);
                        return {};
                    }
                    return response.json();
                }));
                const batchResults = yield Promise.all(batchPromises);
                results.push(...batchResults);
            }
            const combinedData = Object.assign({}, ...results);
            // Cache the results and update state
            Object.entries(combinedData).forEach(([symbol, meta]) => {
                setCachedMeta(symbol, meta);
                recentlyFetched.current.add(symbol);
            });
            setNewsData(prev => (Object.assign(Object.assign({}, prev), combinedData)));
            // Clear recently fetched after 5 minutes
            setTimeout(() => {
                symbolsToFetch.forEach(s => recentlyFetched.current.delete(s));
            }, 5 * 60 * 1000);
        }
        catch (error) {
            console.warn('[watchlist] Error fetching news meta, keeping cached data', error);
        }
        finally {
            fetchInProgress.current = false;
            setLoading(false);
        }
    }), 150), // Reduced to 150ms for more responsive updates
    [enabled]);
    // Fetch meta for visible symbols with stale-while-revalidate
    useEffect(() => {
        if (!enabled || visibleSymbols.length === 0)
            return;
        const symbolsNeedingFetch = [];
        const staleSymbols = [];
        visibleSymbols.forEach(symbol => {
            const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${symbol}`);
            if (!cached) {
                // No cache - need immediate fetch
                symbolsNeedingFetch.push(symbol);
            }
            else {
                try {
                    const data = JSON.parse(cached);
                    const age = Date.now() - data.timestamp;
                    // If stale (>30 minutes but <1 hour), add to background refresh
                    if (age > 30 * 60 * 1000 && age < CACHE_TTL) {
                        staleSymbols.push(symbol);
                    }
                }
                catch (_a) {
                    symbolsNeedingFetch.push(symbol);
                }
            }
        });
        // Fetch uncached symbols immediately
        if (symbolsNeedingFetch.length > 0) {
            fetchNewsMeta(symbolsNeedingFetch);
        }
        // Refresh stale symbols in background (lower priority)
        if (staleSymbols.length > 0) {
            setTimeout(() => {
                fetchNewsMeta(staleSymbols);
            }, 1000); // Delay background refresh
        }
    }, [visibleSymbols, enabled, fetchNewsMeta]);
    // Function to fetch full articles for a symbol with IndexedDB caching
    const fetchArticles = useCallback((symbol) => __awaiter(this, void 0, void 0, function* () {
        try {
            // First, check IndexedDB for cached articles
            const cachedArticles = yield newsStorage.getArticles(symbol);
            if (cachedArticles && cachedArticles.length > 0) {
                updateMetaFromArticles(symbol, cachedArticles);
                // Check if cache is fresh (less than 30 minutes old)
                const age = yield newsStorage.getArticleAge(symbol);
                if (age !== null && age < 30 * 60 * 1000) {
                    // Cache is fresh, return immediately
                    return cachedArticles;
                }
                // Cache is stale but usable - fetch fresh in background
                // Fetch fresh articles in background
                fetch(buildNewsUrl(symbol, 10))
                    .then(res => res.json())
                    .then(data => {
                    if (data.articles && data.articles.length > 0) {
                        newsStorage.storeArticles(symbol, data.articles);
                        updateMetaFromArticles(symbol, data.articles);
                    }
                })
                    .catch(console.error);
                return cachedArticles;
            }
            // No cache or expired, fetch from API
            const response = yield fetch(buildNewsUrl(symbol, 10));
            if (!response.ok) {
                console.error('Failed to fetch articles:', response.status);
                // If offline or error, still return cached if available
                return cachedArticles || [];
            }
            const data = yield response.json();
            const articles = data.articles || [];
            // Store in IndexedDB for future use
            if (articles.length > 0) {
                yield newsStorage.storeArticles(symbol, articles);
                updateMetaFromArticles(symbol, articles);
            }
            else {
                setNewsData(prev => (Object.assign(Object.assign({}, prev), { [symbol]: { hasNews: false, count: 0 } })));
                localStorage.removeItem(`${CACHE_KEY_PREFIX}${symbol}`);
            }
            return articles;
        }
        catch (error) {
            console.error('Error fetching articles:', error);
            // On error, try to return cached articles
            const cachedArticles = yield newsStorage.getArticles(symbol);
            if (cachedArticles && cachedArticles.length > 0) {
                updateMetaFromArticles(symbol, cachedArticles);
                return cachedArticles;
            }
            return [];
        }
    }), [updateMetaFromArticles]);
    // Prefetch articles for a symbol (for hover)
    const prefetchArticles = useCallback((symbol) => __awaiter(this, void 0, void 0, function* () {
        // Check if already cached
        const hasCache = yield newsStorage.hasArticles(symbol);
        if (hasCache) {
            // Check age
            const age = yield newsStorage.getArticleAge(symbol);
            // If cache is fresh enough (< 1 hour), don't prefetch
            if (age !== null && age < 60 * 60 * 1000) {
                return;
            }
        }
        // Prefetch with limit=1 for efficiency
        try {
            const response = yield fetch(buildNewsUrl(symbol, 1));
            if (response.ok) {
                const data = yield response.json();
                if (data.articles && data.articles.length > 0) {
                    // Store even single article for preview
                    yield newsStorage.storeArticles(symbol, data.articles);
                    updateMetaFromArticles(symbol, data.articles);
                }
            }
        }
        catch (error) {
            // Silently fail for prefetch
        }
    }), [updateMetaFromArticles]);
    return {
        newsData,
        loading,
        fetchArticles,
        prefetchArticles,
        refetch: () => fetchNewsMeta(visibleSymbols)
    };
}
