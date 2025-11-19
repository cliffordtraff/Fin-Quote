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
import { normalizeSymbol } from '@watchlist/utils/symbolNormalizer';
/**
 * Hook to fetch extended hours data for symbols
 * Only fetches when enabled and during extended hours sessions
 * Polls every 1 minute during extended hours
 */
export function useExtendedHoursData(symbols, enabled) {
    const [data, setData] = useState(new Map());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const abortControllerRef = useRef(null);
    const fetchExtendedHoursData = useCallback(() => __awaiter(this, void 0, void 0, function* () {
        if (!enabled || symbols.length === 0) {
            setData(new Map());
            return;
        }
        // Cancel any in-flight requests
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        try {
            setIsLoading(true);
            setError(null);
            const response = yield fetch(`/api/stocks/extended-hours?symbols=${symbols.join(',')}`, { signal: abortControllerRef.current.signal });
            // Handle 404 gracefully - no extended hours data available
            if (response.status === 404) {
                return;
            }
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            const result = yield response.json();
            if (result.data) {
                const newData = new Map();
                Object.entries(result.data).forEach(([symbol, quote]) => {
                    var _a;
                    const quoteData = quote;
                    const normalizedFromQuote = normalizeSymbol(((_a = quoteData.symbol) === null || _a === void 0 ? void 0 : _a.split(':').pop()) || quoteData.symbol || symbol);
                    const normalizedFromKey = normalizeSymbol(symbol);
                    newData.set(normalizedFromQuote, quoteData);
                    if (normalizedFromKey !== normalizedFromQuote) {
                        newData.set(normalizedFromKey, quoteData);
                    }
                    // Also store the raw key for fallback lookups
                    newData.set(symbol, quoteData);
                });
                setData(newData);
            }
            else {
                setData(new Map());
            }
        }
        catch (err) {
            // Ignore abort errors
            if (err instanceof Error && err.name === 'AbortError') {
                return;
            }
            console.error('Error fetching extended hours data:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
        finally {
            setIsLoading(false);
        }
    }), [symbols, enabled]);
    useEffect(() => {
        if (!enabled) {
            setData(new Map());
            return;
        }
        // Initial fetch
        fetchExtendedHoursData();
        // Poll every 1 minute (60000ms) - fetch extended hours data regardless of time
        // This will show the last extended hours close price (8 PM ET)
        const interval = setInterval(() => {
            fetchExtendedHoursData();
        }, 60000);
        return () => {
            clearInterval(interval);
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [enabled, fetchExtendedHoursData]);
    return { data, isLoading, error };
}
