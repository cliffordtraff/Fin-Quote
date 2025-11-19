/**
 * Type definitions for Earnings Integration
 *
 * Supports FMP earnings calendar data with earnings-aware AI summaries
 */
/**
 * Raw earnings data from FMP API with normalized fields
 */
export interface EarningsData {
    symbol: string;
    date: string;
    time: 'bmo' | 'amc' | 'unknown';
    eventTimestampUtc: number;
    fiscalDateEnding: string;
    epsEstimate: number | null;
    epsActual: number | null;
    revenueEstimate: number | null;
    revenueActual: number | null;
    source: 'fmp' | 'manual' | 'other';
    sourceVersion: string;
    updatedAt: number;
}
/**
 * Earnings context for a symbol relative to current time
 */
export interface EarningsContext {
    status: 'upcoming' | 'today_bmo' | 'today_amc' | 'recent' | 'none';
    daysAway?: number;
    daysSince?: number;
    lastEarnings?: EarningsData;
    nextEarnings?: EarningsData;
    impactConfidence: number;
    confidenceBreakdown?: {
        temporal: number;
        volume: number;
        news: number;
        analyst: number;
        gap: number;
        negative: number;
    };
}
/**
 * Beat/miss quality assessment for earnings
 */
export interface EarningsBeatQuality {
    epsQuality: 'strong_beat' | 'beat' | 'inline' | 'miss' | 'strong_miss' | 'no_estimate';
    revenueQuality: 'strong_beat' | 'beat' | 'inline' | 'miss' | 'strong_miss' | 'no_estimate';
    epsBeatPercent: number;
    revenueBeatPercent: number;
    overallScore: number;
    hasEpsData: boolean;
    hasRevenueData: boolean;
}
/**
 * Cached earnings document in Firestore
 */
export interface EarningsCache {
    symbol: string;
    upcoming: EarningsData | null;
    recent: EarningsData[];
    status: 'upcoming' | 'today_bmo' | 'today_amc' | 'recent' | 'none';
    daysAway: number | null;
    daysSince: number | null;
    eventTimestampUtc: number | null;
    cachedAt: number;
    ttl: number;
}
/**
 * Earnings calendar document (all symbols for a date)
 */
export interface EarningsCalendar {
    date: string;
    symbols: string[];
    cachedAt: number;
    ttl: number;
}
/**
 * Raw FMP API response for earnings calendar
 */
export interface FMPEarningsResponse {
    date: string;
    symbol: string;
    eps?: number;
    epsEstimated?: number;
    time?: string;
    revenue?: number;
    revenueEstimated?: number;
    fiscalDateEnding?: string;
    updatedFromDate?: string;
}
/**
 * Confidence scoring configuration
 */
export interface EarningsScoringConfig {
    temporal: {
        today_bmo: number;
        today_amc: number;
        t_plus_1: number;
        t_plus_2: number;
        t_plus_3_to_5: number;
        t_plus_6_to_7: number;
        t_minus_1: number;
        t_minus_2_to_5: number;
    };
    volume: {
        extreme: {
            threshold: number;
            points: number;
        };
        high: {
            threshold: number;
            points: number;
        };
        elevated: {
            threshold: number;
            points: number;
        };
    };
    news: {
        many: {
            threshold: number;
            points: number;
        };
        several: {
            threshold: number;
            points: number;
        };
        few: {
            threshold: number;
            points: number;
        };
    };
    analyst: {
        high_activity: {
            threshold: number;
            points: number;
        };
        moderate_activity: {
            threshold: number;
            points: number;
        };
    };
    gap: {
        large: {
            threshold: number;
            points: number;
        };
        moderate: {
            threshold: number;
            points: number;
        };
    };
    negative: {
        no_volume_spike: number;
        no_news_mentions: number;
        late_reaction: number;
    };
}
/**
 * Input data for confidence calculation
 */
export interface ConfidenceInput {
    earningsContext: {
        status: EarningsContext['status'];
        daysAway?: number;
        daysSince?: number;
    };
    quote: {
        volume: number;
        avgVolume: number;
        previousClose: number;
        price: number;
        dayOpen?: number;
    };
    headlines: Array<{
        title: string;
        description?: string;
    }>;
    analystChanges?: number;
}
