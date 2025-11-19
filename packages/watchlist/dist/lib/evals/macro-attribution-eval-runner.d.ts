/**
 * Macro Attribution Eval Runner
 *
 * Runs eval test cases and validates attribution accuracy
 */
import { EvalTestCase } from './macro-attribution-evals';
import { WhyItMovedData } from '@watchlist/types/ai-summary';
export interface EvalResult {
    testId: string;
    testName: string;
    passed: boolean;
    score: number;
    failures: string[];
    warnings: string[];
    actualOutput?: WhyItMovedData;
    executionTimeMs?: number;
}
export interface EvalSummary {
    totalTests: number;
    passed: number;
    failed: number;
    passRate: number;
    averageScore: number;
    results: EvalResult[];
    timestamp: Date;
}
/**
 * Validate AI output against expected criteria
 */
export declare function validateEvalOutput(testCase: EvalTestCase, actualOutput: WhyItMovedData): EvalResult;
/**
 * Run all evals and generate summary
 */
export declare function runEvals(testCases: EvalTestCase[], getOutputForTestCase: (testCase: EvalTestCase) => Promise<WhyItMovedData>): Promise<EvalSummary>;
/**
 * Check if deployment gate passes (80% pass rate required)
 */
export declare function checkDeploymentGate(summary: EvalSummary): {
    canDeploy: boolean;
    reason: string;
};
/**
 * Format eval summary for console output
 */
export declare function formatEvalSummary(summary: EvalSummary): string;
