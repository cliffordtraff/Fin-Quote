/**
 * Earnings Impact Confidence Scoring Configuration
 *
 * All thresholds and weights are configurable here without code changes.
 * This enables tuning based on observed accuracy.
 */
import { EarningsScoringConfig } from '@/types/earnings';
/**
 * Scoring configuration for earnings impact confidence
 *
 * Total score is capped at 100, representing % confidence that
 * the current price move is driven by earnings.
 */
export declare const EARNINGS_SCORING_CONFIG: EarningsScoringConfig;
/**
 * Confidence interpretation thresholds
 */
export declare const CONFIDENCE_THRESHOLDS: {
    VERY_HIGH: number;
    HIGH: number;
    MODERATE: number;
    LOW: number;
};
/**
 * Beat quality thresholds (percentage vs estimate)
 */
export declare const BEAT_QUALITY_THRESHOLDS: {
    STRONG_BEAT: number;
    BEAT: number;
    INLINE: number;
    MISS: number;
    STRONG_MISS: number;
};
/**
 * Beat quality weighting for overall score
 */
export declare const BEAT_QUALITY_WEIGHTS: {
    EPS: number;
    REVENUE: number;
};
/**
 * Keywords that indicate earnings mentions in headlines
 */
export declare const EARNINGS_KEYWORDS: string[];
