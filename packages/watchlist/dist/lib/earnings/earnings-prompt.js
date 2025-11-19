/**
 * Earnings Prompt Builder
 *
 * Formats earnings context for AI prompts
 */
import { beatQualityScorer } from './beat-quality';
import { CONFIDENCE_THRESHOLDS } from '@watchlist/config/earnings-scoring';
/**
 * Build earnings section for AI prompt
 *
 * Returns null if confidence is too low (<30%) to include
 */
export function buildEarningsPromptSection(earningsContext, confidence) {
    // Skip if confidence too low
    if (confidence < CONFIDENCE_THRESHOLDS.LOW) {
        return null;
    }
    const { status, daysAway, daysSince, lastEarnings, nextEarnings } = earningsContext;
    let section = '\nEarnings Context:\n';
    // Today (BMO or AMC)
    if (status === 'today_bmo' || status === 'today_amc') {
        const timing = status === 'today_bmo' ? 'before market open' : 'after market close';
        section += `- Status: EARNINGS TODAY (${timing.toUpperCase()})\n`;
        if (lastEarnings && lastEarnings.epsActual !== null) {
            // Actuals available (post-report)
            const beatQuality = beatQualityScorer.calculateBeatQuality(lastEarnings);
            section += formatEarningsResult(lastEarnings, beatQuality);
            section += `- Impact Confidence: ${confidence}% (earnings-driven move)\n`;
            section += `- IMPORTANT: Focus analysis on earnings quality, guidance, and market reaction. This is clearly an earnings-driven move.\n`;
        }
        else {
            // Pre-report
            section += `- Estimates: EPS ${formatNumber(lastEarnings === null || lastEarnings === void 0 ? void 0 : lastEarnings.epsEstimate)}, Revenue ${formatRevenue(lastEarnings === null || lastEarnings === void 0 ? void 0 : lastEarnings.revenueEstimate)}\n`;
            section += `- Impact Confidence: ${confidence}%\n`;
            section += `- NOTE: Current move may be anticipatory positioning before earnings report.\n`;
        }
    }
    // Recent earnings (1-7 days ago)
    else if (status === 'recent' && lastEarnings) {
        section += `- Status: POST-EARNINGS (${daysSince} day${daysSince !== 1 ? 's' : ''} ago)\n`;
        section += `- Last Report: ${lastEarnings.date}\n`;
        if (lastEarnings.epsActual !== null || lastEarnings.revenueActual !== null) {
            const beatQuality = beatQualityScorer.calculateBeatQuality(lastEarnings);
            section += formatEarningsResult(lastEarnings, beatQuality);
        }
        section += `- Impact Confidence: ${confidence}%\n`;
        section += `- NOTE: Current move may be delayed reaction, analyst updates, or re-rating after earnings.\n`;
    }
    // Upcoming earnings (1-5 days away)
    else if (status === 'upcoming' && nextEarnings) {
        section += `- Status: PRE-EARNINGS (${daysAway} day${daysAway !== 1 ? 's' : ''} until ${nextEarnings.date})\n`;
        section += `- Timing: ${nextEarnings.time.toUpperCase()}\n`;
        section += `- Estimates: EPS ${formatNumber(nextEarnings.epsEstimate)}, Revenue ${formatRevenue(nextEarnings.revenueEstimate)}\n`;
        section += `- Impact Confidence: ${confidence}%\n`;
        section += `- NOTE: Current move may be anticipatory positioning, unusual options activity, or earnings preview speculation.\n`;
    }
    // No earnings nearby
    else {
        section += `- Status: NO_EARNINGS_NEARBY\n`;
        if (nextEarnings) {
            const daysUntil = Math.floor((new Date(nextEarnings.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            section += `- Next earnings: ${nextEarnings.date} (${daysUntil} days away)\n`;
        }
        section += `- Do not focus on earnings unless headlines specifically mention it\n`;
    }
    return section;
}
/**
 * Format earnings result with beat/miss details
 */
function formatEarningsResult(earnings, beatQuality) {
    let result = '';
    // EPS
    if (earnings.epsActual !== null && earnings.epsEstimate !== null) {
        const epsDiff = earnings.epsActual - earnings.epsEstimate;
        const epsSign = epsDiff >= 0 ? '+' : '';
        const epsBeatPct = ((epsDiff / Math.abs(earnings.epsEstimate)) * 100).toFixed(1);
        const epsQuality = beatQuality.epsQuality.replace('_', ' ').toUpperCase();
        result += `- EPS: $${earnings.epsActual.toFixed(2)} actual vs $${earnings.epsEstimate.toFixed(2)} est `;
        result += `(${epsSign}$${epsDiff.toFixed(2)}, ${epsSign}${epsBeatPct}%) - ${epsQuality}\n`;
    }
    // Revenue
    if (earnings.revenueActual !== null && earnings.revenueEstimate !== null) {
        const revDiff = earnings.revenueActual - earnings.revenueEstimate;
        const revSign = revDiff >= 0 ? '+' : '';
        const revBeatPct = ((revDiff / Math.abs(earnings.revenueEstimate)) * 100).toFixed(1);
        const revQuality = beatQuality.revenueQuality.replace('_', ' ').toUpperCase();
        result += `- Revenue: ${formatRevenue(earnings.revenueActual)} actual vs ${formatRevenue(earnings.revenueEstimate)} est `;
        result += `(${revSign}${formatRevenue(revDiff)}, ${revSign}${revBeatPct}%) - ${revQuality}\n`;
    }
    // Overall quality
    result += `- Beat Quality: ${beatQuality.overallScore}/100 (${beatQualityScorer.getStarRating(beatQuality.overallScore)} stars)\n`;
    return result;
}
/**
 * Format large numbers (revenue, etc.)
 */
function formatRevenue(value) {
    if (value === null || value === undefined)
        return 'N/A';
    if (value >= 1e9) {
        return `$${(value / 1e9).toFixed(2)}B`;
    }
    if (value >= 1e6) {
        return `$${(value / 1e6).toFixed(2)}M`;
    }
    return `$${value.toFixed(2)}`;
}
/**
 * Format regular numbers (EPS, etc.)
 */
function formatNumber(value) {
    if (value === null || value === undefined)
        return 'N/A';
    return `$${value.toFixed(2)}`;
}
