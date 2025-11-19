/**
 * Earnings Beat Quality Scorer
 *
 * Assesses the quality of earnings beats/misses
 */
import { BEAT_QUALITY_THRESHOLDS, BEAT_QUALITY_WEIGHTS } from '@watchlist/config/earnings-scoring';
/**
 * Beat Quality Scorer
 */
export class BeatQualityScorer {
    /**
     * Calculate beat/miss quality for earnings data
     *
     * Returns quality assessment with overall score (0-100)
     */
    calculateBeatQuality(earnings) {
        const epsQuality = this.assessMetricQuality(earnings.epsActual, earnings.epsEstimate, 'EPS');
        const revenueQuality = this.assessMetricQuality(earnings.revenueActual, earnings.revenueEstimate, 'Revenue');
        const epsBeatPercent = this.calculateBeatPercent(earnings.epsActual, earnings.epsEstimate);
        const revenueBeatPercent = this.calculateBeatPercent(earnings.revenueActual, earnings.revenueEstimate);
        const overallScore = this.calculateOverallScore(epsQuality, revenueQuality, earnings.epsActual !== null && earnings.epsEstimate !== null, earnings.revenueActual !== null && earnings.revenueEstimate !== null);
        return {
            epsQuality: epsQuality.quality,
            revenueQuality: revenueQuality.quality,
            epsBeatPercent,
            revenueBeatPercent,
            overallScore,
            hasEpsData: earnings.epsActual !== null && earnings.epsEstimate !== null,
            hasRevenueData: earnings.revenueActual !== null && earnings.revenueEstimate !== null
        };
    }
    /**
     * Assess quality of a single metric (EPS or Revenue)
     */
    assessMetricQuality(actual, estimate, metricName) {
        // Missing data
        if (actual === null || estimate === null) {
            return { quality: 'no_estimate', score: 50 }; // Neutral score
        }
        // Avoid division by zero
        if (estimate === 0) {
            if (actual > 0)
                return { quality: 'strong_beat', score: 100 };
            if (actual < 0)
                return { quality: 'strong_miss', score: 0 };
            return { quality: 'inline', score: 50 };
        }
        const beatPercent = (actual - estimate) / Math.abs(estimate);
        // Assess quality based on thresholds
        if (beatPercent >= BEAT_QUALITY_THRESHOLDS.STRONG_BEAT) {
            return { quality: 'strong_beat', score: 100 };
        }
        if (beatPercent >= BEAT_QUALITY_THRESHOLDS.BEAT) {
            // Linear scale between 70-100
            const pct = (beatPercent - BEAT_QUALITY_THRESHOLDS.BEAT) /
                (BEAT_QUALITY_THRESHOLDS.STRONG_BEAT - BEAT_QUALITY_THRESHOLDS.BEAT);
            return { quality: 'beat', score: 70 + (pct * 30) };
        }
        if (Math.abs(beatPercent) < BEAT_QUALITY_THRESHOLDS.INLINE) {
            return { quality: 'inline', score: 50 };
        }
        if (beatPercent <= BEAT_QUALITY_THRESHOLDS.STRONG_MISS) {
            return { quality: 'strong_miss', score: 0 };
        }
        if (beatPercent <= BEAT_QUALITY_THRESHOLDS.MISS) {
            // Linear scale between 0-30
            const pct = Math.abs((beatPercent - BEAT_QUALITY_THRESHOLDS.MISS) /
                (BEAT_QUALITY_THRESHOLDS.STRONG_MISS - BEAT_QUALITY_THRESHOLDS.MISS));
            return { quality: 'miss', score: 30 - (pct * 30) };
        }
        return { quality: 'inline', score: 50 };
    }
    /**
     * Calculate beat percentage for display
     */
    calculateBeatPercent(actual, estimate) {
        if (actual === null || estimate === null)
            return 0;
        if (estimate === 0)
            return actual > 0 ? 100 : -100;
        return ((actual - estimate) / Math.abs(estimate)) * 100;
    }
    /**
     * Calculate overall score (0-100)
     *
     * Weighted combination of EPS and revenue quality
     * Handles missing data gracefully
     */
    calculateOverallScore(epsResult, revenueResult, hasEpsData, hasRevenueData) {
        // Both metrics available - weighted combination
        if (hasEpsData && hasRevenueData) {
            return Math.round(epsResult.score * BEAT_QUALITY_WEIGHTS.EPS +
                revenueResult.score * BEAT_QUALITY_WEIGHTS.REVENUE);
        }
        // Only EPS available
        if (hasEpsData) {
            return Math.round(epsResult.score);
        }
        // Only revenue available
        if (hasRevenueData) {
            return Math.round(revenueResult.score);
        }
        // No data available
        return 50; // Neutral
    }
    /**
     * Get human-readable quality description
     */
    getQualityDescription(quality) {
        switch (quality) {
            case 'strong_beat':
                return 'Strong beat (>5% above estimate)';
            case 'beat':
                return 'Beat (1-5% above estimate)';
            case 'inline':
                return 'Inline (within ±1% of estimate)';
            case 'miss':
                return 'Miss (1-5% below estimate)';
            case 'strong_miss':
                return 'Strong miss (>5% below estimate)';
            case 'no_estimate':
                return 'No estimate available';
            default:
                return 'Unknown';
        }
    }
    /**
     * Get star rating (1-5 stars) based on overall score
     */
    getStarRating(overallScore) {
        if (overallScore >= 90)
            return 5;
        if (overallScore >= 70)
            return 4;
        if (overallScore >= 50)
            return 3;
        if (overallScore >= 30)
            return 2;
        return 1;
    }
    /**
     * Format beat/miss for display
     */
    formatBeatMiss(actual, estimate) {
        if (actual === null || estimate === null) {
            return 'N/A';
        }
        const diff = actual - estimate;
        const sign = diff >= 0 ? '+' : '';
        if (estimate === 0) {
            return `${sign}${diff.toFixed(2)}`;
        }
        const percent = (diff / Math.abs(estimate)) * 100;
        return `${sign}${diff.toFixed(2)} (${sign}${percent.toFixed(1)}%)`;
    }
}
/**
 * Default singleton instance
 */
export const beatQualityScorer = new BeatQualityScorer();
