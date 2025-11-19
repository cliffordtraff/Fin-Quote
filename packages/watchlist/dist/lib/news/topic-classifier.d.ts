/**
 * Topic Classification Service
 *
 * Classifies news articles into topics using OpenAI GPT-4o-mini.
 * Features:
 * - Batch classification (20-30 articles per API call)
 * - Idempotency via content hash
 * - Feed-level topic extraction
 * - Graceful fallback hierarchy
 * - Classification metadata storage
 */
import { NewsArticle } from '@watchlist/types';
import { Topic } from '@watchlist/config/topics';
/**
 * Generate idempotency key for an article
 * Uses MD5 hash of headline + description + source
 */
export declare function generateIdempotencyKey(article: NewsArticle): string;
/**
 * Classify a batch of articles
 *
 * @param articles - Articles to classify
 * @param batchSize - Max articles per GPT call (default: 25)
 * @returns Articles with topics and classification metadata
 */
export declare function classifyArticles(articles: NewsArticle[], batchSize?: number): Promise<NewsArticle[]>;
/**
 * Get fallback topics for an article when classification fails
 * Uses hierarchy: feedTopic → RSS categories → 'Business'
 */
export declare function getFallbackTopics(article: NewsArticle): Topic[];
/**
 * Merge feed topic with GPT-classified topics
 * Ensures feed topic is included, GPT topics take priority
 */
export declare function mergeTopics(feedTopic: Topic, gptTopics: Topic[]): Topic[];
