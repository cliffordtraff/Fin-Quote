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
/**
 * Hook to fetch and manage chart data for a symbol
 *
 * @param symbol - Stock symbol to fetch data for
 * @param timeframe - Chart timeframe (1m, 5m, 15m, 30m, 1h, 4h, 1d)
 * @param enabled - Whether to fetch data (default: true)
 */
export function useChartData(symbol, timeframe = '15m', enabled = true) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const fetchData = useCallback(() => __awaiter(this, void 0, void 0, function* () {
        if (!symbol || !enabled) {
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const response = yield fetch(`/api/stocks/chart-data?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`, {
                cache: 'default', // Allow browser caching
            });
            const text = yield response.text();
            let result = {};
            try {
                result = text ? JSON.parse(text) : {};
            }
            catch (parseErr) {
                console.warn('[watchlist] Chart data returned non-JSON payload', parseErr);
            }
            if (!response.ok) {
                throw new Error((result === null || result === void 0 ? void 0 : result.error) || `Failed to fetch chart data: ${response.statusText}`);
            }
            if (result.data && Array.isArray(result.data)) {
                setData(result.data);
            }
            else {
                throw new Error('Invalid chart data format received');
            }
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error('Unknown error fetching chart data');
            setError(error);
            console.error('Chart data fetch error:', error);
        }
        finally {
            setLoading(false);
        }
    }), [symbol, timeframe, enabled]);
    // Fetch data on mount and when dependencies change
    useEffect(() => {
        fetchData();
    }, [fetchData]);
    return {
        data,
        loading,
        error,
        refetch: fetchData
    };
}
