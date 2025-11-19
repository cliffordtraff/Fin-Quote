import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Earnings Impact Meter Component
 *
 * Visual bar showing earnings impact confidence with breakdown
 */
import { useState } from 'react';
import { earningsContextCalculator } from '@watchlist/lib/earnings/earnings-context';
export const ImpactMeter = ({ confidence, breakdown, showBreakdown = true }) => {
    const [showDetails, setShowDetails] = useState(false);
    // Determine color based on confidence level
    const getColor = (conf) => {
        if (conf >= 90)
            return 'bg-red-500'; // Very high - red (hot)
        if (conf >= 70)
            return 'bg-orange-500'; // High - orange
        if (conf >= 50)
            return 'bg-yellow-500'; // Moderate - yellow
        if (conf >= 30)
            return 'bg-blue-500'; // Low - blue
        return 'bg-gray-400'; // Very low - gray
    };
    const getLabel = (conf) => {
        return earningsContextCalculator.getConfidenceLabel(conf);
    };
    const color = getColor(confidence);
    const label = getLabel(confidence);
    const percentage = Math.min(100, Math.max(0, confidence));
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "text-xs font-medium text-gray-700 dark:text-gray-300", children: "Earnings Impact" }), _jsxs("span", { className: "text-xs font-semibold text-gray-900 dark:text-gray-100", title: label, children: [confidence, "%"] })] }), _jsxs("div", { className: "relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden", children: [_jsx("div", { className: `h-full ${color} transition-all duration-300 ease-out rounded-full`, style: { width: `${percentage}%` }, role: "progressbar", "aria-valuenow": confidence, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": `Earnings impact confidence: ${confidence}%` }), _jsxs("div", { className: "absolute inset-0 flex", children: [_jsx("div", { className: "flex-1 border-r border-white/30" }), _jsx("div", { className: "flex-1 border-r border-white/30" }), _jsx("div", { className: "flex-1 border-r border-white/30" }), _jsx("div", { className: "flex-1" })] })] }), _jsx("div", { className: "text-xs text-gray-600 dark:text-gray-400 italic", children: label }), showBreakdown && breakdown && (_jsxs("div", { className: "mt-3 pt-3 border-t border-gray-200 dark:border-gray-700", children: [_jsxs("button", { onClick: () => setShowDetails(!showDetails), className: "w-full flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors", children: [_jsx("span", { children: "Based on:" }), _jsx("svg", { className: `w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`, fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" }) })] }), showDetails && (_jsxs("div", { className: "mt-2 space-y-1.5", children: [breakdown.temporal > 0 && (_jsx(BreakdownItem, { icon: "\uD83D\uDCC5", label: "Temporal proximity", value: breakdown.temporal })), breakdown.volume > 0 && (_jsx(BreakdownItem, { icon: "\uD83D\uDCCA", label: "Volume anomaly", value: breakdown.volume })), breakdown.news > 0 && (_jsx(BreakdownItem, { icon: "\uD83D\uDCF0", label: "News mentions", value: breakdown.news })), breakdown.analyst > 0 && (_jsx(BreakdownItem, { icon: "\uD83D\uDC54", label: "Analyst activity", value: breakdown.analyst })), breakdown.gap > 0 && (_jsx(BreakdownItem, { icon: "\uD83D\uDCC8", label: "Gap at open", value: breakdown.gap })), breakdown.negative < 0 && (_jsx(BreakdownItem, { icon: "\u26A0\uFE0F", label: "Conflicting signals", value: breakdown.negative, isNegative: true }))] }))] }))] }));
};
/**
 * Breakdown Item
 */
const BreakdownItem = ({ icon, label, value, isNegative = false }) => {
    return (_jsxs("div", { className: "flex items-center justify-between text-xs", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("span", { "aria-hidden": "true", children: icon }), _jsx("span", { className: "text-gray-600 dark:text-gray-400", children: label })] }), _jsxs("span", { className: `font-medium ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`, children: [value > 0 ? '+' : '', value] })] }));
};
export default ImpactMeter;
