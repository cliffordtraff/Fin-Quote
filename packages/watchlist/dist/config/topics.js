/**
 * News Topic Classification Configuration
 *
 * Centralized topic taxonomy with version control and alias mapping.
 * Used by the topic classifier service to categorize RSS news articles.
 */
export const TOPIC_VERSION = '1.0';
/**
 * Primary topic taxonomy (14 categories)
 * These are the canonical topic names used throughout the system.
 */
export const TOPICS = [
    'Markets',
    'Earnings',
    'Economy',
    'Fed Policy',
    'M&A',
    'Technology',
    'Crypto',
    'Energy',
    'Commodities',
    'Banking',
    'Real Estate',
    'Politics',
    'Business',
    'International'
];
/**
 * Topic alias mapping for normalizing GPT outputs
 * Handles synonyms, abbreviations, and case variations
 */
export const TOPIC_ALIASES = {
    // Markets
    'market': 'Markets',
    'stock market': 'Markets',
    'stocks': 'Markets',
    'trading': 'Markets',
    'equities': 'Markets',
    // Earnings
    'earnings report': 'Earnings',
    'earnings reports': 'Earnings',
    'quarterly earnings': 'Earnings',
    'revenue': 'Earnings',
    'profit': 'Earnings',
    // Economy
    'economic': 'Economy',
    'gdp': 'Economy',
    'inflation': 'Economy',
    'unemployment': 'Economy',
    // Fed Policy
    'federal reserve': 'Fed Policy',
    'fed': 'Fed Policy',
    'interest rates': 'Fed Policy',
    'monetary policy': 'Fed Policy',
    'central bank': 'Fed Policy',
    // M&A
    'mergers': 'M&A',
    'acquisitions': 'M&A',
    'merger': 'M&A',
    'acquisition': 'M&A',
    'deals': 'M&A',
    'buyout': 'M&A',
    // Technology
    'tech': 'Technology',
    'ai': 'Technology',
    'software': 'Technology',
    'artificial intelligence': 'Technology',
    'chips': 'Technology',
    'semiconductors': 'Technology',
    // Crypto
    'cryptocurrency': 'Crypto',
    'cryptocurrencies': 'Crypto',
    'bitcoin': 'Crypto',
    'blockchain': 'Crypto',
    'digital assets': 'Crypto',
    'web3': 'Crypto',
    'ethereum': 'Crypto',
    // Energy
    'oil': 'Energy',
    'gas': 'Energy',
    'renewable': 'Energy',
    'renewables': 'Energy',
    'utilities': 'Energy',
    'clean energy': 'Energy',
    // Commodities
    'gold': 'Commodities',
    'metals': 'Commodities',
    'silver': 'Commodities',
    'agriculture': 'Commodities',
    'copper': 'Commodities',
    // Banking
    'financial services': 'Banking',
    'banks': 'Banking',
    'bank': 'Banking',
    'lending': 'Banking',
    'fintech': 'Banking',
    'finance': 'Banking',
    // Real Estate
    'housing': 'Real Estate',
    'real-estate': 'Real Estate',
    'property': 'Real Estate',
    'reits': 'Real Estate',
    'commercial property': 'Real Estate',
    // Politics
    'regulation': 'Politics',
    'policy': 'Politics',
    'government': 'Politics',
    'elections': 'Politics',
    'political': 'Politics',
    // Business
    'corporate': 'Business',
    'companies': 'Business',
    'company': 'Business',
    'business news': 'Business',
    // International
    'global': 'International',
    'geopolitics': 'International',
    'trade': 'International',
    'international trade': 'International',
    'world': 'International'
};
/**
 * Canonicalize a topic string to a valid Topic
 * Handles exact matches, aliases, and case variations
 *
 * @param topic - Raw topic string from GPT or other source
 * @returns Canonical topic name or null if invalid
 */
export function canonicalizeTopic(topic) {
    const normalized = topic.trim();
    // Check for exact match (case-sensitive)
    if (TOPICS.includes(normalized)) {
        return normalized;
    }
    // Check aliases (case-insensitive)
    const lowerTopic = normalized.toLowerCase();
    if (lowerTopic in TOPIC_ALIASES) {
        return TOPIC_ALIASES[lowerTopic];
    }
    return null;
}
/**
 * Validate and canonicalize an array of topics
 * Filters out invalid topics and removes duplicates
 *
 * @param topics - Array of raw topic strings
 * @param maxTopics - Maximum number of topics to return (default: 3)
 * @returns Array of canonical topic names
 */
export function canonicalizeTopics(topics, maxTopics = 3) {
    const canonicalized = topics
        .map(topic => canonicalizeTopic(topic))
        .filter((topic) => topic !== null);
    // Remove duplicates while preserving order
    const unique = Array.from(new Set(canonicalized));
    // Limit to maxTopics
    return unique.slice(0, maxTopics);
}
/**
 * Feed type to topic mapping
 * Maps RSS feed types to their primary topic classification
 */
export const FEED_TOPIC_MAP = {
    // WSJ
    'wsj_markets': 'Markets',
    'wsj_business': 'Business',
    'wsj_tech': 'Technology',
    'wsj_opinion': 'Business', // Opinion is too broad, default to Business
    // Bloomberg
    'bloomberg_markets': 'Markets',
    'bloomberg_technology': 'Technology',
    'bloomberg_politics': 'Politics',
    'bloomberg_wealth': 'Business',
    'bloomberg_industries': 'Business',
    // NYT
    'nyt_business': 'Business',
    'nyt_technology': 'Technology',
    'nyt_dealbook': 'M&A',
    'nyt_economy': 'Economy',
    'nyt_markets': 'Markets'
};
/**
 * Get feed topic from source and feed type
 *
 * @param source - News source (WSJ, Bloomberg, NYT)
 * @param feedType - Feed type (markets, business, etc.)
 * @returns Primary topic for the feed or 'Business' as default
 */
export function getFeedTopic(source, feedType) {
    const key = `${source.toLowerCase()}_${feedType.toLowerCase()}`;
    return FEED_TOPIC_MAP[key] || 'Business';
}
