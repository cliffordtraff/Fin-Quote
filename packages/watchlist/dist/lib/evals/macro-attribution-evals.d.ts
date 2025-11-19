/**
 * Macro Attribution Eval Test Suite
 *
 * Tests the accuracy of macro vs company attribution in "Why It Moved" summaries.
 * Covers diverse scenarios to prevent false positives and ensure correct attribution.
 */
export interface EvalTestCase {
    id: string;
    name: string;
    description: string;
    input: {
        symbol: string;
        priceData: {
            currentPrice: number;
            change: number;
            changePercent: number;
            volume: number;
            previousClose: number;
        };
        benchmarkContext: {
            benchmark: 'SPY' | 'QQQ';
            benchmarkReturn: number;
            aligned: boolean;
        };
        macroEvents: Array<{
            type: 'trade_tariff' | 'fed_policy' | 'geopolitical' | 'economic_data' | 'financial_stress' | 'policy';
            headline: string;
        }>;
        companyHeadlines: string[];
    };
    expected: {
        attributionType: 'macro' | 'company' | 'mixed' | 'no_clear_catalyst';
        primaryDriverMustInclude?: string[];
        primaryDriverMustNotInclude?: string[];
        narrativeMustInclude?: string[];
        sentimentRange: {
            min: 'bearish' | 'neutral' | 'bullish';
            max: 'bearish' | 'neutral' | 'bullish';
        };
        scoreRange: {
            min: number;
            max: number;
        };
        confidenceRange: {
            min: number;
            max: number;
        };
        reasoning: string;
    };
}
/**
 * Eval Test Suite
 *
 * Covers:
 * - Clear macro attribution (stock moves with market on macro event)
 * - Clear company attribution (stock diverges from market with strong news)
 * - Ambiguous cases (aligned with market but strong company news)
 * - Edge cases (contradictions, no catalyst)
 */
export declare const macroAttributionEvals: EvalTestCase[];
/**
 * Get eval test case by ID
 */
export declare function getEvalById(id: string): EvalTestCase | undefined;
/**
 * Get all eval test cases by category
 */
export declare function getEvalsByCategory(category: 'macro' | 'company' | 'mixed' | 'edge'): EvalTestCase[];
