import { useState, useEffect } from 'react';
export function useDividendDataSimple(symbols) {
    const [dividendData, setDividendData] = useState(new Map());
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!symbols || symbols.length === 0)
            return;
        // Always fetch immediately
        const url = `/api/stocks/data?symbols=${symbols.join(',')}&include=dividends`;
        setIsLoading(true);
        fetch(url)
            .then(res => res.json())
            .then((result) => {
            const newData = new Map();
            if (result.data.dividends) {
                Object.entries(result.data.dividends).forEach(([symbol, dividend]) => {
                    newData.set(symbol, dividend);
                });
            }
            setDividendData(newData);
            setIsLoading(false);
        })
            .catch(err => {
            console.error('Dividend fetch error:', err);
            setError(err.message);
            setIsLoading(false);
        });
    }, [symbols.join(',')]); // Re-fetch when symbols change
    return { dividendData, isLoading, error };
}
