/**
 * Earnings Impact Confidence Scoring Configuration
 *
 * All thresholds and weights are configurable here without code changes.
 * This enables tuning based on observed accuracy.
 */

import { EarningsScoringConfig } from '@/types/earnings'

/**
 * Scoring configuration for earnings impact confidence
 *
 * Total score is capped at 100, representing % confidence that
 * the current price move is driven by earnings.
 */
export const EARNINGS_SCORING_CONFIG: EarningsScoringConfig = {
  /**
   * Temporal factors: How close are we to earnings?
   *
   * Higher scores for proximity to earnings event.
   * BMO (before market open) gets slightly higher score than AMC
   * because it directly influences the current trading session.
   */
  temporal: {
    today_bmo: 50,      // Earnings this morning → current session reacting
    today_amc: 45,      // Earnings tonight → next session will react
    t_plus_1: 40,       // Yesterday (first full day of reaction)
    t_plus_2: 30,       // 2 days ago (continuing reaction)
    t_plus_3_to_5: 20,  // 3-5 days ago (delayed reaction)
    t_plus_6_to_7: 15,  // 6-7 days ago (fading impact)
    t_minus_1: 10,      // Tomorrow (anticipatory positioning)
    t_minus_2_to_5: 5   // 2-5 days away (early positioning)
  },

  /**
   * Volume factors: Is volume elevated?
   *
   * Earnings typically cause 2-5x normal volume.
   * Calibrated against typical post-earnings volume, not long-term averages.
   */
  volume: {
    extreme: { threshold: 3.0, points: 20 },    // 3x+ volume (very unusual)
    high: { threshold: 2.0, points: 15 },       // 2x+ volume (typical earnings)
    elevated: { threshold: 1.5, points: 10 }    // 1.5x+ volume (moderate)
  },

  /**
   * News factors: Do headlines mention earnings?
   *
   * Count of headlines with earnings keywords:
   * "earnings", "EPS", "revenue beat", "guidance", "quarterly results", etc.
   */
  news: {
    many: { threshold: 5, points: 15 },      // 5+ headlines mention earnings
    several: { threshold: 3, points: 10 },   // 3-4 headlines mention earnings
    few: { threshold: 1, points: 5 }         // 1-2 headlines mention earnings
  },

  /**
   * Analyst factors: Are analysts reacting to earnings?
   *
   * Count of analyst upgrades/downgrades/target changes in past 24h.
   * Analysts often update models immediately after earnings.
   */
  analyst: {
    high_activity: { threshold: 3, points: 10 },      // 3+ analyst changes
    moderate_activity: { threshold: 1, points: 5 }    // 1-2 analyst changes
  },

  /**
   * Gap factors: Did stock gap at open?
   *
   * After-hours earnings often cause gaps at next open.
   * Large gaps indicate strong earnings reaction.
   */
  gap: {
    large: { threshold: 0.05, points: 10 },     // 5%+ gap (strong reaction)
    moderate: { threshold: 0.03, points: 5 }    // 3%+ gap (moderate reaction)
  },

  /**
   * Negative signals: Evidence that conflicts with earnings attribution
   *
   * These reduce confidence when present.
   * Example: Earnings reported but volume is normal → less confidence
   */
  negative: {
    no_volume_spike: -10,    // Earnings happened but volume < 1.2x (unusual)
    no_news_mentions: -5,    // Earnings happened but 0 headlines mention it (stale news)
    late_reaction: -5        // T+5 or later with normal volume (impact faded)
  }
}

/**
 * Confidence interpretation thresholds
 */
export const CONFIDENCE_THRESHOLDS = {
  VERY_HIGH: 90,  // 90-100: Clearly earnings-driven
  HIGH: 70,       // 70-89: Likely earnings-driven
  MODERATE: 50,   // 50-69: Partially earnings-driven
  LOW: 30         // 30-49: Minimal earnings impact
  // 0-29: No earnings impact (don't mention in AI summary)
}

/**
 * Beat quality thresholds (percentage vs estimate)
 */
export const BEAT_QUALITY_THRESHOLDS = {
  STRONG_BEAT: 0.05,   // >5% above estimate
  BEAT: 0.01,          // 1-5% above estimate
  INLINE: 0.01,        // Within ±1% of estimate
  MISS: -0.01,         // 1-5% below estimate
  STRONG_MISS: -0.05   // >5% below estimate
}

/**
 * Beat quality weighting for overall score
 */
export const BEAT_QUALITY_WEIGHTS = {
  EPS: 0.6,       // EPS contributes 60% to overall score
  REVENUE: 0.4    // Revenue contributes 40% to overall score
}

/**
 * Keywords that indicate earnings mentions in headlines
 */
export const EARNINGS_KEYWORDS = [
  'earnings',
  'eps',
  'revenue',
  'quarterly results',
  'q1 results',
  'q2 results',
  'q3 results',
  'q4 results',
  'beat estimates',
  'miss estimates',
  'beat expectations',
  'miss expectations',
  'guidance',
  'outlook',
  'fiscal year',
  'profit',
  'loss',
  'report',
  'results'
]
