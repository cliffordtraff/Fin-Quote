/**
 * Earnings Context Calculator
 *
 * Calculates earnings impact confidence score and provides context
 */
import { EARNINGS_SCORING_CONFIG, EARNINGS_KEYWORDS, CONFIDENCE_THRESHOLDS } from '@watchlist/config/earnings-scoring';
/**
 * Earnings Context Calculator
 */
export class EarningsContextCalculator {
    /**
     * Calculate impact confidence score
     *
     * Returns 0-100 score representing confidence that the current
     * price move is driven by earnings.
     */
    calculateImpactConfidence(input) {
        const config = EARNINGS_SCORING_CONFIG;
        // Calculate individual components
        const temporal = this.calculateTemporalScore(input.earningsContext, config);
        const volume = this.calculateVolumeScore(input.quote, config);
        const news = this.calculateNewsScore(input.headlines, config);
        const analyst = this.calculateAnalystScore(input.analystChanges || 0, config);
        const gap = this.calculateGapScore(input.quote, config);
        const negative = this.calculateNegativeSignals(input, config);
        // Sum all components
        const total = temporal + volume + news + analyst + gap + negative;
        // Cap at 100
        const confidence = Math.min(100, Math.max(0, total));
        return {
            confidence,
            breakdown: {
                temporal,
                volume,
                news,
                analyst,
                gap,
                negative
            }
        };
    }
    /**
     * Calculate temporal proximity score
     */
    calculateTemporalScore(earningsContext, config) {
        const { status, daysAway, daysSince } = earningsContext;
        switch (status) {
            case 'today_bmo':
                return config.temporal.today_bmo;
            case 'today_amc':
                return config.temporal.today_amc;
            case 'recent':
                if (daysSince === 1)
                    return config.temporal.t_plus_1;
                if (daysSince === 2)
                    return config.temporal.t_plus_2;
                if (daysSince && daysSince >= 3 && daysSince <= 5)
                    return config.temporal.t_plus_3_to_5;
                if (daysSince && daysSince >= 6 && daysSince <= 7)
                    return config.temporal.t_plus_6_to_7;
                return 0;
            case 'upcoming':
                if (daysAway === 1)
                    return config.temporal.t_minus_1;
                if (daysAway && daysAway >= 2 && daysAway <= 5)
                    return config.temporal.t_minus_2_to_5;
                return 0;
            default:
                return 0;
        }
    }
    /**
     * Calculate volume score
     */
    calculateVolumeScore(quote, config) {
        if (!quote.volume || !quote.avgVolume)
            return 0;
        const volumeRatio = quote.volume / quote.avgVolume;
        if (volumeRatio >= config.volume.extreme.threshold) {
            return config.volume.extreme.points;
        }
        if (volumeRatio >= config.volume.high.threshold) {
            return config.volume.high.points;
        }
        if (volumeRatio >= config.volume.elevated.threshold) {
            return config.volume.elevated.points;
        }
        return 0;
    }
    /**
     * Calculate news mentions score
     */
    calculateNewsScore(headlines, config) {
        const earningsMentions = headlines.filter(h => this.containsEarningsKeywords(h.title) ||
            this.containsEarningsKeywords(h.description || '')).length;
        if (earningsMentions >= config.news.many.threshold) {
            return config.news.many.points;
        }
        if (earningsMentions >= config.news.several.threshold) {
            return config.news.several.points;
        }
        if (earningsMentions >= config.news.few.threshold) {
            return config.news.few.points;
        }
        return 0;
    }
    /**
     * Calculate analyst activity score
     */
    calculateAnalystScore(analystChanges, config) {
        if (analystChanges >= config.analyst.high_activity.threshold) {
            return config.analyst.high_activity.points;
        }
        if (analystChanges >= config.analyst.moderate_activity.threshold) {
            return config.analyst.moderate_activity.points;
        }
        return 0;
    }
    /**
     * Calculate gap at open score
     */
    calculateGapScore(quote, config) {
        if (!quote.dayOpen || !quote.previousClose)
            return 0;
        const gapPercent = Math.abs((quote.dayOpen - quote.previousClose) / quote.previousClose);
        if (gapPercent >= config.gap.large.threshold) {
            return config.gap.large.points;
        }
        if (gapPercent >= config.gap.moderate.threshold) {
            return config.gap.moderate.points;
        }
        return 0;
    }
    /**
     * Calculate negative signals (reduce confidence)
     */
    calculateNegativeSignals(input, config) {
        let negativeScore = 0;
        const { earningsContext, quote, headlines } = input;
        // Negative signal: Earnings happened but no volume spike
        if (earningsContext.status === 'recent' || earningsContext.status === 'today_bmo' || earningsContext.status === 'today_amc') {
            const volumeRatio = quote.volume && quote.avgVolume ? quote.volume / quote.avgVolume : 0;
            if (volumeRatio < 1.2) {
                negativeScore += config.negative.no_volume_spike;
            }
        }
        // Negative signal: Earnings happened but no news mentions
        if (earningsContext.status === 'recent' || earningsContext.status === 'today_bmo' || earningsContext.status === 'today_amc') {
            const earningsMentions = headlines.filter(h => this.containsEarningsKeywords(h.title) ||
                this.containsEarningsKeywords(h.description || '')).length;
            if (earningsMentions === 0) {
                negativeScore += config.negative.no_news_mentions;
            }
        }
        // Negative signal: Late reaction with normal volume
        if (earningsContext.status === 'recent' && earningsContext.daysSince && earningsContext.daysSince >= 5) {
            const volumeRatio = quote.volume && quote.avgVolume ? quote.volume / quote.avgVolume : 0;
            if (volumeRatio < 1.5) {
                negativeScore += config.negative.late_reaction;
            }
        }
        return negativeScore;
    }
    /**
     * Check if text contains earnings keywords
     */
    containsEarningsKeywords(text) {
        if (!text)
            return false;
        const lowerText = text.toLowerCase();
        return EARNINGS_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()));
    }
    /**
     * Get confidence interpretation label
     */
    getConfidenceLabel(confidence) {
        if (confidence >= CONFIDENCE_THRESHOLDS.VERY_HIGH) {
            return 'Very high confidence - clearly earnings-driven';
        }
        if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
            return 'High confidence - likely earnings-driven';
        }
        if (confidence >= CONFIDENCE_THRESHOLDS.MODERATE) {
            return 'Moderate confidence - partially earnings-driven';
        }
        if (confidence >= CONFIDENCE_THRESHOLDS.LOW) {
            return 'Low confidence - minimal earnings impact';
        }
        return 'No earnings impact';
    }
    /**
     * Determine if earnings context should be included in AI prompt
     */
    shouldIncludeInPrompt(confidence) {
        return confidence >= CONFIDENCE_THRESHOLDS.LOW; // 30+
    }
}
/**
 * Default singleton instance
 */
export const earningsContextCalculator = new EarningsContextCalculator();
