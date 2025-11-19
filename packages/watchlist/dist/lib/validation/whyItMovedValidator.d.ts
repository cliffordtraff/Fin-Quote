/**
 * Validation logic for "Why It Moved" AI Summary outputs
 *
 * Validates structured JSON responses against rules defined in
 * docs/WHY_IT_MOVED_RULES.md
 */
import { WhyItMovedData, ValidationResult } from '@watchlist/types/ai-summary';
/**
 * Validate WhyItMovedData structure and business rules
 */
export declare function validateWhyItMoved(data: unknown, ticker: string): ValidationResult;
/**
 * Generate a fallback response when validation fails and retry exhausted
 */
export declare function generateFallback(ticker: string, priceChange: number, priceChangePercent: number, price: number): WhyItMovedData;
