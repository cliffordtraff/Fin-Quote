/**
 * News Source Configuration
 * Manages quality filtering and prioritization of news sources
 */
// Sources to block - low quality, promotional, or clickbait content
export const BLOCKED_NEWS_SOURCES = [
    '247wallst.com',
    'fool.com',
    'fxempire.com',
    'finbold.com',
    'seeitmarket.com',
    'proactiveinvestors.com'
];
// Premium tier sources - highest quality financial journalism
export const TIER_1_SOURCES = [
    'reuters.com',
    'wsj.com',
    'cnbc.com',
    'bloomberg.com',
    'ft.com',
    'barrons.com',
    'forbes.com'
];
// Good quality sources - reliable but may have some promotional content
export const TIER_2_SOURCES = [
    'marketwatch.com',
    'businessinsider.com',
    'seekingalpha.com',
    'investors.com',
    'yahoo.com',
    'thestreet.com'
];
// Press release sources - direct from companies, factual but promotional
export const PRESS_RELEASE_SOURCES = [
    'prnewswire.com',
    'businesswire.com',
    'globenewswire.com',
    'accesswire.com'
];
// Helper function to normalize domain for comparison
export function normalizeDomain(url) {
    if (!url)
        return '';
    // Remove protocol
    let domain = url.replace(/^https?:\/\//, '');
    // Remove www
    domain = domain.replace(/^www\./, '');
    // Remove path
    domain = domain.split('/')[0];
    // Remove port
    domain = domain.split(':')[0];
    // Convert to lowercase
    return domain.toLowerCase();
}
// Check if a source is blocked
export function isBlockedSource(source) {
    const normalizedSource = normalizeDomain(source);
    return BLOCKED_NEWS_SOURCES.some(blocked => normalizedSource.includes(blocked.toLowerCase()));
}
// Get source quality tier
export function getSourceTier(source) {
    const normalizedSource = normalizeDomain(source);
    if (BLOCKED_NEWS_SOURCES.some(s => normalizedSource.includes(s.toLowerCase()))) {
        return 'blocked';
    }
    if (TIER_1_SOURCES.some(s => normalizedSource.includes(s.toLowerCase()))) {
        return 'tier1';
    }
    if (TIER_2_SOURCES.some(s => normalizedSource.includes(s.toLowerCase()))) {
        return 'tier2';
    }
    if (PRESS_RELEASE_SOURCES.some(s => normalizedSource.includes(s.toLowerCase()))) {
        return 'press';
    }
    return 'unknown';
}
// Sort articles by source quality
export function sortBySourceQuality(articles) {
    const tierOrder = { tier1: 1, tier2: 2, unknown: 3, press: 4, blocked: 5 };
    return [...articles].sort((a, b) => {
        const tierA = getSourceTier(a.site || '');
        const tierB = getSourceTier(b.site || '');
        return tierOrder[tierA] - tierOrder[tierB];
    });
}
