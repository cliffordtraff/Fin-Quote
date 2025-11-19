/**
 * News Topic Classification Configuration
 *
 * Centralized topic taxonomy with version control and alias mapping.
 * Used by the topic classifier service to categorize RSS news articles.
 */
export declare const TOPIC_VERSION = "1.0";
/**
 * Primary topic taxonomy (14 categories)
 * These are the canonical topic names used throughout the system.
 */
export declare const TOPICS: readonly ["Markets", "Earnings", "Economy", "Fed Policy", "M&A", "Technology", "Crypto", "Energy", "Commodities", "Banking", "Real Estate", "Politics", "Business", "International"];
export type Topic = typeof TOPICS[number];
/**
 * Topic alias mapping for normalizing GPT outputs
 * Handles synonyms, abbreviations, and case variations
 */
export declare const TOPIC_ALIASES: Record<string, Topic>;
/**
 * Canonicalize a topic string to a valid Topic
 * Handles exact matches, aliases, and case variations
 *
 * @param topic - Raw topic string from GPT or other source
 * @returns Canonical topic name or null if invalid
 */
export declare function canonicalizeTopic(topic: string): Topic | null;
/**
 * Validate and canonicalize an array of topics
 * Filters out invalid topics and removes duplicates
 *
 * @param topics - Array of raw topic strings
 * @param maxTopics - Maximum number of topics to return (default: 3)
 * @returns Array of canonical topic names
 */
export declare function canonicalizeTopics(topics: string[], maxTopics?: number): Topic[];
/**
 * Feed type to topic mapping
 * Maps RSS feed types to their primary topic classification
 */
export declare const FEED_TOPIC_MAP: Record<string, Topic>;
/**
 * Get feed topic from source and feed type
 *
 * @param source - News source (WSJ, Bloomberg, NYT)
 * @param feedType - Feed type (markets, business, etc.)
 * @returns Primary topic for the feed or 'Business' as default
 */
export declare function getFeedTopic(source: string, feedType: string): Topic;
