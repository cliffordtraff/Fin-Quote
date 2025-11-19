/**
 * Eval Runner for "Why It Moved" AI Summaries
 *
 * Tests the metaprompt + validation system against golden set
 * to measure quality before deployment.
 */
import { EvalTestCase, EvalResult, EvalSummary } from '@watchlist/types/ai-summary';
/**
 * Run a single eval test case
 */
export declare function runEvalTestCase(testCase: EvalTestCase): Promise<EvalResult>;
/**
 * Run all eval test cases
 */
export declare function runAllEvals(testCases: EvalTestCase[]): Promise<EvalSummary>;
/**
 * Run evals and check deployment gate
 */
export declare function checkDeploymentGate(testCases: EvalTestCase[]): Promise<boolean>;
