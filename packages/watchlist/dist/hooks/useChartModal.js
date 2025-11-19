import { useState, useCallback } from 'react';
/**
 * Hook to manage chart modal state
 *
 * Provides functions to open/close the chart modal and manage selected symbol
 */
export function useChartModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [symbol, setSymbol] = useState(null);
    const [timeframe, setTimeframe] = useState('1d');
    const openChart = useCallback((newSymbol, newTimeframe = '1d') => {
        setSymbol(newSymbol);
        setTimeframe(newTimeframe);
        setIsOpen(true);
    }, []);
    const closeChart = useCallback(() => {
        setIsOpen(false);
        // Don't clear symbol immediately to avoid flash during close animation
        setTimeout(() => setSymbol(null), 300);
    }, []);
    const updateTimeframe = useCallback((newTimeframe) => {
        setTimeframe(newTimeframe);
    }, []);
    return {
        isOpen,
        symbol,
        timeframe,
        openChart,
        closeChart,
        setTimeframe: updateTimeframe
    };
}
