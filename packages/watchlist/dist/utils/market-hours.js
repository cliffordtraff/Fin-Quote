// Helper function to get hours/minutes in Eastern Time
function getEasternTime(date) {
    var _a, _b, _c, _d;
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
        weekday: 'short'
    });
    const parts = formatter.formatToParts(date);
    const hours = parseInt(((_a = parts.find(p => p.type === 'hour')) === null || _a === void 0 ? void 0 : _a.value) || '0');
    const minutes = parseInt(((_b = parts.find(p => p.type === 'minute')) === null || _b === void 0 ? void 0 : _b.value) || '0');
    const weekday = ((_c = parts.find(p => p.type === 'weekday')) === null || _c === void 0 ? void 0 : _c.value) || '';
    // Convert weekday to day number (0 = Sunday, 6 = Saturday)
    const dayMap = {
        'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    };
    const day = (_d = dayMap[weekday]) !== null && _d !== void 0 ? _d : 0;
    return { hours, minutes, day };
}
// Utility to check if US stock market is open
export function isMarketOpen() {
    const now = new Date();
    const { hours: hour, minutes: minute, day } = getEasternTime(now);
    const currentTime = hour + minute / 60;
    // Closed on weekends
    if (day === 0 || day === 6)
        return false;
    // Market hours: 9:30 AM - 4:00 PM EST/EDT
    const marketStart = 9.5; // 9:30 AM
    const marketEnd = 16; // 4:00 PM
    return currentTime >= marketStart && currentTime < marketEnd;
}
// Check if currently in extended hours (pre-market or after-hours)
export function isExtendedHours() {
    const now = new Date();
    const { hours: hour, minutes: minute, day } = getEasternTime(now);
    // Debug logging
    console.log('[isExtendedHours] ET Time:', { hour, minute, day, dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day] });
    // No extended hours on weekends
    if (day === 0 || day === 6) {
        console.log('[isExtendedHours] Weekend - returning false');
        return false;
    }
    // Pre-market: 4:00 AM - 9:30 AM ET
    const isPreMarket = (hour >= 4 && hour < 9) || (hour === 9 && minute < 30);
    // After-hours: 4:00 PM - 8:00 PM ET
    const isAfterHours = hour >= 16 && hour < 20;
    console.log('[isExtendedHours] Pre-market:', isPreMarket, 'After-hours:', isAfterHours, 'Result:', isPreMarket || isAfterHours);
    return isPreMarket || isAfterHours;
}
// Get current extended hours session type
export function getExtendedHoursSession() {
    if (!isExtendedHours())
        return null;
    const { hours: hour, minutes: minute } = getEasternTime(new Date());
    // Before 9:30 AM is pre-market
    if (hour < 9 || (hour === 9 && minute < 30)) {
        return 'pre-market';
    }
    // 4:00 PM or later is after-hours
    return 'after-hours';
}
// Get appropriate cache max-age based on market status
export function getCacheMaxAge(dataType) {
    switch (dataType) {
        case 'quote':
            // Stock quotes: 15 seconds during market hours, 5 minutes after
            return isMarketOpen() ? 15 : 300;
        case 'dividend':
            // Dividend data rarely changes: 24 hours
            return 86400;
        case 'static':
            // Static data: 1 week
            return 604800;
        default:
            // Default: 1 minute
            return 60;
    }
}
