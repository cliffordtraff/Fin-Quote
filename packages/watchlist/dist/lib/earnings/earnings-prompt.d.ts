/**
 * Earnings Prompt Builder
 *
 * Formats earnings context for AI prompts
 */
import { EarningsContext } from '@watchlist/types/earnings';
/**
 * Build earnings section for AI prompt
 *
 * Returns null if confidence is too low (<30%) to include
 */
export declare function buildEarningsPromptSection(earningsContext: EarningsContext, confidence: number): string | null;
