import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Clock } from 'lucide-react';
import { cn } from '@watchlist/lib/utils';
/**
 * Toggle button for extended hours column visibility
 * Only active during pre-market (4-9:30am ET) and after-hours (4-8pm ET)
 */
export function ExtendedHoursToggle({ enabled, onToggle, isExtendedHours }) {
    return (_jsxs("button", { onClick: onToggle, className: cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors', 'hover:opacity-90 active:scale-95 transition-transform', enabled
            ? 'bg-blue-500 dark:bg-blue-600 text-white shadow-sm'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'), title: enabled
            ? 'Hide extended hours column'
            : 'Show extended hours column (displays last extended hours close)', children: [_jsx(Clock, { className: "w-4 h-4" }), _jsx("span", { children: "Extended Hours" })] }));
}
