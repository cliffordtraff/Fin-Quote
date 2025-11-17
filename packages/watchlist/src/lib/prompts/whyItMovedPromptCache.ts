/**
 * Prompt Cache for "Why It Moved" Metaprompts
 *
 * Caches generated prompts in memory to avoid regenerating on every request.
 * In production, this would sync with Firestore for version management.
 */

import { MetapromptData } from '@watchlist/types/ai-summary'
import { generateMetaprompt } from './whyItMovedMetaprompt'
import { getActivePromptVersion } from './whyItMovedPromptRollback'

// In-memory cache
let cachedPrompt: MetapromptData | null = null
let cacheTimestamp: number = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get cached metaprompt, or generate if not cached
 */
export function getCachedPrompt(): MetapromptData {
  const now = Date.now()

  // Check if cache is valid
  if (cachedPrompt && (now - cacheTimestamp < CACHE_TTL)) {
    return cachedPrompt
  }

  // Generate new prompt
  const activeVersion = getActivePromptVersion()
  cachedPrompt = generateMetaprompt(activeVersion)
  cacheTimestamp = now

  return cachedPrompt
}

/**
 * Clear the prompt cache (used after rollback or version update)
 */
export function clearPromptCache(): void {
  cachedPrompt = null
  cacheTimestamp = 0
}

/**
 * Get a specific prompt version (for rollback scenarios)
 */
export function getPromptVersion(version: string): MetapromptData {
  // In production, this would fetch from Firestore
  // For now, we only support v1.0.0
  if (version === '1.0.0') {
    return generateMetaprompt('1.0.0')
  }

  throw new Error(`Unknown prompt version: ${version}`)
}

/**
 * Update active prompt version (would write to Firestore in production)
 */
export function setActivePromptVersion(version: string): void {
  clearPromptCache()
  // In production: await db.collection('config').doc('activePromptVersion').set({ version })
  console.log(`[Prompt Cache] Active version set to ${version}`)
}
