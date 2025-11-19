import { useMemo } from 'react';
import { useFMPData } from './useFMPData';
import { useWSJNews } from './useWSJNews';
import { useExtendedHoursData } from './useExtendedHoursData';
import { normalizeSymbol } from '@watchlist/utils/symbolNormalizer';
export function useMergedStockData({ symbols, visibleSymbols, // Pass through to useFMPData
enabled = true, enableNews = true, showExtendedHours = false }) {
    // Fetch price data with real-time updates
    // useFMPData already fetches dividend data internally
    const { stockData, isLoading: priceLoading, error: priceError, isConnected, marketStatus, dataSource, lastUpdated, refresh } = useFMPData({ symbols, visibleSymbols, enabled });
    // Fetch news data from WSJ
    const { news: newsData, loading: newsLoading, error: newsError, getNewsForTicker, getNewsCount, formatTimeAgo } = useWSJNews({
        symbols,
        enabled: enabled && enableNews,
        feedType: 'markets'
    });
    // Fetch extended hours data
    const { data: extendedHoursData } = useExtendedHoursData(symbols, showExtendedHours);
    // Transform stock data to merged format with news
    const mergedData = useMemo(() => {
        const merged = new Map();
        // Add all stock data - it already includes dividend data from useFMPData
        stockData.forEach((stock, symbol) => {
            const normalizedSymbol = normalizeSymbol(symbol);
            // Get news for this ticker
            const tickerNews = enableNews ? getNewsForTicker(normalizedSymbol) : null;
            const newsCount = enableNews ? getNewsCount(normalizedSymbol) : 0;
            // Get extended hours data for this symbol if available
            // Always retrieve the data from the Map, regardless of showExtendedHours toggle
            // The toggle only controls column visibility, not data availability
            const extHoursQuote = extendedHoursData.get(normalizedSymbol) ||
                extendedHoursData.get(symbol) ||
                extendedHoursData.get(normalizeSymbol(stock.symbol)) ||
                extendedHoursData.get(stock.symbol);
            let extendedQuote;
            // If we have extended hours data, process it and assign it to the stock
            if (extHoursQuote) {
                const previousClose = typeof stock.price === 'number' &&
                    typeof stock.change === 'number'
                    ? stock.price - stock.change
                    : null;
                let derivedChange = extHoursQuote.change;
                let derivedPercent = extHoursQuote.changePercent;
                if (previousClose && Math.abs(previousClose) > 0.0001) {
                    derivedChange = extHoursQuote.price - previousClose;
                    derivedPercent = (derivedChange / previousClose) * 100;
                }
                extendedQuote = Object.assign(Object.assign({}, extHoursQuote), { change: derivedChange, changePercent: derivedPercent });
            }
            merged.set(normalizedSymbol, Object.assign(Object.assign({}, stock), { yieldBasis: stock.dividendYield ? 'TTM' : 'unknown', dividendDataFresh: true, news: tickerNews, newsCount: newsCount, extendedHoursQuote: extendedQuote }));
        });
        return merged;
    }, [stockData, newsData, enableNews, getNewsForTicker, getNewsCount, showExtendedHours, extendedHoursData]);
    return {
        stockData: mergedData,
        isLoading: priceLoading || newsLoading,
        isPriceLoading: priceLoading,
        isDividendLoading: false, // Dividend loading is part of price loading
        isNewsLoading: newsLoading,
        error: priceError || newsError,
        isConnected,
        marketStatus,
        dataSource,
        lastUpdated,
        refresh,
        formatTimeAgo
    };
}
