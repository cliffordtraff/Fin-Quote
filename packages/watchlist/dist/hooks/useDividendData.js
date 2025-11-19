var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { useState, useEffect } from 'react';
export function useDividendData(symbols) {
    const [dividendData, setDividendData] = useState(new Map());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    // Fetch dividend data when symbols change
    useEffect(() => {
        if (symbols.length === 0) {
            return;
        }
        const fetchDividendData = () => __awaiter(this, void 0, void 0, function* () {
            setIsLoading(true);
            setError(null);
            try {
                // Use the new consolidated endpoint for dividends
                const url = `/api/stocks/data?symbols=${symbols.join(',')}&include=dividends`;
                // Force a server log by adding a header
                const response = yield fetch(url, {
                    headers: {
                        'X-Debug': 'dividend-fetch'
                    }
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch dividend data');
                }
                const result = yield response.json();
                // Handle any warnings from the API
                if (result.status.warnings.length > 0) {
                    console.warn('Dividend API warnings:', result.status.warnings);
                }
                // Convert to Map with proper DividendData structure
                const newDividendData = new Map();
                if (result.data.dividends) {
                    Object.entries(result.data.dividends).forEach(([symbol, dividend]) => {
                        newDividendData.set(symbol, dividend);
                    });
                }
                else {
                    // If no dividend data returned, set defaults
                    symbols.forEach(symbol => {
                        newDividendData.set(symbol, {
                            symbol,
                            dividendYield: null,
                            exDividendDate: null,
                            yieldBasis: 'unknown',
                            lastUpdated: result.status.timestamp
                        });
                    });
                }
                setDividendData(newDividendData);
            }
            catch (err) {
                console.error('Error fetching dividend data:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch dividend data');
            }
            finally {
                setIsLoading(false);
            }
        });
        fetchDividendData();
    }, [symbols.join(',')]);
    return {
        dividendData,
        isLoading,
        error
    };
}
