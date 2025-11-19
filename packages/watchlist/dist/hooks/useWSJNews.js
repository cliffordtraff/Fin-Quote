var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useState, useEffect, useCallback } from 'react';
const CACHE_KEY = 'wsj_news_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
export function useWSJNews({ symbols, enabled = true, feedType = 'markets', pollInterval = 5 * 60 * 1000 // 5 minutes
 }) {
    const [state, setState] = useState({
        news: {},
        loading: false,
        error: null,
        lastUpdated: null
    });
    // Load from localStorage cache
    const loadFromCache = useCallback(() => {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                const cacheAge = Date.now() - new Date(parsed.timestamp).getTime();
                if (cacheAge < CACHE_TTL) {
                    // Only use cache for matching symbols
                    const filteredNews = {};
                    for (const symbol of symbols) {
                        if (parsed.news[symbol]) {
                            // Parse dates back to Date objects
                            filteredNews[symbol] = parsed.news[symbol].map((article) => (Object.assign(Object.assign({}, article), { publishedAt: new Date(article.publishedAt) })));
                        }
                    }
                    setState(prev => (Object.assign(Object.assign({}, prev), { news: filteredNews, lastUpdated: new Date(parsed.timestamp), stats: parsed.stats })));
                    return true;
                }
            }
        }
        catch (error) {
            console.error('Error loading news from cache:', error);
        }
        return false;
    }, [symbols]);
    // Save to localStorage cache
    const saveToCache = useCallback((news, stats) => {
        try {
            const cacheData = {
                news,
                stats,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        }
        catch (error) {
            console.error('Error saving news to cache:', error);
        }
    }, []);
    // Fetch news from API
    const fetchNews = useCallback(() => __awaiter(this, void 0, void 0, function* () {
        if (!enabled || symbols.length === 0)
            return;
        // Don't fetch if we're already loading
        if (state.loading)
            return;
        setState(prev => (Object.assign(Object.assign({}, prev), { loading: true, error: null })));
        try {
            const response = yield fetch('/api/news/match', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    symbols,
                    feedType
                })
            });
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn('[watchlist] News API unavailable (404), using cached data if present');
                    setState(prev => (Object.assign(Object.assign({}, prev), { loading: false, error: null })));
                    return;
                }
                throw new Error(`Failed to fetch news: ${response.status}`);
            }
            const data = yield response.json();
            // Parse dates in the response
            const parsedNews = {};
            for (const [ticker, articles] of Object.entries(data.news || {})) {
                parsedNews[ticker] = articles.map(article => (Object.assign(Object.assign({}, article), { publishedAt: new Date(article.publishedAt) })));
            }
            // Update state
            setState({
                news: parsedNews,
                loading: false,
                error: null,
                lastUpdated: new Date(),
                stats: data.stats
            });
            // Save to cache
            saveToCache(parsedNews, data.stats);
        }
        catch (error) {
            console.warn('[watchlist] Error fetching news, keeping last known data', error);
            setState(prev => (Object.assign(Object.assign({}, prev), { loading: false, error: null })));
        }
    }), [enabled, symbols, feedType, state.loading, saveToCache]);
    // Initial load
    useEffect(() => {
        if (!enabled || symbols.length === 0)
            return;
        // Try to load from cache first
        const hasCache = loadFromCache();
        // Fetch fresh data if no valid cache
        if (!hasCache) {
            fetchNews();
        }
        else {
            // Still fetch in background to update cache after a delay
            setTimeout(fetchNews, 1000);
        }
    }, [enabled, symbols.join(','), feedType]); // Re-fetch when symbols change
    // Polling
    useEffect(() => {
        if (!enabled || symbols.length === 0 || pollInterval <= 0)
            return;
        const interval = setInterval(fetchNews, pollInterval);
        return () => clearInterval(interval);
    }, [enabled, symbols.join(','), pollInterval, fetchNews]);
    // Get news for a specific ticker
    const getNewsForTicker = useCallback((ticker) => {
        const tickerNews = state.news[ticker];
        if (tickerNews && tickerNews.length > 0) {
            return tickerNews[0]; // Return most relevant/recent
        }
        return null;
    }, [state.news]);
    // Get all news for a ticker
    const getAllNewsForTicker = useCallback((ticker) => {
        return state.news[ticker] || [];
    }, [state.news]);
    // Get news count for a ticker
    const getNewsCount = useCallback((ticker) => {
        var _a;
        return ((_a = state.news[ticker]) === null || _a === void 0 ? void 0 : _a.length) || 0;
    }, [state.news]);
    // Refresh news manually
    const refresh = useCallback(() => {
        fetchNews();
    }, [fetchNews]);
    // Format time ago
    const formatTimeAgo = useCallback((date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0)
            return `${days}d`;
        if (hours > 0)
            return `${hours}h`;
        if (minutes > 0)
            return `${minutes}m`;
        return 'now';
    }, []);
    return {
        news: state.news,
        loading: state.loading,
        error: state.error,
        lastUpdated: state.lastUpdated,
        stats: state.stats,
        getNewsForTicker,
        getAllNewsForTicker,
        getNewsCount,
        refresh,
        formatTimeAgo
    };
}
