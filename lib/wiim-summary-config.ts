/**
 * Dependency-free WIIM summary constants shared by generation and read paths.
 *
 * Keep this module leaf-only. Public stock pages need the active config version
 * without importing the OpenAI, provider, or newsletter generation graph.
 */
export const WIIM_SUMMARY_CONFIG_VERSION = 'fin-quote-daily-v2'
export const WIIM_SUMMARY_NEWS_LOOKBACK_DAYS = 7
export const WIIM_SUMMARY_MAX_CHARACTERS = 280
