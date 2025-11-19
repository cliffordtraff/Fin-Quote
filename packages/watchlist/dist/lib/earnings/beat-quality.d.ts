/**
 * Earnings Beat Quality Scorer
 *
 * Assesses the quality of earnings beats/misses
 */
import { EarningsData, EarningsBeatQuality } from '@watchlist/types/earnings';
/**
 * Beat Quality Scorer
 */
export declare class BeatQualityScorer {
    /**
     * Calculate beat/miss quality for earnings data
     *
     * Returns quality assessment with overall score (0-100)
     */
    calculateBeatQuality(earnings: EarningsData): EarningsBeatQuality;
    /**
     * Assess quality of a single metric (EPS or Revenue)
     */
    private assessMetricQuality;
    /**
     * Calculate beat percentage for display
     */
    private calculateBeatPercent;
    /**
     * Calculate overall score (0-100)
     *
     * Weighted combination of EPS and revenue quality
     * Handles missing data gracefully
     */
    private calculateOverallScore;
    /**
     * Get human-readable quality description
     */
    getQualityDescription(quality: EarningsBeatQuality['epsQuality']): string;
    /**
     * Get star rating (1-5 stars) based on overall score
     */
    getStarRating(overallScore: number): number;
    /**
     * Format beat/miss for display
     */
    formatBeatMiss(actual: number | null, estimate: number | null): string;
}
/**
 * Default singleton instance
 */
export declare const beatQualityScorer: BeatQualityScorer;
