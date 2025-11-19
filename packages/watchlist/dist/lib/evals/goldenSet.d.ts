/**
 * Golden Set of Test Cases for "Why It Moved" AI Summaries
 *
 * These are real historical events with known outcomes,
 * used to measure quality of AI summaries through evals.
 */
import { EvalTestCase } from '@watchlist/types/ai-summary';
export declare const goldenSet: EvalTestCase[];
/**
 * Get test case by ID
 */
export declare function getTestCase(id: string): EvalTestCase | undefined;
/**
 * Get test cases by ticker
 */
export declare function getTestCasesByTicker(ticker: string): EvalTestCase[];
