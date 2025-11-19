/**
 * Type definitions for "Why It Moved" AI Summary feature
 * Supporting metaprompting and structured output
 */
import { EarningsContext } from './earnings';
export interface WhyItMovedData {
    narrative: string;
    primaryDriver: string;
    sentiment: 'bullish' | 'neutral' | 'bearish';
    score: number;
    confidence: number;
    supportingFactors?: string[];
    priceContext?: {
        volumeNote?: string;
        rangeNote?: string;
        alignmentNote?: string;
    };
}
export interface WhyItMovedResponse {
    data: WhyItMovedData;
    summary: string;
    meta: {
        promptVersion: string;
        cached: boolean;
        timestamp: number;
        model: string;
        earningsContextIncluded?: boolean;
    };
    sources?: Array<{
        title: string;
        source: string;
        link: string;
        time: string;
    }>;
    earningsContext?: EarningsContext;
    mock?: boolean;
}
export interface WhyItMovedError {
    error: string;
    fallback?: WhyItMovedData;
    details?: string;
}
/**
 * Metaprompt structure
 */
export interface MetapromptData {
    systemPrompt: string;
    metadata: {
        version: string;
        rulesVersion: string;
        generatedAt: number;
        model: string;
    };
}
/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings?: string[];
}
/**
 * Eval test case structure
 */
export interface EvalTestCase {
    id: string;
    name: string;
    ticker: string;
    quote: {
        price: number;
        change: number;
        changePercent: number;
        volume: number;
        avgVolume: number;
        dayLow: number;
        dayHigh: number;
        previousClose: number;
    };
    headlines: Array<{
        title: string;
        source: string;
        date: Date;
    }>;
    expected: {
        sentiment: 'bullish' | 'neutral' | 'bearish';
        scoreRange: [number, number];
        confidenceRange: [number, number];
        primaryDriverContains?: string;
        narrativeMustInclude?: string[];
    };
    description: string;
}
/**
 * Eval results
 */
export interface EvalResult {
    testCase: EvalTestCase;
    actual: WhyItMovedData;
    passed: boolean;
    failures: string[];
    timestamp: number;
}
export interface EvalSummary {
    totalTests: number;
    passed: number;
    failed: number;
    passRate: number;
    runDate: number;
    promptVersion: string;
    failures: Array<{
        testId: string;
        testName: string;
        reasons: string[];
    }>;
}
