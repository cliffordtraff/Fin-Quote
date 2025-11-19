/**
 * Metaprompt Generator for "Why It Moved" AI Summaries
 *
 * Converts rules from docs/WHY_IT_MOVED_RULES.md into a structured system prompt
 * that GPT-4o-mini can follow consistently.
 */
import { MetapromptData } from '@watchlist/types/ai-summary';
/**
 * Generate the metaprompt from rules
 *
 * In a full implementation, this would parse the markdown file.
 * For now, we're hardcoding based on v1.0.0 of the rules.
 */
export declare function generateMetaprompt(rulesVersion?: string): MetapromptData;
