/**
 * Prompt Cache for "Why It Moved" Metaprompts
 *
 * Caches generated prompts in memory to avoid regenerating on every request.
 * In production, this would sync with Firestore for version management.
 */
import { MetapromptData } from '@watchlist/types/ai-summary';
/**
 * Get cached metaprompt, or generate if not cached
 */
export declare function getCachedPrompt(): MetapromptData;
/**
 * Clear the prompt cache (used after rollback or version update)
 */
export declare function clearPromptCache(): void;
/**
 * Get a specific prompt version (for rollback scenarios)
 */
export declare function getPromptVersion(version: string): MetapromptData;
/**
 * Update active prompt version (would write to Firestore in production)
 */
export declare function setActivePromptVersion(version: string): void;
