/**
 * Formats dividend yield for display
 * - Shows "0.00" only for confirmed zero yields
 * - Handles very small numbers appropriately
 * - Note: null/undefined values are handled in the component with proper styling
 */
export const formatDividendYield = (yieldValue, basis) => {
    // Handle confirmed zero
    if (yieldValue === 0) {
        return "0.00";
    }
    // Handle very small yields
    if (yieldValue && yieldValue < 0.01) {
        return "<0.01";
    }
    // Format normal yields
    return (yieldValue === null || yieldValue === void 0 ? void 0 : yieldValue.toFixed(2)) || "0.00";
};
/**
 * Formats ex-dividend date for display
 */
export const formatExDividendDate = (date) => {
    if (!date)
        return "—";
    try {
        const exDate = new Date(date);
        const today = new Date();
        const daysUntil = Math.floor((exDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntil < 0)
            return "—";
        if (daysUntil === 0)
            return "Today";
        if (daysUntil === 1)
            return "Tomorrow";
        if (daysUntil <= 7)
            return `${daysUntil} days`;
        return exDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }
    catch (_a) {
        return "—";
    }
};
/**
 * Formats price for display
 */
export const formatPrice = (price) => {
    if (price === null || price === undefined)
        return "—";
    // For crypto or very high prices
    if (price >= 10000) {
        return price.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    // For penny stocks
    if (price < 1) {
        return price.toFixed(4);
    }
    // Normal stocks
    return price.toFixed(2);
};
/**
 * Formats percentage change for display
 */
export const formatPercentChange = (change) => {
    if (change === null || change === undefined)
        return "—";
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
};
/**
 * Formats large numbers (volume, market cap)
 */
export const formatLargeNumber = (num) => {
    if (num === null || num === undefined)
        return "—";
    if (num >= 1e12) {
        return `${(num / 1e12).toFixed(2)}T`;
    }
    if (num >= 1e9) {
        return `${(num / 1e9).toFixed(2)}B`;
    }
    if (num >= 1e6) {
        return `${(num / 1e6).toFixed(2)}M`;
    }
    if (num >= 1e3) {
        return `${(num / 1e3).toFixed(2)}K`;
    }
    return num.toFixed(0);
};
