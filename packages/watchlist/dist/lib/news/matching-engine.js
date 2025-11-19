import { companyMappings } from '@watchlist/lib/data/company-mappings';
// Configuration
const CONFIDENCE_THRESHOLD = 40; // Balanced threshold for precision/recall
const HEADLINE_BOOST = 10; // Extra confidence for headline matches
const EXACT_TICKER_CONFIDENCE = 95;
const COMPANY_NAME_CONFIDENCE = 85;
const URL_SLUG_CONFIDENCE = 80; // New: URL slug matches
const ALIAS_CONFIDENCE = 70;
const EXECUTIVE_CONFIDENCE = 60;
const PRODUCT_CONFIDENCE = 50;
// Ambiguous tickers that require stronger signals to prevent false positives
const AMBIGUOUS_TICKERS = new Set(['F', 'T', 'GM', 'IT', 'ON', 'ALL', 'A', 'C']);
// Ambiguous tickers with clear company names (relaxed gating - allow company name in description)
const AMBIGUOUS_WITH_CLEAR_NAME = new Set(['T', 'GM']); // AT&T, General Motors have distinctive names
// Source tier scoring
const SOURCE_TIER_SCORES = {
    'WSJ': 10,
    'NYT': 8,
    'Bloomberg': 10,
    'Reuters': 8
};
export class NewsMatchingEngine {
    normalizeText(text) {
        return text.toLowerCase().trim();
    }
    generateMatchReason(matchType, matchedTerm, ticker, companyName) {
        switch (matchType) {
            case 'exact':
                return `Mentions ${ticker}`;
            case 'company':
                return `Mentions ${matchedTerm}`;
            case 'executive':
                return `${matchedTerm} mentioned`;
            case 'product':
                return `${matchedTerm} news`;
            case 'context':
            case 'entity':
                return `Related to ${companyName}`;
            default:
                return `Related news`;
        }
    }
    containsExactTicker(text, ticker) {
        // For ambiguous single-letter tickers, require much more explicit context
        if (AMBIGUOUS_TICKERS.has(ticker)) {
            const strictPatterns = [
                `\\$${ticker}\\b`, // Dollar sign: $F, $T
                `\\(${ticker}\\)`, // In parentheses: (F), (T)
                `\\b${ticker}:\\s*NYSE`, // Exchange: F: NYSE
                `\\b${ticker}:\\s*NASDAQ`, // Exchange: T: NASDAQ
                `NYSE:\\s*${ticker}\\b`, // NYSE: F
                `NASDAQ:\\s*${ticker}\\b`, // NASDAQ: T
                `\\b${ticker}\\s+stock\\b`, // "F stock", "T stock"
                `\\bticker\\s+${ticker}\\b`, // "ticker F", "ticker T"
                `\\bsymbol\\s+${ticker}\\b` // "symbol F", "symbol T"
            ];
            for (const pattern of strictPatterns) {
                const regex = new RegExp(pattern, 'i');
                if (regex.test(text)) {
                    return true;
                }
            }
            return false;
        }
        // For non-ambiguous tickers, use standard patterns
        const patterns = [
            `\\b${ticker}\\b`, // Word boundary match: NVDA
            `\\$${ticker}\\b`, // Dollar sign: $NVDA
            `\\(${ticker}\\)`, // In parentheses: (NVDA)
            `\\b${ticker}:`, // Exchange notation: NVDA:
            `NASDAQ:\\s*${ticker}\\b`, // NASDAQ: NVDA
            `NYSE:\\s*${ticker}\\b`, // NYSE: NVDA
            `\\(${ticker}:\\s*\\w+\\)`, // Full exchange: (NVDA: NASDAQ)
            `\\b${ticker}\\s+stock\\b`, // "NVDA stock"
            `\\b${ticker}'s\\b` // Possessive: NVDA's
        ];
        for (const pattern of patterns) {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(text)) {
                return true;
            }
        }
        return false;
    }
    extractUrlSlug(url) {
        // Extract potential company/ticker references from URL
        const slugs = [];
        // Remove protocol and domain
        const pathMatch = url.match(/^https?:\/\/[^\/]+(.*)$/);
        if (!pathMatch)
            return slugs;
        const path = pathMatch[1].toLowerCase();
        // Common non-company terms to filter out
        const excludeTerms = [
            'www', 'com', 'tech', 'business', 'article', 'news', 'story', 'articles',
            'html', 'php', 'aspx', 'index', 'page', 'post', 'blog', 'category',
            'tag', 'year', 'month', 'day', 'amp', 'feed', 'rss',
            // Generic corporate terms that cause false positives
            'group', 'corp', 'inc', 'company', 'corporation', 'limited', 'ltd',
            'holdings', 'international', 'global', 'industries'
        ];
        // Split by common separators and filter
        const parts = path.split(/[\/\-_\.]/)
            .filter(p => {
            // Must be at least 3 chars AND not a common term AND not all digits
            return p.length >= 3 && !excludeTerms.includes(p) && !/^\d+$/.test(p);
        });
        slugs.push(...parts);
        return slugs;
    }
    checkUrlForCompany(url, ticker, companyName) {
        const slugs = this.extractUrlSlug(url);
        const normalizedTicker = ticker.toLowerCase();
        const normalizedCompany = companyName.toLowerCase().replace(/[^\w]/g, '');
        // For ambiguous single-letter tickers, skip URL matching entirely
        if (AMBIGUOUS_TICKERS.has(ticker)) {
            // Only match if company name appears in URL (not ticker)
            for (const slug of slugs) {
                if (slug.includes(normalizedCompany) && normalizedCompany.length > 3) {
                    return true;
                }
            }
            return false;
        }
        for (const slug of slugs) {
            // Check for exact ticker match in URL (must be 3+ chars for safety)
            if (slug === normalizedTicker && ticker.length >= 3) {
                return true;
            }
            // Check for company name match (requires significant overlap)
            // Must match at least 60% of the company name to avoid false positives
            if (normalizedCompany.length >= 6 && slug.includes(normalizedCompany)) {
                return true;
            }
            // Check for common variations (e.g., "nvidia" for NVDA)
            // Require slug to be at least 6 chars AND match a significant portion (60%+)
            if (slug.length >= 6 &&
                companyName.toLowerCase().includes(slug) &&
                slug.length >= companyName.length * 0.6) {
                return true;
            }
        }
        return false;
    }
    findExactMatches(text, terms) {
        const normalizedText = this.normalizeText(text);
        const matches = [];
        for (const term of terms) {
            const normalizedTerm = this.normalizeText(term);
            // Use word boundary matching for more accurate results
            const regex = new RegExp(`\\b${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(normalizedText)) {
                matches.push(term);
            }
        }
        return matches;
    }
    calculateContextBoost(text, mapping) {
        let boost = 0;
        const normalizedText = this.normalizeText(text);
        // Check positive context
        for (const positiveWord of mapping.contextPositive) {
            if (normalizedText.includes(this.normalizeText(positiveWord))) {
                boost += 5;
            }
        }
        // Check negative context (reduces confidence)
        for (const negativeWord of mapping.contextNegative) {
            if (normalizedText.includes(this.normalizeText(negativeWord))) {
                boost -= 20;
            }
        }
        return boost;
    }
    matchArticleToTicker(article, ticker) {
        const mapping = companyMappings[ticker];
        if (!mapping)
            return null;
        const headline = article.headline;
        const description = article.description;
        const combinedText = `${headline} ${description}`;
        const url = article.canonicalUrl || '';
        let confidence = 0;
        let matchType = 'context';
        const matchedTerms = [];
        // Layer 0: URL slug match (strong signal)
        if (url && this.checkUrlForCompany(url, ticker, mapping.primary)) {
            confidence = URL_SLUG_CONFIDENCE;
            matchType = 'company';
            matchedTerms.push(`URL: ${ticker}`);
        }
        // Layer 1: Exact ticker match
        if (confidence === 0 && this.containsExactTicker(combinedText, ticker)) {
            confidence = EXACT_TICKER_CONFIDENCE;
            matchType = 'exact';
            matchedTerms.push(ticker);
            // Boost if in headline
            if (this.containsExactTicker(headline, ticker)) {
                confidence += 5;
            }
        }
        // Layer 2: Company name match (with word boundaries to prevent substring false positives)
        if (confidence === 0) {
            const normalizedCombined = this.normalizeText(combinedText);
            const normalizedHeadline = this.normalizeText(headline);
            // Helper to escape regex special characters
            const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Check primary name with word boundaries
            const primaryNameRegex = new RegExp(`\\b${escapeRegex(this.normalizeText(mapping.primary))}\\b`, 'i');
            if (primaryNameRegex.test(normalizedCombined)) {
                confidence = COMPANY_NAME_CONFIDENCE;
                matchType = 'company';
                matchedTerms.push(mapping.primary);
                if (primaryNameRegex.test(normalizedHeadline)) {
                    confidence += HEADLINE_BOOST;
                }
            }
            // Check aliases with word boundaries
            if (confidence === 0) {
                for (const alias of mapping.aliases) {
                    const aliasRegex = new RegExp(`\\b${escapeRegex(this.normalizeText(alias))}\\b`, 'i');
                    if (aliasRegex.test(normalizedCombined)) {
                        confidence = ALIAS_CONFIDENCE;
                        matchType = 'company';
                        matchedTerms.push(alias);
                        if (aliasRegex.test(normalizedHeadline)) {
                            confidence += HEADLINE_BOOST;
                        }
                        break;
                    }
                }
            }
        }
        // Layer 3: Executive match
        if (confidence === 0) {
            const executiveMatches = this.findExactMatches(combinedText, mapping.executives);
            if (executiveMatches.length > 0) {
                confidence = EXECUTIVE_CONFIDENCE;
                matchType = 'executive';
                matchedTerms.push(...executiveMatches);
                // Boost if executive in headline
                const headlineExecMatches = this.findExactMatches(headline, mapping.executives);
                if (headlineExecMatches.length > 0) {
                    confidence += HEADLINE_BOOST;
                }
            }
        }
        // Layer 4: Product match (REMOVED - too many false positives)
        // Product-only matches are insufficient evidence for relevance.
        // Articles must mention the company name, ticker, or executive to be included.
        // Apply context boost/penalty
        if (confidence > 0) {
            const contextBoost = this.calculateContextBoost(combinedText, mapping);
            confidence += contextBoost;
        }
        // Apply source tier bonus
        const sourceTierScore = SOURCE_TIER_SCORES[article.source] || 0;
        if (confidence > 0 && sourceTierScore > 0) {
            confidence += sourceTierScore;
        }
        // Ensure confidence stays within bounds
        confidence = Math.max(0, Math.min(100, confidence));
        // Apply ambiguous ticker gating
        if (AMBIGUOUS_TICKERS.has(ticker) && confidence > 0) {
            // For ambiguous tickers with clear company names (AT&T, GM), be less strict
            if (AMBIGUOUS_WITH_CLEAR_NAME.has(ticker)) {
                // Allow if company name appears (even in description) OR high confidence
                const hasCompanyName = new RegExp(`\\b${this.normalizeText(mapping.primary).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(this.normalizeText(combinedText));
                if (!hasCompanyName && confidence < 70) {
                    return null;
                }
            }
            else {
                // For highly ambiguous tickers (F, A, C, etc.), require strict signals
                // 1. URL slug match (strongest signal)
                // 2. Exact ticker or company name in headline
                // 3. High confidence (≥80)
                const hasUrlSlug = matchedTerms.some(t => t.startsWith('URL:'));
                const hasHeadlineMatch = this.containsExactTicker(headline, ticker) ||
                    new RegExp(`\\b${this.normalizeText(mapping.primary).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(this.normalizeText(headline));
                if (!hasUrlSlug && !hasHeadlineMatch && confidence < 80) {
                    // Reject weak ambiguous ticker matches
                    return null;
                }
            }
        }
        // Return match if above threshold
        if (confidence >= CONFIDENCE_THRESHOLD) {
            const primaryMatchedTerm = matchedTerms[0] || mapping.primary;
            const matchReason = this.generateMatchReason(matchType, primaryMatchedTerm, ticker, mapping.primary);
            // Dev-mode logging for debugging
            if (process.env.NODE_ENV === 'development') {
                console.log(`[NewsMatching] ${ticker} ← "${article.headline.substring(0, 60)}..." | ` +
                    `Type: ${matchType} | Confidence: ${confidence} | Reason: ${matchReason}`);
            }
            return {
                symbol: ticker,
                confidence,
                matchType,
                matchedTerms,
                matchReason
            };
        }
        // Log rejected matches for ambiguous tickers in dev mode
        if (process.env.NODE_ENV === 'development' && confidence > 0 && confidence < CONFIDENCE_THRESHOLD) {
            console.log(`[NewsMatching] REJECTED ${ticker} (confidence ${confidence} < ${CONFIDENCE_THRESHOLD}) ← ` +
                `"${article.headline.substring(0, 50)}..."`);
        }
        return null;
    }
    matchArticles(articles, tickers) {
        const tickerNewsMap = new Map();
        // Initialize map with empty arrays
        for (const ticker of tickers) {
            tickerNewsMap.set(ticker, []);
        }
        // Temporarily disable date filtering to handle RSS edge cases
        // TODO: Re-enable with a more appropriate timeframe once RSS feed dates are stable
        const recentArticles = articles;
        // Match each recent article to tickers
        for (const article of recentArticles) {
            const matches = [];
            // Try to match against each ticker
            for (const ticker of tickers) {
                const match = this.matchArticleToTicker(article, ticker);
                if (match) {
                    matches.push({
                        symbol: match.symbol,
                        confidence: match.confidence,
                        matchType: match.matchType,
                        matchedTerms: match.matchedTerms,
                        matchReason: match.matchReason
                    });
                }
            }
            // Add article to matched tickers
            if (matches.length > 0) {
                // Sort by confidence
                matches.sort((a, b) => b.confidence - a.confidence);
                // Add matches to article
                const articleWithMatches = Object.assign(Object.assign({}, article), { matchedTickers: matches });
                // Add to each matched ticker's news array
                for (const match of matches) {
                    const tickerNews = tickerNewsMap.get(match.symbol) || [];
                    tickerNews.push(articleWithMatches);
                    tickerNewsMap.set(match.symbol, tickerNews);
                }
            }
        }
        // Sort news for each ticker by confidence and recency
        for (const [ticker, news] of tickerNewsMap.entries()) {
            news.sort((a, b) => {
                var _a, _b, _c, _d;
                // First sort by confidence
                const aConfidence = ((_b = (_a = a.matchedTickers) === null || _a === void 0 ? void 0 : _a.find(m => m.symbol === ticker)) === null || _b === void 0 ? void 0 : _b.confidence) || 0;
                const bConfidence = ((_d = (_c = b.matchedTickers) === null || _c === void 0 ? void 0 : _c.find(m => m.symbol === ticker)) === null || _d === void 0 ? void 0 : _d.confidence) || 0;
                if (aConfidence !== bConfidence) {
                    return bConfidence - aConfidence;
                }
                // Then by publish date
                return b.publishedAt.getTime() - a.publishedAt.getTime();
            });
        }
        return tickerNewsMap;
    }
    deduplicateArticles(articles) {
        const seenUrls = new Set();
        const seenTitles = new Map();
        for (const article of articles) {
            // Primary deduplication: by canonical URL
            if (seenUrls.has(article.canonicalUrl)) {
                continue; // Skip this duplicate URL
            }
            seenUrls.add(article.canonicalUrl);
            // Secondary deduplication: by normalized title (for same story from different sources)
            const titleKey = article.normalizedTitle;
            if (!seenTitles.has(titleKey)) {
                seenTitles.set(titleKey, article);
            }
            else {
                // Keep the one with more information
                const existing = seenTitles.get(titleKey);
                if (article.description.length > existing.description.length) {
                    seenTitles.set(titleKey, article);
                }
            }
        }
        return Array.from(seenTitles.values());
    }
    rankArticles(articles) {
        const now = Date.now();
        return articles.map(article => {
            let score = article.confidence || 50;
            // Recency decay (lose 1 point per hour old)
            const hoursOld = (now - article.publishedAt.getTime()) / (1000 * 60 * 60);
            score -= Math.min(hoursOld, 24); // Cap at 24 hours
            // Event type boost
            if (article.eventType === 'earnings' || article.eventType === 'guidance') {
                score *= 1.5;
            }
            else if (article.eventType === 'lawsuit') {
                score *= 1.3;
            }
            else if (article.eventType === 'product') {
                score *= 1.2;
            }
            // Source quality (WSJ is high quality)
            if (article.source === 'WSJ') {
                score *= 1.1;
            }
            return Object.assign(Object.assign({}, article), { confidence: Math.max(0, Math.min(100, score)) });
        }).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    }
}
