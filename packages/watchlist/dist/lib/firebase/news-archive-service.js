var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { doc, setDoc, getDoc, getDocs, collection, query, where, orderBy, limit, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '@watchlist/lib/firebase/config';
export class NewsArchiveService {
    constructor() {
        this.collectionName = 'newsArchive';
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new NewsArchiveService();
        }
        return this.instance;
    }
    /**
     * Archive a new article
     */
    archiveArticle(article) {
        return __awaiter(this, void 0, void 0, function* () {
            const articleId = this.generateArticleId(article.canonicalUrl);
            // Use simpler path structure that works with client SDK
            const archiveRef = doc(db, 'newsArchive', articleId);
            const archivedArticle = {
                headline: article.headline,
                description: article.description,
                canonicalUrl: article.canonicalUrl,
                source: article.source,
                sourceDomain: article.sourceDomain,
                publishedAt: Timestamp.fromDate(article.publishedAt),
                archivedAt: Timestamp.now(),
                isPaywalled: article.isPaywalled || false
            };
            // Only add optional fields if they exist
            if (article.author) {
                archivedArticle.author = article.author;
            }
            if (article.categories && article.categories.length > 0) {
                archivedArticle.categories = article.categories;
            }
            if (article.matchedTickers && article.matchedTickers.length > 0) {
                archivedArticle.matchedTickers = article.matchedTickers.map(ticker => ({
                    symbol: ticker.symbol,
                    confidence: ticker.confidence
                }));
            }
            // Add topic classification fields
            if (article.feedTopic) {
                archivedArticle.feedTopic = article.feedTopic;
            }
            if (article.topics && article.topics.length > 0) {
                archivedArticle.topics = article.topics;
            }
            if (article.topicsClassified !== undefined) {
                archivedArticle.topicsClassified = article.topicsClassified;
            }
            if (article.classificationMetadata) {
                archivedArticle.classificationMetadata = {
                    model: article.classificationMetadata.model,
                    promptVersion: article.classificationMetadata.promptVersion,
                    classifiedAt: Timestamp.fromDate(article.classificationMetadata.classifiedAt),
                    idempotencyKey: article.classificationMetadata.idempotencyKey
                };
            }
            // Add macro attribution fields (v2.0.0)
            if (article.scope) {
                archivedArticle.scope = article.scope;
            }
            if (article.macroEventType !== undefined) {
                archivedArticle.macroEventType = article.macroEventType;
            }
            yield setDoc(archiveRef, archivedArticle, { merge: false });
            // Add to ticker indices if matched
            if (article.matchedTickers) {
                for (const ticker of article.matchedTickers) {
                    yield this.addToTickerIndex(ticker.symbol, articleId, article.publishedAt);
                }
            }
            // Add to source index
            yield this.addToSourceIndex(article.source, articleId, article.publishedAt);
        });
    }
    /**
     * Check if an article already exists in the archive
     */
    articleExists(url) {
        return __awaiter(this, void 0, void 0, function* () {
            const articleId = this.generateArticleId(url);
            const docRef = doc(db, 'newsArchive', articleId);
            const docSnap = yield getDoc(docRef);
            return docSnap.exists();
        });
    }
    /**
     * Get archived articles by ticker
     */
    getArticlesByTicker(ticker_1) {
        return __awaiter(this, arguments, void 0, function* (ticker, daysBack = 7, maxResults = 50) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysBack);
            const tickerQuery = query(collection(db, `newsArchiveByTicker_${ticker}`), where('date', '>=', Timestamp.fromDate(cutoffDate)), orderBy('date', 'desc'), limit(maxResults));
            const querySnapshot = yield getDocs(tickerQuery);
            const articleIds = querySnapshot.docs.map(doc => doc.id);
            // Fetch full articles
            const articles = [];
            for (const articleId of articleIds) {
                const article = yield this.getArticleById(articleId);
                if (article)
                    articles.push(article);
            }
            return articles;
        });
    }
    /**
     * Get archived articles by source
     */
    getArticlesBySource(source_1) {
        return __awaiter(this, arguments, void 0, function* (source, daysBack = 7, maxResults = 50) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysBack);
            const sourceQuery = query(collection(db, `newsArchiveBySource_${source}`), where('date', '>=', Timestamp.fromDate(cutoffDate)), orderBy('date', 'desc'), limit(maxResults));
            const querySnapshot = yield getDocs(sourceQuery);
            const articleIds = querySnapshot.docs.map(doc => doc.id);
            // Fetch full articles
            const articles = [];
            for (const articleId of articleIds) {
                const article = yield this.getArticleById(articleId);
                if (article)
                    articles.push(article);
            }
            return articles;
        });
    }
    /**
     * Get all archived articles within a date range
     */
    getArchivedArticles() {
        return __awaiter(this, arguments, void 0, function* (daysBack = 7, sources, maxResults = 100) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysBack);
            // Simplified query without composite index requirement
            const articlesQuery = query(collection(db, 'newsArchive'), where('publishedAt', '>=', Timestamp.fromDate(cutoffDate)), orderBy('publishedAt', 'desc'), limit(maxResults));
            const querySnapshot = yield getDocs(articlesQuery);
            let articles = querySnapshot.docs.map(doc => this.convertToNewsArticle(doc.id, doc.data()));
            // Filter by source after fetching if needed
            if (sources && sources.length > 0) {
                articles = articles.filter(article => sources.includes(article.source));
            }
            return articles;
        });
    }
    /**
     * Clean up articles older than the retention period
     */
    cleanupOldArticles() {
        return __awaiter(this, arguments, void 0, function* (retentionDays = 7) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const oldArticlesQuery = query(collection(db, 'newsArchive'), where('publishedAt', '<', Timestamp.fromDate(cutoffDate)), limit(100) // Process in batches
            );
            const querySnapshot = yield getDocs(oldArticlesQuery);
            let deletedCount = 0;
            for (const docSnapshot of querySnapshot.docs) {
                yield deleteDoc(docSnapshot.ref);
                deletedCount++;
                // Also clean up indices (would need to track these separately in production)
                // For now, indices will be cleaned up manually or via a separate process
            }
            return deletedCount;
        });
    }
    /**
     * Private helper methods
     */
    generateArticleId(url) {
        // Use URL hash as article ID
        const hash = this.hashUrl(url);
        return hash;
    }
    hashUrl(url) {
        // Simple hash function for URL
        let hash = 0;
        for (let i = 0; i < url.length; i++) {
            const char = url.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }
    addToTickerIndex(ticker, articleId, publishedAt) {
        return __awaiter(this, void 0, void 0, function* () {
            const dateStr = publishedAt.toISOString().split('T')[0];
            const indexRef = doc(db, `newsArchiveByTicker_${ticker}`, `${dateStr}_${articleId}`);
            yield setDoc(indexRef, { date: Timestamp.fromDate(publishedAt) });
        });
    }
    addToSourceIndex(source, articleId, publishedAt) {
        return __awaiter(this, void 0, void 0, function* () {
            const dateStr = publishedAt.toISOString().split('T')[0];
            const indexRef = doc(db, `newsArchiveBySource_${source}`, `${dateStr}_${articleId}`);
            yield setDoc(indexRef, { date: Timestamp.fromDate(publishedAt) });
        });
    }
    getArticleById(articleId) {
        return __awaiter(this, void 0, void 0, function* () {
            const docRef = doc(db, 'newsArchive', articleId);
            const docSnap = yield getDoc(docRef);
            if (!docSnap.exists())
                return null;
            return this.convertToNewsArticle(articleId, docSnap.data());
        });
    }
    convertToNewsArticle(id, archived) {
        var _a;
        return {
            id,
            headline: archived.headline,
            description: archived.description,
            canonicalUrl: archived.canonicalUrl,
            source: archived.source,
            sourceDomain: archived.sourceDomain,
            publishedAt: archived.publishedAt.toDate(),
            author: archived.author,
            categories: archived.categories,
            matchedTickers: (_a = archived.matchedTickers) === null || _a === void 0 ? void 0 : _a.map(ticker => ({
                symbol: ticker.symbol,
                confidence: ticker.confidence,
                matchType: 'context',
                matchedTerms: []
            })),
            isPaywalled: archived.isPaywalled,
            normalizedTitle: archived.headline.toLowerCase().replace(/[^a-z0-9]/g, ''),
            normalizedDescription: archived.description.toLowerCase().replace(/[^a-z0-9]/g, ''),
            isArchived: true,
            // Topic classification fields
            topics: archived.topics,
            feedTopic: archived.feedTopic,
            topicsClassified: archived.topicsClassified,
            classificationMetadata: archived.classificationMetadata ? {
                model: archived.classificationMetadata.model,
                promptVersion: archived.classificationMetadata.promptVersion,
                classifiedAt: archived.classificationMetadata.classifiedAt.toDate(),
                idempotencyKey: archived.classificationMetadata.idempotencyKey
            } : undefined,
            // Macro attribution fields (v2.0.0)
            scope: archived.scope,
            macroEventType: archived.macroEventType
        };
    }
}
export const newsArchiveService = NewsArchiveService.getInstance();
