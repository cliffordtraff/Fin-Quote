'use client';
import { jsx as _jsx } from "react/jsx-runtime";
import { formatTimeframe } from '@watchlist/utils/chart-helpers';
const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
/**
 * Timeframe selector component for switching chart intervals
 */
export function TimeframeSelector({ currentTimeframe, onChange }) {
    return (_jsx("div", { className: "flex items-center gap-1", children: _jsx("div", { className: "flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-md p-1", children: TIMEFRAMES.map((timeframe) => (_jsx("button", { onClick: () => onChange(timeframe), className: `
              px-3 py-1 rounded text-sm font-medium transition-colors
              ${currentTimeframe === timeframe
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'}
            `, title: formatTimeframe(timeframe), children: timeframe }, timeframe))) }) }));
}
