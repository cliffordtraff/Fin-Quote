/**
 * Macro Headlines Query Service
 *
 * Fetches and processes macro news articles for attribution:
 * - Queries newsArchive for scope='macro' articles
 * - Filters by market session date
 * - Groups and deduplicates similar events
 * - Returns structured macro event data
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@watchlist/lib/firebase/config';
import { getMarketSessionDate } from './market-context';
/**
 * Fetch today's macro headlines from newsArchive
 * Groups similar articles into events
 */
export function getTodaysMacroHeadlines(sessionDate_1) {
    return __awaiter(this, arguments, void 0, function* (sessionDate, maxArticles = 50) {
        const marketDate = sessionDate || getMarketSessionDate();
        // Query window: 4am previous day to 4am today (ET)
        const startTime = new Date(marketDate);
        startTime.setUTCHours(9, 0, 0, 0); // 4am ET = 9am UTC (approximation, ignore DST)
        const endTime = new Date(startTime);
        endTime.setUTCDate(endTime.getUTCDate() + 1);
        try {
            // Query newsArchive for macro articles in time window
            const macroQuery = query(collection(db, 'newsArchive'), where('scope', '==', 'macro'), where('publishedAt', '>=', Timestamp.fromDate(startTime)), where('publishedAt', '<', Timestamp.fromDate(endTime)), orderBy('publishedAt', 'desc'));
            const snapshot = yield getDocs(macroQuery);
            // Convert to NewsArticle objects
            const articles = [];
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                articles.push({
                    id: doc.id,
                    headline: data.headline,
                    description: data.description,
                    canonicalUrl: data.canonicalUrl,
                    source: data.source,
                    sourceDomain: data.sourceDomain,
                    publishedAt: data.publishedAt.toDate(),
                    isPaywalled: data.isPaywalled || false,
                    normalizedTitle: data.headline.toLowerCase(),
                    normalizedDescription: data.description.toLowerCase(),
                    scope: data.scope,
                    macroEventType: data.macroEventType,
                    topics: data.topics,
                    feedTopic: data.feedTopic
                });
            });
            // Limit to maxArticles
            const limitedArticles = articles.slice(0, maxArticles);
            // Group into events by macroEventType
            const events = groupIntoEvents(limitedArticles);
            return {
                events,
                totalArticles: limitedArticles.length,
                sessionDate: marketDate,
                fetchedAt: new Date()
            };
        }
        catch (error) {
            console.error('Error fetching macro headlines:', error);
            return {
                events: [],
                totalArticles: 0,
                sessionDate: marketDate,
                fetchedAt: new Date()
            };
        }
    });
}
/**
 * Group articles into distinct macro events
 * Deduplicates similar headlines and groups by event type
 */
function groupIntoEvents(articles) {
    const eventGroups = new Map();
    for (const article of articles) {
        if (!article.macroEventType)
            continue;
        const eventKey = article.macroEventType;
        if (eventGroups.has(eventKey)) {
            const event = eventGroups.get(eventKey);
            // Add headline if not duplicate
            if (!isDuplicateHeadline(event.headlines, article.headline)) {
                event.headlines.push(article.headline);
                event.articleIds.push(article.id);
                if (!event.sources.includes(article.source)) {
                    event.sources.push(article.source);
                }
                // Update earliest timestamp
                if (article.publishedAt < event.publishedAt) {
                    event.publishedAt = article.publishedAt;
                }
            }
        }
        else {
            // Create new event group
            eventGroups.set(eventKey, {
                type: article.macroEventType,
                headlines: [article.headline],
                sources: [article.source],
                publishedAt: article.publishedAt,
                articleIds: [article.id]
            });
        }
    }
    // Sort events by recency
    return Array.from(eventGroups.values()).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}
/**
 * Check if headline is duplicate or very similar
 * Uses simple string similarity heuristic
 */
function isDuplicateHeadline(existingHeadlines, newHeadline) {
    const normalized = normalizeHeadline(newHeadline);
    for (const existing of existingHeadlines) {
        const normalizedExisting = normalizeHeadline(existing);
        // Exact match
        if (normalized === normalizedExisting) {
            return true;
        }
        // High similarity (>70% overlap)
        const similarity = calculateSimilarity(normalized, normalizedExisting);
        if (similarity > 0.7) {
            return true;
        }
    }
    return false;
}
/**
 * Normalize headline for comparison
 */
function normalizeHeadline(headline) {
    return headline
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Calculate string similarity using Jaccard index
 */
function calculateSimilarity(str1, str2) {
    const words1 = new Set(str1.split(' '));
    const words2 = new Set(str2.split(' '));
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
}
/**
 * Format macro event for prompt injection
 * Returns concise summary suitable for LLM context
 */
export function formatMacroEventForPrompt(event) {
    const typeLabel = formatEventType(event.type);
    const mainHeadline = event.headlines[0];
    const additionalCount = event.headlines.length - 1;
    let formatted = `[${typeLabel}] ${mainHeadline}`;
    if (additionalCount > 0) {
        formatted += ` (+${additionalCount} related article${additionalCount > 1 ? 's' : ''})`;
    }
    return formatted;
}
/**
 * Format event type as human-readable label
 */
function formatEventType(type) {
    const labels = {
        trade_tariff: 'Trade/Tariffs',
        fed_policy: 'Fed Policy',
        geopolitical: 'Geopolitical',
        economic_data: 'Economic Data',
        financial_stress: 'Financial Stress',
        policy: 'Government Policy'
    };
    return labels[type] || type;
}
/**
 * Summarize all macro events into compact prompt text
 * Limits output to top N most important events
 */
export function summarizeMacroEventsForPrompt(events, maxEvents = 5) {
    if (events.length === 0) {
        return 'No major macro events detected today.';
    }
    const topEvents = events.slice(0, maxEvents);
    const lines = topEvents.map(event => formatMacroEventForPrompt(event));
    return lines.join('\n');
}
/**
 * Check if any high-impact macro events exist
 * High-impact = trade_tariff, fed_policy, geopolitical, financial_stress
 */
export function hasHighImpactMacroEvents(events) {
    const highImpactTypes = [
        'trade_tariff',
        'fed_policy',
        'geopolitical',
        'financial_stress'
    ];
    return events.some(event => highImpactTypes.includes(event.type));
}
