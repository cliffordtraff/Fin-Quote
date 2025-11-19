/**
 * Earnings Context Calculator
 *
 * Calculates earnings impact confidence score and provides context
 */
import { ConfidenceInput } from '@watchlist/types/earnings';
/**
 * Earnings Context Calculator
 */
export declare class EarningsContextCalculator {
    /**
     * Calculate impact confidence score
     *
     * Returns 0-100 score representing confidence that the current
     * price move is driven by earnings.
     */
    calculateImpactConfidence(input: ConfidenceInput): {
        confidence: number;
        breakdown: {
            temporal: number;
            volume: number;
            news: number;
            analyst: number;
            gap: number;
            negative: number;
        };
    };
    /**
     * Calculate temporal proximity score
     */
    private calculateTemporalScore;
    /**
     * Calculate volume score
     */
    private calculateVolumeScore;
    /**
     * Calculate news mentions score
     */
    private calculateNewsScore;
    /**
     * Calculate analyst activity score
     */
    private calculateAnalystScore;
    /**
     * Calculate gap at open score
     */
    private calculateGapScore;
    /**
     * Calculate negative signals (reduce confidence)
     */
    private calculateNegativeSignals;
    /**
     * Check if text contains earnings keywords
     */
    private containsEarningsKeywords;
    /**
     * Get confidence interpretation label
     */
    getConfidenceLabel(confidence: number): string;
    /**
     * Determine if earnings context should be included in AI prompt
     */
    shouldIncludeInPrompt(confidence: number): boolean;
}
/**
 * Default singleton instance
 */
export declare const earningsContextCalculator: EarningsContextCalculator;
