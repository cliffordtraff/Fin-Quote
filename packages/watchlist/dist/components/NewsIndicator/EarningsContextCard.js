import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Earnings Context Card Component
 *
 * Expandable card showing detailed earnings information
 */
import { useState } from 'react';
import { beatQualityScorer } from '@watchlist/lib/earnings/beat-quality';
export const EarningsContextCard = ({ context, expanded: defaultExpanded = false }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const { lastEarnings, nextEarnings } = context;
    // Don't show if no earnings data
    if (!lastEarnings && !nextEarnings) {
        return null;
    }
    return (_jsxs("div", { className: "border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800", children: [_jsxs("button", { onClick: () => setIsExpanded(!isExpanded), className: "w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors", "aria-expanded": isExpanded, "aria-controls": "earnings-details", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-lg", "aria-hidden": "true", children: "\uD83D\uDCCA" }), _jsx("span", { className: "font-semibold text-sm text-gray-900 dark:text-gray-100", children: "Earnings Details" })] }), _jsx("svg", { className: `w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", "aria-hidden": "true", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" }) })] }), isExpanded && (_jsxs("div", { id: "earnings-details", className: "px-4 py-3 border-t border-gray-200 dark:border-gray-700 space-y-4", children: [lastEarnings && (_jsxs("div", { children: [_jsxs("h4", { className: "text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2", children: ["Last Report: ", lastEarnings.date, lastEarnings.time && (_jsxs("span", { className: "ml-2 text-gray-500 dark:text-gray-400", children: ["(", lastEarnings.time.toUpperCase(), ")"] }))] }), lastEarnings.epsEstimate !== null && (_jsx("div", { className: "space-y-1 mb-2", children: _jsx(EarningsMetric, { label: "EPS", actual: lastEarnings.epsActual, estimate: lastEarnings.epsEstimate, formatter: (v) => `$${v.toFixed(2)}` }) })), lastEarnings.revenueEstimate !== null && (_jsx("div", { className: "space-y-1 mb-2", children: _jsx(EarningsMetric, { label: "Revenue", actual: lastEarnings.revenueActual, estimate: lastEarnings.revenueEstimate, formatter: formatRevenue }) })), (lastEarnings.epsActual !== null || lastEarnings.revenueActual !== null) && (_jsx(BeatQualityDisplay, { earnings: lastEarnings }))] })), nextEarnings && (_jsxs("div", { className: "pt-4 border-t border-gray-200 dark:border-gray-700", children: [_jsxs("h4", { className: "text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2", children: ["Next Report: ", nextEarnings.date, nextEarnings.time && (_jsxs("span", { className: "ml-2 text-gray-500 dark:text-gray-400", children: ["(", nextEarnings.time.toUpperCase(), ")"] }))] }), nextEarnings.epsEstimate !== null && (_jsxs("div", { className: "text-xs text-gray-600 dark:text-gray-400", children: ["EPS Estimate: $", nextEarnings.epsEstimate.toFixed(2)] })), nextEarnings.revenueEstimate !== null && (_jsxs("div", { className: "text-xs text-gray-600 dark:text-gray-400", children: ["Revenue Estimate: ", formatRevenue(nextEarnings.revenueEstimate)] }))] }))] }))] }));
};
/**
 * Earnings Metric Row (Actual vs Estimate)
 */
const EarningsMetric = ({ label, actual, estimate, formatter }) => {
    if (estimate === null)
        return null;
    const hasActual = actual !== null;
    const diff = hasActual ? actual - estimate : 0;
    const diffPercent = hasActual && estimate !== 0 ? ((diff / Math.abs(estimate)) * 100) : 0;
    const isBeat = diff > 0;
    const isMiss = diff < 0;
    return (_jsxs("div", { className: "text-xs", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("span", { className: "text-gray-600 dark:text-gray-400", children: [label, ":"] }), _jsx("div", { className: "flex items-center gap-2", children: hasActual ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "font-medium text-gray-900 dark:text-gray-100", children: formatter(actual) }), _jsx("span", { className: "text-gray-500 dark:text-gray-400", children: "vs" }), _jsx("span", { className: "text-gray-600 dark:text-gray-400", children: formatter(estimate) }), _jsx("span", { className: `font-medium ${isBeat ? 'text-green-600 dark:text-green-400' : isMiss ? 'text-red-600 dark:text-red-400' : 'text-gray-600'}`, children: isBeat ? '✅' : isMiss ? '❌' : '➖' })] })) : (_jsxs("span", { className: "text-gray-600 dark:text-gray-400", children: ["Est: ", formatter(estimate)] })) })] }), hasActual && Math.abs(diffPercent) > 0.1 && (_jsx("div", { className: "text-right mt-0.5", children: _jsxs("span", { className: `text-xs ${isBeat ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`, children: [diff > 0 ? '+' : '', formatter(diff), " (", diff > 0 ? '+' : '', diffPercent.toFixed(1), "%)"] }) }))] }));
};
/**
 * Beat Quality Display with Star Rating
 */
const BeatQualityDisplay = ({ earnings }) => {
    const beatQuality = beatQualityScorer.calculateBeatQuality(earnings);
    const stars = beatQualityScorer.getStarRating(beatQuality.overallScore);
    return (_jsx("div", { className: "mt-3 pt-3 border-t border-gray-200 dark:border-gray-700", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs text-gray-600 dark:text-gray-400", children: "Beat Quality:" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("span", { className: "text-xs font-medium text-gray-900 dark:text-gray-100", children: [beatQuality.overallScore, "/100"] }), _jsx("div", { className: "flex gap-0.5", "aria-label": `${stars} out of 5 stars`, children: [...Array(5)].map((_, i) => (_jsx("span", { className: i < stars ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600', "aria-hidden": "true", children: "\u2B50" }, i))) })] })] }) }));
};
/**
 * Format revenue (billions/millions)
 */
function formatRevenue(value) {
    if (value === null)
        return 'N/A';
    if (value >= 1e9) {
        return `$${(value / 1e9).toFixed(2)}B`;
    }
    if (value >= 1e6) {
        return `$${(value / 1e6).toFixed(2)}M`;
    }
    return `$${value.toFixed(2)}`;
}
export default EarningsContextCard;
